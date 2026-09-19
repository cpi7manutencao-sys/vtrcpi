// ============================================================
// LoginPage - Abre popup OAuth 2.0 com Google
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithGoogle, GOOGLE_CLIENT_ID } from "../lib/auth";

export default function LoginPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin() {
    setErro("");
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      if (result.needsProfile) {
        nav("/completar-cadastro", { replace: true });
      } else if (result.needsApproval) {
        nav("/aguardando-aprovacao", { replace: true });
      } else {
        nav("/", { replace: true });
      }
    } catch (err: any) {
      setErro(err.message || "Erro de login");
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Viaturas CPI-7</h1>
        <p className="subtitle">Sistema de Agendamento de Viaturas</p>

        {erro && <div className="alert alert-error">{erro}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <p>Autenticando...</p>
            <p style={{ fontSize: 12, color: "#888" }}>
              Se o popup do Google não abriu, permita popups pra este site.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={handleLogin}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <span style={{ marginRight: 8 }}>🔐</span> Entrar com Google
            </button>
            {!GOOGLE_CLIENT_ID && (
              <div className="alert alert-warning" style={{ marginTop: 12, fontSize: 12 }}>
                <strong>Setup pendente:</strong> VITE_GOOGLE_CLIENT_ID não definido.
                <br />
                Edite <code>frontend/.env</code> e adicione seu Client ID.
              </div>
            )}
          </>
        )}

        <p style={{ fontSize: 11, color: "#888", marginTop: 16, textAlign: "center" }}>
          Acesso restrito a policiais militares do CPI-7.
          <br />
          Novos usuários precisam de aprovação de um gestor.
        </p>
      </div>
    </div>
  );
}
