// ============================================================
// AguardandoAprovacaoPage - User novo com cadastro completo, esperando gestor
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, getUser, refreshUserFromServer } from "../lib/auth";

export default function AguardandoAprovacaoPage() {
  const nav = useNavigate();
  const [checking, setChecking] = useState(false);
  const user = getUser();

  async function verificar() {
    setChecking(true);
    try {
      const updated = await refreshUserFromServer();
      if (updated?.approved) {
        // Gestor aprovou! Redireciona pra home
        nav("/", { replace: true });
      }
    } catch (e) {
      // ignora
    } finally {
      setChecking(false);
    }
  }

  // Auto-check a cada 30s
  useEffect(() => {
    const t = setInterval(verificar, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page-container" style={{ maxWidth: 600, margin: "40px auto", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
      <h1>Aguardando Aprovação</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Seu cadastro foi enviado para um gestor.
        <br />
        Você receberá acesso assim que for aprovado.
      </p>

      <div style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, marginBottom: 24, textAlign: "left" }}>
        <strong>Seus dados:</strong>
        <div style={{ marginTop: 8, fontSize: 14 }}>
          <div>📧 {user?.email}</div>
          <div>👤 {user?.name}</div>
          {user?.cpf && <div>🆔 CPF: {user.cpf}</div>}
          {user?.re && <div>🎖️ RE: {user.re}{user?.digre ? `-${user.digre}` : ""}</div>}
          {user?.postoGraduacao && <div>⭐ {user.postoGraduacao} {user?.warName}</div>}
        </div>
      </div>

      <button onClick={verificar} className="btn btn-primary" disabled={checking} style={{ marginRight: 8 }}>
        {checking ? "Verificando..." : "🔄 Verificar agora"}
      </button>
      <button onClick={logout} className="btn btn-secondary">
        Sair
      </button>
    </div>
  );
}
