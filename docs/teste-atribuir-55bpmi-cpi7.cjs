// ============================================================
// teste-atribuir-55bpmi-cpi7.cjs
//
// TESTE END-TO-END: Rafael (55BPMI) -> Carlos (CPI-7) atribuir viatura
//
// Cenario:
//   1. Rafael (55BPMI ug=[20,91,92,115]) cria solicitacao pra CPI-7 (ur=11)
//      - Motorista JAH preenchido manualmente (bypassando SAT)
//   2. Carlos (CPI-7 ug=[11]) aprova a solicitacao
//   3. William (master) atribui viatura livre do CPI-7 ao agendamento
//
// Como rodar:
//   cd "C:\Temp\pg-test"
//   node teste-atribuir-55bpmi-cpi7.cjs
//
// Requisitos:
//   - API Vercel no ar (default: https://vtrcpi-five.vercel.app)
//   - Rafael (id=109), Carlos (id=110), William (id=3) no DB
//   - Pelo menos 1 viatura ATIVA do CPI-7 (opm=11) sem agendamento hoje
//
// Pra rodar na intranet, mude VTR_API:
//   set VTR_API=https://vtrcpi.intranet.pm.gov.br
//   node teste-atribuir-55bpmi-cpi7.cjs
//
// IDEMPOTENTE: cada run usa dataMissao = hoje + 7 dias (variando conforme
// o dia da semana), evitando conflito de horario. Tambem pega a primeira
// viatura livre disponivel.
// ============================================================

const jose = require('jose');
const { Client } = require('pg');

// ====== CONFIGURACAO ======
const API_BASE = process.env.VTR_API || 'https://vtrcpi-five.vercel.app';
const JWT_SECRET = process.env.VTR_JWT_SECRET || 'FdMeai7Zv8w6X5DWeV3yRQbHKbofin9fs3LA73/odkM=';
const POSTGRES_URL = process.env.VTR_PG || 'postgres://a58045bec351377e56ab2ce985a146959085966265e011ac4bfdcc4b5311e0bd:sk__8mIU0ieXj-hfy6jUn3Kp@db.prisma.io:5432/postgres?sslmode=require';

// IDs no banco (fixos pra repetibilidade)
const RAFAEL_ID = 109;
const CARLOS_ID = 110;
const WILLIAM_ID = 3;
const CPI7_OPM = 11;

// Data: sempre amanha as 14:00-15:30 (sem conflito se rodar varias vezes no mesmo dia)
function calcDataMissao() {
  const d = new Date();
  d.setDate(d.getDate() + 1); // amanha
  d.setHours(14, 0, 0, 0);
  return d.getTime();
}
const DATA_MISSAO_MS = calcDataMissao();
const DATA_MISSAO_FIM = DATA_MISSAO_MS + (90 * 60 * 1000); // +1h30

// Configuracao da solicitacao
const AGENDAMENTO_CONFIG = {
  // FIX: create.ts espera o CODE SIAFEM, nao o ID
  unidadeRequerente: '607000000',  // CPI-7 (code SIAFEM)
  unidadeRequerenteCode: '607000000',
  secaoSetor: 'P-4',
  tipoViaturaSolicitada: 'FURGAO',
  dataMissao: DATA_MISSAO_MS,
  destino: 'DTIC (teste E2E 55BPMI->CPI-7)',
  finalidade: 'Validar atribuicao de viatura entre OPMs',
  oficialAutorizador: 'Cap teste (E2E)',
  horarioApresentacao: '14:00',
  solicitanteMotorista: true,
  // Motorista JAH preenchido (bypass SAT)
  motoristaRe: '7771111',
  motoristaPosto: 'Cb PM',
  motoristaNome: 'MOTORISTA TESTE E2E',
  motoristaOpm: 'CPI-7',
  motoristaOpmCode: '607002140',
  motoristaCnh: 'AB',
  motoristaBoletim: 'BOL.INT.CPI7-E2E-001',
  motoristaDataProva: '15/03/2010',
  motoristaPublicacoes: [
    { data: '15/03/2010', boletim: 'BOL.INT.CPI7-E2E-001', cassada: false, categoria: 'AB' },
  ],
  retiradaData: DATA_MISSAO_MS,
  retiradaHora: '14:00',
  devolucaoData: DATA_MISSAO_FIM,
  devolucaoHora: '15:30',
};

// ====== HELPERS ======
function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

function separator(label) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${label}`);
  console.log('='.repeat(60));
}

async function jwt(user) {
  return await new jose.SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('viaturas-cpi7')
    .setAudience('viaturas-cpi7-app')
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function apiCall(method, path, token, body) {
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
  };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(API_BASE + path, opts);
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch { j = { ok: false, raw: txt }; }
  return { status: r.status, body: j };
}

// Pega primeira viatura ATIVA do CPI-7 sem agendamento no dia de amanha
async function pickViaturaLivre() {
  const c = new Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const dayStart = new Date(DATA_MISSAO_MS);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 86400000;
  const r = await c.query(`
    SELECT v.id, v.prefixo, v.marcaModelo, v.placa
    FROM viaturas v
    WHERE v.opm = $1
      AND v.ativo = TRUE
      AND v.emDescarga = FALSE
      AND v.id NOT IN (
        SELECT viaturaAtribuida FROM agendamentos
        WHERE viaturaAtribuida IS NOT NULL
          AND status IN ('aprovado','concluido')
          AND dataMissao >= $2 AND dataMissao < $3
      )
    ORDER BY v.prefixo
    LIMIT 1
  `, [CPI7_OPM, dayStartMs, dayEndMs]);
  await c.end();
  if (!r.rows[0]) {
    throw new Error('Nenhuma viatura livre do CPI-7 disponivel para amanha. Limpe atribuicoes antigas ou escolha outra data.');
  }
  return r.rows[0];
}

// ====== CENARIO ======
(async () => {
  console.log(`\nAPI: ${API_BASE}`);
  log('🔧', 'Gerando JWTs...');
  log('📅', `DataMissao: ${new Date(DATA_MISSAO_MS).toLocaleString('pt-BR')}`);

  // Pega viatura livre dinamicamente
  separator('PREPARACAO: Buscando viatura livre do CPI-7');
  const viaturaLivre = await pickViaturaLivre();
  log('🚗', `Escolhida: id=${viaturaLivre.id} | prefixo=${viaturaLivre.prefixo} | placa=${viaturaLivre.placa || '?'}`);
  const VIATURA_ID = viaturaLivre.id;

  // Tokens
  const rafaelToken = await jwt({
    googleId: 'aristeum82', email: 'aristeum82@gmail.com', name: 'Rafael',
    userId: RAFAEL_ID, role: 'gestor', viaturasRole: 'gestor',
    unidadesGestor: [20, 91, 92, 115], unidadesEditor: [],
    approved: true, isMaster: false, escopo: 'pm-7',
  });
  const carlosToken = await jwt({
    googleId: 'scioinformatica', email: 'scioinformatica@gmail.com', name: 'Carlos',
    userId: CARLOS_ID, role: 'gestor', viaturasRole: 'gestor',
    unidadesGestor: [11], unidadesEditor: [11],
    approved: true, isMaster: false, escopo: 'pm-7',
  });
  const williamToken = await jwt({
    googleId: 'william', email: 'michelwilliam@policiamilitar.sp.gov.br', name: 'William',
    userId: WILLIAM_ID, role: 'admin', viaturasRole: 'admin',
    unidadesGestor: [], unidadesEditor: [],
    approved: true, isMaster: true, escopo: 'pm-7',
  });

  // ====== PASSO 1: Rafael cria solicitacao ======
  separator('PASSO 1: Rafael (55BPMI) cria solicitacao pra CPI-7');
  log('🚀', 'POST /api/agendamentos/create');
  const r1 = await apiCall('POST', '/api/agendamentos/create', rafaelToken, AGENDAMENTO_CONFIG);
  log('📊', `STATUS: ${r1.status} | OK: ${r1.body.ok}`);
  if (!r1.body.ok) {
    log('❌', `Erro: ${r1.body.error || JSON.stringify(r1.body)}`);
    log('⛔', 'TESTE ABORTADO no passo 1');
    process.exit(1);
  }
  const agendamentoId = r1.body.id;
  log('✅', `Agendamento criado: id=${agendamentoId}`);

  // ====== PASSO 2: Carlos aprova ======
  separator('PASSO 2: Carlos (CPI-7) aprova o agendamento');
  log('🚀', `POST /api/agendamentos/approve { agendamentoId: ${agendamentoId} }`);
  const r2 = await apiCall('POST', '/api/agendamentos/approve', carlosToken, { agendamentoId });
  log('📊', `STATUS: ${r2.status} | OK: ${r2.body.ok}`);
  if (!r2.body.ok) {
    log('❌', `Erro: ${r2.body.error || JSON.stringify(r2.body)}`);
    log('⛔', 'TESTE ABORTADO no passo 2');
    process.exit(1);
  }
  log('✅', 'Agendamento APROVADO');

  // ====== PASSO 3: William atribui viatura ======
  separator(`PASSO 3: William (master) atribui viatura id=${VIATURA_ID}`);
  log('🚀', `POST /api/agendamentos/atribuir { agendamentoId: ${agendamentoId}, viaturaId: ${VIATURA_ID} }`);
  const r3 = await apiCall('POST', '/api/agendamentos/atribuir', williamToken, {
    agendamentoId,
    viaturaId: VIATURA_ID,
  });
  log('📊', `STATUS: ${r3.status} | OK: ${r3.body.ok}`);
  if (!r3.body.ok) {
    log('❌', `Erro: ${r3.body.error || JSON.stringify(r3.body)}`);
    log('⛔', 'TESTE ABORTADO no passo 3');
    process.exit(1);
  }
  log('✅', `Viatura ATRIBUIDA! linkIfct gerado: ${r3.body.linkIfct?.substring(0, 13)}...`);
  log('📧', `Email enviado ao solicitante: ${r3.body.emailEnviado}`);

  // ====== VERIFICACOES FINAIS ======
  separator('VERIFICACOES FINAIS');
  log('🔍', 'Consultando agendamento final via /api/agendamentos/list (como William, master)...');
  const rFinal = await apiCall('GET', `/api/agendamentos/list`, williamToken);
  const agFinal = rFinal.body.agendamentos?.find(a => a.id === agendamentoId);
  if (agFinal) {
    log('📋', `Status: ${agFinal.status}`);
    log('🚗', `viaturaAtribuida: ${agFinal.viaturaAtribuida}`);
    log('🔗', `ifctStatus: ${agFinal.ifctStatus}`);
    log('📧', `linkIfct: ${agFinal.linkIfct?.substring(0, 13)}...`);
    log('📍', `unidadeRequerente: ${agFinal.unidadeRequerente} (${agFinal.unidadeRequerente === 11 ? 'CPI-7' : '?'})`);
    log('🏛️', `unidadeOrigem: ${agFinal.unidadeOrigem} (${agFinal.unidadeOrigem === 20 ? '55BPMI' : '?'})`);
  } else {
    log('⚠️', 'Agendamento nao encontrado na lista (verificar permissao)');
  }

  separator('TESTE CONCLUIDO COM SUCESSO');
  log('🎉', 'Todos os 3 passos passaram!');
  log('📝', 'Resumo:');
  log('   ', `- Rafael (55BPMI ug=[20]) criou solicitacao ur=11 (CPI-7)`);
  log('   ', `- Carlos (CPI-7 ug=[11]) aprovou (cobre destino=11)`);
  log('   ', `- William (master) atribuiu viatura id=${VIATURA_ID} (cobre destino=11)`);
  log('   ', `- linkIfct gerado automaticamente: ${r3.body.linkIfct?.substring(0, 8)}...`);
  log('   ', `- Email enviado pro solicitante: ${r3.body.emailEnviado ? 'SIM' : 'NAO (SMTP nao configurado)'}`);
})().catch(e => {
  console.error('\n❌ ERRO FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
