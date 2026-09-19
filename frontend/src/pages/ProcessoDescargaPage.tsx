import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { getUser, isAdmin } from '../lib/auth'
import { listViaturasByDescarga, removeViatura, reativarViatura, listUnits } from '../lib/api'

export default function ProcessoDescargaPage() {
  const user = getUser()
  const [dados, setDados] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [filtroSubordinada, setFiltroSubordinada] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'MT' | 'CR' | undefined>(undefined)
  const [confirmExcluir, setConfirmExcluir] = useState<any>(null)
  const [opResultado, setOpResultado] = useState<{ tipo: 'reativar' | 'excluir' | null; ok: boolean; msg: string }>({ tipo: null, ok: false, msg: '' })

  if (!user) return <Navigate to="/login" replace />

  // FIX (William 2026-09-16 v74): mesmo escopo da ViaturasPage
  // Regra de visualizacao por unidade: editor/gestor/admin so ve suas unidades
  // - admin (William) ou escopo="livre" -> tudo livre
  // - 1 unidade matriz BPM (!= CPI-7) -> unidade travada, filhas livres
  // - 1 unidade filha -> ambos travados
  // - 1 unidade CPI-7 raiz (607000000) -> livre (ve tudo)
  const escopoInfo = useMemo(() => {
    if (!user) return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    if (user.viaturasRole === 'admin') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    if ((user as any).escopo === 'livre') {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }
    const unidadesUser = (user.unidadesEditor && user.unidadesEditor.length > 0
      ? user.unidadesEditor
      : (user.unidadesGestor || [])
    ).map((u: any) => typeof u === 'object' ? u.id : u).filter(Boolean);

    if (unidadesUser.length === 0) {
      return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
    }

    const matrizTecnica = (id: any): number | null => {
      const unit = units.find((u: any) => u.id === id || u._id === String(id))
      if (!unit) return null
      if (unit.code && unit.code.endsWith('0000')) return unit.id
      return unit.commandUnit ?? null
    }

    // DEFENSIVO: se units ainda nao carregou, trava na 1a unidade (v71)
    if (units.length === 0) {
      const firstId = String(unidadesUser[0])
      return { lockedUnidade: true, lockedSubordinada: false, unidadeFixa: firstId, subordinadaFixa: '' }
    }

    const matrizesList = unidadesUser.map(matrizTecnica).filter((x: any) => x !== null)
    const firstMT = matrizesList[0]
    if (firstMT !== undefined && matrizesList.every((m: any) => m === firstMT)) {
      const matriz = units.find((u: any) => u.id === firstMT || u._id === String(firstMT))
      if (matriz) {
        if (matriz.code === '607000000') {
          return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
        }
        return { lockedUnidade: true, lockedSubordinada: false, unidadeFixa: matriz._id, subordinadaFixa: '' }
      }
    }
    if (unidadesUser.length === 1) {
      const unicaUnidade = unidadesUser[0]
      const unit = units.find((u: any) => u.id === unicaUnidade || u._id === String(unicaUnidade))
      if (unit) {
        if (unit.code === '607000000') {
          return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
        }
        if (unit.code && unit.code.endsWith('0000')) {
          return { lockedUnidade: true, lockedSubordinada: false, unidadeFixa: unit._id, subordinadaFixa: '' }
        }
        if (unit.parentUnit) {
          return { lockedUnidade: true, lockedSubordinada: true, unidadeFixa: unit.parentUnit, subordinadaFixa: unit._id }
        }
      }
    }
    return { lockedUnidade: false, lockedSubordinada: false, unidadeFixa: '', subordinadaFixa: '' }
  }, [user, units])

  // Quando escopo trava, seta filtros pros valores fixos
  useEffect(() => {
    if (escopoInfo.lockedUnidade && escopoInfo.unidadeFixa) {
      setFiltroUnidade(escopoInfo.unidadeFixa)
    }
    if (escopoInfo.lockedSubordinada && escopoInfo.subordinadaFixa) {
      setFiltroSubordinada(escopoInfo.subordinadaFixa)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopoInfo.unidadeFixa, escopoInfo.subordinadaFixa, escopoInfo.lockedUnidade, escopoInfo.lockedSubordinada])

  function carregar() {
    setLoading(true)
    Promise.all([
      listViaturasByDescarga(user.cpf),
      listUnits().catch(() => []),
    ])
      .then(([emDescarga, unitsList]) => {
        // Enriquece com opmCode/opmName
        // FIX (William 2026-09-16 v74): v.opm agora eh OBJETO {_id, id, code, name, sigla}
        // vindo do backend list-by-descarga (com JOIN ja feito). Helper pra extrair id:
        const getOpmId = (v: any): string => {
          if (!v || !v.opm) return ''
          return typeof v.opm === 'object' ? String(v.opm.id ?? v.opm._id) : String(v.opm)
        }
        const unitsById = new Map(unitsList.map((u: any) => [u._id.toString(), u]))
        const enriched = emDescarga.map((v: any) => {
          const opmId = getOpmId(v)
          const unit = unitsById.get(opmId)
          return {
            ...v,
            opmCode: (v.opm && typeof v.opm === 'object' ? v.opm.code : '') || unit?.code || '',
            opmName: (v.opm && typeof v.opm === 'object' ? v.opm.name : '') || unit?.name || '',
          }
        })
        // Agrupa por unidade (matriz)
        const porUnidadeMap: Record<string, { matrizCode: string; matrizName: string; matrizId: string; count: number; motos: number; carros: number }> = {}
        for (const v of enriched) {
          const opmId = getOpmId(v)
          const unit = unitsById.get(opmId)
          const matrizId = unit?.parentUnit ? unit.parentUnit : opmId  // se for filha, agrupa pela matriz
          const matriz = unitsById.get(String(matrizId)) || unit
          const k = String(matrizId)
          if (!porUnidadeMap[k]) {
            porUnidadeMap[k] = {
              matrizId: k,
              matrizCode: matriz?.code || '',
              matrizName: matriz?.name || '',
              count: 0, motos: 0, carros: 0,
            }
          }
          porUnidadeMap[k].count++
          if (v.tipo === 'MT') porUnidadeMap[k].motos++
          else porUnidadeMap[k].carros++
        }
        const porUnidade = Object.values(porUnidadeMap).sort((a: any, b: any) => a.matrizCode.localeCompare(b.matrizCode))
        setDados({ todas: enriched, porUnidade })
        setUnits(unitsList)
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [user?.cpf])

  // SO MATRIZES no filtro de unidade: code termina em "0000" (igual ViaturasPage)
  const matrizes = useMemo(() => {
    return units
      .filter((u: any) => u.code && u.code.length === 9 && u.code.endsWith('0000'))
      .sort((a: any, b: any) => a.code.localeCompare(b.code))
  }, [units])

  // Filhas DIRETAS da unidade selecionada (1 nivel soh)
  const unidadesFilhas = useMemo(() => {
    if (!filtroUnidade) return []
    return units.filter((u: any) => u.parentUnit === filtroUnidade)
  }, [units, filtroUnidade])

  async function reativar(v: any) {
    if (!user) return
    setOpResultado({ tipo: null, ok: false, msg: '' })
    try {
      await reativarViatura(user.cpf, v._id)
      setOpResultado({ tipo: 'reativar', ok: true, msg: `${v.prefixo || v.patrimonio} reativada e voltou a operar.` })
      carregar()
    } catch (e: any) {
      setOpResultado({ tipo: 'reativar', ok: false, msg: e.message })
    }
  }

  async function excluir(v: any) {
    if (!user || !isAdmin()) return
    setOpResultado({ tipo: null, ok: false, msg: '' })
    try {
      await removeViatura(user.cpf, v._id)
      setOpResultado({ tipo: 'excluir', ok: true, msg: `${v.prefixo || v.patrimonio} excluída do banco.` })
      setConfirmExcluir(null)
      carregar()
    } catch (e: any) {
      setOpResultado({ tipo: 'excluir', ok: false, msg: e.message })
    }
  }

  if (loading) return <p>Carregando...</p>
  if (erro) return <div className="alert alert-error">{erro}</div>
  if (!dados) return <p>Sem dados.</p>

  const { todas = [], porUnidade = [] } = dados

  // Filtragem
  const q = busca.toLowerCase().trim()
  const filtradas = todas.filter((v: any) => {
    // FIX (William 2026-09-16 v74): v.opm agora eh OBJETO {_id, id, code, ...}
    // vindo do backend list-by-descarga. Comparar com string via String() ou usar .id.
    const vOpmId = v.opm ? (typeof v.opm === 'object' ? String(v.opm.id) : String(v.opm)) : ''
    // FIX (William 2026-08-21): filtro de unidade (matriz) - se filtrou matriz,
    // inclui a matriz + filhas (subordinadas)
    if (filtroUnidade) {
      if (vOpmId !== filtroUnidade) {
        const unit = units.find((u: any) => u._id === vOpmId || String(u.id) === vOpmId)
        if (!unit || unit.parentUnit !== filtroUnidade) return false
      }
    }
    // FIX (William 2026-08-21): filtro de subordinada especifica
    if (filtroSubordinada && vOpmId !== filtroSubordinada) return false
    // FIX (William 2026-08-21): filtro de tipo (MT/CR)
    if (filtroTipo && v.tipo !== filtroTipo) return false
    if (!q) return true
    return (
      (v.placa || '').toLowerCase().includes(q) ||
      (v.prefixo || '').toLowerCase().includes(q) ||
      (v.patrimonio || '').toLowerCase().includes(q) ||
      (v.marcaModelo || '').toLowerCase().includes(q) ||
      (v.situacao || '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="page-header">
        <h1>Processo de Descarga</h1>
        <p>Viaturas em descarte (fim de vida útil) - separadas da frota operacional</p>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeft: '4px solid #ff9800' }}>
          <div className="stat-label">Total em Descarte</div>
          <div className="stat-value" style={{ color: '#e65100' }}>{todas.length}</div>
          <div className="stat-detail">viaturas em fim de vida útil</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Motos</div>
          <div className="stat-value">{todas.filter((v: any) => v.tipo === 'MT').length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Carros</div>
          <div className="stat-value">{todas.filter((v: any) => v.tipo !== 'MT').length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unidades afetadas</div>
          <div className="stat-value">{porUnidade.length}</div>
        </div>
      </div>

      {/* AVISO */}
      <div className="alert" style={{ background: '#fff3e0', borderLeft: '4px solid #ff9800', color: '#5d4037', marginBottom: 16 }}>
        <strong>Atenção:</strong> estas viaturas estão em <strong>descarte definitivo</strong> (fim de vida útil).
        Não contam no total operacional. Use os botões para <strong>reativar</strong> (se a viatura
        voltou a operar) ou <strong>excluir</strong> (se foi removida de fato do cadastro).
      </div>

      {opResultado.msg && (
        <div className={`alert ${opResultado.ok ? 'alert-success' : 'alert-error'}`}>
          {opResultado.msg}
        </div>
      )}

      {/* FILTROS (padrao identico ao da ViaturasPage) */}
      <div className="card" style={{ background: '#fafafa' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Toggle Tipo (Todos | Carro | Moto) */}
          <div style={{ display: 'inline-flex', border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden' }}>
            <button
              onClick={() => setFiltroTipo(undefined)}
              style={{
                padding: '6px 12px', border: 'none',
                background: filtroTipo === undefined ? '#1976d2' : 'white',
                color: filtroTipo === undefined ? 'white' : '#333',
                cursor: 'pointer', fontSize: 14,
              }}
            >Todos</button>
            <button
              onClick={() => setFiltroTipo('CR')}
              style={{
                padding: '6px 12px', border: 'none', borderLeft: '1px solid #ccc',
                background: filtroTipo === 'CR' ? '#1976d2' : 'white',
                color: filtroTipo === 'CR' ? 'white' : '#333',
                cursor: 'pointer', fontSize: 14,
              }}
            >🚗 Carro</button>
            <button
              onClick={() => setFiltroTipo('MT')}
              style={{
                padding: '6px 12px', border: 'none', borderLeft: '1px solid #ccc',
                background: filtroTipo === 'MT' ? '#1976d2' : 'white',
                color: filtroTipo === 'MT' ? 'white' : '#333',
                cursor: 'pointer', fontSize: 14,
              }}
            >🏍️ Moto</button>
          </div>

          {/* Dropdown Unidade: SO MATRIZES (code termina em 0000) */}
          <select
            value={filtroUnidade}
            onChange={e => { setFiltroUnidade(e.target.value); setFiltroSubordinada('') }}
            disabled={escopoInfo.lockedUnidade}
            style={{
              padding: '6px 10px', borderRadius: 4,
              border: escopoInfo.lockedUnidade ? '3px solid #e65100' : '1px solid #ccc',
              background: escopoInfo.lockedUnidade ? '#ffe0b2' : 'white',
              minWidth: 220,
              cursor: escopoInfo.lockedUnidade ? 'not-allowed' : 'pointer',
              fontSize: 14,
              color: escopoInfo.lockedUnidade ? '#bf360c' : '#333',
              fontWeight: escopoInfo.lockedUnidade ? 600 : 400,
            }}
            title={escopoInfo.lockedUnidade ? '🔒 Unidade travada pelo seu escopo - você só tem acesso a esta matriz e suas filhas' : 'Filtrar por unidade'}
          >
            {escopoInfo.lockedUnidade
              ? (() => {
                  const u = units.find((x: any) => x._id === escopoInfo.unidadeFixa || String(x.id) === String(escopoInfo.unidadeFixa));
                  return (
                    <option value={escopoInfo.unidadeFixa}>
                      🔒 {u ? `${u.code} - ${u.sigla || u.name}` : escopoInfo.unidadeFixa}
                    </option>
                  );
                })()
              : (
                <>
                  <option value="">Todas as unidades</option>
                  {matrizes.map((u: any) => (
                    <option key={u._id} value={u._id}>
                      {u.code} - {u.sigla || u.name}
                    </option>
                  ))}
                </>
              )}
          </select>

          {/* Dropdown Subordinada (soh aparece se a unidade selecionada tem filhas) */}
          {filtroUnidade && unidadesFilhas.length > 0 && (
            <select
              value={filtroSubordinada}
              onChange={e => setFiltroSubordinada(e.target.value)}
              disabled={escopoInfo.lockedSubordinada}
              style={{
                padding: '6px 10px', borderRadius: 4,
                border: escopoInfo.lockedSubordinada ? '3px solid #e65100' : '1px solid #ccc',
                background: escopoInfo.lockedSubordinada ? '#ffe0b2' : 'white',
                minWidth: 240,
                cursor: escopoInfo.lockedSubordinada ? 'not-allowed' : 'pointer',
                fontSize: 14,
                color: escopoInfo.lockedSubordinada ? '#bf360c' : '#333',
                fontWeight: escopoInfo.lockedSubordinada ? 600 : 400,
              }}
              title={escopoInfo.lockedSubordinada ? '🔒 Filha travada pelo seu escopo' : 'Filtrar por uma filha específica'}
            >
              {escopoInfo.lockedSubordinada ? (
                <option value={escopoInfo.subordinadaFixa}>
                  🔒 {units.find((x: any) => x._id === escopoInfo.subordinadaFixa)?.name || escopoInfo.subordinadaFixa}
                </option>
              ) : (
                <>
                  <option value="">Todas as subordinadas</option>
                  {unidadesFilhas.map((u: any) => (
                    <option key={u._id} value={u._id}>
                      {u.code} - {u.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          )}

          {/* Badge visual de escopo restrito (igual ViaturasPage v69) */}
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

          <div style={{ flex: 1 }}></div>

          {/* Botao limpar */}
          {(filtroUnidade || filtroSubordinada || filtroTipo || busca) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setFiltroUnidade(''); setFiltroSubordinada(''); setFiltroTipo(undefined); setBusca('') }}
            >Limpar filtros</button>
          )}
        </div>
      </div>

      {/* LISTA DETALHADA (em DESTAQUE primeiro) */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Lista Detalhada ({filtradas.length} de {todas.length})</h2>
        <div className="form-row">
          <div className="form-group">
            <input
              type="text"
              placeholder="Buscar por placa, prefixo, patrimônio, marca ou situação..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {filtradas.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>Nenhuma viatura em processo de descarga.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Prefixo</th>
                <th>Placa</th>
                <th>Patrimônio</th>
                <th>Marca/Modelo</th>
                <th>Ano</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Unidade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 100).map((v: any) => (
                <tr key={v._id}>
                  <td><strong>{v.prefixo || '-'}</strong></td>
                  <td>{v.placa || '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{v.patrimonio || '-'}</td>
                  <td>{v.marcaModelo || '-'}</td>
                  <td>{v.anoFab || '-'}</td>
                  <td>{v.valor ? `R$ ${v.valor.toFixed(2)}` : '-'}</td>
                  <td>{v.situacao || '-'}</td>
                  <td><code style={{ fontSize: 11 }}>{v.opmCode || (v.opm && typeof v.opm === 'object' ? v.opm.code : String(v.opm || '').substring(0, 8))}</code></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => reativar(v)}
                        title="Reativar (voltar a operar)"
                      >
                        ↻ Reativar
                      </button>
                      {isAdmin() && (
                        <button
                          className="btn btn-sm"
                          style={{ background: '#c62828', color: 'white' }}
                          onClick={() => setConfirmExcluir(v)}
                          title="Excluir definitivamente"
                        >
                          ✕ Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filtradas.length > 100 && (
          <p style={{ color: '#666', fontStyle: 'italic' }}>
            Mostrando 100 de {filtradas.length}. Use o filtro acima pra refinar.
          </p>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmExcluir && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={() => setConfirmExcluir(null)}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 480, width: '100%',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: '#c62828' }}>Confirmar exclusão</h3>
            <p>Tem certeza que deseja <strong>excluir definitivamente</strong> a viatura:</p>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, margin: '12px 0' }}>
              <strong>{confirmExcluir.prefixo || confirmExcluir.patrimonio}</strong><br />
              Placa: {confirmExcluir.placa || '-'}<br />
              Marca: {confirmExcluir.marcaModelo || '-'}
            </div>
            <p style={{ color: '#c62828', fontSize: 13 }}>
              ⚠️ Esta ação não pode ser desfeita. A viatura sairá do banco de dados.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmExcluir(null)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: '#c62828', color: 'white' }}
                onClick={() => excluir(confirmExcluir)}
              >
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
