import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getUser, isAdmin } from '../lib/auth'
import { listAllUsers, setViaturasRole, listUnits } from '../lib/api'

export default function GestaoUsuariosPage() {
  const user = getUser()
  const [usuários, setUsuarios] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')

  // Modal de edição completa (Role + unidades + escopo)
  const [editando, setEditando] = useState<any | null>(null)
  const [editRole, setEditRole] = useState('viewer')
  // FIX (William 2026-09-14 v65): nova hierarquia - matriz + filhas-raiz (recursivo)
  const [editMatriz, setEditMatriz] = useState<string>('')
  const [editFilhas, setEditFilhas] = useState<string[]>([])
  // FIX (William 2026-08-18): escopo controla se os dropdowns de unidade
  // ficam livres ou travados. Default: "restrito" (mais seguro)
  const [editEscopo, setEditEscopo] = useState<'livre' | 'restrito'>('restrito')
  // FIX (William 2026-09-14 v61): editUnit = OPM principal do usuario
  // (mantido por compat - agora eh editMatriz, mas editUnit ainda eh usado)
  const [editUnit, setEditUnit] = useState<string>('')
  const [editSalvo, setEditSalvo] = useState(false)
  const [editErro, setEditErro] = useState('')

  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin()) {
    return (
      <div className="alert alert-error">
        Acesso restrito a administradores.
      </div>
    )
  }
  const canEdit = isAdmin()

  function carregar() {
    setLoading(true)
    Promise.all([listAllUsers(), listUnits()])
      .then(([us, us2]) => {
        setUsuarios(us)
        setUnits(us2)
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  // FIX (William 2026-09-14 v62): helper pra resumir unidades na tabela.
  // Quando TODAS as unidades selecionadas compartilham o mesmo commandUnit
  // (mesma "matriz"), mostra "X e suas subordinadas" ao inves de listar uma por uma.
  // Ex: ["7º BPM/I EM", "7º BPM-I 1ª Cia", "7º BPM-I 2ª Cia"] -> "7º BPM/I e suas subordinadas"
  // Helper: converte QUALQUER tipo (numero, string, objeto, null) pra string segura
  // pra evitar "id.substring is not a function" quando o backend retorna tipo
  // misturado (ex: SQLite devolve number, mas fallback pode ser string ou objeto).
  function safeIdStr(v: any): string {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    if (typeof v === 'object') {
      // Pode ser { _id: 'x' } vindo do JOIN - tenta achar _id ou id interno
      const inner = v._id ?? v.id
      return inner !== undefined ? safeIdStr(inner) : ''
    }
    try {
      return String(v)
    } catch {
      return ''
    }
  }

  function resumirUnidades(unitsIds: any): string {
    try {
      if (!Array.isArray(unitsIds) || unitsIds.length === 0) return ''
      // Normaliza IDs pra string (backend pode mandar number OU string)
      const idsStr = unitsIds.map(safeIdStr).filter(Boolean)
      if (idsStr.length === 0) return ''
      if (idsStr.length === 1) {
        const u = units.find(x => safeIdStr(x._id) === idsStr[0] || String(x.id) === idsStr[0])
        if (u) return u.sigla || u.name || u.code || idsStr[0]
        return idsStr[0]
      }
      // Pega commandUnit de cada uma
      const commandUnits = idsStr.map(id => {
        const u = units.find(x => safeIdStr(x._id) === id || String(x.id) === id)
        return u ? u.commandUnit : null
      })
      // Se todas tem o mesmo commandUnit (e nao eh null), agrupa
      const first = commandUnits[0]
      if (first && commandUnits.every(c => c === first)) {
        const matriz = units.find(x => safeIdStr(x._id) === safeIdStr(first) || String(x.id) === safeIdStr(first))
        if (matriz) {
          return `${matriz.sigla || matriz.name || matriz.code} e suas subordinadas`
        }
      }
      // Caso contrario, mostra primeiro 3 + contador
      const labels = idsStr.slice(0, 3).map(id => {
        const u = units.find(x => safeIdStr(x._id) === id || String(x.id) === id)
        return u ? (u.sigla || u.name || u.code) : id.slice(0, 8)
      })
      if (idsStr.length > 3) {
        return labels.join(', ') + ` (+${idsStr.length - 3})`
      }
      return labels.join(', ')
    } catch (err) {
      // NUNCA quebrar a tabela - loga e retorna string vazia
      console.warn('[resumirUnidades] erro:', err, 'unitsIds:', unitsIds)
      return ''
    }
  }

  // FIX (William 2026-09-14 v62): retorna a propria unidade + suas filhas
  // (todas as units com commandUnit = unitId). Usado pra travar os
  // dropdowns/checkboxes conforme a OPM principal escolhida.
  function getMatrizEFilhas(unitId: string): any[] {
    if (!unitId) return units
    const result: any[] = []
    // Inclui a propria unidade
    const self = units.find(u => u._id === unitId)
    if (self) result.push(self)
    // Inclui filhas (commandUnit === unitId)
    units.forEach(u => {
      if (u._id !== unitId && String(u.commandUnit) === String(unitId)) {
        result.push(u)
      }
    })
    return result
  }

  const filtrados = usuários.filter(u => {
    if (!busca) return true
    const q = busca.toLowerCase().trim()
    // FIX (William 2026-08-25): busca focada em RE + nome/guerra
    // (removido match por CPF - admin master usa o RE pra localizar)
    return (
      (u.re || '').toLowerCase().includes(q) ||
      (u.warName || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q)
    )
  })

  function abrirEdição(u: any) {
    setEditando(u)
    setEditRole(u.viaturasRole || 'viewer')
    const unitId = u.unitId ?? u.unit?._id ?? u.unit?.id ?? u.unit
    setEditUnit(unitId ? String(unitId) : '')
    setEditMatriz(unitId ? String(unitId) : '')
    const unitsArr = Array.isArray(u.unidadesGestor) ? u.unidadesGestor.map(safeIdStr).filter(Boolean) : []
    const matrizIdNum = unitId ? Number(unitId) : null
    const matrizObj = matrizIdNum
      ? units.find(x => safeIdStr(x._id) === String(matrizIdNum) || x.id === matrizIdNum)
      : null
    const temTudo: boolean = (() => {
      if (!matrizObj) return false
      const todas: any[] = []
      function expand(id: number) {
        if (todas.includes(id)) return
        todas.push(id)
        units.forEach(u => {
          if (u.commandUnit === id && u.id !== undefined && !todas.includes(u.id)) expand(u.id)
        })
      }
      const rootId = matrizObj.id ?? Number(matrizObj._id)
      if (typeof rootId !== 'number' || isNaN(rootId)) return false
      expand(rootId)
      return todas.every((id: number) => unitsArr.includes(String(id)))
    })()
    if (temTudo || unitsArr.length === 0) {
      setEditFilhas([])
    } else {
      setEditFilhas(unitsArr.filter((id: string) => id !== String(matrizIdNum)))
    }
    setEditEscopo(u.escopo || 'restrito')
    setEditSalvo(false)
    setEditErro('')
  }

  function fecharEdição() {
    setEditando(null)
    setEditSalvo(false)
    setEditErro('')
    setEditUnit('')
    setEditMatriz('')
    setEditFilhas([])
  }

  function toggleFilha(unitId: string) {
    setEditFilhas(f => f.includes(unitId) ? f.filter(id => id !== unitId) : [...f, unitId])
  }

  async function salvarEdição() {
    if (!editando) return
    setEditSalvo(false)
    setEditErro('')
    try {
      await setViaturasRole({
        userId: editando.id,
        viaturasRole: editRole as any,
        escopo: editEscopo,
        // FIX (William 2026-09-14 v65): NOVA hierarquia matriz + filhas.
        // Backend resolve recursivamente. Se filhasIds vazio, ve' tudo da matriz.
        matrizId: parseInt(editMatriz),
        filhasIds: editFilhas.map(f => parseInt(f)),
      } as any)
      setEditSalvo(true)
      carregar()
      setTimeout(() => fecharEdição(), 800)
    } catch (e: any) {
      setEditErro(e.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Gestão de Usuários</h1>
        <p>Filtrar por RE e atribuir role + unidades no app</p>
      </div>

      {/* FILTRO LIVRE POR RE (FOCO PRINCIPAL) - FIX (William 2026-08-25) */}
      <div className="form-group">
        <input
          type="text"
          placeholder="🔍 Filtrar por RE, nome de guerra ou nome completo..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      {loading ? <p>Carregando...</p> : (
        <div className="card">
          <p style={{ color: '#666', fontSize: 13 }}>
            {filtrados.length} usuário(s) {canEdit ? 'cadastrado(s). Clique em Editar pra mudar role ou atribuir unidades.' : 'nas suas unidades (visão de gestor). Edição só com admin.'}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>RE</th>
                <th>CPF</th>
                <th>Nome</th>
                <th>Guerra</th>
                <th>OPM</th>
                <th>Role</th>
                <th>Unidades Gestor</th>
                {canEdit && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(u => {
                // FIX (William 2026-09-14 v62): usa resumirUnidades pra
                // mostrar "X e suas subordinadas" quando aplicavel.
                const unidadesG = resumirUnidades(u.unidadesGestor || [])
                return (
                  <tr key={u._id}>
                    <td>{u.re}</td>
                    <td>{u.cpf}</td>
                    <td>{u.name}</td>
                    <td>{u.warName}</td>
                    <td>{u.opmCode}</td>
                    <td><strong>{u.viaturasRole || 'viewer'}</strong></td>
                    <td style={{ fontSize: 12, color: '#666' }}>{unidadesG || <em style={{ color: '#999' }}>nenhuma</em>}</td>
                    {canEdit && (
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => abrirEdição(u)}>
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE EDICAO COMPLETA */}
      {editando && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={fecharEdição}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Editar usuário</h2>

            <div className="alert" style={{ background: '#f0f7ff', border: '1px solid #1976d2', color: '#0d47a1', marginBottom: 12 }}>
              <strong>{editando.ptgr || ''} {editando.warName || editando.name}</strong>
              <br />CPF: <span style={{ fontFamily: 'monospace' }}>{editando.cpf}</span> | RE: {editando.re}{editando.digre ? `-${editando.digre}` : ''}
            </div>

            <div className="form-group">
              <label><strong>Role</strong></label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ fontSize: 14, padding: 8 }}>
                <option value="viewer">viewer (so agenda)</option>
                <option value="editor">editor (CRUD viatura)</option>
                <option value="gestor">gestor (aprova pedido)</option>
                <option value="admin">admin (gerência usuários)</option>
              </select>
            </div>

            {/* FIX (William 2026-09-14 v61): campo Unidade (OPM principal).
                Define a "casa" do usuario - ele ve' so viaturas/agendamentos
                dessa OPM por padrao. Sem isso o sistema nao sabe de qual
                subfrota o policial faz parte. */}
            <div className="form-group">
              <label><strong>🏢 Matriz da OPM</strong> (define o escopo do usuario)</label>
              <select
                value={editMatriz}
                onChange={e => { setEditMatriz(e.target.value); setEditUnit(e.target.value); setEditFilhas([]); }}
                style={{ fontSize: 14, padding: 8, width: '100%' }}
              >
                <option value="">— Selecione a matriz —</option>
                {/* FIX (William 2026-09-14 v65): soh mostra unidades MATRIZ
                    (code termina em "0000" ou eh CPI-7). Eh a partir daqui
                    que expandimos recursivamente pra pegar as filhas. */}
                {units.filter(u => u.code && u.code.length === 9 && u.code.endsWith('0000')).map(u => (
                  <option key={u._id} value={u._id}>
                    {u.code} - {u.sigla || u.name}
                  </option>
                ))}
              </select>
              <small style={{ color: '#666', fontSize: 11 }}>
                Matriz da OPM de origem (BPM, CPI-7, etc). Define quais viaturas o policial v&ecirc;.
              </small>
            </div>

            {/* FIX (William 2026-09-14 v65): multi-select filhas-raiz (opcional).
                Default = nada marcado = vê TODA a matriz recursivamente.
                Marcando = restringe pra essas filhas + seus descendentes. */}
            {editMatriz && (
              <div className="form-group">
                <label><strong>Filhas permitidas</strong> (opcional - sem nada marcado vê tudo)</label>
                <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8, maxHeight: 200, overflowY: 'auto', background: '#fff3e0' }}>
                  <small style={{ color: '#c62828', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    ⚠ ATENÇÃO: nao marque nada pra ele ver TODA a matriz.
                    Marcando filhas, ele so' ve as unidades selecionadas (+ descendentes).
                  </small>
                  {units.filter(u => String(u.commandUnit) === String(editMatriz) && u._id !== editMatriz).map(u => (
                    <label key={u._id} style={{ display: 'block', padding: 2, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editFilhas.includes(u._id)}
                        onChange={() => toggleFilha(u._id)}
                        style={{ marginRight: 6 }}
                      />
                      <span style={{ fontFamily: 'monospace' }}>{u.code}</span> - {u.sigla || u.name}
                    </label>
                  ))}
                  {(() => {
                    const filhasCount = units.filter(u => String(u.commandUnit) === String(editMatriz) && u._id !== editMatriz).length
                    if (filhasCount === 0) {
                      return (
                        <div style={{ marginTop: 8, padding: 8, background: '#ffebee', borderRadius: 4, fontSize: 12 }}>
                          ⚠ Nenhuma OPM cadastrada como subordinada dessa matriz.
                          <br />Se deixar tudo em branco, o usuário vê TUDA a matriz recursivamente.
                          <br />→ Pra cadastrar subordinadas: aba <strong>OPMs (Unidades)</strong> do menu.
                        </div>
                      )
                    }
                    return (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
                        ({filhasCount} filha{filhasCount !== 1 ? 's' : ''}-raiz encontrada{filhasCount !== 1 ? 's' : ''})
                      </div>
                    )
                  })()}
                </div>
                <small style={{ color: '#666' }}>
                  {editFilhas.length === 0
                    ? '(vazio) - Usuário vê TODA a matriz (todas as filhas + descendentes)'
                    : `${editFilhas.length} filha(s) selecionada(s)`}
                </small>
              </div>
            )}

            {/* FIX (William 2026-08-18): Escopo dos filtros de unidade */}
            <div className="form-group" style={{ background: '#fff3e0', padding: 12, borderRadius: 4, border: '1px solid #ff9800' }}>
              <label><strong>🔒 Escopo dos filtros de unidade</strong></label>
              <select
                value={editEscopo}
                onChange={e => setEditEscopo(e.target.value as 'livre' | 'restrito')}
                style={{ fontSize: 14, padding: 8, width: '100%' }}
              >
                <option value="restrito">
                  🔒 Restrito (recomendado) - dropdowns travados conforme a unidade
                </option>
                <option value="livre">
                  🔓 Livre - dropdowns abertos (vê todo o escopo: use só pra CPI-7 ou admin master)
                </option>
              </select>
              <small style={{ color: '#666', display: 'block', marginTop: 4 }}>
                <strong>Restrito + 1 unidade matriz</strong> (ex: 40BPMI): unidade travado, escolhe a filha<br />
                <strong>Restrito + 1 unidade filha</strong> (ex: 1ª Cia): ambos travados<br />
                <strong>Livre</strong>: admin master ou editor do CPI-7 (vê tudo)
              </small>
            </div>

            <div className="form-group" style={{ background: '#e3f2fd', padding: 12, borderRadius: 4, border: '1px solid #1976d2' }}>
              <strong>📌 Visão geral</strong>
              <p style={{ margin: '8px 0 4px 0', fontSize: 13 }}>
                Matriz: <strong>{(() => {
                  const u = units.find(x => x._id === editMatriz)
                  return u ? `${u.code} - ${u.sigla || u.name}` : '(não selecionada)'
                })()}</strong>
              </p>
              <p style={{ margin: '4px 0', fontSize: 13 }}>
                Filhas-raiz selecionadas: <strong>{editFilhas.length === 0 ? '(todas - vê toda a matriz recursivamente)' : editFilhas.length}</strong>
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: '#555' }}>
                🚦 GESTOR e EDITOR são gerados pelo backend a partir da matriz+filhas.
                Não precisa mais marcar nada - é automático.
              </p>
            </div>

            {editErro && <div className="alert alert-error">{editErro}</div>}
            {editSalvo && <div className="alert alert-success">Salvo! Modal fechando...</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={fecharEdição}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarEdição} disabled={editSalvo}>
                {editSalvo ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
