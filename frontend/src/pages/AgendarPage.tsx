import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { getUser } from '../lib/auth'
import { createAgendamento } from '../lib/api'
import { parseSAT, abrirSATPopup, type SatResult } from '../lib/sat-parser'
import { UNIDADES_REQUERENTES, SELECT_SECOES_SETORES, SELECT_TIPOS_VIATURA, POSTO_GRADUACAO } from '../lib/constants'

export default function AgendarPage() {
  const user = getUser()
  const nav = useNavigate()

  // Solicitante (auto do user)
  const [unidadeRequerente, setUnidadeRequerente] = useState('')
  const [unidadeRequerenteOutro, setUnidadeRequerenteOutro] = useState('')
  const [secaoSetor, setSecaoSetor] = useState('')
  const [secaoSetorOutro, setSecaoSetorOutro] = useState('')
  const [tipoViatura, setTipoViatura] = useState('')
  const [tipoViaturaOutro, setTipoViaturaOutro] = useState('')
  const [dataMissao, setdataMissao] = useState('')
  const [destino, setDestino] = useState('')
  const [finalidade, setFinalidade] = useState('')
  const [horarioApresentacao, setHorarioApresentacao] = useState('')
  const [oficialAutorizador, setOficialAutorizador] = useState('')
  const [retiradaData, setRetiradaData] = useState('')
  const [retiradaHora, setRetiradaHora] = useState('')
  const [devolucaoData, setDevolucaoData] = useState('')
  const [devolucaoHora, setDevolucaoHora] = useState('')

  // Motorista (SAT)
  const [solicitanteMotorista, setSolicitanteMotorista] = useState(true)
  const [motoristaRe, setMotoristaRe] = useState('')
  const [satResult, setSatResult] = useState<SatResult | null>(null)
  const [satErro, setSatErro] = useState('')
  const [satPaste, setSatPaste] = useState('')
  const [satPasteAberto, setSatPasteAberto] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  // Estado pra preenchimento manual (fallback se SAT nao abrir)
  const [motoristaManual, setMotoristaManual] = useState({
    posto: '',
    nome: '',
    opm: '',
    cnh: '',
    boletim: '',
    dataProva: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  function abrirJanelaSAT() {
    const reLimpo = (solicitanteMotorista ? (user.re || '') : motoristaRe).replace(/\D/g, '').trim()
    if (reLimpo.length < 2) {
      setSatErro('RE invalido (precisa de pelo menos 2 digitos)')
      return
    }
    setSatErro('')
    setSatPasteAberto(true)
    abrirSATPopup(reLimpo)
  }

  function processarPasteSAT() {
    if (!satPaste || satPaste.trim().length < 10) {
      setSatErro('Cole o resultado do SAT no campo abaixo (selecione o texto na pagina do SAT e CTRL+V aqui)')
      return
    }
    const reLimpo = (solicitanteMotorista ? (user.re || '') : motoristaRe).replace(/\D/g, '').trim()
    const r = parseSAT(satPaste, reLimpo)
    setSatResult(r)
    if (!r.encontrado) {
      setSatErro(r.erro || 'Nao foi possivel extrair dados do SAT. Confira se colou o conteudo da pagina inteira.')
    } else {
      setSatErro('')
    }
  }

  function ativarModoManual() {
    setManualMode(true)
    // Se for o proprio solicitante, pre-preenche com os dados dele
    if (solicitanteMotorista && user) {
      setMotoristaManual({
        posto: user.postoGraduacao || '',
        nome: user.name || '',
        opm: user.unit?.name || user.unit?.sigla || '',
        cnh: '',
        boletim: '',
        dataProva: '',
      })
    }
    setSatResult({
      encontrado: true,
      re: (solicitanteMotorista ? (user.re || '') : motoristaRe).replace(/\D/g, '').trim(),
      postoGraduacao: '',
      nome: '',
      opm: '',
      opmCode: '',
      cnhCategoria: '',
      boletim: '',
      dataProva: '',
      cassada: false,
      publicacoes: [],
    })
  }

  function aplicarManual() {
    setSatResult({
      encontrado: true,
      re: (solicitanteMotorista ? (user.re || '') : motoristaRe).replace(/\D/g, '').trim(),
      postoGraduacao: motoristaManual.posto,
      nome: motoristaManual.nome,
      opm: motoristaManual.opm,
      opmCode: '',
      cnhCategoria: motoristaManual.cnh,
      boletim: motoristaManual.boletim,
      dataProva: motoristaManual.dataProva,
      cassada: false,
      publicacoes: [],
    })
    setSatErro('')
    setManualMode(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSubmitting(true)
    try {
      if (!unidadeRequerente) throw new Error('Selecione a unidade requerente')
      if (unidadeRequerente === 'OUTRO' && !unidadeRequerenteOutro.trim()) {
        throw new Error('Especifique a unidade requerente (Outro)')
      }
      if (!secaoSetor) throw new Error('Selecione a secao/setor')
      if (secaoSetor === 'OUTRO' && !secaoSetorOutro.trim()) {
        throw new Error('Especifique a secao/setor (Outro)')
      }
      if (!tipoViatura) throw new Error('Selecione o tipo de viatura')
      if (tipoViatura === 'OUTRO' && !tipoViaturaOutro.trim()) {
        throw new Error('Especifique o tipo de viatura (Outro)')
      }
      if (!dataMissao || !retiradaData || !devolucaoData) {
        throw new Error('Preencha as datas')
      }
      if (!retiradaHora || !devolucaoHora) {
        throw new Error('Preencha os horarios')
      }
      if (!destino.trim() || !finalidade.trim()) {
        throw new Error('Preencha destino e finalidade')
      }
      if (!oficialAutorizador.trim()) {
        throw new Error('Preencha o oficial que autorizou')
      }
      // FIX (William 2026-09-04 v2): SEMPRE exigir o RE do motorista.
      // A consulta SAT é SEMPRE por conta do GESTOR na aprovacao,
      // independente de o solicitante ser o motorista ou nao.
      const reLimpo = (solicitanteMotorista ? (user.re || '') : motoristaRe).replace(/\D/g, '').trim()
      if (reLimpo.length < 2) {
        throw new Error('Informe o RE do motorista (sem digito verificador). Se você é o motorista, o seu RE já vem preenchido.')
      }

      const args: any = {
        cpf: user.cpf,
        // Unidade REQUERENTE (escolhida pelo PM)
        unidadeRequerente,
        unidadeRequerenteOutro: unidadeRequerente === 'OUTRO' ? unidadeRequerenteOutro : undefined,
        // Seção/Setor dentro da unidade requerente
        secaoSetor: secaoSetor === 'OUTRO' ? secaoSetorOutro : secaoSetor,
        tipoViaturaSolicitada: tipoViatura,
        tipoViaturaOutro: tipoViatura === 'OUTRO' ? tipoViaturaOutro : undefined,
        dataMissao: new Date(dataMissao).getTime(),
        destino,
        finalidade,
        horarioApresentacao,
        oficialAutorizador,
        retiradaData: new Date(retiradaData).getTime(),
        retiradaHora,
        devolucaoData: new Date(devolucaoData).getTime(),
        devolucaoHora,
        solicitanteMotorista,
        // FIX (William 2026-09-04 v2): só envia o RE; resto fica null
        // pra ser preenchido pelo GESTOR via /atualizar-motorista na aprovacao
        motoristaRe: reLimpo,
        motoristaPosto: null,
        motoristaNome: null,
        motoristaOpm: null,
        motoristaOpmCode: null,
        motoristaCnh: null,
        motoristaBoletim: null,
        motoristaDataProva: null,
        motoristaPublicacoes: null,
      }

      await createAgendamento(args)
      setSucesso(true)
      setTimeout(() => nav('/agendamentos'), 1500)
    } catch (err: any) {
      setErro(err.message || 'Erro ao agendar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Agendar Viatura</h1>
        <p>Preencha o formulário para reservar uma viatura para a missão</p>
      </div>

      {sucesso && (
        <div className="alert alert-success">
          Agendamento criado com sucesso! Redirecionando...
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dados do Solicitante</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Posto/Graduacao</label>
              <input type="text" value={user.postoGraduacao || ''} readOnly />
            </div>
            <div className="form-group">
              <label>RE</label>
              <input type="text" value={user.re || ''} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Nome de Guerra</label>
              <input type="text" value={user.warName || ''} readOnly />
            </div>
            <div className="form-group">
              <label>E-mail</label>
              <input type="text" value={user.email || ''} readOnly />
            </div>
          </div>
        </div>

        {/* MOTORISTA (SAT) - sempre delegado pro gestor na aprovacao (William 2026-09-04 v2) */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Motorista</h3>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: 8 }}>O solicitante é o proprio motorista? <span className="required">*</span></label>
            <label style={{ display: 'inline-flex', alignItems: 'center', marginRight: 16, cursor: 'pointer' }}>
              <input type="radio" name="solMotorista" checked={solicitanteMotorista} onChange={() => setSolicitanteMotorista(true)} style={{ marginRight: 4 }} />
              Sim, eu vou dirigir
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="solMotorista" checked={!solicitanteMotorista} onChange={() => setSolicitanteMotorista(false)} style={{ marginRight: 4 }} />
              Não, outro PM vai dirigir
            </label>
          </div>

          <div className="form-group">
            <label>RE do motorista (sem digito verificador) <span className="required">*</span></label>
            <input
              type="text"
              value={solicitanteMotorista ? (user.re || '').replace(/\D/g, '') : motoristaRe}
              onChange={e => setMotoristaRe(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 111926"
              maxLength={6}
              readOnly={solicitanteMotorista}
              disabled={solicitanteMotorista}
              style={{ fontFamily: 'monospace', background: solicitanteMotorista ? '#f5f5f5' : 'white' }}
            />
            <small style={{ color: '#666', display: 'block', marginTop: 4 }}>
              O RE informado sera usado pelo GESTOR para consultar o SAT no momento da aprovacao.
              Se voce informar um RE errado, a consulta do gestor vai falhar e o agendamento pode
              ser rejeitado.
            </small>
          </div>

          <div className="alert" style={{ background: '#fff3e0', border: '1px solid #ff9800', color: '#5d4037', padding: 10, borderRadius: 4, marginTop: 8 }}>
            <strong>📡 SAT é consultado pelo gestor na aprovação.</strong><br />
            <span style={{ fontSize: 13 }}>
              {solicitanteMotorista
                ? 'Mesmo sendo o motorista, a consulta SAT fica por conta do gestor. Você só precisa informar que é o motorista e confirmar o RE acima.'
                : 'Você NÃO é o motorista, então a consulta SAT fica por conta do gestor no momento da aprovação. Você só precisa informar o RE correto.'}
            </span>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Unidade / Missão</h3>

          <div className="alert" style={{ background: '#e3f2fd', border: '1px solid #1976d2', color: '#0d47a1', marginBottom: 12, padding: 10, borderRadius: 4 }}>
            <strong>Sua OPM de origem:</strong> {user.unit?.name || user.unit?.sigla || user.opmCode || '?'} (automatica do seu login, não editavel).
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Unidade REQUERENTE (pra qual unidade vai a viatura?) <span className="required">*</span></label>
              <select value={unidadeRequerente} onChange={e => setUnidadeRequerente(e.target.value)} required>
                <option value="">Selecione...</option>
                {UNIDADES_REQUERENTES.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Seção/Setor (dentro da unidade requerente) <span className="required">*</span></label>
              <select value={secaoSetor} onChange={e => setSecaoSetor(e.target.value)} required>
                <option value="">Selecione...</option>
                {SELECT_SECOES_SETORES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          {unidadeRequerente === 'OUTRO' && (
            <div className="form-group">
              <label>Especifique a unidade requerente</label>
              <input
                type="text"
                value={unidadeRequerenteOutro}
                onChange={e => setUnidadeRequerenteOutro(e.target.value)}
                placeholder="Descreva a unidade"
                required
              />
            </div>
          )}
          {secaoSetor === 'OUTRO' && (
            <div className="form-group">
              <label>Especifique a secao/setor</label>
              <input
                type="text"
                value={secaoSetorOutro}
                onChange={e => setSecaoSetorOutro(e.target.value)}
                placeholder="Descreva a secao/setor"
                required
              />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Data da Missão <span className="required">*</span></label>
              <input type="date" value={dataMissao} onChange={e => setdataMissao(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Tipo de Viatura <span className="required">*</span></label>
              <select value={tipoViatura} onChange={e => setTipoViatura(e.target.value)} required>
                <option value="">Selecione...</option>
                {SELECT_TIPOS_VIATURA.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          {tipoViatura === 'OUTRO' && (
            <div className="form-group">
              <label>Especifique o tipo de viatura</label>
              <input
                type="text"
                value={tipoViaturaOutro}
                onChange={e => setTipoViaturaOutro(e.target.value)}
                placeholder="Descreva o tipo"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Destino e Finalidade da Missão <span className="required">*</span></label>
            <textarea
              value={destino}
              onChange={e => setDestino(e.target.value)}
              placeholder="Descreva o destino e a finalidade da missão"
              required
            />
          </div>
          <div className="form-group">
            <label>Finalidade (resumo) <span className="required">*</span></label>
            <textarea
              value={finalidade}
              onChange={e => setFinalidade(e.target.value)}
              placeholder="Resumo da missão"
              required
            />
          </div>
          <div className="form-group">
            {/* FIX (William 2026-09-09 v29): horario especifico que o
                solicitante informa pra "apresentar-se em" no IFCT.
                Sera usado no PDF do IFCT no campo "Apresentar-se em". */}
            <label>Horário da apresentação <span className="required">*</span></label>
            <input
              type="time"
              value={horarioApresentacao}
              onChange={e => setHorarioApresentacao(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Oficial que autorizou o deslocamento <span className="required">*</span></label>
            <input
              type="text"
              value={oficialAutorizador}
              onChange={e => setOficialAutorizador(e.target.value)}
              placeholder="Nome e posto do oficial"
              required
            />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Retirada e Devolucao</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Data de Retirada <span className="required">*</span></label>
              <input type="date" value={retiradaData} onChange={e => setRetiradaData(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Horario de Retirada <span className="required">*</span></label>
              <input type="time" value={retiradaHora} onChange={e => setRetiradaHora(e.target.value)} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Data de Devolucao <span className="required">*</span></label>
              <input type="date" value={devolucaoData} onChange={e => setDevolucaoData(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Horario de Devolucao <span className="required">*</span></label>
              <input type="time" value={devolucaoHora} onChange={e => setDevolucaoHora(e.target.value)} required />
            </div>
          </div>
        </div>

        {erro && <div className="alert alert-error">{erro}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Solicitar Agendamento'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => nav('/agendamentos')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
