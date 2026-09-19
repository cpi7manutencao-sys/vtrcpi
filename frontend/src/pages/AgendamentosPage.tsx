import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { getUser, isGestor, isAdmin, isMaster } from '../lib/auth'
import { listAgendamentos, approveAgendamento, rejectAgendamento, atribuirViatura, concluirAgendamento, cancelAgendamento, listViaturas, listUnits, getUltimoOdometro, editarOdometro, excluirAgendamento, gerarLinkIfct, validarIfct, revogarLinkIfct, atualizarMotorista } from '../lib/api'
import { parseSAT, abrirSATPopup, type SatResult } from '../lib/sat-parser'
import { STATUS_AGENDAMENTO } from '../lib/constants'

export default function AgendamentosPage() {
  const user = getUser()
  const [filtro, setFiltro] = useState<string>('')
  // FIX (William 2026-08-24): filtro por data da RETIRADA
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('')
  const [filtroDataFim, setFiltroDataFim] = useState<string>('')
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [viaturas, setViaturas] = useState<any[]>([])
  const [unitsMap, setUnitsMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<any>(null)  // modal de detalhes

  // FIX (William 2026-09-04): modal pra gestor consultar SAT do motorista
  // (caso o solicitante NAO seja o motorista)
  const [satMotoristaModal, setSatMotoristaModal] = useState<any | null>(null)
  const [satMotoristaPaste, setSatMotoristaPaste] = useState('')
  const [satMotoristaErro, setSatMotoristaErro] = useState('')
  const [satMotoristaResult, setSatMotoristaResult] = useState<SatResult | null>(null)
  const [satMotoristaSubmitting, setSatMotoristaSubmitting] = useState(false)

  // FIX (William 2026-09-04): modal proprio pro link IFCT
  // (substitui alert() - alert trava a UI e o clipboard pode falhar silenciosamente)
  const [ifctLinkModal, setIfctLinkModal] = useState<{ url: string; expiraEm?: number; jaExistia?: boolean } | null>(null)
  const [ifctLinkCopiado, setIfctLinkCopiado] = useState(false)

  if (!user) return <Navigate to="/login" replace />

  function carregar() {
    if (!user) return
    setLoading(true)
    Promise.all([
      listAgendamentos(user.cpf, filtro || undefined),
      isGestor() || isAdmin() ? listViaturas(user.cpf, undefined, true) : Promise.resolve([]),
      listUnits().catch(() => []),
    ])
      .then(([ags, viats, units]) => {
        setAgendamentos(ags)
        setViaturas(viats)
        const m: Record<string, any> = {}
        for (const u of units) m[u.id] = u
        setUnitsMap(m)
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [filtro, user?.cpf])

  async function handleApprove(id: number) {
    if (!user) return
    if (!confirm('Aprovar este agendamento?')) return
    try {
      await approveAgendamento(user.cpf, id)
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  async function handleReject(id: number) {
    if (!user) return
    const motivo = prompt('Motivo da rejeição:')
    if (!motivo) return
    try {
      await rejectAgendamento(user.cpf, id, motivo)
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  async function handleAtribuir(agendamentoId: number) {
    if (!user) return
    const prefixo = prompt('Prefixo da viatura (ex: I-07019):')
    if (!prefixo) return
    const v = viaturas.find(x => x.prefixo === prefixo)
    if (!v) {
      alert('Viatura não encontrada com esse prefixo')
      return
    }

    // FIX (William 2026-09-07 v2): KM inicial agora eh responsabilidade do MOTORISTA
    // (preenchido no encerramento do IFCT). Gestor so atribui a viatura.

    try {
      await atribuirViatura(user.cpf, agendamentoId, v.id)
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  // FIX (William 2026-09-01): gera link IFCT pro motorista preencher no celular
  // FIX (William 2026-09-04 v3): substitui alert por modal proprio com URL visivel
  // + botao "Copiar pro clipboard" (UX mais confiavel)
  async function handleGerarLinkIfct(agendamentoId: number) {
    if (!user) return
    try {
      const res = await gerarLinkIfct(user.cpf, agendamentoId)
      const baseUrl = window.location.origin
      const url = `${baseUrl}/#/ifct/${res.linkIfct}`
      setIfctLinkModal({ url, expiraEm: res.linkIfctExpiraEm, jaExistia: res.jaExistia })
      // Tenta copiar pro clipboard em background (UX extra)
      try {
        await navigator.clipboard.writeText(url)
        setIfctLinkCopiado(true)
      } catch {
        setIfctLinkCopiado(false)
      }
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  // FIX (William 2026-09-14 v58): modal de Validar ICT com opcoes Aprovar/Negar
  // Substitui o antigo confirm() direto. Tambem remove a redundancia entre
  // o botao "Concluir" e o "Validar ICT" - agora Validar ICT FAZ TUDO.
  const [validarModal, setValidarModal] = useState<{ id: number; nome: string } | null>(null)
  const [justificativaNegar, setJustificativaNegar] = useState('')
  const [submitValidar, setSubmitValidar] = useState(false)
  function abrirValidarModal(agendamentoId: number, nome: string) {
    setValidarModal({ id: agendamentoId, nome })
    setJustificativaNegar('')
  }
  async function handleValidarAprovar() {
    if (!validarModal || !user) return
    setSubmitValidar(true)
    try {
      await validarIfct(user.cpf, validarModal.id, { aprovar: true })
      alert('ICT APROVADO! Agendamento concluido com sucesso.')
      setValidarModal(null)
      carregar()
    } catch (e: any) { alert(e.message) }
    finally { setSubmitValidar(false) }
  }
  async function handleValidarNegar() {
    if (!validarModal || !user) return
    if (!justificativaNegar.trim()) {
      alert('Informe a justificativa pra NEGAR o ICT.')
      return
    }
    setSubmitValidar(true)
    try {
      const r = await validarIfct(user.cpf, validarModal.id, {
        aprovar: false,
        justificativa: justificativaNegar.trim(),
      })
      if (r.emailEnviado) {
        alert('ICT NEGADO. O motorista foi notificado por email para corrigir.')
      } else {
        alert('ICT NEGADO. ' + (r.emailErro ? '(Email nao enviado: ' + r.emailErro + ')' : ''))
      }
      setValidarModal(null)
      setJustificativaNegar('')
      carregar()
    } catch (e: any) { alert(e.message) }
    finally { setSubmitValidar(false) }
  }

  // FIX (William 2026-09-01): revoga link ICT
  async function handleRevogarLinkIfct(agendamentoId: number) {
    if (!user) return
    if (!confirm('Revogar o link ICT? O motorista não conseguirá mais acessar o formulário.')) return
    try {
      await revogarLinkIfct(user.cpf, agendamentoId)
      alert('Link ICT revogado.')
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  // FIX (William 2026-09-04): abre modal pro gestor consultar SAT do motorista
  // (caso o solicitante NAO seja o motorista)
  function handleAbrirSatMotorista(ag: any) {
    setSatMotoristaModal(ag)
    setSatMotoristaPaste('')
    setSatMotoristaResult(null)
    setSatMotoristaErro('')
  }

  function processarPasteSatMotorista() {
    if (!satMotoristaPaste || satMotoristaPaste.trim().length < 10) {
      setSatMotoristaErro('Cole o resultado do SAT no campo abaixo (selecione o texto da pagina e CTRL+V aqui)')
      return
    }
    if (!satMotoristaModal) return
    const reLimpo = String(satMotoristaModal.motoristaRe || '').replace(/\D/g, '').trim()
    const r = parseSAT(satMotoristaPaste, reLimpo)
    setSatMotoristaResult(r)
    if (!r.encontrado) {
      setSatMotoristaErro(r.erro || 'Nao foi possivel extrair dados do SAT. Confira se colou o conteudo da pagina inteira.')
    } else {
      setSatMotoristaErro('')
    }
  }

  function abrirSatPopupMotorista() {
    if (!satMotoristaModal) return
    const reLimpo = String(satMotoristaModal.motoristaRe || '').replace(/\D/g, '').trim()
    if (reLimpo.length < 2) {
      setSatMotoristaErro('RE invalido (precisa de pelo menos 2 digitos)')
      return
    }
    setSatMotoristaErro('')
    abrirSATPopup(reLimpo)
  }

  async function handleSalvarSatMotorista() {
    if (!satMotoristaModal || !satMotoristaResult) return
    setSatMotoristaSubmitting(true)
    try {
      await atualizarMotorista(satMotoristaModal.id, {
        motoristaRe: satMotoristaResult.re,
        motoristaPosto: satMotoristaResult.postoGraduacao,
        motoristaNome: satMotoristaResult.nome,
        motoristaOpm: satMotoristaResult.opm,
        motoristaOpmCode: satMotoristaResult.opmCode,
        motoristaCnh: satMotoristaResult.cnhCategoria,
        motoristaBoletim: satMotoristaResult.boletim,
        motoristaDataProva: satMotoristaResult.dataProva,
        motoristaPublicacoes: satMotoristaResult.publicacoes,
      })
      alert('Dados do motorista atualizados com sucesso!')
      setSatMotoristaModal(null)
      setSatMotoristaPaste('')
      setSatMotoristaResult(null)
      carregar()
    } catch (e: any) {
      setSatMotoristaErro(e.message || 'Erro ao salvar dados do motorista')
    } finally {
      setSatMotoristaSubmitting(false)
    }
  }

  async function handleConcluir(id: number) {
    // FIX (William 2026-09-14 v58): botao "Concluir" foi removido da UI normal.
    // Agora a conclusao acontece junto com a validacao do ICT (handleValidarAprovar).
    // Mantido como stub pra nao quebrar se algum lugar chama, mas redireciona
    // pro modal de validar.
    if (!user) return
    const ag = agendamentos.find(x => x.id === id)
    if (ag) abrirValidarModal(id, `${ag.postoGraduacao} ${ag.nomeGuerra}`)
    else alert('Agendamento nao encontrado')
  }

  async function handleCancel(id: number) {
    if (!user) return
    if (!confirm('Cancelar este agendamento?')) return
    try {
      await cancelAgendamento(user.cpf, id)
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  // FIX (William 2026-09-14 v55): excluir agendamento (qualquer ADMIN)
  async function handleExcluir(id: number, info: string) {
    if (!user) return
    if (!isAdmin()) {
      alert('Apenas admin pode excluir agendamentos.')
      return
    }
    const ok = confirm(
      `EXCLUIR PERMANENTEMENTE o agendamento?\n\n${info}\n\nEssa ação NÃO pode ser desfeita.`
    )
    if (!ok) return
    try {
      await excluirAgendamento(user.cpf, id)
      alert('Agendamento excluído.')
      setDetalhe(null)  // fecha modal se tiver aberto
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  // FIX (William 2026-08-19): gestor/admin edita odometro caso erro
  async function handleEditarOdometro(ag: any) {
    if (!user) return
    const tipoStr = prompt(
      'Qual odômetro quer editar?\n\nDigite:\n  1 = Retirada\n  2 = Devolução',
      '1',
    )
    if (tipoStr === null) return
    const tipo = tipoStr === '2' ? 'devolucao' : 'retirada'
    const valorAtual = tipo === 'retirada' ? ag.odometroRetirada : ag.odometroDevolucao
    const novoStr = prompt(
      `Novo valor do odômetro de ${tipo.toUpperCase()}\n(Atual: ${valorAtual ?? 'não registrado'} km)`,
      valorAtual !== null && valorAtual !== undefined ? String(valorAtual) : '',
    )
    if (novoStr === null) return
    const novo = parseInt(novoStr, 10)
    if (isNaN(novo) || novo < 0) {
      alert('Valor inválido (deve ser >= 0)')
      return
    }
    if (!confirm(`Confirmar edição do odômetro de ${tipo} para ${novo} km?`)) return
    try {
      await editarOdometro(user.cpf, ag.id, tipo, novo)
      alert('Odômetro atualizado!')
      carregar()
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Agendamentos</h1>
        <p>Lista de todos os agendamentos da sua unidade</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={`btn ${filtro === '' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro('')}>Todos</button>
        <button className={`btn ${filtro === 'pendente' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro('pendente')}>Pendentes</button>
        <button className={`btn ${filtro === 'aprovado' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro('aprovado')}>Aprovados</button>
        <button className={`btn ${filtro === 'rejeitado' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro('rejeitado')}>Rejeitados</button>
        <button className={`btn ${filtro === 'concluido' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro('concluido')}>Concluidos</button>

        {/* FIX (William 2026-08-24): filtro por data da RETIRADA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 16 }}>
          <label style={{ fontSize: 13, color: '#666' }}>Retirada:</label>
          <input
            type="date"
            value={filtroDataInicio}
            onChange={e => setFiltroDataInicio(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
            title="Data inicial da retirada"
          />
          <span style={{ color: '#666' }}>até</span>
          <input
            type="date"
            value={filtroDataFim}
            onChange={e => setFiltroDataFim(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
            title="Data final da retirada"
          />
          {(filtroDataInicio || filtroDataFim) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setFiltroDataInicio(''); setFiltroDataFim('') }}
              title="Limpar filtro de data"
              style={{ padding: '2px 8px', fontSize: 12 }}
            >×</button>
          )}
        </div>

        <div style={{ flex: 1 }}></div>
        <Link to="/agendar" className="btn btn-primary">+ Novo</Link>
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      {loading ? <p>Carregando...</p> : (
        <div className="card">
          {/* FIX (William 2026-08-24): filtro de data da retirada (client-side) */}
          {(() => {
            const filtrados = agendamentos.filter((a: any) => {
              if (!filtroDataInicio && !filtroDataFim) return true
              const r = new Date(a.retiradaData)
              const rStr = r.toISOString().slice(0, 10)
              if (filtroDataInicio && rStr < filtroDataInicio) return false
              if (filtroDataFim && rStr > filtroDataFim) return false
              return true
            })
            if (filtrados.length === 0) {
              return <p style={{ color: '#666' }}>Nenhum agendamento encontrado no período selecionado.</p>
            }
            return (
            <table className="table">
              <thead>
                <tr>
                  <th>Data Missão</th>
                  <th>Solicitante</th>
                  <th>Unidade</th>
                  <th>Tipo VTR</th>
                  <th>Destino / Finalidade</th>
                  <th>Retirada</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(a => {
                  const unidadeReq = unitsMap[a.unidadeRequerente]
                  const unidadeOrig = unitsMap[a.unidadeOrigem]
                  const unidadeReqLabel = unidadeReq ? (unidadeReq.sigla || unidadeReq.name) : '?'
                  const unidadeOrigLabel = unidadeOrig ? (unidadeOrig.sigla || unidadeOrig.name) : '-'
                  // FIX (William 2026-08-19): mostra prefixo da viatura atribuida
                  // ao inves do ID cru do Convex
                  const viaturaAtribuida = a.viaturaAtribuida
                    ? viaturas.find(v => v.id === a.viaturaAtribuida)
                    : null
                  const viaturaLabel = viaturaAtribuida
                    ? `${viaturaAtribuida.prefixo}${viaturaAtribuida.placa ? ' (' + viaturaAtribuida.placa + ')' : ''}`
                    : null
                  return (
                  <tr key={a.id}>
                    <td>{new Date(a.dataMissao).toLocaleDateString('pt-BR')}</td>
                    <td>{a.postoGraduacao} {a.nomeGuerra}<br /><small style={{ color: '#888' }}>RE {a.re}</small></td>
                    <td>
                      <strong>Req: {unidadeReqLabel}</strong>
                      <div style={{ fontSize: 11, color: '#666' }}>Orig: {unidadeOrigLabel}</div>
                      {a.secaoSetor && <div style={{ fontSize: 11, color: '#888' }}>{a.secaoSetor}</div>}
                      {a.unidadeRequerenteOutro && <div style={{ fontSize: 11, color: '#888' }}>Outro: {a.unidadeRequerenteOutro}</div>}
                    </td>
                    <td>
                      {a.tipoViaturaSolicitada}
                      {a.tipoViaturaOutro && <div style={{ fontSize: 11, color: '#888' }}>{a.tipoViaturaOutro}</div>}
                    </td>
                    <td style={{ maxWidth: 240 }}>
                      <div><strong>{a.destino}</strong></div>
                      <div style={{ fontSize: 12, color: '#666' }}>{a.finalidade}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {new Date(a.retiradaData).toLocaleDateString('pt-BR')} <strong>{a.retiradaHora}</strong>
                      <div style={{ color: '#888' }}>
                        até {new Date(a.devolucaoData).toLocaleDateString('pt-BR')} {a.devolucaoHora}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${a.status}`}>
                        {STATUS_AGENDAMENTO[a.status]?.label || a.status}
                      </span>
                      {viaturaLabel && <div style={{ fontSize: 11, color: '#1976d2', fontWeight: 600 }}>VTR: {viaturaLabel}</div>}
                      {/* FIX (William 2026-09-01): badge ICT quando tem viatura atribuida */}
                      {a.viaturaAtribuida && a.ifctStatus && (
                        <div style={{ fontSize: 11, color: a.ifctStatus === 'validado' ? '#2e7d32' : a.ifctStatus === 'preenchido' ? '#1976d2' : '#f57c00', fontWeight: 600, marginTop: 2 }}>
                          📋 ICT: {a.ifctStatus === 'pendente' ? 'aguardando motorista' : a.ifctStatus}
                        </div>
                      )}
                      {/* KM rodados quando concluido (William 2026-08-19) */}
                      {a.status === 'concluido' && typeof a.kmRodados === 'number' && (
                        <div style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600, marginTop: 2 }}>
                          🚗 {a.kmRodados.toLocaleString('pt-BR')} km
                        </div>
                      )}
                      {/* FIX (William 2026-09-04 v2): badge motorista pendente
                          - Aparece sempre que: aprovado, tem RE mas falta nome do motorista */}
                      {a.motoristaRe && !a.motoristaNome && (
                        <div style={{ fontSize: 11, color: '#f57c00', fontWeight: 600, marginTop: 2 }}>
                          📡 SAT do motorista pendente
                        </div>
                      )}
                      {a.motoristaNome && (
                        <div style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600, marginTop: 2 }}>
                          ✓ Motorista: {a.motoristaPosto} {a.motoristaNome}
                        </div>
                      )}
                      {a.status === 'aprovado' && typeof a.odometroRetirada === 'number' && (
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                          KM inicial: {a.odometroRetirada.toLocaleString('pt-BR')}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setDetalhe(a)}>Detalhes</button>
                      {' '}
                      {a.status === 'pendente' && !a.ehDejem && (isGestor() || isAdmin()) && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => handleApprove(a.id)}>Aprovar</button>
                          {' '}
                          <button className="btn btn-danger btn-sm" onClick={() => handleReject(a.id)}>Rejeitar</button>
                        </>
                      )}
                      {a.status === 'aprovado' && (
                        <>
                          {(!a.viaturaAtribuida) && (
                            a.motoristaNome ? (
                              <button className="btn btn-primary btn-sm" onClick={() => handleAtribuir(a.id)}>Atribuir VTR</button>
                            ) : (
                              <button
                                className="btn btn-sm"
                                disabled
                                title="Consulte o SAT do motorista (botao 'Consultar SAT Motorista' na coluna Acoes) antes de atribuir a viatura"
                                style={{ background: '#f5f5f5', color: '#999', border: '1px solid #ddd', cursor: 'not-allowed', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                              >🔒 Aguardando SAT</button>
                            )
                          )}
                        </>
                      )}
                      {/* FIX (William 2026-09-14 v58): regra de Cancelar
                          NAO aparece se:
                          - ja' foi concluido/cancelado/rejeitado
                          - motorista ja' comecou (partidaConfirmadaEm != null)
                          - ICT ja' foi preenchido ou validado
                          (gestor precisa EXCLUIR via admin se quiser forçar) */}
                      {a.status !== 'concluido' && a.status !== 'cancelado' && a.status !== 'rejeitado' && !a.partidaConfirmadaEm && a.ifctStatus !== 'preenchido' && a.ifctStatus !== 'validado' && (
                        <>{' '}<button className="btn btn-secondary btn-sm" onClick={() => handleCancel(a.id)}>Cancelar</button></>
                      )}
                      {/* FIX (William 2026-09-04 v2): Botao "Consultar SAT do motorista"
                          - Aparece sempre que: status=aprovado, tem RE mas ainda nao
                            tem nome do motorista (independente de quem eh o motorista).
                          - Visivel soh pra gestor/admin */}
                      {a.status === 'aprovado' && (isGestor() || isAdmin()) &&
                        a.motoristaRe && !a.motoristaNome && (
                        <>{' '}<button
                          className="btn btn-warning btn-sm"
                          title={`Consultar SAT do RE ${a.motoristaRe} (preenchido pelo solicitante)`}
                          onClick={() => handleAbrirSatMotorista(a)}
                        >📡 Consultar SAT Motorista</button></>
                      )}
                      {/* FIX (William 2026-09-01): Botoes ICT - soh aparece se tem viatura atribuida */}
                      {a.viaturaAtribuida && (isGestor() || isAdmin()) && (
                        <>
                          {(!a.ifctStatus || a.ifctStatus === 'pendente') && (
                            <>{' '}<button
                              className="btn btn-warning btn-sm"
                              title="Gerar link ICT pro motorista preencher no celular"
                              onClick={() => handleGerarLinkIfct(a.id)}
                            >📋 ICT</button></>
                          )}
                          {a.ifctStatus === 'preenchido' && (
                            <>{' '}<button
                              className="btn btn-success btn-sm"
                              title="Validar ICT preenchido pelo motorista (aprovar ou negar com justificativa)"
                              onClick={() => abrirValidarModal(a.id, `${a.postoGraduacao} ${a.nomeGuerra}`)}
                            >✅ Validar ICT</button></>
                          )}
                          {a.ifctStatus === 'validado' && (
                            <>{' '}<span
                              style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600, marginLeft: 4 }}
                              title={`ICT validado em ${a.ifctValidadoEm ? new Date(a.ifctValidadoEm).toLocaleString('pt-BR') : ''}`}
                            >✅ ICT OK</span></>
                          )}
                          {/* FIX (William 2026-09-08): botao de baixar PDF (pra gestor tambem) */}
                          {a.linkIfct && (a.ifctStatus === 'preenchido' || a.ifctStatus === 'validado') && (
                            <>{' '}<a
                              href={`/api/ifct/pdf?token=${encodeURIComponent(a.linkIfct)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm"
                              title="Baixar PDF do ICT (Frente/Verso)"
                              style={{ background: '#e3f2fd', color: '#1976d2', border: '1px solid #1976d2', padding: '4px 8px', fontSize: 12, borderRadius: 4, textDecoration: 'none' }}
                            >📥 PDF</a></>
                          )}
                        </>
                      )}
                      {/* FIX (William 2026-09-14 v55): botao Excluir (admin) */}
                      {isAdmin() && (
                        <>{' '}<button
                          className="btn btn-danger btn-sm"
                          title="Excluir permanentemente (apenas admin)"
                          onClick={() => handleExcluir(a.id,
                            `${a.postoGraduacao} ${a.nomeGuerra} (RE ${a.re}) - ${new Date(a.dataMissao).toLocaleDateString('pt-BR')}`
                          )}
                        >🗑️ Excluir</button></>
                      )}
                      {/* FIX (William 2026-09-16 v77): Solicitante pode ver o ICT
                          (PDF e link) - mas NAO pode gerar/revogar. So visualizar. */}
                      {a.linkIfct && user?.id === a.solicitante && !(isGestor() || isAdmin()) && (a.ifctStatus === 'preenchido' || a.ifctStatus === 'validado') && (
                        <>{' '}<a
                          href={`/api/ifct/pdf?token=${encodeURIComponent(a.linkIfct)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          title="Baixar PDF do ICT (Frente/Verso) - apenas visualizar"
                          style={{ background: '#e3f2fd', color: '#1976d2', border: '1px solid #1976d2', padding: '4px 8px', fontSize: 12, borderRadius: 4, textDecoration: 'none' }}
                        >📥 PDF</a></>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            )
          })()}
        </div>
      )}

      {/* FIX (William 2026-09-04): Modal de SAT do motorista (gestor consulta
          quando o solicitante NAO eh o motorista) */}
      {satMotoristaModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001, padding: 20,
        }} onClick={() => setSatMotoristaModal(null)}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>📡 Consultar SAT do Motorista</h2>
            <p style={{ color: '#666', fontSize: 14, margin: '0 0 12px 0' }}>
              O solicitante indicou o <strong>RE {satMotoristaModal.motoristaRe}</strong> como motorista.
              Consulte o SAT e cole o resultado aqui.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={abrirSatPopupMotorista}>
                Abrir SAT em nova janela (RE {satMotoristaModal.motoristaRe})
              </button>
            </div>

            <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 4 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
                Cole aqui o resultado do SAT (CTRL+V) <span style={{ color: '#c62828' }}>*</span>
              </label>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                Na janela do SAT, selecione o texto da pagina (CTRL+A) e copie (CTRL+C).
                Depois cole aqui embaixo. O sistema parseia automaticamente.
              </div>
              <textarea
                value={satMotoristaPaste}
                onChange={e => setSatMotoristaPaste(e.target.value)}
                onPaste={() => setTimeout(processarPasteSatMotorista, 100)}
                placeholder="Cole aqui o HTML ou texto da pagina do SAT..."
                rows={8}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={processarPasteSatMotorista}
                  disabled={!satMotoristaPaste || satMotoristaPaste.trim().length < 10}
                >
                  Processar texto colado
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setSatMotoristaPaste(''); setSatMotoristaResult(null); setSatMotoristaErro('') }}
                >
                  Limpar
                </button>
              </div>
            </div>

            {satMotoristaErro && <div className="alert alert-error" style={{ marginTop: 8 }}>{satMotoristaErro}</div>}

            {satMotoristaResult && satMotoristaResult.encontrado && (
              <div style={{ marginTop: 12, padding: 12, background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#2e7d32' }}>✓ Dados do SAT parseados:</div>
                <table style={{ fontSize: 14 }}>
                  <tbody>
                    <tr><td style={{ color: '#666', paddingRight: 12 }}>Motorista:</td><td><strong>{satMotoristaResult.postoGraduacao} {satMotoristaResult.nome}</strong></td></tr>
                    <tr><td style={{ color: '#666' }}>RE:</td><td style={{ fontFamily: 'monospace' }}>{satMotoristaResult.re}</td></tr>
                    <tr><td style={{ color: '#666' }}>OPM:</td><td>{satMotoristaResult.opm} ({satMotoristaResult.opmCode})</td></tr>
                    <tr>
                      <td style={{ color: '#666', verticalAlign: 'top' }}>CNH:</td>
                      <td>
                        {satMotoristaResult.publicacoes && satMotoristaResult.publicacoes.length > 0 ? (
                          <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                            <tbody>
                              {satMotoristaResult.publicacoes.map((p, i) => (
                                <tr key={i} style={{
                                  background: p.cassada ? '#ffebee' : 'transparent',
                                  color: p.cassada ? '#c62828' : 'inherit',
                                }}>
                                  <td style={{ padding: '2px 8px 2px 0', fontWeight: 600 }}>{p.categoria}</td>
                                  <td style={{ padding: '2px 8px 2px 0' }}>
                                    {p.boletim ? <code style={{ fontSize: 12 }}>{p.boletim}</code> : '-'}
                                  </td>
                                  <td style={{ padding: '2px 0' }}>{p.data || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <span>{satMotoristaResult.cnhCategoria} (Boletim: {satMotoristaResult.boletim}, {satMotoristaResult.dataProva})</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSatMotoristaModal(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSalvarSatMotorista}
                disabled={!satMotoristaResult?.encontrado || satMotoristaSubmitting}
              >
                {satMotoristaSubmitting ? 'Salvando...' : 'Salvar dados do motorista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX (William 2026-09-14 v58): MODAL VALIDAR ICT (aprovar/negar)
          Substitui o antigo confirm() direto. Mostra os dados do ICT e da
          missao, e permite APROVAR (conclui agendamento) ou NEGAR (pede
          justificativa + manda email pro motorista com link pra corrigir). */}
      {validarModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1002, padding: 20,
        }} onClick={() => !submitValidar && setValidarModal(null)}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>✅ Validar ICT</h2>
            <p style={{ color: '#666', fontSize: 14, margin: '0 0 16px 0' }}>
              Revise os dados preenchidos pelo(a) motorista <strong>{validarModal.nome}</strong>.
              Voce pode <strong>APROVAR</strong> (concluir o agendamento) ou <strong>NEGAR</strong>
              (pedir correcoes - motorista recebe email com link pra refazer).
            </p>

            <div style={{
              background: '#fff3e0', border: '1px solid #ffcc80',
              padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13,
            }}>
              <strong style={{ color: '#e65100' }}>O que acontece em cada caso:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, color: '#555' }}>
                <li><strong>APROVAR</strong>: agendamento vai pra status <code>concluido</code> e o ICT pra <code>validado</code>.</li>
                <li><strong>NEGAR</strong>: ICT volta pra <code>pendente</code>, motorista recebe email com o link pra corrigir.</li>
              </ul>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Justificativa (obrigatoria pra NEGAR, opcional pra aprovar):
              </label>
              <textarea
                value={justificativaNegar}
                onChange={e => setJustificativaNegar(e.target.value)}
                placeholder="Ex: KM de retorno esta inconsistente. Corrija conforme hodometro real."
                rows={4}
                style={{
                  width: '100%', padding: 8, fontSize: 14,
                  border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box',
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </div>

            {submitValidar && (
              <div style={{ marginBottom: 12, color: '#1976d2', fontSize: 13 }}>
                Processando...
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setValidarModal(null)}
                disabled={submitValidar}
              >Cancelar</button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleValidarNegar}
                disabled={submitValidar}
                style={{ background: '#c62828', color: 'white' }}
              >❌ Negar</button>
              <button
                className="btn btn-success btn-sm"
                onClick={handleValidarAprovar}
                disabled={submitValidar}
              >✅ Aprovar</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX (William 2026-09-04 v3): Modal do Link IFCT (substitui alert) */}
      {ifctLinkModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1002, padding: 20,
        }} onClick={() => { setIfctLinkModal(null); setIfctLinkCopiado(false) }}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 640, width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>📋 Link ICT {ifctLinkModal.jaExistia ? '(já existia)' : 'gerado'}</h2>
            <p style={{ color: '#666', fontSize: 14, margin: '0 0 12px 0' }}>
              {ifctLinkModal.jaExistia
                ? 'Esse link já tinha sido gerado antes. Pode reenviar pro motorista sem problema.'
                : 'Link gerado e pronto pra enviar pro motorista via WhatsApp.'}
              {ifctLinkModal.expiraEm && (
                <><br /><strong>Expira em:</strong> {new Date(ifctLinkModal.expiraEm).toLocaleString('pt-BR')}</>
              )}
            </p>

            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 }}>
              URL (clique no campo e CTRL+C pra copiar)
            </label>
            <input
              type="text"
              value={ifctLinkModal.url}
              readOnly
              onClick={e => (e.target as HTMLInputElement).select()}
              onFocus={e => (e.target as HTMLInputElement).select()}
              style={{
                width: '100%', padding: '10px', fontFamily: 'monospace', fontSize: 12,
                border: '1px solid #ccc', borderRadius: 4, background: '#fafafa',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(ifctLinkModal.url)
                    setIfctLinkCopiado(true)
                  } catch {
                    setIfctLinkCopiado(false)
                    // Fallback: prompt
                    prompt('Copie o link ICT (CTRL+C):', ifctLinkModal.url)
                  }
                }}
              >
                📋 Copiar pro clipboard
              </button>
              {ifctLinkCopiado === true && (
                <span style={{ color: '#2e7d32', fontWeight: 600, fontSize: 13 }}>
                  ✓ Copiado!
                </span>
              )}
              {ifctLinkCopiado === false && (
                <span style={{ color: '#c62828', fontSize: 13 }}>
                  ⚠ Copia manual necessária (use o campo acima)
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent('Prezado motorista, preencha o ICT no link: ' + ifctLinkModal.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-success btn-sm"
                style={{ textDecoration: 'none' }}
              >
                💬 Abrir WhatsApp
              </a>
              <button className="btn btn-secondary" onClick={() => { setIfctLinkModal(null); setIfctLinkCopiado(false) }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      {detalhe && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={() => setDetalhe(null)}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Detalhes do Agendamento</h2>
            <table className="table" style={{ fontSize: 14 }}>
              <tbody>
                <tr><th>Status</th><td>
                  <span className={`badge badge-${detalhe.status}`}>
                    {STATUS_AGENDAMENTO[detalhe.status]?.label || detalhe.status}
                  </span>
                </td></tr>
                <tr><th>Solicitante</th><td>{detalhe.postoGraduacao} {detalhe.nomeGuerra} (RE {detalhe.re})</td></tr>
                <tr><th>Email</th><td>{detalhe.email}</td></tr>
                <tr><th>Unidade ORIGEM</th><td>
                  {unitsMap[detalhe.unidadeOrigem]?.sigla || '?'}
                  {' '}({(unitsMap[detalhe.unidadeOrigem]?.name) || '?'})
                  <div style={{ fontSize: 11, color: '#888' }}>(OPM do PM logado, automatica)</div>
                </td></tr>
                <tr><th>Unidade REQUERENTE</th><td>
                  <strong>{unitsMap[detalhe.unidadeRequerente]?.sigla || '?'}</strong>
                  {' '}({(unitsMap[detalhe.unidadeRequerente]?.name) || '?'})
                  {detalhe.unidadeRequerenteOutro && <div style={{ fontSize: 12, color: '#888' }}>Outro: {detalhe.unidadeRequerenteOutro}</div>}
                  <div style={{ fontSize: 11, color: '#888' }}>(gestor dessa unidade que aprova)</div>
                </td></tr>
                {detalhe.secaoSetor && (
                  <tr><th>Seção/Setor</th><td>{detalhe.secaoSetor}</td></tr>
                )}
                <tr><th>Data Missão</th><td>{new Date(detalhe.dataMissao).toLocaleDateString('pt-BR')}</td></tr>
                <tr><th>Destino</th><td>{detalhe.destino}</td></tr>
                <tr><th>Finalidade</th><td style={{ whiteSpace: 'pé-wrap' }}>{detalhe.finalidade}</td></tr>
                <tr><th>Oficial Autorizador</th><td>{detalhe.oficialAutorizador}</td></tr>
                <tr><th>Tipo Viatura Solicitada</th><td>
                  {detalhe.tipoViaturaSolicitada}
                  {detalhe.tipoViaturaOutro && <div style={{ fontSize: 12, color: '#888' }}>Outro: {detalhe.tipoViaturaOutro}</div>}
                </td></tr>
                <tr><th>Retirada</th><td>{new Date(detalhe.retiradaData).toLocaleDateString('pt-BR')} as <strong>{detalhe.retiradaHora}</strong></td></tr>
                <tr><th>Devolucao</th><td>{new Date(detalhe.devolucaoData).toLocaleDateString('pt-BR')} as <strong>{detalhe.devolucaoHora}</strong></td></tr>
                {detalhe.viaturaAtribuida && (() => {
                  // FIX (William 2026-08-19): mostra prefixo + placa ao inves do ID
                  const v = viaturas.find(x => x.id === detalhe.viaturaAtribuida)
                  if (v) {
                    return (
                      <tr>
                        <th>Viatura Atribuída</th>
                        <td>
                          <strong style={{ color: '#1976d2' }}>{v.prefixo}</strong>
                          {v.placa && <span style={{ marginLeft: 8, color: '#666' }}>({v.placa})</span>}
                          {v.tipo && <div style={{ fontSize: 12, color: '#888' }}>{v.tipo}</div>}
                        </td>
                      </tr>
                    )
                  }
                  // Viatura nao encontrada na lista (pode ter sido removida)
                  return (
                    <tr>
                      <th>Viatura Atribuída</th>
                      <td>
                        <strong style={{ color: '#999' }}>ID: {detalhe.viaturaAtribuida}</strong>
                        <div style={{ fontSize: 11, color: '#c62828' }}>(viatura não encontrada - foi removida?)</div>
                      </td>
                    </tr>
                  )
                })()}
                {/* ODOMETRO (William 2026-08-19) */}
                {(typeof detalhe.odometroRetirada === 'number' || typeof detalhe.odometroDevolucao === 'number') && (
                  <tr>
                    <th>Odômetro</th>
                    <td>
                      {typeof detalhe.odometroRetirada === 'number' && (
                        <div>
                          <span style={{ color: '#666' }}>Retirada:</span>{' '}
                          <strong>{detalhe.odometroRetirada.toLocaleString('pt-BR')} km</strong>
                          {detalhe.odometroRetiradaEm && (
                            <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
                              em {new Date(detalhe.odometroRetiradaEm).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                      )}
                      {typeof detalhe.odometroDevolucao === 'number' && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ color: '#666' }}>Devolução:</span>{' '}
                          <strong>{detalhe.odometroDevolucao.toLocaleString('pt-BR')} km</strong>
                          {detalhe.odometroDevolucaoEm && (
                            <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
                              em {new Date(detalhe.odometroDevolucaoEm).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                      )}
                      {typeof detalhe.kmRodados === 'number' && detalhe.kmRodados >= 0 && (
                        <div style={{ marginTop: 6, padding: 4, background: '#e8f5e9', borderRadius: 4, display: 'inline-block' }}>
                          <strong style={{ color: '#2e7d32' }}>🚗 {detalhe.kmRodados.toLocaleString('pt-BR')} km rodados</strong>
                          {detalhe.odometroEditado && (
                            <span style={{ fontSize: 10, color: '#f57c00', marginLeft: 8 }}>(editado manualmente)</span>
                          )}
                        </div>
                      )}
                      {/* Botao de editar pra gestor/admin */}
                      {(isGestor() || isAdmin()) && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEditarOdometro(detalhe)}
                          >
                            ✏️ Editar odômetro
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {detalhe.motivoRejeição && (
                  <tr><th>Motivo Rejeição</th><td style={{ color: '#c62828' }}>{detalhe.motivoRejeição}</td></tr>
                )}
                {(detalhe.motoristaNome || detalhe.motoristaRe) && (
                  <tr><th>Motorista</th><td>
                    {detalhe.motoristaPosto} <strong>{detalhe.motoristaNome}</strong> (RE {detalhe.motoristaRe})
                    <div style={{ fontSize: 12, color: '#666' }}>
                      OPM: {detalhe.motoristaOpm} ({detalhe.motoristaOpmCode}) |
                      CNH: {detalhe.motoristaCnh} (Boletim: {detalhe.motoristaBoletim}, {detalhe.motoristaDataProva})
                    </div>
                  </td></tr>
                )}
                <tr><th>Criado em</th><td>{new Date(detalhe.criadoEm).toLocaleString('pt-BR')}</td></tr>
                {detalhe.aprovadoEm && <tr><th>Aprovado em</th><td>{new Date(detalhe.aprovadoEm).toLocaleString('pt-BR')}</td></tr>}
                {detalhe.concluidoEm && <tr><th>Concluído em</th><td>{new Date(detalhe.concluidoEm).toLocaleString('pt-BR')}</td></tr>}
              </tbody>
            </table>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {/* FIX (William 2026-09-14 v55): botao Excluir no modal (admin) */}
                {isAdmin() && detalhe && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleExcluir(detalhe.id,
                      `${detalhe.postoGraduacao} ${detalhe.nomeGuerra} (RE ${detalhe.re}) - ${new Date(detalhe.dataMissao).toLocaleDateString('pt-BR')}`
                    )}
                  >
                    🗑️ Excluir permanentemente
                  </button>
                )}
              </div>
              <button className="btn btn-secondary" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
