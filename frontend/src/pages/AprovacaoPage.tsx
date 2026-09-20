// ============================================================
// AprovacaoPage - Gestor/admin aprova users pendentes
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, isLoggedIn, isGestor, getUser } from "../lib/auth";
import { useAutoRefresh } from "../lib/useAutoRefresh";

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
  // FIX (William 2026-09-20): auto-refresh a cada 20s pra ver novos
  // usuarios pendentes cadastrados.
  useAutoRefresh(loadAll, { interval: 20000, paused: loading });

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
      // FIX (William 2026-09-19): se for gestor/editor e tiver unidade selecionada,
      // envia unidadesGestor/unidadesEditor com base na unidade atribuida.
      // Isso garante que o novo gestor/admin veja as viaturas/agendamentos da unidade.
      const unidadesParaEnviar = (cfg.viaturasRole === "gestor" || cfg.viaturasRole === "admin")
        ? [cfg.unitId].filter((x): x is number => !!x)
        : [];
      const data: any = await apiFetch(`/api/users/approve`, {
        method: "POST",
        body: JSON.stringify({
          userId,
          viaturasRole: cfg.viaturasRole,
          unitId: cfg.unitId,
          unidadesGestor: unidadesParaEnviar,
          unidadesEditor: unidadesParaEnviar,
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
    <div>
      <div className="page-header">
        <h1>Aprovação de Usuários</h1>
        <p>{pending.length} usuário(s) aguardando aprovação. Defina o papel e a unidade, depois aprove ou rejeite.</p>
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      {pending.length === 0 ? (
        <div className="card">
          <p style={{ textAlign: "center", color: "#888", padding: 40 }}>
            🎉 Nenhum usuário pendente!
          </p>
        </div>
      ) : (
        <div className="card">
          <p style={{ color: '#666', fontSize: 13 }}>
            {pending.length} usuário(s) aguardando aprovação
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Identificação</th>
                <th>Unidade atual</th>
                <th>Papel a atribuir</th>
                <th>Unidade a atribuir</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((u) => {
                const cfg = config[u.id] || { viaturasRole: "viewer", unitId: null };
                const isThisProcessing = processing === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {u.picture && (
                          <img
                            src={u.picture}
                            alt={u.name}
                            style={{ width: 36, height: 36, borderRadius: "50%" }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {u.postoGraduacao} {u.warName}
                          </div>
                          <div style={{ fontSize: 12, color: "#666" }}>{u.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>📧 {u.email}</div>
                      <div>🆔 CPF {u.cpf}</div>
                      <div>RE {u.re}{u.digre ? `-${u.digre}` : ""}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {u.unit ? u.unit.name : <span style={{ color: "#999" }}>— sem unidade —</span>}
                    </td>
                    <td>
                      <select
                        value={cfg.viaturasRole}
                        onChange={(e) => setUserConfig(u.id, "viaturasRole", e.target.value)}
                        style={{ width: 130 }}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="gestor">Gestor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={cfg.unitId ?? ""}
                        onChange={(e) => setUserConfig(u.id, "unitId", e.target.value ? Number(e.target.value) : null)}
                        style={{ width: 200 }}
                      >
                        <option value="">— sem unidade —</option>
                        {units.map((un) => (
                          <option key={un.id} value={un.id}>
                            {un.sigla || un.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => aprovar(u.id)}
                          disabled={isThisProcessing}
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          ✅ Aprovar
                        </button>
                        <button
                          onClick={() => rejeitar(u.id)}
                          disabled={isThisProcessing}
                          className="btn btn-danger"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          ❌ Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
