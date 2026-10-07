import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import "../components/Layout.css";

const ADMIN_EMAIL = "italo.fontes2026@gmail.com";
const VALOR_POR_PUBLICACAO = 100;

interface PubPagamento {
  id: number;
  pub_id: string;
  nome: string;
  cpf: string;
  protocolo: string;
  data: string;
  curso: string;
  pagamento_status: "pendente" | "pago";
  pagamento_data: string | null;
  created_at: string;
}

export default function Pendentes() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pubs, setPubs] = useState<PubPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email !== ADMIN_EMAIL) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      await carregar();
      setLoading(false);
    }
    init();
  }, []);

  async function carregar() {
    const { data } = await supabase
      .from("publicacoes")
      .select("id,pub_id,nome,cpf,protocolo,data,curso,pagamento_status,pagamento_data,created_at")
      .order("created_at", { ascending: false });
    if (data) setPubs(data as PubPagamento[]);
  }

  async function marcarPago(id: number) {
    setSaving(true);
    const agora = new Date().toISOString();
    const { data } = await supabase
      .from("publicacoes")
      .update({ pagamento_status: "pago", pagamento_data: agora })
      .eq("id", id)
      .select("id,pub_id,nome,cpf,protocolo,data,curso,pagamento_status,pagamento_data,created_at")
      .single();
    if (data) setPubs(prev => prev.map(p => p.id === id ? data as PubPagamento : p));
    setSaving(false);
    setConfirmId(null);
  }

  async function marcarPendente(id: number) {
    setSaving(true);
    const { data } = await supabase
      .from("publicacoes")
      .update({ pagamento_status: "pendente", pagamento_data: null })
      .eq("id", id)
      .select("id,pub_id,nome,cpf,protocolo,data,curso,pagamento_status,pagamento_data,created_at")
      .single();
    if (data) setPubs(prev => prev.map(p => p.id === id ? data as PubPagamento : p));
    setSaving(false);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", color: "var(--fg-muted)", gap: 10 }}>
      <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Carregando...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!isAdmin) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16, color: "var(--fg-muted)" }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>Acesso restrito</div>
      <div style={{ fontSize: 14 }}>Esta página é exclusiva para o administrador do sistema.</div>
    </div>
  );

  const pendentes = pubs.filter(p => p.pagamento_status === "pendente");
  const pagos     = pubs.filter(p => p.pagamento_status === "pago");
  const totalPendente = pendentes.length * VALOR_POR_PUBLICACAO;
  const totalPago     = pagos.length     * VALOR_POR_PUBLICACAO;

  return (
    <>
      {confirmId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "28px 32px", maxWidth: 380, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,.4)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)", marginBottom: 8 }}>Confirmar pagamento</div>
            <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 24 }}>
              Confirma que o pagamento de <strong style={{ color: "var(--fg)" }}>R$ 100,00</strong> foi recebido para esta publicação?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn-sm" onClick={() => setConfirmId(null)} disabled={saving}>Cancelar</button>
              <button className="btn-primary" style={{ fontSize: 13, padding: "7px 20px" }} onClick={() => marcarPago(confirmId!)} disabled={saving}>
                {saving ? "Salvando..." : "Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Pendentes</h1>
        <p className="page-sub">Controle de pagamentos por publicação gerada</p>
      </div>

      {/* Cards resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <Tile label="Aguardando pagamento" value={pendentes.length.toString()} sub="publicações" color="var(--chip-yellow-fg, #f59e0b)" />
        <Tile label="A receber" value={`R$ ${totalPendente.toLocaleString("pt-BR")},00`} sub="valor pendente" color="var(--chip-red-fg, #ef4444)" />
        <Tile label="Pagamentos recebidos" value={pagos.length.toString()} sub="publicações pagas" color="var(--chip-green-fg, #34d399)" />
        <Tile label="Total recebido" value={`R$ ${totalPago.toLocaleString("pt-BR")},00`} sub="receita total" color="var(--accent)" />
      </div>

      {/* Tabela */}
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Publicações geradas</span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>R$ 100,00 por publicação</span>
        </div>
        <div className="section-card-body" style={{ overflowX: "auto" }}>
          {pubs.length === 0 ? (
            <div className="empty-state"><p>Nenhuma publicação gerada ainda.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Protocolo</th>
                  <th>Data Publicação</th>
                  <th>Valor</th>
                  <th>Pagamento</th>
                  <th>Pago em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pubs.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nome}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13, color: "var(--fg-muted)" }}>{p.cpf}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--accent)" }}>{p.protocolo || "—"}</td>
                    <td style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{p.data || "—"}</td>
                    <td style={{ fontWeight: 700, color: "var(--fg)" }}>R$ 100,00</td>
                    <td>
                      {p.pagamento_status === "pago"
                        ? <span className="chip chip--green">● Pago</span>
                        : <span className="chip chip--yellow">● Pendente</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      {p.pagamento_data
                        ? new Date(p.pagamento_data).toLocaleDateString("pt-BR") + " " + new Date(p.pagamento_data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td>
                      {p.pagamento_status === "pendente" ? (
                        <button className="btn-primary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => setConfirmId(p.id)}>
                          Marcar pago
                        </button>
                      ) : (
                        <button className="btn-sm" style={{ fontSize: 12 }} onClick={() => marcarPendente(p.id)}>
                          Reverter
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="section-card" style={{ padding: "18px 20px", margin: 0 }}>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{sub}</div>
    </div>
  );
}
