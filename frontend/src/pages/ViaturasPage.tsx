import { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getUser, isEditor, isAdmin, isGestor } from '../lib/auth'
import { listViaturas, upsertViatura, listUnits, colocarViaturaEmDescarga, toggleViaturaAtivo, listViaturaHistorico, gerarLinkRonda, listRondasByViatura } from '../lib/api'

export default function ViaturasPage() {
  const user = getUser()
  const [viaturas, setViaturas] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // Filtros
  const [filtroAtivo, setFiltroAtivo] = useState<boolean | undefined>(undefined)  // status
  const [filtroTipo, setFiltroTipo] = useState<'MT' | 'CR' | undefined>(undefined)  // tipo
  const [filtroOpm, setFiltroOpm] = useState<string>('')  // unidade (matriz)
  // FIX (William 2026-08-18): busca livre por placa/prefixo/patrimonio
  const [filtroBusca, setFiltroBusca] = useState<string>('')
  // FIX (William 2026-08-18): filtra uma subordinada (filha) especifica
  // SÓ aparece se a unidade selecionada tem filhas
  const [filtroSubordinada, setFiltroSubordinada] = useState<string>('')

  // Modal de cadastro/edicao
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<any>(null)

  // FIX (William 2026-08-24): modal de Historico de baixa/reativacao
  const [showHistorico, setShowHistorico] = useState(false)
  const [viaturaHistorico, setViaturaHistorico] = useState<any | null>(null)
  const [historicoEventos, setHistoricoEventos] = useState<any[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)

  // FIX (William 2026-08-24): mini-modal pra pedir motivo/situacao/observacao
  // quando o user desmarca o checkbox de operante (vai baixar)
  const [showBaixaForm, setShowBaixaForm] = useState(false)
  const [viaturaParaBaixar, setViaturaParaBaixar] = useState<any | null>(null)
  const [baixaMotivo, setBaixaMotivo] = useState('')
  const [baixaSituacao, setBaixaSituacao] = useState('')
  const [baixaObservacao, setBaixaObservacao] = useState('')

  if (!user) return <Navigate to="/login" replace />
  if (!isEditor() && !isAdmin() && !isGestor()) {
    return <Navigate to="/" replace />
  }

  function carregar() {
    if (!user) return
    setLoading(true)
    Promise.all([
      listViaturas(user.cpf, filtroOpm || undefined, filtroAtivo, filtroTipo),
      listUnits(),
    ])
      .then(([viaturasData, unitsData]) => {
        setViaturas(viaturasData)
        setUnits(unitsData)
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [filtroAtivo, filtroTipo, filtroOpm, user?.cpf])

  // SÓ MATRIZES no filtro: code termina em "0000"
  const matrizes = useMemo(() => {
    return units
      .filter(u => u.code && u.code.length === 9 && u.code.endsWith('0000'))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [units])

  // FIX (William 2026-08-18): Subordinadas = filhas DIRETAS da unidade selecionada
  // (1 nivel soh, nao recursivo). Usado pra popular o dropdown "Subordinadas".
  // SÓ aparece no dropdown se a unidade selecionada tem filhas (>0).
  const subordinadas = useMemo(() => {
    if (!filtroOpm) return []
    return units
      .filter(u => u.parentUnit === filtroOpm)
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [units, filtroOpm])

  // FIX (William 2026-08-18): Determina o escopo do user e quais dropdowns
  // devem ficar TRAVADOS com base no role + unidades + flag escopo.
  //
  // Regras (confirmadas com William 2026-08-18):
  // - admin (William) ou escopo="livre" â tudo livre
  // - 1 unidade matriz BPM (â  CPI-7) â unidade travado, subordinadas livre
  // - 1 unidade filha â ambos travados
  // - 1 unidade CPI-7 raiz (607000000) â livre (ve toda a arvore PMESP)
  // - 0 ou varias unidades â livre (fallback)
  const escopoInfo = useMemo(() => {
    if (!user) return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    // Admin master sempre livre
    if (user.viaturasRole === 'admin') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    // Flag explicita de escopo livre
    if ((user as any).escopo === 'livre') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    // FIX (William 2026-09-14 v64): identifica a(s) unidade(s) do user
    // Cada item pode ser ID (string/number) OU objeto
    const unidadesUser = (user.unidadesEditor && user.unidadesEditor.length > 0
      ? user.unidadesEditor
      : (user.unidadesGestor || [])
    ).map((u: any) => typeof u === 'object' ? u.id : u).filter(Boolean);

    if (unidadesUser.length === 0) {
      // 0 unidades -> livre (fallback admin)
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }

    // Helper: retorna a "matriz tecnica" de cada unidade do user.
    const matrizTecnica = (id: any): number | null => {
      const unit = units.find((u: any) => u.id === id || u._id === String(id))
      if (!unit) return null
      if (unit.code && unit.code.endsWith('0000')) return unit.id
      return unit.commandUnit ?? null
    }

    // FIX (William 2026-09-15 v71): DEFENSIVO - se units ainda nao carregou
    // (1a render), NAO libera os dropdowns. Confia que o backend RLS restringe.
    // Ao inves disso, trava na primeira unidade do user (defensivo).
    if (units.length === 0) {
      const firstId = String(unidadesUser[0])
      return {
        lockedUnidade: true,
        lockedSubordinada: false,
        unidadeFixa: firstId,
        subordinadaFixa: '',
      }
    }

    const matrizesList = unidadesUser.map(matrizTecnica).filter((x: any) => x !== null)
    // Se TODAS tem a mesma matriz tecnica (e nao null) -> trava nessa matriz
    const firstMT = matrizesList[0]
    if (firstMT !== undefined && matrizesList.every((m: any) => m === firstMT)) {
      const matriz = units.find((u: any) => u.id === firstMT || u._id === String(firstMT))
      if (matriz) {
        // CPI-7 raiz â livre (ve tudo)
        if (matriz.code === '607000000') {
          return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
        }
        // Matriz BPM: trava na matriz, filha livre
        return { lockedUnidade: true, lockedSubordinada: false, unidadeFixa: matriz._id, subordinadaFixa: '' }
      }
    }

    // FIX (William v64): soh 1 unidade, ver se eh matriz ou filha
    if (unidadesUser.length === 1) {
      const unicaUnidade = unidadesUser[0]
      const unit = units.find((u: any) => u.id === unicaUnidade || u._id === String(unicaUnidade))
      if (unit) {
        // CPI-7 raiz â livre
        if (unit.code === '607000000') {
          return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
        }
        // Matriz BPM (termina em 0000, â  CPI-7) â unidade travado, subordinada livre
        if (unit.code && unit.code.endsWith('0000')) {
          return { lockedUnidade: true, lockedSubordinada: false, unidadeFixa: unit._id, subordinadaFixa: '' }
        }
        // Filha (code NAO termina em 0000) â ambos travados
        if (unit.parentUnit) {
          return { lockedUnidade: true, lockedSubordinada: true, unidadeFixa: unit.parentUnit, subordinadaFixa: unit._id }
        }
      }
    }

    // 0 unidades OU varias com commandUnit diferentes -> livre (fallback)
    return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
  }, [user, units])

  // FIX (William 2026-08-18): quando o escopo trava a unidade, força filtroOpm
  // E filtroSubordinada pros valores fixos (so na 1a carga ou troca de user)
  useEffect(() => {
    if (escopoInfo.lockedUnidade && escopoInfo.unidadeFixa) {
      setFiltroOpm(escopoInfo.unidadeFixa)
    }
    if (escopoInfo.lockedSubordinada && escopoInfo.subordinadaFixa) {
      setFiltroSubordinada(escopoInfo.subordinadaFixa)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopoInfo.unidadeFixa, escopoInfo.subordinadaFixa, escopoInfo.lockedUnidade, escopoInfo.lockedSubordinada])

  // FIX (William 2026-08-18): filtragem adicional no frontend por busca livre
  // (placa, prefixo ou patrimonio). Case-insensitive, busca em 3 campos.
  // Aplica DEPOIS dos filtros do backend (status, tipo, unidade).
  const viaturasFiltradas = useMemo(() => {
    let result = viaturas
    // Filtro de subordinada (soh se selecionado)
    // FIX (William 2026-09-15): usar _id (string) em vez de id (number)
    // pra match exato com o value do <select>
    if (filtroSubordinada) {
      result = result.filter(v => v.opm && String(v.opm.id) === filtroSubordinada)
    }
    // Filtro de busca textual
    if (filtroBusca.trim()) {
      const busca = filtroBusca.trim().toLowerCase()
      result = result.filter(v => {
        const placa = (v.placa || '').toLowerCase()
        const prefixo = (v.prefixo || '').toLowerCase()
        const patrimonio = (v.patrimonio || '').toLowerCase()
        return placa.includes(busca) ||
               prefixo.includes(busca) ||
               patrimonio.includes(busca)
      })
    }
    return result
  }, [viaturas, filtroBusca, filtroSubordinada])

  // Handler do checkbox inline (marcar/desmarcar como baixada)
  // FIX (William 2026-08-24): agora usa mutation dedicada que registra historico
  async function handleToggleAtivo(v: any, novoAtivo: boolean) {
    if (!user) return
    if (!novoAtivo) {
      // Vai baixar - pede motivo/situacao/observacao antes
      setViaturaParaBaixar(v)
      setBaixaMotivo(v.motivo || '')
      setBaixaSituacao(v.situacao || '')
      setBaixaObservacao(v.observacao || '')
      setShowBaixaForm(true)
      return
    }
    // Reativacao - vai direto, sem motivo
    await aplicarToggleAtivo(v, novoAtivo)
  }

  async function aplicarToggleAtivo(v: any, novoAtivo: boolean, motivo?: string, situacao?: string, observacao?: string) {
    if (!user) return
    try {
      await toggleViaturaAtivo(user.cpf, v._id, novoAtivo, motivo, situacao, observacao)
      // Atualiza local
      setViaturas(prev => prev.map(x => x._id === v._id
        ? { ...x, ativo: novoAtivo, motivo: novoAtivo ? undefined : (motivo || v.motivo), situacao: novoAtivo ? undefined : (situacao || v.situacao), observacao: novoAtivo ? undefined : (observacao || v.observacao) }
        : x))
    } catch (e: any) {
      setErro(e.message)
    }
  }

  // FIX (William 2026-08-24): Confirma baixa com motivo/situacao/observacao
  async function confirmarBaixa() {
    if (!viaturaParaBaixar) return
    if (!baixaMotivo.trim()) {
      alert('Motivo da baixa é obrigatório.')
      return
    }
    await aplicarToggleAtivo(viaturaParaBaixar, false, baixaMotivo.trim(), baixaSituacao.trim() || undefined, baixaObservacao.trim() || undefined)
    setShowBaixaForm(false)
    setViaturaParaBaixar(null)
    setBaixaMotivo('')
    setBaixaSituacao('')
    setBaixaObservacao('')
  }

  // FIX (William 2026-08-24): Abre modal de historico da viatura
  async function handleAbrirHistorico(v: any) {
    if (!user) return
    setViaturaHistorico(v)
    setShowHistorico(true)
    setHistoricoLoading(true)
    try {
      const evs = await listViaturaHistorico(user.cpf, v._id)
      setHistoricoEventos(evs)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setHistoricoLoading(false)
    }
  }

  // FIX (William 2026-09-14 v60): handleGerarLinkRonda REMOVIDO.
  // Era da feature DEJEM (descartada no v49). Rondas agora sao feitas
  // via link do ICT (tela mobile do motorista), nao ha mais QR fixo
  // por viatura. A funcao foi removida pra nao ficar codigo orfao.

  // FIX (William 2026-08-17): handler para enviar viatura para DESCARTE
  async function handleColocarEmDescarga(v: any) {
    if (!user) return
    const confirmar = window.confirm(
      `Enviar viatura "${v.prefixo}" (${v.marcaModelo}) para PROCESSO DE DESCARGA?\n\n` +
      `A viatura sairá da aba Viaturas e ficará disponível apenas na aba "Processo de Descarga".\n` +
      `Para reverter, use a aba "Processo de Descarga" (botão Reativar).`
    )
    if (!confirmar) return
    try {
      await colocarViaturaEmDescarga(user.cpf, v._id, v.motivo)
      // Recarrega lista (viatura vai sumir)
      carregar()
    } catch (e: any) {
      setErro(e.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Viaturas</h1>
        <p>Cadastro das viaturas da sua unidade</p>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className={`btn ${filtroAtivo === undefined ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFiltroAtivo(undefined)}
        >Todas</button>
        <button
          className={`btn ${filtroAtivo === true ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFiltroAtivo(true)}
        >Operantes</button>
        <button
          className={`btn ${filtroAtivo === false ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFiltroAtivo(false)}
        >Baixadas</button>

        {/* FILTRO DE TIPO (NOVO 2026-08-17) */}
        <div style={{ display: 'inline-flex', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
          <button
            onClick={() => setFiltroTipo(undefined)}
            style={{
              padding: '6px 10px',
              border: 'none',
              background: filtroTipo === undefined ? '#1976d2' : 'white',
              color: filtroTipo === undefined ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >Todos</button>
          <button
            onClick={() => setFiltroTipo('CR')}
            style={{
              padding: '6px 10px',
              border: 'none',
              borderLeft: '1px solid #ccc',
              background: filtroTipo === 'CR' ? '#1976d2' : 'white',
              color: filtroTipo === 'CR' ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >🚗 Carro</button>
          <button
            onClick={() => setFiltroTipo('MT')}
            style={{
              padding: '6px 10px',
              border: 'none',
              borderLeft: '1px solid #ccc',
              background: filtroTipo === 'MT' ? '#1976d2' : 'white',
              color: filtroTipo === 'MT' ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >🏍️ Moto</button>
        </div>

        {/* FILTRO DE UNIDADE: SÓ MATRIZES */}
        <select
          value={filtroOpm}
          onChange={e => { setFiltroOpm(e.target.value); setFiltroSubordinada('') }}
          disabled={escopoInfo.lockedUnidade}
          style={{
            padding: '6px 10px',
            borderRadius: '4px',
            border: escopoInfo.lockedUnidade ? '3px solid #e65100' : '1px solid #ccc',
            background: escopoInfo.lockedUnidade ? '#ffe0b2' : 'white',
            minWidth: '240px',
            cursor: escopoInfo.lockedUnidade ? 'not-allowed' : 'pointer',
            color: escopoInfo.lockedUnidade ? '#bf360c' : '#333',
            fontWeight: escopoInfo.lockedUnidade ? 600 : 400,
          }}
          title={escopoInfo.lockedUnidade ? '🔒 Unidade travada pelo seu escopo - você só tem acesso a esta matriz e suas filhas' : 'Filtrar por unidade'}
        >
          {escopoInfo.lockedUnidade
            ? (() => {
                // TRAVADO: mostra APENAS a unidade fixa (sem "Todas" nem outras)
                const u = units.find(x => x._id === escopoInfo.unidadeFixa || String(x.id) === String(escopoInfo.unidadeFixa))
                return (
                  <option value={escopoInfo.unidadeFixa}>
                    🔒 {u ? `${u.code} - ${u.sigla || u.name}` : escopoInfo.unidadeFixa}
                  </option>
                )
              })()
            : (
              <>
                <option value="">Todas as unidades</option>
                {matrizes.map(u => (
                  <option key={u._id} value={u._id}>
                    {u.code} - {u.sigla || u.name}
                  </option>
                ))}
              </>
            )}
        </select>

        {/* FIX (William 2026-09-15 v70): FILTRO DE FILHAS/OPM
            SEMPRE aparece quando uma unidade foi selecionada.
            Mostra a opcao "Todas as OPMs desta unidade" + cada filha. */}
        {filtroOpm && (
          <select
            value={filtroSubordinada}
            onChange={e => setFiltroSubordinada(e.target.value)}
            disabled={escopoInfo.lockedSubordinada}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: escopoInfo.lockedSubordinada ? '3px solid #e65100' : '1px solid #ccc',
              background: escopoInfo.lockedSubordinada ? '#ffe0b2' : 'white',
              minWidth: '260px',
              cursor: escopoInfo.lockedSubordinada ? 'not-allowed' : 'pointer',
              color: escopoInfo.lockedSubordinada ? '#bf360c' : '#333',
              fontWeight: escopoInfo.lockedSubordinada ? 600 : 400,
            }}
            title={escopoInfo.lockedSubordinada
              ? '🔒 Filha travada pelo seu escopo'
              : (subordinadas.length > 0
                  ? 'Filtrar por uma filha específica (ou "Todas" pra ver matriz+filhas)'
                  : 'Esta unidade não tem filhas cadastradas')}
          >
            {escopoInfo.lockedSubordinada ? (
              <option value={escopoInfo.subordinadaFixa}>
                🔒 {units.find(x => x._id === escopoInfo.subordinadaFixa)?.name || escopoInfo.subordinadaFixa}
              </option>
            ) : (
              <>
                <option value="">📋 Todas as OPMs desta unidade</option>
                {subordinadas.map(u => (
                  <option key={u._id} value={u._id}>
                    {u.code} - {u.name}
                  </option>
                ))}
              </>
            )}
          </select>
        )}

        <div style={{ flex: 1 }}></div>

        {/* FIX (William 2026-09-15 v69): Badge visual de escopo - AGORA MUITO mais visivel */}
        {(escopoInfo.lockedUnidade || escopoInfo.lockedSubordinada) && (
          <span style={{
            padding: '6px 12px',
            background: '#e65100',
            border: '2px solid #bf360c',
            borderRadius: 6,
            fontSize: 12,
            color: 'white',
            fontWeight: 700,
          }} title="Seu escopo restringe os filtros de unidade. Você só vê as unidades que tem acesso.">
            🔒 ESCOPO RESTRITO
          </span>
        )}

        {/* FIX (William 2026-08-18): Busca livre por placa/prefixo/patrimonio */}
        <input
          type="text"
          value={filtroBusca}
          onChange={e => setFiltroBusca(e.target.value)}
          placeholder="🔍 Buscar placa, prefixo ou patrimônio..."
          style={{
            padding: '6px 10px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            minWidth: '280px',
            fontSize: '13px',
          }}
        />
        {filtroBusca && (
          <button
            onClick={() => setFiltroBusca('')}
            style={{
              padding: '4px 8px',
              border: '1px solid #ccc',
              background: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
            title="Limpar busca"
          >â</button>
        )}

        {/* Contador */}
        <span style={{ color: '#666', fontSize: '13px' }}>
          {filtroBusca
            ? `${viaturasFiltradas.length} de ${viaturas.length}`
            : `${viaturas.length} viatura${viaturas.length !== 1 ? 's' : ''}`}
        </span>

        {(isEditor() || isAdmin()) && (
          <button
            className="btn btn-primary"
            onClick={() => { setEditando(null); setShowForm(true) }}
          >+ Nova Viatura</button>
        )}
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      {/* FIX (William 2026-08-24): MODAL mini - pedir motivo ao baixar */}
      {showBaixaForm && viaturaParaBaixar && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1001,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowBaixaForm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 8, padding: 24, maxWidth: 520,
              width: '90%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
          >
            <h2 style={{ marginTop: 0 }}>🔴 Registrar Baixa</h2>
            <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
              Viatura <strong>{viaturaParaBaixar.prefixo}</strong> ({viaturaParaBaixar.marcaModelo})
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                Motivo da baixa *
              </label>
              <input
                type="text"
                value={baixaMotivo}
                onChange={e => setBaixaMotivo(e.target.value)}
                placeholder="MOTOR, ARREFECIMENTO, SINISTRO, ..."
                autoFocus
                style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                Situação
              </label>
              <input
                type="text"
                value={baixaSituacao}
                onChange={e => setBaixaSituacao(e.target.value)}
                placeholder="AGUARDANDO PREGÃO, AGUARDANDO PEÇA, EM MANUTENÇÃO, ..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                Observação
              </label>
              <textarea
                value={baixaObservacao}
                onChange={e => setBaixaObservacao(e.target.value)}
                placeholder="Detalhes adicionais (opcional)"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowBaixaForm(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={confirmarBaixa}>
                Confirmar Baixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX (William 2026-08-24): MODAL Historico de baixa/reativacao */}
      {showHistorico && viaturaHistorico && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowHistorico(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 8, padding: 24, maxWidth: 720,
              width: '90%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>📜 Histórico de Baixa/Reativação</h2>
                <p style={{ color: '#666', fontSize: 14, marginTop: 4, marginBottom: 0 }}>
                  <strong>{viaturaHistorico.prefixo}</strong> â {viaturaHistorico.marcaModelo}
                  {viaturaHistorico.placa && <span style={{ marginLeft: 8 }}>({viaturaHistorico.placa})</span>}
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowHistorico(false)}
              >Fechar</button>
            </div>

            {historicoLoading ? (
              <p>Carregando histórico...</p>
            ) : historicoEventos.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#666', background: '#fafafa', borderRadius: 4 }}>
                Nenhuma baixa registrada para esta viatura.
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* Linha vertical da timeline */}
                <div style={{
                  position: 'absolute', left: 14, top: 8, bottom: 8, width: 2,
                  background: '#e0e0e0',
                }} />
                {historicoEventos.map((ev, i) => {
                  const isBaixa = ev.tipo === 'baixa'
                  return (
                    <div key={ev._id} style={{ position: 'relative', paddingLeft: 40, marginBottom: 16 }}>
                      {/* Bolinha da timeline */}
                      <div style={{
                        position: 'absolute', left: 6, top: 8, width: 18, height: 18,
                        borderRadius: '50%', background: isBaixa ? '#f57c00' : '#2e7d32',
                        border: '3px solid white', boxShadow: '0 0 0 2px ' + (isBaixa ? '#f57c00' : '#2e7d32'),
                      }} />
                      <div style={{
                        background: isBaixa ? '#fff3e0' : '#e8f5e9',
                        border: '1px solid ' + (isBaixa ? '#ffcc80' : '#a5d6a7'),
                        borderRadius: 6, padding: 12,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <strong style={{ color: isBaixa ? '#e65100' : '#2e7d32' }}>
                            {isBaixa ? '🔴 BAIXADA' : '🟢 REATIVADA'}
                          </strong>
                          <span style={{ fontSize: 12, color: '#666' }}>
                            {new Date(ev.dataHora).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                          <tbody>
                            {ev.motivo && (
                              <tr>
                                <td style={{ padding: '2px 8px 2px 0', color: '#666', width: '30%' }}>Motivo:</td>
                                <td style={{ padding: '2px 0' }}><strong>{ev.motivo}</strong></td>
                              </tr>
                            )}
                            {ev.situacao && (
                              <tr>
                                <td style={{ padding: '2px 8px 2px 0', color: '#666' }}>Situação:</td>
                                <td style={{ padding: '2px 0' }}>{ev.situacao}</td>
                              </tr>
                            )}
                            {typeof ev.km === 'number' && (
                              <tr>
                                <td style={{ padding: '2px 8px 2px 0', color: '#666' }}>KM:</td>
                                <td style={{ padding: '2px 0' }}>{ev.km.toLocaleString('pt-BR')} km</td>
                              </tr>
                            )}
                            <tr>
                              <td style={{ padding: '2px 8px 2px 0', color: '#666' }}>Registrado por:</td>
                              <td style={{ padding: '2px 0' }}>
                                {ev.registradoPorPosto} {ev.registradoPorNome}
                                {ev.registradoPorRe && <span style={{ color: '#888' }}> (RE {ev.registradoPorRe})</span>}
                              </td>
                            </tr>
                            {ev.observacao && (
                              <tr>
                                <td style={{ padding: '2px 8px 2px 0', color: '#666', verticalAlign: 'top' }}>Observação:</td>
                                <td style={{ padding: '2px 0', whiteSpace: 'pre-wrap' }}>{ev.observacao}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL de cadastro/edicao completo */}
      {showForm && (
        <ViaturaFormModal
          user={user}
          units={units}
          viatura={editando}
          onClose={() => { setShowForm(false); setEditando(null) }}
          onSaved={() => { setShowForm(false); setEditando(null); carregar() }}
          onColocarEmDescarga={handleColocarEmDescarga}
        />
      )}

      {loading ? <p>Carregando...</p> : (
        <div className="card">
          {viaturasFiltradas.length === 0 ? (
            <p style={{ color: '#666' }}>
              {filtroBusca
                ? `Nenhuma viatura encontrada para "${filtroBusca}".`
                : 'Nenhuma viatura encontrada com esses filtros.'}
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Operante</th>
                  <th>Prefixo</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Modelo</th>
                  <th>Placa</th>
                  <th>Patrimônio</th>
                  <th>Unidade</th>
                  <th>Motivo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {viaturasFiltradas.map(v => {
                  const unit = v.opm ? units.find(u => u.id === v.opm.id) : null
                  // COR DA LINHA por status (William 2026-08-17)
                  // - Operando: verde bem sutil
                  // - Baixada: laranja bem sutil
                  const rowStyle: React.CSSProperties = {
                    background: v.ativo
                      ? '#e8f5e9'                                          // green 50 - operante
                      : '#fff3e0'                                          // orange 50 - baixada
                  }
                  return (
                    <tr key={v._id} style={rowStyle}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={v.ativo}
                          onChange={e => handleToggleAtivo(v, e.target.checked)}
                          title={v.ativo ? 'Operante (clique pra marcar como baixada)' : 'Baixada (clique pra marcar como operante)'}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                          disabled={!isEditor() && !isAdmin()}
                        />
                      </td>
                      <td><strong>{v.prefixo}</strong></td>
                      <td>{v.tipo}</td>
                      <td>{v.categoria}</td>
                      <td>{v.marcaModelo}</td>
                      <td>{v.placa || '-'}</td>
                      <td>{v.patrimonio || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{unit ? `${unit.code} - ${unit.sigla || unit.name}` : '-'}</td>
                      <td style={{ fontSize: '12px' }}>
                        {/* FIX (William 2026-08-31): quando a viatura esta
                            operando e o motivo no banco eh "OPERACAO"
                            (legado do LCM), mostra "OPERANDO" pra ficar
                            claro o status atual. Caso contrario, mostra
                            o motivo gravado. */}
                        {v.ativo && (v.motivo === 'OPERAÇÃO' || v.motivo === 'OPERACAO' || v.motivo === 'Operação')
                          ? 'OPERANDO'
                          : (v.motivo || '-')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(isEditor() || isAdmin()) && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => { setEditando(v); setShowForm(true) }}
                            >Editar</button>
                          )}
                          {(isEditor() || isAdmin()) && (
                            <button
                              className="btn btn-sm"
                              onClick={() => handleColocarEmDescarga(v)}
                              title="Enviar para Processo de Descarga (sai da aba Viaturas)"
                              style={{
                                background: '#fff',
                                border: '1px solid #c62828',
                                color: '#c62828',
                                padding: '4px 8px',
                                fontSize: '12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >🔴 Descarga</button>
                          )}
                          {/* FIX (William 2026-08-24): Botao Historico */}
                          <button
                            className="btn btn-sm"
                            onClick={() => handleAbrirHistorico(v)}
                            title="Ver histórico de baixa/reativação"
                            style={{
                              background: '#fff',
                              border: '1px solid #1976d2',
                              color: '#1976d2',
                              padding: '4px 8px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >📜 Histórico</button>
                          {/* FIX (William 2026-09-14 v60): Botao "QR Ronda" REMOVIDO.
                              Era da feature DEJEM (descartada no v49).
                              Rondas agora sao feitas via link do ICT (tela mobile do
                              motorista). Botao removido pra nao confundir usuarios. */}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * MODAL de cadastro completo de viatura (popup overlay)
 * FIX (William 2026-08-17): botao "Enviar para Descarga" no card Status
 */
function ViaturaFormModal({ user, units, viatura, onClose, onSaved, onColocarEmDescarga }: {
  user: any
  units: any[]
  viatura: any
  onClose: () => void
  onSaved: () => void
  onColocarEmDescarga: (v: any) => void
}) {
  const [opm, setOpm] = useState(viatura?.opm?.id || user.unit?.id || '')
  const [prefixo, setPrefixo] = useState(viatura?.prefixo || '')
  const [tipo, setTipo] = useState(viatura?.tipo || 'CR')
  const [categoria, setCategoria] = useState(viatura?.categoria || 'OPERACIONAL')
  const [marcaModelo, setMarcaModelo] = useState(viatura?.marcaModelo || '')
  const [placa, setPlaca] = useState(viatura?.placa || '')
  const [patrimonio, setPatrimonio] = useState(viatura?.patrimonio || '')
  const [cadConv, setCadConv] = useState(viatura?.cadConv || '')
  const [anoFab, setAnoFab] = useState<any>(viatura?.anoFab ?? '')
  const [valor, setValor] = useState<any>(viatura?.valor ?? '')
  const [nl, setNl] = useState(viatura?.nl || '')
  const [contaPatrimonial, setContaPatrimonial] = useState(viatura?.contaPatrimonial || '')
  const [local, setLocal] = useState(viatura?.local || '')
  const [ativo, setAtivo] = useState(viatura?.ativo ?? true)
  const [motivo, setMotivo] = useState(viatura?.motivo || '')
  const [situacao, setSituacao] = useState(viatura?.situacao || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await upsertViatura({
        cpf: user.cpf,
        // FIX (William 2026-08-17): passa id da viatura em edicao pra
        // a validacao de placa nao conflitar com a propria viatura
        id: viatura?._id,
        opm,
        prefixo,
        tipo: tipo as 'MT' | 'CR',
        categoria: categoria as 'OPERACIONAL' | 'ADM',
        marcaModelo,
        ativo,
        placa: placa || undefined,
        patrimonio: patrimonio || undefined,
        cadConv: cadConv || undefined,
        anoFab: anoFab === '' ? undefined : Number(anoFab),
        valor: valor === '' ? undefined : Number(valor),
        nl: nl || undefined,
        contaPatrimonial: contaPatrimonial || undefined,
        local: local || undefined,
        motivo: ativo ? undefined : (motivo || undefined),
        situacao: ativo ? undefined : (situacao || undefined),
      })
      onSaved()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 8,
          padding: 24,
          maxWidth: 800,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{viatura ? 'Editar Viatura' : 'Nova Viatura'}</h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}
            title="Fechar (ESC)"
          >×</button>
        </div>

        <form onSubmit={handleSave}>
          <h3 style={{ fontSize: '14px', color: '#666', borderBottom: '1px solid #eee', paddingBottom: 4, marginTop: 0 }}>Identificação</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Prefixo *</label>
              <input type="text" value={prefixo} onChange={e => setPrefixo(e.target.value)} required placeholder="8-792" />
            </div>
            <div className="form-group">
              <label>Placa</label>
              <input type="text" value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="BRZ9485" />
            </div>
            <div className="form-group">
              <label>Patrimônio</label>
              <input type="text" value={patrimonio} onChange={e => setPatrimonio(e.target.value)} placeholder="1279580-P" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="CR">Carro (CR)</option>
                <option value="MT">Moto (MT)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                <option value="OPERACIONAL">Operacional</option>
                <option value="ADM">Administrativa</option>
              </select>
            </div>
            <div className="form-group">
              <label>Marca/Modelo *</label>
              <input type="text" value={marcaModelo} onChange={e => setMarcaModelo(e.target.value)} required placeholder="GM/TRAILBLAZER" />
            </div>
          </div>

          <h3 style={{ fontSize: '14px', color: '#666', borderBottom: '1px solid #eee', paddingBottom: 4, marginTop: 16 }}>Cadastro LCM</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Cad Conv.</label>
              <input type="text" value={cadConv} onChange={e => setCadConv(e.target.value)} placeholder="8  792" />
            </div>
            <div className="form-group">
              <label>Ano Fab.</label>
              <input type="number" value={anoFab} onChange={e => setAnoFab(e.target.value)} placeholder="2014" min="1950" max="2030" />
            </div>
            <div className="form-group">
              <label>Valor (R$)</label>
              <input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="45000" step="0.01" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>NL (Nota Lançamento)</label>
              <input type="text" value={nl} onChange={e => setNl(e.target.value)} placeholder="123110501" />
            </div>
            <div className="form-group">
              <label>Conta Patrimonial</label>
              <input type="text" value={contaPatrimonial} onChange={e => setContaPatrimonial(e.target.value)} placeholder="180156" />
            </div>
            <div className="form-group">
              <label>Unidade (OPM) *</label>
              <select value={opm} onChange={e => setOpm(e.target.value)} required>
                <option value="">Selecione...</option>
                {units.map(u => (
                  <option key={u._id} value={u._id}>
                    {u.code} - {u.sigla || u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Local (texto livre)</label>
            <input type="text" value={local} onChange={e => setLocal(e.target.value)} placeholder="Pátio da 1ª Cia / Reserva / etc." />
          </div>

          <h3 style={{ fontSize: '14px', color: '#666', borderBottom: '1px solid #eee', paddingBottom: 4, marginTop: 16 }}>Status</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={ativo}
                onChange={e => setAtivo(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              Viatura Operante
            </label>
            <small style={{ color: '#666' }}>Desmarque para registrar como baixada (exige Motivo + Situação)</small>
          </div>

          {!ativo && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Motivo da baixa</label>
                  <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="MOTOR, ARREFECIMENTO, ..." />
                </div>
                <div className="form-group">
                  <label>Situação</label>
                  <input type="text" value={situacao} onChange={e => setSituacao(e.target.value)} placeholder="AGUARDANDO PREGAO, EM DESCARGA, ..." />
                </div>
              </div>
            </>
          )}

          {erro && <div className="alert alert-error">{erro}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
            {/* FIX (William 2026-08-17): botao de descarga s\u00f3 aparece em edicao e se ainda nao est\u00e1 em descarga */}
            {viatura && !viatura.emDescarga ? (
              <button
                type="button"
                onClick={() => onColocarEmDescarga(viatura)}
                style={{
                  background: '#fff',
                  border: '1px solid #c62828',
                  color: '#c62828',
                  padding: '8px 14px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                title="Sai da aba Viaturas e vai pra aba Processo de Descarga"
              >
                🔴 Enviar para Descarga
              </button>
            ) : (
              <div></div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando...' : (viatura ? 'Salvar Alterações' : 'Criar Viatura')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
