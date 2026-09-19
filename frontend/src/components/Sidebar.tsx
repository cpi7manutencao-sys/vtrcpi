import { NavLink, useNavigate } from 'react-router-dom'
import { logout, getUser, isAdmin, isEditor, isGestor, useUserSubscription } from '../lib/auth'

export default function Sidebar() {
  // FIX (William 2026-08-24): re-renderiza quando refreshUserFromServer
  // atualiza o localStorage (sem precisar logout/login)
  useUserSubscription(() => {})
  const user = getUser()
  const nav = useNavigate()

  function handleLogout() {
    logout()
    nav('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>Viaturas CPI-7</h2>
            <div className="sidebar-user">
              {user?.postoGraduacao} {user?.warName || user?.name}
              <br />
              RE {user?.re}
              <br />
              {user?.viaturasRole === 'admin' && 'Admin'}
              {user?.viaturasRole === 'gestor' && 'Gestor'}
              {user?.viaturasRole === 'editor' && 'Editor'}
              {user?.viaturasRole === 'viewer' && 'Usuário'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
            title="Sair do sistema"
          >
            Sair
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/agendar">Agendar Viatura</NavLink>
        <NavLink to="/agendamentos">Agendamentos</NavLink>
        <NavLink to="/calendario">Calendário</NavLink>
        {(isEditor() || isAdmin()) && (
          <>
            <div className="nav-section">Operação</div>
            <NavLink to="/dashboard">Mapa Geral de Viaturas</NavLink>
            <NavLink to="/desempenho">Desempenho</NavLink>
            <NavLink to="/viaturas">Viaturas</NavLink>
            <NavLink to="/descarga">Processo de Descarga</NavLink>
          </>
        )}

        {/* Admin: lista de usuários (cadastrar, promover, unidades) */}
        {isAdmin() && (
          <>
            <div className="nav-section">Admin</div>
            <NavLink to="/gestão">Usuários</NavLink>
          </>
        )}

        {/* Gestor+: aprovar users pendentes */}
        {isGestor() && (
          <>
            <div className="nav-section">Gestão</div>
            <NavLink to="/aprovacao">Aprovar Usuários</NavLink>
          </>
        )}

        {/* Cadastro de OPMs: admin (tudo) OU gestor (so filhas das suas) */}
        {(isAdmin() || isGestor()) && (
          <>
            {!isAdmin() && <div className="nav-section">Gestão</div>}
            <NavLink to="/opms">OPMs (Unidades)</NavLink>
          </>
        )}
      </nav>
    </aside>
  )
}
