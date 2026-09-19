import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUser, refreshUserFromServer, useUserSubscription } from '../lib/auth'
import { getHomeStats } from '../lib/api'

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
        <h3 style={{ marginTop: 0 }}>Seu perfil</h3>
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
    </div>
  )
}
