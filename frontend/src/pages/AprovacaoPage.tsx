// ============================================================
// AprovacaoPage - Gestor/admin aprova users pendentes
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, isLoggedIn, isGestor, getUser } from "../lib/auth";

interface PendingUser {
  id: number;
  email: string;
  name: string;
  picture?: string;
  cpf: string;
  re: string;
  digre?: string;
  warName: string;
  postoGraduacao: string;
  unitId?: number;
  unit?: { id: number; name: string; code: string; sigla?: string } | null;
  createdAt: number;
}

interface Unit {
  id: number;
  code: string;
  name: string;
  sigla?: string;
}

export default function AprovacaoPage() {
  const nav = useNavigate();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [processing, setProcessing] = useState<number | null>(null);

  // Por usuário, configuração de aprovação
  const [config, setConfig] = useState<Record<number, { viaturasRole: string; unitId: number | null }>>({});

  useEffect(() => {
    if (!isLoggedIn()) {
      nav("/login", { replace: true });
      return;
    }
    if (!isGestor()) {
      nav("/", { replace: true });
      return;
    }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErro("");
    try {
      const [pendingRes, unitsRes] = await Promise.all([
        apiFetch(`/api/users/pending`),
        apiFetch(`/api/units/list`),
      ]);
      if (pendingRes.ok) {
        setPending(pendingRes.pending);
        // Inicializar config default
        const newConfig: typeof config = {};
        pendingRes.pending.forEach((u: PendingUser) => {
          newConfig[u.id] = {
            viaturasRole: "viewer",
            unitId: u.unitId || null,
          };
        });
        setConfig(newConfig);
      } else {
        setErro(pendingRes.error || "Erro ao carregar pendentes");
      }
      if (unitsRes.ok) {
        setUnits(unitsRes.units);
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function aprovar(userId: number) {
    const cfg = config[userId];
    if (!cfg) return;
    setProcessing(userId);
    try {
      const data: any = await apiFetch(`/api/users/approve`, {
        method: "POST",
        body: JSON.stringify({
          userId,
          viaturasRole: cfg.viaturasRole,
          unitId: cfg.unitId,
        }),
      });
      if (data.ok) {
        await loadAll();
      } else {
        setErro(data.error || "Erro ao aprovar");
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessing(null);
    }
  }

  async function rejeitar(userId: number) {
    if (!confirm("Rejeitar este usuário? Ele será desativado.")) return;
    setProcessing(userId);
    try {
      const data: any = await apiFetch(`/api/users/reject`, {
        method: "POST",
        body: JSON.stringify({ userId, motivo: "Rejeitado pelo gestor" }),
      });
      if (data.ok) {
        await loadAll();
      } else {
        setErro(data.error || "Erro ao rejeitar");
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessing(null);
    }
  }

  function setUserConfig(userId: number, field: string, value: any) {
    setConfig((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center" }}>Carregando...</div>;
  }

  return (
    <div className="page-container" style={{ padding: 24 }}>
      <h1>👥 Aprovação de Usuários</h1>
      <p style={{ color: "#666" }}>
        {pending.length} usuário(s) aguardando aprovação
      </p>

      {erro && <div className="alert alert-error">{erro}</div>}

      {pending.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
          🎉 Nenhum usuário pendente!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pending.map((u) => {
            const cfg = config[u.id] || { viaturasRole: "viewer", unitId: null };
            const isThisProcessing = processing === u.id;
            return (
              <div
                key={u.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 16,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", gap: 16 }}>
                  {u.picture && (
                    <img
                      src={u.picture}
                      alt={u.name}
                      style={{ width: 56, height: 56, borderRadius: "50%" }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0 }}>
                      {u.postoGraduacao} {u.warName}
                    </h3>
                    <div style={{ color: "#666", fontSize: 14 }}>
                      {u.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                      📧 {u.email} · 🆔 {u.cpf} · RE {u.re}
                      {u.digre ? `-${u.digre}` : ""}
                      {u.unit && ` · 📍 ${u.unit.name}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: "1 1 200px", margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Papel:</label>
                    <select
                      value={cfg.viaturasRole}
                      onChange={(e) => setUserConfig(u.id, "viaturasRole", e.target.value)}
                      style={{ width: "100%" }}
                    >
                      <option value="viewer">Viewer (só vê)</option>
                      <option value="editor">Editor (CRUD viatura)</option>
                      <option value="gestor">Gestor (aprova)</option>
                      <option value="admin">Admin (tudo)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: "2 1 300px", margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Unidade:</label>
                    <select
                      value={cfg.unitId ?? ""}
                      onChange={(e) => setUserConfig(u.id, "unitId", e.target.value ? Number(e.target.value) : null)}
                      style={{ width: "100%" }}
                    >
                      <option value="">— sem unidade —</option>
                      {units.map((un) => (
                        <option key={un.id} value={un.id}>
                          {un.name} ({un.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => aprovar(u.id)}
                      disabled={isThisProcessing}
                      className="btn btn-primary"
                    >
                      ✅ Aprovar
                    </button>
                    <button
                      onClick={() => rejeitar(u.id)}
                      disabled={isThisProcessing}
                      className="btn btn-danger"
                    >
                      ❌ Rejeitar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
