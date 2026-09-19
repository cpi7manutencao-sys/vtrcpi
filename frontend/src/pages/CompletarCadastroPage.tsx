// ============================================================
// CompletarCadastroPage - User novo preenche CPF/RE/Posto/Unidade
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, getUser, setAuth, isLoggedIn } from "../lib/auth";

interface Unit {
  id: number;
  code: string;
  name: string;
  sigla?: string;
  active: boolean;
}

export default function CompletarCadastroPage() {
  const nav = useNavigate();
  const [units, setUnits] = useState<Unit[]>([]);
  const [cpf, setCpf] = useState("");
  const [re, setRe] = useState("");
  const [digre, setDigre] = useState("");
  const [warName, setWarName] = useState("");
  const [postoGraduacao, setPostoGraduacao] = useState("");
  const [unitId, setUnitId] = useState<number | null>(null);
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      nav("/login", { replace: true });
      return;
    }
    loadUnits();
  }, []);

  async function loadUnits() {
    try {
      const data: any = await apiFetch(`/api/units/list`);
      if (data.ok) {
        // Mostrar SÓ matrizes raiz (terminadas em 0000) + opção "OUTRA"
        const raizes = data.units.filter((u: Unit) => u.code.endsWith("0000") || u.code.endsWith("000"));
        setUnits(raizes);
      }
    } catch (e: any) {
      setErro(`Erro ao carregar unidades: ${e.message}`);
    }
  }

  function formatCpf(v: string) {
    const clean = v.replace(/\D/g, "").slice(0, 11);
    return clean
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!cpf || cpf.replace(/\D/g, "").length !== 11) {
      setErro("CPF inválido");
      return;
    }
    if (!re) {
      setErro("RE obrigatório");
      return;
    }
    if (!warName) {
      setErro("Nome de guerra obrigatório");
      return;
    }
    if (!postoGraduacao) {
      setErro("Posto/Graduação obrigatório");
      return;
    }
    setLoading(true);
    try {
      const data: any = await apiFetch(`/api/users/profile`, {
        method: "POST",
        body: JSON.stringify({
          cpf: cpf.replace(/\D/g, ""),
          re,
          digre: digre || undefined,
          warName,
          postoGraduacao,
          unitId: unitId || undefined,
          telefone: telefone || undefined,
        }),
      });
      if (!data.ok) {
        setErro(data.error || "Erro ao salvar");
        return;
      }
      // Atualizar localStorage com novo token
      const current = getUser();
      if (current) {
        setAuth(data.token, {
          ...current,
          cpf: data.session.cpf,
          re: data.session.re,
          warName: data.session.warName,
          postoGraduacao: data.session.postoGraduacao,
          unitId: data.session.unitId,
        });
      }
      nav("/aguardando-aprovacao", { replace: true });
    } catch (err: any) {
      setErro(err.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  const postos = [
    "Sd PM",
    "Cb PM",
    "3º Sgt PM",
    "2º Sgt PM",
    "1º Sgt PM",
    "Sub Ten PM",
    "Asp Of PM",
    "2º Ten PM",
    "1º Ten PM",
    "Cap PM",
    "Maj PM",
    "Ten Cel PM",
    "Cel PM",
  ];

  return (
    <div className="page-container" style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
      <h1>Completar Cadastro</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Preencha seus dados para que um gestor possa aprovar seu acesso.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>CPF *</label>
          <input
            type="text"
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            required
          />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div className="form-group" style={{ flex: 3 }}>
            <label>RE *</label>
            <input
              type="text"
              value={re}
              onChange={(e) => setRe(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              required
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Dígito</label>
            <input
              type="text"
              value={digre}
              onChange={(e) => setDigre(e.target.value.slice(0, 1))}
              placeholder="0"
              maxLength={1}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Nome de Guerra *</label>
          <input
            type="text"
            value={warName}
            onChange={(e) => setWarName(e.target.value.toUpperCase())}
            placeholder="WILLIAM"
            maxLength={50}
            required
          />
        </div>

        <div className="form-group">
          <label>Posto/Graduação *</label>
          <select
            value={postoGraduacao}
            onChange={(e) => setPostoGraduacao(e.target.value)}
            required
          >
            <option value="">Selecione...</option>
            {postos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Unidade</label>
          <select
            value={unitId ?? ""}
            onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem unidade específica (gestor define)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Telefone (opcional)</label>
          <input
            type="text"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(15) 99999-9999"
            maxLength={20}
          />
        </div>

        {erro && <div className="alert alert-error">{erro}</div>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
        >
          {loading ? "Salvando..." : "Enviar para aprovação"}
        </button>
      </form>
    </div>
  );
}
