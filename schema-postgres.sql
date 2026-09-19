-- ============================================================
-- Sistema de Viaturas CPI-7 - Schema POSTGRES (Vercel/Prisma)
-- Baseado no schema.sqlite.sql convertido pra Postgres
-- Campos em camelCase (clone do Convex legacy)
-- Adaptacoes:
--   INTEGER PK AUTOINCREMENT -> BIGSERIAL PK
--   INTEGER FK -> BIGINT
--   TEXT (JSON arrays) -> JSONB
--   INTEGER (0/1 boolean) -> BOOLEAN
--   REAL -> NUMERIC
--
-- ORDEM DE CRIACAO (importante por causa das FKs):
--   1. units      (sem deps)
--   2. users      (FK -> units)
--   3. viaturas   (FK -> units, users)   <-- ANTES de agendamentos
--   4. viaturaHistorico (FK -> viaturas)
--   5. agendamentos (FK -> users, units, viaturas)
--   6. rondas     (FK -> viaturas)
--   7. auditLog   (FK -> users)
--   8. ifctAbastecimentos (FK -> agendamentos)
--   9. ifctEncerramentos  (FK -> agendamentos)
-- ============================================================

-- ============================================================
-- 1. UNITS
-- ============================================================
CREATE TABLE IF NOT EXISTS units (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parentUnit BIGINT REFERENCES units(id) ON DELETE SET NULL,
  commandUnit BIGINT REFERENCES units(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT TRUE,
  sigla TEXT
);

CREATE INDEX IF NOT EXISTS idx_units_code ON units(code);
CREATE INDEX IF NOT EXISTS idx_units_parent ON units(parentUnit);
CREATE INDEX IF NOT EXISTS idx_units_command ON units(commandUnit);
CREATE INDEX IF NOT EXISTS idx_units_active ON units(active);

-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,

  email TEXT UNIQUE NOT NULL,
  cpf TEXT UNIQUE,
  re TEXT,
  digre TEXT,
  name TEXT,
  warName TEXT,
  postoGraduacao TEXT,
  codptgr TEXT,
  opmCode TEXT,
  unit BIGINT REFERENCES units(id) ON DELETE SET NULL,
  sexo TEXT,
  dataNascimento TEXT,
  telefone TEXT,

  role TEXT,
  viaturasRole TEXT DEFAULT 'viewer',
  unidadesGestor JSONB DEFAULT '[]'::jsonb,
  unidadesEditor JSONB DEFAULT '[]'::jsonb,

  googleId TEXT UNIQUE,
  picture TEXT,
  approved BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  lastLogin BIGINT,
  loginCount INTEGER DEFAULT 0,
  createdAt BIGINT,
  promotedAt BIGINT,
  escopo TEXT DEFAULT 'restrito',
  isMaster BOOLEAN DEFAULT FALSE,

  assinaturaDigitalSvg TEXT,
  assinaturaDigitalCriadoEm BIGINT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
CREATE INDEX IF NOT EXISTS idx_users_re ON users(re);
CREATE INDEX IF NOT EXISTS idx_users_viaturasRole ON users(viaturasRole);
CREATE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId);

-- ============================================================
-- 3. VIATURAS (criada ANTES de agendamentos por causa da FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS viaturas (
  id BIGSERIAL PRIMARY KEY,
  opm BIGINT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  prefixo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  marcaModelo TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  dataBaixa BIGINT,
  dataReativadoEm BIGINT,
  motivo TEXT,
  situacao TEXT,
  observacao TEXT,
  emDescarga BOOLEAN DEFAULT FALSE,
  linkRonda TEXT,
  placa TEXT,
  patrimonio TEXT,
  cadConv TEXT,
  anoFab INTEGER,
  valor NUMERIC,
  nl TEXT,
  contaPatrimonial TEXT,
  local TEXT,
  criadoEm BIGINT NOT NULL,
  criadoPor BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  atualizadoEm BIGINT,
  atualizadoPor BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vtr_opm ON viaturas(opm);
CREATE INDEX IF NOT EXISTS idx_vtr_prefixo ON viaturas(prefixo);
CREATE INDEX IF NOT EXISTS idx_vtr_ativo ON viaturas(ativo);
CREATE INDEX IF NOT EXISTS idx_vtr_emDescarga ON viaturas(emDescarga);
CREATE INDEX IF NOT EXISTS idx_vtr_placa ON viaturas(placa);
CREATE INDEX IF NOT EXISTS idx_vtr_patrimonio ON viaturas(patrimonio);
CREATE INDEX IF NOT EXISTS idx_vtr_opm_ativo ON viaturas(opm, ativo);

-- ============================================================
-- 4. VIATURA_HISTORICO
-- ============================================================
CREATE TABLE IF NOT EXISTS viaturaHistorico (
  id BIGSERIAL PRIMARY KEY,
  viaturaId BIGINT NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  dataHora BIGINT NOT NULL,
  motivo TEXT,
  situacao TEXT,
  km INTEGER,
  observacao TEXT,
  registradoPor BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_hist_viatura ON viaturaHistorico(viaturaId, dataHora);
CREATE INDEX IF NOT EXISTS idx_hist_viatura_tipo ON viaturaHistorico(viaturaId, tipo);

-- ============================================================
-- 5. AGENDAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamentos (
  id BIGSERIAL PRIMARY KEY,

  solicitante BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  postoGraduacao TEXT NOT NULL,
  re TEXT NOT NULL,
  nomeGuerra TEXT NOT NULL,
  email TEXT NOT NULL,

  unidadeRequerente BIGINT REFERENCES units(id) ON DELETE SET NULL,
  unidadeRequerenteOutro TEXT,
  unidadeOrigem BIGINT REFERENCES units(id) ON DELETE SET NULL,
  secaoSetor TEXT,

  tipoViaturaSolicitada TEXT NOT NULL,
  tipoViaturaOutro TEXT,

  dataMissao BIGINT NOT NULL,
  destino TEXT NOT NULL,
  finalidade TEXT NOT NULL,
  oficialAutorizador TEXT NOT NULL,

  horarioApresentacao TEXT,

  solicitanteMotorista BOOLEAN DEFAULT FALSE,
  motoristaRe TEXT,
  motoristaPosto TEXT,
  motoristaNome TEXT,
  motoristaOpm TEXT,
  motoristaOpmCode TEXT,
  motoristaCnh TEXT,
  motoristaBoletim TEXT,
  motoristaDataProva TEXT,
  motoristaPublicacoes JSONB,

  retiradaData BIGINT NOT NULL,
  retiradaHora TEXT NOT NULL,
  devolucaoData BIGINT NOT NULL,
  devolucaoHora TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pendente',
  aprovadoPor BIGINT REFERENCES users(id) ON DELETE SET NULL,
  aprovadoEm BIGINT,
  rejeitadoPor BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejeitadoEm BIGINT,
  motivoRejeicao TEXT,
  concluidoPor BIGINT REFERENCES users(id) ON DELETE SET NULL,
  concluidoEm BIGINT,
  naoCompareceu BOOLEAN DEFAULT FALSE,

  viaturaAtribuida BIGINT REFERENCES viaturas(id) ON DELETE SET NULL,

  odometroRetirada INTEGER,
  odometroRetiradaEm BIGINT,
  odometroRetiradaPor BIGINT REFERENCES users(id) ON DELETE SET NULL,
  odometroDevolucao INTEGER,
  odometroDevolucaoEm BIGINT,
  odometroDevolucaoPor BIGINT REFERENCES users(id) ON DELETE SET NULL,
  kmRodados INTEGER,
  odometroEditado BOOLEAN DEFAULT FALSE,

  linkIfct TEXT,
  linkIfctExpiraEm BIGINT,
  ifctStatus TEXT,
  ifctData JSONB,
  ifctValidadoPor BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ifctValidadoEm BIGINT,
  ifctValidadoObservacao TEXT,

  criadoEm BIGINT NOT NULL,
  atualizadoEm BIGINT
);

CREATE INDEX IF NOT EXISTS idx_ag_solicitante ON agendamentos(solicitante);
CREATE INDEX IF NOT EXISTS idx_ag_unidade_requerente ON agendamentos(unidadeRequerente);
CREATE INDEX IF NOT EXISTS idx_ag_unidade_origem ON agendamentos(unidadeOrigem);
CREATE INDEX IF NOT EXISTS idx_ag_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_ag_dataMissao ON agendamentos(dataMissao);
CREATE INDEX IF NOT EXISTS idx_ag_unidade_requerente_status ON agendamentos(unidadeRequerente, status);
CREATE INDEX IF NOT EXISTS idx_ag_linkIfct ON agendamentos(linkIfct);
CREATE INDEX IF NOT EXISTS idx_ag_ifctStatus ON agendamentos(ifctStatus);
CREATE INDEX IF NOT EXISTS idx_ag_viaturaAtribuida ON agendamentos(viaturaAtribuida);

-- ============================================================
-- 6. RONDAS
-- ============================================================
CREATE TABLE IF NOT EXISTS rondas (
  id BIGSERIAL PRIMARY KEY,
  viaturaId BIGINT NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  rondadoPor TEXT NOT NULL,
  textoLivre TEXT,
  posto TEXT,
  nomeGuerra TEXT,
  unidadePertence TEXT,
  assinaturaSvg TEXT,
  preenchidoEm BIGINT NOT NULL,
  ipOrigem TEXT,
  userAgentOrigem TEXT
);

CREATE INDEX IF NOT EXISTS idx_ronda_viatura ON rondas(viaturaId, preenchidoEm);

-- ============================================================
-- 7. AUDIT_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS auditLog (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cpf TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resourceId TEXT,
  details JSONB,
  ipOrigem TEXT,
  userAgent TEXT,
  dataHora BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON auditLog(userId);
CREATE INDEX IF NOT EXISTS idx_audit_dataHora ON auditLog(dataHora);

-- ============================================================
-- 8. IFCT ABASTECIMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS ifctAbastecimentos (
  id BIGSERIAL PRIMARY KEY,
  agendamentoId BIGINT NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  dataHora BIGINT NOT NULL,
  natureza TEXT NOT NULL,
  quantidadeLitros NUMERIC NOT NULL,
  odometro INTEGER NOT NULL,
  posto TEXT,
  fotoComprovante TEXT,
  observacao TEXT,
  criadoEm BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ifctab_agendamento ON ifctAbastecimentos(agendamentoId, dataHora);

-- ============================================================
-- 9. IFCT ENCERRAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS ifctEncerramentos (
  id BIGSERIAL PRIMARY KEY,
  agendamentoId BIGINT NOT NULL UNIQUE REFERENCES agendamentos(id) ON DELETE CASCADE,
  dataHora BIGINT NOT NULL,
  hodometroPartida INTEGER,
  hodometroRetorno INTEGER,
  hodometroDiferenca INTEGER,
  partidaConfirmadaEm BIGINT,
  defeitosVerificados TEXT,
  observacoes TEXT,
  novaApresentacaoData BIGINT,
  novaApresentacaoHora TEXT,
  novaApresentacaoLocal TEXT,
  consideracoesVeiculo TEXT,
  assinaturaCondutorSvg TEXT,
  ipOrigem TEXT,
  userAgentOrigem TEXT,
  criadoEm BIGINT NOT NULL
);

-- ============================================================
-- SEED INICIAL: 10 unidades (CPI-7 + 9 BPMs/BAEP)
-- William (admin master) eh criado no primeiro login via Google
-- ============================================================
INSERT INTO units (code, name, sigla, parentUnit, commandUnit, active) VALUES
  ('607000000', 'CPI-7',     'CPI7',  NULL, NULL, TRUE),
  ('607070000', '7o BPM/I',  '7BPMI', NULL, NULL, TRUE),
  ('607120000', '12o BPM/I', '12BPMI', NULL, NULL, TRUE),
  ('607140000', '14o BAEP',  '14BAEP', NULL, NULL, TRUE),
  ('607220000', '22o BPM/I', '22BPMI', NULL, NULL, TRUE),
  ('607400000', '40o BPM/I', '40BPMI', NULL, NULL, TRUE),
  ('607500000', '50o BPM/I', '50BPMI', NULL, NULL, TRUE),
  ('607530000', '53o BPM/I', '53BPMI', NULL, NULL, TRUE),
  ('607540000', '54o BPM/I', '54BPMI', NULL, NULL, TRUE),
  ('607550000', '55o BPM/I', '55BPMI', NULL, NULL, TRUE)
ON CONFLICT (code) DO NOTHING;
