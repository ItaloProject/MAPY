import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../components/Layout.css";
import { supabase } from "../lib/supabase";

type Stat = {
  label: string;
  value: number | null;
  delta?: string;
  dir?: "up" | "down";
  color: string;
  bg: string;
  icon: React.ReactNode;
};

type ClienteRecente = {
  id: string;
  nome: string;
  cpf: string | null;
  controle_status: string;
  created_at: string;
};

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtNum(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR");
}
function iniciais(nome: string) {
  const p = nome.trim().split(" ");
  return (p[0][0] + (p[p.length - 1]?.[0] ?? "")).toUpperCase();
}
const AVATAR_COLORS = ["#0ea5e9","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#8b5cf6"];
function avatarColor(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const statusChip: Record<string, { cls: string; label: string }> = {
  Pendente:  { cls: "chip--yellow", label: "Pendente" },
  Concluído: { cls: "chip--green",  label: "Concluído" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading,      setLoading]      = useState(true);
  const [clientes,     setClientes]     = useState<number | null>(null);
  const [qrcodes,      setQrcodes]      = useState<number | null>(null);
  const [pendentes,    setPendentes]    = useState<number | null>(null);
  const [usuarios,     setUsuarios]     = useState<number | null>(null);
  const [recentes,     setRecentes]     = useState<ClienteRecente[]>([]);
  const [deltaCli,     setDeltaCli]     = useState<string>("");
  const [deltaQR,      setDeltaQR]      = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoading(true);

      const mesAtual = new Date();
      const inicioMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).toISOString();
      const inicioMesAnt = new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1).toISOString();

      const [
        { count: totalCli },
        { count: totalQR },
        { count: totalPend },
        { count: totalUsu },
        { data: recentesData },
        { count: cliMes },
        { count: cliMesAnt },
        { count: qrMes },
        { count: qrMesAnt },
      ] = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }).eq("pagamento_status", "pendente"),
        supabase.from("usuarios").select("*", { count: "exact", head: true }).eq("status", "Ativo"),
        supabase.from("clientes").select("id,nome,cpf,controle_status,created_at").order("created_at", { ascending: false }).limit(6),
        supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", inicioMes),
        supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", inicioMesAnt).lt("created_at", inicioMes),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }).gte("created_at", inicioMes),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }).gte("created_at", inicioMesAnt).lt("created_at", inicioMes),
      ]);

      setClientes(totalCli ?? 0);
      setQrcodes(totalQR ?? 0);
      setPendentes(totalPend ?? 0);
      setUsuarios(totalUsu ?? 0);
      setRecentes((recentesData ?? []) as ClienteRecente[]);

      // Delta clientes
      if ((cliMesAnt ?? 0) > 0) {
        const pct = Math.round(((cliMes ?? 0) - (cliMesAnt ?? 0)) / (cliMesAnt ?? 1) * 100);
        setDeltaCli(`${pct >= 0 ? "+" : ""}${pct}% este mês`);
      } else {
        setDeltaCli(`+${cliMes ?? 0} este mês`);
      }

      // Delta QR
      if ((qrMesAnt ?? 0) > 0) {
        const pct = Math.round(((qrMes ?? 0) - (qrMesAnt ?? 0)) / (qrMesAnt ?? 1) * 100);
        setDeltaQR(`${pct >= 0 ? "+" : ""}${pct}% este mês`);
      } else {
        setDeltaQR(`+${qrMes ?? 0} este mês`);
      }

      setLoading(false);
    }
    load();
  }, []);

  const stats: Stat[] = [
    {
      label: "Total Clientes", value: clientes, delta: deltaCli, dir: "up",
      color: "#6366f1", bg: "rgba(99,102,241,0.12)",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
      label: "QRCodes Gerados", value: qrcodes, delta: deltaQR, dir: "up",
      color: "#34d399", bg: "rgba(52,211,153,0.12)",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>,
    },
    {
      label: "Pendentes", value: pendentes,
      delta: pendentes !== null ? (pendentes > 0 ? `${pendentes} aguardando` : "Tudo em dia") : "",
      dir: (pendentes ?? 0) > 0 ? "down" : "up",
      color: "#fbbf24", bg: "rgba(251,191,36,0.12)",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      label: "Usuários Ativos", value: usuarios,
      color: "#818cf8", bg: "rgba(129,140,248,0.12)",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
  ];

  return (
    <>
      <style>{`
        @keyframes pulse-sk { 0%,100%{opacity:.4} 50%{opacity:.8} }
        .sk { background:var(--surface-2); border-radius:6px; animation:pulse-sk 1.4s ease infinite; }
      `}</style>

      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Visão geral do sistema — {loading ? "carregando…" : "atualizado agora"}</p>
        </div>
        <button className="btn-sm" onClick={() => window.location.reload()} style={{ alignSelf: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
          </svg>
          Atualizar
        </button>
      </div>

      {/* Stat cards */}
      <div className="stats-row">
        {stats.map(s => (
          <div key={s.label} className="stat-card" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="stat-icon" style={{ background: s.bg, color: s.color, margin: 0 }}>{s.icon}</div>
              {loading && <div className="sk" style={{ width: 48, height: 16 }} />}
            </div>
            {loading ? (
              <div className="sk" style={{ width: 72, height: 32, marginBottom: 6 }} />
            ) : (
              <div className="stat-value" style={{ color: s.color }}>{fmtNum(s.value)}</div>
            )}
            <div className="stat-label">{s.label}</div>
            {s.delta && !loading && (
              <div className={`stat-delta ${s.dir ?? "up"}`}>
                {s.dir === "down" ? "↓" : "↑"} {s.delta}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Clientes Recentes */}
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Clientes Recentes</span>
          <button className="btn-sm" onClick={() => navigate("/clientes")}>Ver todos</button>
        </div>
        <div className="section-card-body" style={{ overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="sk" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", gap: 16 }}>
                    <div className="sk" style={{ width: 140, height: 14 }} />
                    <div className="sk" style={{ width: 80, height: 14 }} />
                    <div className="sk" style={{ width: 70, height: 14 }} />
                    <div className="sk" style={{ width: 90, height: 14 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : recentes.length === 0 ? (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .4 }}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              <p>Nenhum cliente cadastrado ainda.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>CPF</th>
                  <th>Status</th>
                  <th>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map(c => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => navigate("/clientes")}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(c.nome), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {iniciais(c.nome)}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nome}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 13, color: "var(--fg-muted)" }}>
                      {c.cpf ?? <span style={{ opacity: .4 }}>—</span>}
                    </td>
                    <td>
                      <span className={`chip ${statusChip[c.controle_status]?.cls ?? "chip--gray"}`}>
                        {statusChip[c.controle_status]?.label ?? c.controle_status}
                      </span>
                    </td>
                    <td style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      {fmtData(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
