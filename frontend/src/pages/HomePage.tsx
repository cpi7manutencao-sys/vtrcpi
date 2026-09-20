import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUser, refreshUserFromServer, setAuth, useUserSubscription } from '../lib/auth'
import { getHomeStats, updateMyProfile } from '../lib/api'

export default function HomePage() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  // FIX (William 2026-08-25): escuta atualizacoes do user (evento disparado
  // pelo setAuth) pra re-renderizar quando o localStorage muda.
  // Resolve bug do OPM que ficava vazio na Home.
  const subscribedUser = useUserSubscription(() => {})
  const [currentUser, setCurrentUser] = useState(getUser())
  // FIX (William 2026-08-25): usa o user do subscription se ele mudou
  const user = subscribedUser || currentUser

  // FIX (William 2026-09-20): modal de edicao do proprio perfil
  const [showEditPerfil, setShowEditPerfil] = useState(false)
  const [editName, setEditName] = useState('')
  const [editWarName, setEditWarName] = useState('')
  const [editPostoGraduacao, setEditPostoGraduacao] = useState('')
  const [editTelefone, setEditTelefone] = useState('')
  const [editSalvo, setEditSalvo] = useState(false)
  const [editErro, setEditErro] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    if (!currentUser) return

    // FIX (William 2026-08-11): se token antigo não tem opmCode/viaturasRole,
    // chama /api/admin/refresh-token pra pegar dados atualizados do Convex
    // (merge: viaturasRole, opmCode, unidadesGestor/Editor)
    // FIX (William 2026-08-21): SEMPRE fazer refresh pra pegar isMaster
    // (campo novo, JWT antigo nao tem). Barato (1 query no Convex).
    refreshUserFromServer().then((u) => {
      if (u) {
        console.log("[home] refresh OK:", {
          opmCode: u.opmCode,
          viaturasRole: u.viaturasRole,
          isMaster: u.isMaster,
        })
        setCurrentUser(u)
      }
    })

    getHomeStats(currentUser.cpf)
      .then((data: any) => setStats(data?.stats || data))
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }, [currentUser?.cpf])

  // FIX (William 2026-09-20): funcoes para modal de edicao de perfil
  function abrirEditPerfil() {
    if (!user) return
    // name eh o nome completo (vem do Google, as vezes vem do email)
    setEditName(user.name || '')
    setEditWarName(user.warName || '')
    setEditPostoGraduacao(user.postoGraduacao || '')
    // telefone nao vem no JWT - pega do localStorage do setAuth
    setEditTelefone((user as any).telefone || '')
    setEditSalvo(false)
    setEditErro('')
    setShowEditPerfil(true)
  }

  async function salvarPerfil() {
    setEditLoading(true)
    setEditSalvo(false)
    setEditErro('')
    try {
      const r: any = await updateMyProfile({
        name: editName,
        warName: editWarName,
        postoGraduacao: editPostoGraduacao,
        telefone: editTelefone || undefined,
      })
      if (r.ok) {
        // Atualiza localStorage com novo token + session
        if (r.token && r.session) {
          setAuth(r.token, {
            ...user,
            name: r.session.name,
            warName: r.session.warName,
            postoGraduacao: r.session.postoGraduacao,
            cpf: r.session.cpf,
            re: r.session.re,
            isMaster: r.session.isMaster,
            approved: r.session.approved,
            viaturasRole: r.session.viaturasRole,
            unit: r.session.unitId,
          } as any)
        }
        setEditSalvo(true)
        // Atualiza o currentUser pra refletir as mudancas
        setCurrentUser(getUser())
        setTimeout(() => {
          setShowEditPerfil(false)
        }, 1000)
      } else {
        setEditErro(r.error || 'Erro ao salvar')
      }
    } catch (e: any) {
      setEditErro(e.message || 'Erro ao salvar')
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Bem-vindo, {user?.postoGraduacao} {user?.warName || user?.name}</h1>
        <p>Painel principal do sistema de viaturas</p>
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Meus Agendamentos</div>
          <div className="stat-value">{loading ? '...' : stats?.meusAgendamentos || 0}</div>
          <div className="stat-detail">total que eu fiz</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Aprovados</div>
          <div className="stat-value" style={{ color: '#2e7d32' }}>
            {loading ? '...' : stats?.meusAprovados || 0}
          </div>
          <div className="stat-detail">confirmados pelo gestor</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Concluidos</div>
          <div className="stat-value" style={{ color: '#666' }}>
            {loading ? '...' : stats?.meusConcluidos || 0}
          </div>
          <div className="stat-detail">finalizados</div>
        </div>
        {(user?.viaturasRole === 'gestor' || user?.viaturasRole === 'admin') && (
          <div className="stat-card">
            <div className="stat-label">Pendentes (gestor)</div>
            <div className="stat-value" style={{ color: '#f57c00' }}>
              {loading ? '...' : stats?.pendentes || 0}
            </div>
            <div className="stat-detail">aguardando aprovação</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ações rapidas</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/agendar" className="btn btn-primary">+ Agendar Viatura</Link>
          <Link to="/agendamentos" className="btn btn-secondary">Ver Agendamentos</Link>
          <Link to="/calendario" className="btn btn-secondary">Calendário</Link>
          {(user?.viaturasRole === 'gestor' || user?.viaturasRole === 'admin') && (
            <Link to="/dashboard" className="btn btn-secondary">Mapa Geral de Viaturas</Link>
          )}
          {(user?.viaturasRole === 'editor' || user?.viaturasRole === 'gestor' || user?.viaturasRole === 'admin') && (
            <Link to="/viaturas" className="btn btn-secondary">Viaturas</Link>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ marginTop: 0 }}>Seu perfil</h3>
          {/* FIX (William 2026-09-20): botao para editar perfil (warName, posto, telefone) */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={abrirEditPerfil}
            title="Editar nome de guerra, posto, telefone"
          >✏️ Editar Perfil</button>
        </div>
        <table className="table">
          <tbody>
            <tr><th>CPF</th><td>{user?.cpf}</td></tr>
            <tr><th>RE</th><td>{user?.re}</td></tr>
            <tr><th>Nome</th><td>{user?.name}</td></tr>
            <tr><th>Nome de Guerra</th><td>{user?.warName}</td></tr>
            <tr><th>Posto/Graduacao</th><td>{user?.postoGraduacao}</td></tr>
            <tr><th>OPM</th><td>{user?.opmCode}</td></tr>
            <tr><th>Unidade</th><td>{user?.unit?.name || user?.unit?.sigla || "—"}</td></tr>
            <tr><th>Role no app</th>
              <td>
                {user?.viaturasRole === 'admin' && 'Administrador'}
                {user?.viaturasRole === 'gestor' && 'Gestor'}
                {user?.viaturasRole === 'editor' && 'Editor'}
                {user?.viaturasRole === 'viewer' && 'Usuário'}
                {!user?.viaturasRole && '(aguardando promocao)'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* FIX (William 2026-09-20): Modal de edicao do proprio perfil */}
      {showEditPerfil && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowEditPerfil(false) }}
        >
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 480, width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ marginTop: 0 }}>✏️ Editar Perfil</h2>
            <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
              Atualize seus dados pessoais. CPF, RE e unidades só podem ser alterados pelo admin.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Posto/Graduação
              </label>
              <input
                type="text"
                value={editPostoGraduacao}
                onChange={e => setEditPostoGraduacao(e.target.value)}
                placeholder="Ex: Cb PM"
                style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Nome (completo)
              </label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Ex: MICHEL WILLIAM DE MORAES"
                style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
              <small style={{ color: '#888', fontSize: 11 }}>
                O Google às vezes preenche isso com parte do email. Corrija aqui.
              </small>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Nome de Guerra
              </label>
              <input
                type="text"
                value={editWarName}
                onChange={e => setEditWarName(e.target.value)}
                placeholder="Ex: GUERREIRO"
                style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Telefone (opcional)
              </label>
              <input
                type="text"
                value={editTelefone}
                onChange={e => setEditTelefone(e.target.value)}
                placeholder="(11) 98765-4321"
                style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
            </div>

            {editErro && (
              <div className="alert alert-error" style={{ fontSize: 13 }}>{editErro}</div>
            )}
            {editSalvo && (
              <div className="alert" style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: 13 }}>
                ✅ Dados atualizados com sucesso!
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowEditPerfil(false)}
                disabled={editLoading}
              >Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={salvarPerfil}
                disabled={editLoading || editSalvo}
              >{editLoading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
