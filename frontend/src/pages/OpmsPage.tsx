import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getUser, isAdmin, isGestor } from '../lib/auth'
import {
  listUnits,
  listUnitsHierarchical,
  createUnit,
  updateUnit,
  deactivateUnit,
  reactivateUnit,
} from '../lib/api'

type Unit = {
  _id: string
  code: string
  name: string
  sigla?: string
  parentUnit?: string
  commandUnit?: string
  active?: boolean
}

export default function OpmsPage() {
  const user = getUser()
  const [units, setUnits] = useState<Unit[]>([])
  const [hier, setHier] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroAtiva, setFiltroAtiva] = useState<'ativas' | 'inativas' | 'todas'>('ativas')
  const [erro, setErro] = useState('')

  // Modal
  const [editando, setEditando] = useState<Unit | null>(null)
  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editErro, setEditErro] = useState('')
  const [editSalvo, setEditSalvo] = useState(false)

  // Form fields
  const [fCode, setFCode] = useState('')
  const [fName, setFName] = useState('')
  const [fSigla, setFSigla] = useState('')
  const [fParent, setFParent] = useState<string>('')
  const [fCommand, setFCommand] = useState<string>('')
  const [fActive, setFActive] = useState(true)

  if (!user) return <Navigate to="/login" replace />
  // A pagina eh so pra admin ou gestor. Editor/Viewer sao bloqueados.
  if (!isAdmin() && !isGestor()) {
    return (
      <div className="alert alert-error">
        Acesso restrito a administradores e gestores.
      </div>
    )
  }

  const can = useMemo(() => {
    // FIX (William 2026-09-16 v75): backend list.ts JÁ aplica RLS
    // (admin ve tudo, gestor ve so unidades autorizadas + filhas recursivamente).
    // Aqui no front, qualquer unit da lista pode ser editada pelo user
    // (exceto gestor NAO pode reativar e mexer em commandUnit).
    if (isAdmin()) {
      return {
        criar: true,
        podeEditar: (_u: Unit) => true,
        podeDesativar: (_u: Unit) => true,
        podeReativar: (_u: Unit) => true,
        parentOptions: 'all' as const,
      }
    }
    // Gestor: backend ja retorna so unidades autorizadas (recursivas)
    // Entao qualquer unit da lista pode ser editada (exceto commandUnit)
    const unidadesAut = (user.unidadesGestor || []) as string[]
    return {
      criar: unidadesAut.length > 0,
      podeEditar: (_u: Unit) => true,  // backend valida recursivamente
      podeDesativar: (_u: Unit) => true,  // backend valida
      // gestor NAO pode reativar
      podeReativar: (_u: Unit) => false,
      // parentUnit no form: todas as units autorizadas (ja vem do RLS)
      parentOptions: unidadesAut,
    }
  }, [user])

  function carregar() {
    setLoading(true)
    setErro('')
    Promise.all([listUnits(), listUnitsHierarchical()])
      .then(([u, h]) => {
        setUnits(u)
        setHier(h)
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  const filtrados = useMemo(() => {
    let r = units
    if (filtroAtiva === 'ativas') r = r.filter(u => u.active !== false)
    if (filtroAtiva === 'inativas') r = r.filter(u => u.active === false)
    if (busca.trim()) {
      const q = busca.toLowerCase().trim()
      r = r.filter(u =>
        (u.code || '').includes(q) ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.sigla || '').toLowerCase().includes(q)
      )
    }
    return r.sort((a, b) => (a.code || '').localeCompare(b.code || ''))
  }, [units, busca, filtroAtiva])

  function unitLabel(id?: string): string {
    if (!id) return '—'
    const u = units.find(x => x._id === id)
    if (!u) return id
    return `${u.code} – ${u.sigla || u.name}`
  }

  function abrirCriar() {
    // FIX (William 2026-08-31): recarrega a lista de units ANTES de abrir
    // o modal. Sem isso, se o user acabou de reativar/desativar uma
    // OPM, o `units` em state fica stale e o dropdown de Matriz-pai
    // nao mostra a unit que acabou de voltar a ativa.
    carregar();
    setCriando(true);
    setCriando(true)
    setEditando(null)
    setFCode('')
    setFName('')
    setFSigla('')
    setFParent(typeof can.parentOptions === 'string' ? '' : (can.parentOptions[0] || ''))
    setFCommand('')
    setFActive(true)
    setEditErro('')
    setEditSalvo(false)
  }

  function abrirEditar(u: Unit) {
    // FIX (William 2026-08-31): mesma correcao do abrirCriar - recarrega
    // a lista antes de abrir o modal pra evitar dropdown stale.
    carregar();
    setEditando(u)
    setCriando(false)
    setFCode(u.code)
    setFName(u.name)
    setFSigla(u.sigla || '')
    setFParent(u.parentUnit || '')
    setFCommand(u.commandUnit || '')
    setFActive(u.active !== false)
    setEditErro('')
    setEditSalvo(false)
  }

  function fechar() {
    setEditando(null)
    setCriando(false)
    setEditErro('')
    setEditSalvo(false)
  }

  async function salvar() {
    if (!user) return
    setSalvando(true)
    setEditErro('')
    try {
      if (criando) {
        await createUnit({
          cpf: user.cpf!,
          code: fCode.trim(),
          name: fName.trim(),
          sigla: fSigla.trim() || undefined,
          parentUnit: fParent || undefined,
          // FIX (William 2026-08-31): gestor NAO pode setar commandUnit
          // (decisao de admin - hierarquia funcional). So admin envia.
          commandUnit: isAdmin() ? (fCommand || undefined) : undefined,
          active: fActive,
        })
      } else if (editando) {
        await updateUnit({
          cpf: user.cpf!,
          id: editando._id,
          name: fName.trim(),
          sigla: fSigla.trim() || undefined,
          parentUnit: fParent || undefined,
          // FIX (William 2026-08-31): gestor edita nome/sigla/pai/status
          // mas NAO mexe no commandUnit (preserva o que o admin setou).
          commandUnit: isAdmin() ? (fCommand || undefined) : undefined,
          active: fActive,
        })
      }
      setEditSalvo(true)
      carregar()
    } catch (e: any) {
      setEditErro(e.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function desativar(u: Unit) {
    if (!user) return
    if (!window.confirm(`Desativar a OPM "${u.code} – ${u.name}"?\n\nAs viaturas/agendamentos dela continuam no banco, mas ela some da listagem ativa.`)) {
      return
    }
    try {
      await deactivateUnit(user.cpf!, u._id)
      carregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function reativar(u: Unit) {
    if (!user) return
    try {
      await reactivateUnit(user.cpf!, u._id)
      carregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  // Options pro dropdown de parentUnit no form
  // FIX (William 2026-08-31): EXCLUI a propria unit da lista (se
  // estiver editando). Se a propria unit aparece, o user pode
  // selecionar ela como pai = auto-referencia = loop no findMatriz
  // do dashboard.
  const parentUnitOptions: Unit[] = useMemo(() => {
    const excludeId = editando?._id  // se ta editando, esconde ela mesma
    let base: Unit[]
    if (can.parentOptions === 'all') {
      base = units.filter(u => u.active !== false)
    } else {
      // gestor: so as unidadesAutorizadas
      base = units.filter(u => can.parentOptions.includes(u._id))
    }
    return base
      .filter(u => u._id !== excludeId)
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
  }, [units, can.parentOptions, editando?._id])

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: '0 0 4px 0' }}>OPMs (Unidades)</h1>
      <div style={{ color: '#666', marginBottom: 16, fontSize: 14 }}>
        Cadastro e edição de OPMs do sistema. {isAdmin() ? 'Como admin, você pode criar e editar qualquer OPM.' : 'Como gestor, você só pode criar/editar OPMs filhas das suas unidades autorizadas.'}
      </div>

      {/* Barra de ações */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por código, nome ou sigla…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
        />
        <select
          value={filtroAtiva}
          onChange={e => setFiltroAtiva(e.target.value as any)}
          style={{ padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
        >
          <option value="ativas">Apenas ativas</option>
          <option value="inativas">Apenas inativas</option>
          <option value="todas">Todas</option>
        </select>
        {can.criar && (
          <button
            onClick={abrirCriar}
            style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            + Nova OPM
          </button>
        )}
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      {loading ? (
        <div style={{ padding: 24, color: '#666' }}>Carregando…</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #ddd', borderRadius: 6, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={th}>Código SIAFEM</th>
                <th style={th}>Nome</th>
                <th style={th}>Sigla</th>
                <th style={th}>Matriz-pai (técnica)</th>
                <th style={th}>Comando (funcional)</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                    Nenhuma OPM encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {filtrados.map(u => {
                const isAtiva = u.active !== false
                return (
                  <tr key={u._id} style={{ borderBottom: '1px solid #eee', background: isAtiva ? 'white' : '#f9f9f9' }}>
                    <td style={tdMono}>{u.code}</td>
                    <td style={td}>{u.name}</td>
                    <td style={td}>{u.sigla || '—'}</td>
                    <td style={td}>
                      {u.parentUnit ? (
                        <span title={unitLabel(u.parentUnit)}>{unitLabel(u.parentUnit)}</span>
                      ) : (
                        <span style={{ color: '#1976d2', fontWeight: 600 }}>raiz</span>
                      )}
                    </td>
                    <td style={td}>
                      {u.commandUnit ? unitLabel(u.commandUnit) : '—'}
                    </td>
                    <td style={td}>
                      {isAtiva ? (
                        <span style={{ color: '#2e7d32', fontWeight: 600 }}>● ativa</span>
                      ) : (
                        <span style={{ color: '#999' }}>○ inativa</span>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {isAtiva && can.podeEditar(u) && (
                        <button onClick={() => abrirEditar(u)} style={btnEdit}>Editar</button>
                      )}
                      {isAtiva && can.podeDesativar(u) && (
                        <button onClick={() => desativar(u)} style={btnDanger}>Desativar</button>
                      )}
                      {!isAtiva && can.podeReativar(u) && (
                        <button onClick={() => reativar(u)} style={btnEdit}>Reativar</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
        Total: {filtrados.length} OPM{filtrados.length === 1 ? '' : 's'} listada{filtrados.length === 1 ? '' : 's'}.
        {!isAdmin() && user.unidadesGestor && user.unidadesGestor.length > 0 && (
          <> Suas unidades autorizadas: {user.unidadesGestor.length}.</>
        )}
      </div>

      {/* Modal de Criar/Editar */}
      {(criando || editando) && (
        <div
          onClick={fechar}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 8, padding: 24, width: 560, maxWidth: '92vw',
              maxHeight: '92vh', overflow: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>{criando ? 'Nova OPM' : `Editar OPM ${editando!.code}`}</h2>
              <button onClick={fechar} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' }}>×</button>
            </div>

            {editErro && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>{editErro}</div>
            )}
            {editSalvo && (
              <div className="alert alert-success" style={{ marginBottom: 12 }}>OPM salva com sucesso!</div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Código SIAFEM" required>
                <input
                  type="text"
                  value={fCode}
                  onChange={e => setFCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="607000000"
                  maxLength={9}
                  disabled={!criando}
                  style={input}
                />
                {criando && <div style={hint}>Apenas dígitos. 6-9 dígitos. Não pode repetir código existente.</div>}
              </Field>

              <Field label="Nome" required>
                <input
                  type="text"
                  value={fName}
                  onChange={e => setFName(e.target.value)}
                  placeholder="CPI-7, 7º BPM/I, 1ª Cia do 7º BPM/I…"
                  style={input}
                />
              </Field>

              <Field label="Sigla (opcional)">
                <input
                  type="text"
                  value={fSigla}
                  onChange={e => setFSigla(e.target.value)}
                  placeholder="7BPMI, CPI7…"
                  maxLength={20}
                  style={input}
                />
              </Field>

              <Field label="Matriz-pai (técnica)" required={!isAdmin()}>
                <select
                  value={fParent}
                  onChange={e => setFParent(e.target.value)}
                  style={input}
                  disabled={!criando && !can.podeEditar(editando!)}
                >
                  <option value="">— raiz (sem pai) —</option>
                  {parentUnitOptions.map(u => (
                    <option key={u._id} value={u._id}>
                      {u.code} – {u.sigla || u.name}
                    </option>
                  ))}
                </select>
                {!isAdmin() && (
                  <div style={hint}>
                    Gestor só pode escolher entre as suas unidades autorizadas.
                  </div>
                )}
              </Field>

              {/* FIX (William 2026-08-31): campo "Comando funcional" so aparece
                  para admin. Gestor nao precisa decidir hierarquia funcional
                  (decisao organizacional da PM, so admin mexer). */}
              {isAdmin() && (
                <Field label="Comando (funcional)">
                  <select
                    value={fCommand}
                    onChange={e => setFCommand(e.target.value)}
                    style={input}
                  >
                    <option value="">— sem comando (raiz) —</option>
                    {units
                      .filter(u => u.active !== false)
                      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                      .map(u => (
                        <option key={u._id} value={u._id}>
                          {u.code} – {u.sigla || u.name}
                        </option>
                      ))}
                  </select>
                  <div style={hint}>
                    Unidade de comando PM (ex: 7BPMI tem commandUnit = CPI-7). Deixe vazio se for raiz.
                  </div>
                </Field>
              )}

              <Field label="Status">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={fActive}
                    onChange={e => setFActive(e.target.checked)}
                  />
                  <span>OPM ativa (desmarque para desativar)</span>
                </label>
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={fechar} style={btnSecondary}>Cancelar</button>
              <button
                onClick={salvar}
                disabled={salvando || !fCode.trim() || !fName.trim() || (!isAdmin() && !fParent)}
                style={{
                  padding: '8px 20px', fontSize: 14, fontWeight: 600,
                  background: salvando ? '#999' : '#1976d2',
                  color: 'white', border: 'none', borderRadius: 4,
                  cursor: salvando ? 'wait' : 'pointer',
                }}
              >
                {salvando ? 'Salvando…' : (criando ? 'Criar OPM' : 'Salvar alterações')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#333' }}>
        {label}{required && <span style={{ color: '#c62828' }}> *</span>}
      </div>
      {children}
    </label>
  )
}

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase',
}
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const tdMono: React.CSSProperties = { ...td, fontFamily: 'monospace', fontSize: 13, color: '#1976d2', fontWeight: 600 }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4,
  background: 'white', boxSizing: 'border-box',
}
const hint: React.CSSProperties = { fontSize: 12, color: '#888', marginTop: 4 }
const btnEdit: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, background: 'white', border: '1px solid #1976d2',
  color: '#1976d2', borderRadius: 3, cursor: 'pointer', marginRight: 4,
}
const btnDanger: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, background: 'white', border: '1px solid #c62828',
  color: '#c62828', borderRadius: 3, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', fontSize: 14, background: 'white',
  border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer',
}
