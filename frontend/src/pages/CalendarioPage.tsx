import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getUser } from '../lib/auth'
import { listAgendamentosPorMes, listViaturas, listUnits } from '../lib/api'

export default function CalendarioPage() {
  const user = getUser()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mês, setMes] = useState(hoje.getMonth())
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [viaturas, setViaturas] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<any | null>(null)
  // FIX (William 2026-09-14 v57): clicar no QUADRADO do dia abre lista
  // completa. Antes: soh os primeiros eventos individuais eram clicaveis
  // e o "+N" de overflow nao levava a nada util.
  const [diaSelecionado, setDiaSelecionado] = useState<{ data: string; eventos: any[] } | null>(null)

  if (!user) return <Navigate to="/login" replace />

  async function carregar() {
    if (!user) return
    setLoading(true)
    setErro('')
    try {
      const [ags, viats, unts] = await Promise.all([
        listAgendamentosPorMes(user.cpf, ano, mês),
        listViaturas(user.cpf),
        listUnits(),
      ])
      setAgendamentos(ags)
      setViaturas(viats)
      setUnits(unts)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [ano, mês, user?.cpf])

  function mesAnterior() {
    if (mês === 0) {
      setMes(11)
      setAno(ano - 1)
    } else {
      setMes(mês - 1)
    }
  }

  function mesProximo() {
    if (mês === 11) {
      setMes(0)
      setAno(ano + 1)
    } else {
      setMes(mês + 1)
    }
  }

  const primeiroDia = new Date(ano, mês, 1)
  const ultimoDia = new Date(ano, mês + 1, 0)
  const diasNoMes = ultimoDia.getDate()
  const diaSemanaInicio = primeiroDia.getDay()  // 0=domingo

  const dias: { dia: number; mesAtual: boolean; data: string }[] = []
  // Dias do mês anterior
  for (let i = diaSemanaInicio; i > 0; i--) {
    const d = new Date(ano, mês, -i + 1)
    dias.push({ dia: d.getDate(), mesAtual: false, data: d.toISOString().slice(0, 10) })
  }
  // Dias do mês atual
  for (let d = 1; d <= diasNoMes; d++) {
    const data = new Date(ano, mês, d)
    dias.push({ dia: d, mesAtual: true, data: data.toISOString().slice(0, 10) })
  }
  // Completar até 42 (6 semanas)
  while (dias.length < 42) {
    const idx = dias.length - diaSemanaInicio - diasNoMes + 1
    const d = new Date(ano, mês, idx)
    dias.push({ dia: d.getDate(), mesAtual: false, data: d.toISOString().slice(0, 10) })
  }

  const eventosPorDia: Record<string, any[]> = {}
  for (const a of agendamentos) {
    const dataKey = new Date(a.dataMissao).toISOString().slice(0, 10)
    if (!eventosPorDia[dataKey]) eventosPorDia[dataKey] = []
    eventosPorDia[dataKey].push(a)
  }

  const hojeKey = hoje.toISOString().slice(0, 10)
  const nomesMes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

  function unitLabel(id: any): string {
    if (!id) return '—'
    const u = units.find(x => x._id === id.toString())
    if (!u) return '(unidade não encontrada)'
    return u.sigla || u.name || '(sem nome)'
  }

  function viaturaLabel(id: any): { prefixo: string; placa?: string; tipo?: string } | null {
    if (!id) return null
    const v = viaturas.find(x => x._id === id.toString())
    if (!v) return null
    return { prefixo: v.prefixo, placa: v.placa, tipo: v.tipo }
  }

  function formatarData(ts: number): string {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('pt-BR')
  }

  function formatarStatus(s: string): { label: string; cor: string } {
    switch (s) {
      case 'pendente': return { label: 'Pendente', cor: '#f57c00' }
      case 'aprovado': return { label: 'Aprovado', cor: '#2e7d32' }
      case 'rejeitado': return { label: 'Rejeitado', cor: '#c62828' }
      case 'concluido': return { label: 'Concluído', cor: '#1976d2' }
      case 'nao_compareceu': return { label: 'Não compareceu', cor: '#757575' }
      default: return { label: s, cor: '#666' }
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Calendário de Agendamentos</h1>
        <p>Visão mensal das missões agendadas. Clique em um agendamento para ver os detalhes.</p>
      </div>

      <div className="calendar">
        <div className="calendar-header">
          <button className="btn btn-secondary btn-sm" onClick={mesAnterior}>&lt; Anterior</button>
          <h2>{nomesMes[mês]} {ano}</h2>
          <button className="btn btn-secondary btn-sm" onClick={mesProximo}>Próximo &gt;</button>
        </div>

        <div className="calendar-grid">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
            <div key={d} className="calendar-day-header">{d}</div>
          ))}
          {dias.map((d, i) => {
            const eventos = eventosPorDia[d.data] || []
            const isHoje = d.data === hojeKey
            // FIX (William 2026-09-14 v57): o QUADRADO do dia eh clicavel pra
            // abrir a lista do dia. Mas eventos individuais abrem detalhe direto.
            return (
              <div
                key={i}
                className={`calendar-day ${!d.mesAtual ? 'other-month' : ''} ${isHoje ? 'today' : ''}`}
                style={{ cursor: eventos.length > 0 ? 'pointer' : 'default' }}
                onClick={() => {
                  if (eventos.length > 0) setDiaSelecionado({ data: d.data, eventos });
                }}
                title={eventos.length > 0 ? `Clique para ver todos os ${eventos.length} agendamento(s) deste dia` : undefined}
              >
                <div className="calendar-day-number">{d.dia}</div>
                {eventos.slice(0, 3).map((e, j) => {
                  // FIX (William 2026-08-24): se viatura atribuida, mostra prefixo na frente do nome
                  // Ex: "I-07019 BONFANTE" ou "I-07019 (ABC-1234) BONFANTE"
                  // FIX (William 2026-09-14 v57): clique no evento NAO propaga pro quadrado
                  const vtr = e.viaturaAtribuida
                    ? viaturaLabel(e.viaturaAtribuida)
                    : null
                  const vtrLabel = vtr
                    ? (vtr.placa ? `${vtr.prefixo} (${vtr.placa})` : vtr.prefixo)
                    : null
                  return (
                    <div
                      key={j}
                      className={`calendar-event ${e.status}`}
                      title={`${e.destino} - clique para detalhes`}
                      onClick={(ev) => { ev.stopPropagation(); setDetalhe(e); }}
                      style={{ cursor: 'pointer' }}
                    >
                      {vtrLabel ? <strong>{vtrLabel} </strong> : null}
                      {e.nomeGuerra}
                    </div>
                  )
                })}
                {eventos.length > 3 && (
                  <div
                    className="calendar-event"
                    style={{ background: '#666', color: '#fff', fontWeight: 600 }}
                  >
                    +{eventos.length - 3} (clique no dia pra ver todos)
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {loading && <p>Carregando...</p>}
        {/* FIX (William 2026-09-16 v76): mensagem de "funcionando" removida
            (era ruido - usuario ja sabe que funciona). Mantem vazio quando
            nao tem agendamentos. */}
      </div>

      {/* FIX (William 2026-09-14 v57): MODAL LISTA DO DIA
          - Abre ao clicar no QUADRADO de um dia que tem agendamentos.
          - Lista TODOS os agendamentos daquele dia ordenados por horario.
          - Cada item tem botao "Ver detalhes" que abre o modal de detalhe. */}
      {diaSelecionado && (
        <div
          className="modal-overlay"
          onClick={() => setDiaSelecionado(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            className="modal-content"
            onClick={(ev) => ev.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, padding: 24, maxWidth: 720,
              width: '90%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>
                📅 Agendamentos do dia {formatarData(new Date(diaSelecionado.data).getTime())}
              </h2>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDiaSelecionado(null)}
              >Fechar</button>
            </div>
            <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: 13 }}>
              {diaSelecionado.eventos.length} agendamento(s) neste dia. Clique em "Ver detalhes" pra abrir o agendamento especifico.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...diaSelecionado.eventos]
                .sort((a, b) => (a.retiradaHora || '').localeCompare(b.retiradaHora || ''))
                .map((e, j) => {
                  const st = formatarStatus(e.status)
                  const vtr = viaturaLabel(e.viaturaAtribuida)
                  const vtrLabel = vtr
                    ? (vtr.placa ? `${vtr.prefixo} (${vtr.placa})` : vtr.prefixo)
                    : '(sem viatura)'
                  return (
                    <div
                      key={j}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: 12, border: '1px solid #e0e0e0', borderRadius: 6,
                        background: '#fafafa',
                      }}
                    >
                      <div style={{
                        minWidth: 70, fontWeight: 700, fontSize: 16,
                        color: '#1976d2', fontFamily: 'monospace',
                      }}>
                        {e.retiradaHora || '—'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {e.postoGraduacao} {e.nomeGuerra}
                          {e.re ? <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>RE {e.re}</span> : null}
                        </div>
                        <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>
                          <strong style={{ color: '#1976d2' }}>{vtrLabel}</strong>
                          {' · '}
                          {e.destino}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 3,
                            background: st.cor, color: '#fff', fontWeight: 600,
                          }}>{st.label}</span>
                          <span style={{ color: '#888' }}>{e.finalidade}</span>
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          // FIX: fechar o modal-do-dia antes de abrir o detalhe
                          // (senao fica 2 modais empilhados)
                          setDiaSelecionado(null);
                          setDetalhe(e);
                        }}
                      >Ver detalhes</button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DO AGENDAMENTO */}
      {detalhe && (() => {
        const st = formatarStatus(detalhe.status)
        const vtr = viaturaLabel(detalhe.viaturaAtribuida)
        const uniReq = unitLabel(detalhe.unidadeRequerente)
        const uniOrig = unitLabel(detalhe.unidadeOrigem)
        return (
          <div
            className="modal-overlay"
            onClick={() => setDetalhe(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              className="modal-content"
              onClick={(ev) => ev.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 8, padding: 24, maxWidth: 640,
                width: '90%', maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>Detalhes do Agendamento</h2>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDetalhe(null)}
                >Fechar</button>
              </div>

              <div style={{
                padding: '4px 12px', borderRadius: 4, display: 'inline-block',
                background: st.cor, color: '#fff', fontWeight: 600, fontSize: 13,
                marginBottom: 16,
              }}>
                {st.label}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  <tr><th style={th}>Solicitante</th><td style={td}><strong>{detalhe.postoGraduacao} {detalhe.nomeGuerra}</strong>{detalhe.re ? ` (RE ${detalhe.re})` : ''}</td></tr>
                  <tr><th style={th}>Unidade Requerente</th><td style={td}>{uniReq}{detalhe.secaoSetor ? ` / ${detalhe.secaoSetor}` : ''}</td></tr>
                  <tr><th style={th}>Sua OPM de origem</th><td style={td}>{uniOrig}</td></tr>
                  <tr><th style={th}>Tipo de viatura</th><td style={td}>{detalhe.tipoViaturaSolicitada}{detalhe.tipoViaturaOutro ? ` (${detalhe.tipoViaturaOutro})` : ''}</td></tr>
                  <tr><th style={th}>Data da missão</th><td style={td}>{formatarData(detalhe.dataMissao)}</td></tr>
                  <tr><th style={th}>Destino</th><td style={td}>{detalhe.destino}</td></tr>
                  <tr><th style={th}>Finalidade</th><td style={td}>{detalhe.finalidade}</td></tr>
                  <tr><th style={th}>Oficial autorizador</th><td style={td}>{detalhe.oficialAutorizador || '—'}</td></tr>
                  <tr><th style={th}>Retirada</th><td style={td}>{formatarData(detalhe.retiradaData)} às <strong>{detalhe.retiradaHora}</strong></td></tr>
                  <tr><th style={th}>Devolução</th><td style={td}>{formatarData(detalhe.devolucaoData)} às <strong>{detalhe.devolucaoHora}</strong></td></tr>
                  {vtr && (
                    <tr>
                      <th style={th}>Viatura atribuída</th>
                      <td style={td}>
                        <strong style={{ color: '#1976d2' }}>{vtr.prefixo}</strong>
                        {vtr.placa && <span style={{ marginLeft: 8, color: '#666' }}>({vtr.placa})</span>}
                        {vtr.tipo && <span style={{ marginLeft: 8, color: '#888' }}>[{vtr.tipo}]</span>}
                      </td>
                    </tr>
                  )}
                  {typeof detalhe.odometroRetirada === 'number' && (
                    <tr><th style={th}>Odômetro retirada</th><td style={td}>{detalhe.odometroRetirada} km</td></tr>
                  )}
                  {typeof detalhe.odometroDevolucao === 'number' && (
                    <tr><th style={th}>Odômetro devolução</th><td style={td}>{detalhe.odometroDevolucao} km</td></tr>
                  )}
                  {typeof detalhe.kmRodados === 'number' && (
                    <tr><th style={th}>KM rodados</th><td style={td}><strong>{detalhe.kmRodados} km</strong></td></tr>
                  )}
                  {detalhe.motoristaNome && (
                    <>
                      <tr><th style={th}>Motorista</th><td style={td}><strong>{detalhe.motoristaPosto} {detalhe.motoristaNome}</strong>{detalhe.motoristaRe ? ` (RE ${detalhe.motoristaRe})` : ''}</td></tr>
                      <tr><th style={th}>CNH categoria</th><td style={td}>{detalhe.motoristaCnh || '—'}</td></tr>
                      {detalhe.motoristaOpm && (
                        <tr><th style={th}>Motorista da OPM</th><td style={td}>{detalhe.motoristaOpm}</td></tr>
                      )}
                    </>
                  )}
                  {detalhe.observacao && (
                    <tr><th style={th}>Observação</th><td style={td}>{detalhe.observacao}</td></tr>
                  )}
                </tbody>
              </table>

              <div style={{ marginTop: 16, fontSize: 12, color: '#888', textAlign: 'right' }}>
                Criado em {new Date(detalhe.criadoEm).toLocaleString('pt-BR')}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #eee',
  fontWeight: 600, color: '#555', width: '40%', verticalAlign: 'top',
}
const td: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid #eee', verticalAlign: 'top',
}
