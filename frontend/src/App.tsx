import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import AgendarPage from "./pages/AgendarPage";
import AgendamentosPage from "./pages/AgendamentosPage";
import CalendarioPage from "./pages/CalendarioPage";
import ViaturasPage from "./pages/ViaturasPage";
import DashboardPage from "./pages/DashboardPage";
import GestaoUsuariosPage from "./pages/GestaoUsuariosPage";
import ProcessoDescargaPage from "./pages/ProcessoDescargaPage";
import DesempenhoPage from "./pages/DesempenhoPage";
import OpmsPage from "./pages/OpmsPage";
import CompletarCadastroPage from "./pages/CompletarCadastroPage";
import AguardandoAprovacaoPage from "./pages/AguardandoAprovacaoPage";
import AprovacaoPage from "./pages/AprovacaoPage";
import IfctMobilePage from "./pages/IfctMobilePage";
import Sidebar from "./components/Sidebar";
import { isLoggedIn, getUser, refreshUserFromServer } from "./lib/auth";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = getUser();
  if (!isLoggedIn() || !user) {
    return <Navigate to="/login" replace />;
  }
  // Redireciona conforme estado do user
  if (!user.cpf) {
    return <Navigate to="/completar-cadastro" replace />;
  }
  if (!user.approved && !user.isMaster) {
    return <Navigate to="/aguardando-aprovacao" replace />;
  }
  return <>{children}</>;
}

function SidebarRefresher() {
  const location = useLocation();
  useEffect(() => {
    if (!getUser()) return;
    refreshUserFromServer().catch(() => {});
  }, [location.pathname]);
  return null;
}

function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-container">
      <SidebarRefresher />
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Fluxo de cadastro novo */}
      <Route path="/completar-cadastro" element={<CompletarCadastroPage />} />
      <Route path="/aguardando-aprovacao" element={<AguardandoAprovacaoPage />} />
      <Route path="/aprovacao" element={<AprovacaoPage />} />

      {/* App principal */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <HomePage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/agendar"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <AgendarPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/agendamentos"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <AgendamentosPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/calendario"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <CalendarioPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/viaturas"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <ViaturasPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <DashboardPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/desempenho"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <DesempenhoPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/descarga"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <ProcessoDescargaPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/gestão"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <GestaoUsuariosPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/opms"
        element={
          <PrivateRoute>
            <PrivateLayout>
              <OpmsPage />
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      <Route
        element={
          <PrivateRoute>
            <PrivateLayout>
            </PrivateLayout>
          </PrivateRoute>
        }
      />
      {/* FIX (William 2026-09-04): rota PUBLICA do IFCT mobile (sem auth, sem Sidebar) */}
      <Route path="/ifct/:token" element={<IfctMobilePage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// FORCED-CHANGE-V73-PROBE-99