import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import "../components/Layout.css";

type StatusPag = "pendente" | "pago";

interface Pub {
  id: number;
  pub_id: string;
  nome: string;
  cpf: string;
  protocolo: string;
  data: string;
  curso: string;
  valor: number;
  pagamento_status: StatusPag;
  pagamento_data: string | null;
  agendamento_data: string | null;
  created_at: string;
}

type ModalTipo = "marcarPago" | "agendar" | "editarValor" | "reverter" | null;

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateOnly(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function isAtrasado(agendamento: string | null) {
  if (!agendamento) return false;
  return new Date(agendamento) < new Date();
}

export default function Pendentes() {
  const [pubs,     setPubs]     = useState<Pub[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [aba,      setAba]      = useState<"pendente" | "pago">("pendente");
  const [modal,    setModal]    = useState<ModalTipo>(null);
  const [alvo,     setAlvo]     = useState<Pub | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);

  // form states
  const [novoValor,      setNovoValor]      = useState("");
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [dataPagamento,   setDataPagamento]   = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("publicacoes")
      .select("id,pub_id,nome,cpf,protocolo,data,curso,valor,pagamento_status,pagamento_data,agendamento_data,created_at")
      .order("created_at", { ascending: false });
    setPubs((data ?? []) as Pub[]);
    setLoading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function abrirModal(tipo: ModalTipo, pub: Pub) {
    setAlvo(pub);
    setModal(tipo);
    if (tipo === "editarValor")  setNovoValor(String(pub.valor));
    if (tipo === "agendar")      setDataAgendamento(pub.agendamento_data ?? "");
    if (tipo === "marcarPago")   setDataPagamento(new Date().toISOString().slice(0, 10));
  }

  function fecharModal() { setModal(null); setAlvo(null); setSaving(false); }

  // ── Marcar como pago ──────────────────────────────────────────────────────
  async function confirmarPago() {
    if (!alvo) return;
    setSaving(true);
    const iso = dataPagamento ? new Date(dataPagamento + "T12:00:00").toISOString() : new Date().toISOString();
    const { data } = await supabase
      .from("publicacoes")
      .update({ pagamento_status: "pago", pagamento_data: iso })
      .eq("id", alvo.id)
      .select()
      .single();
    if (data) setPubs(prev => prev.map(p => p.id === alvo.id ? data as Pub : p));
    fecharModal();
    showToast(`${alvo.nome} marcado como pago.`);
  }

  // ── Reverter para pendente ────────────────────────────────────────────────
  async function reverterPendente() {
    if (!alvo) return;
    setSaving(true);
    const { data } = await supabase
      .from("publicacoes")
      .update({ pagamento_status: "pendente", pagamento_data: null })
      .eq("id", alvo.id)
      .select()
      .single();
    if (data) setPubs(prev => prev.map(p => p.id === alvo.id ? data as Pub : p));
    fecharModal();
    showToast(`${alvo.nome} revertido para pendente.`);
  }

  // ── Editar valor ─────────────────────────────────────────────────────────
  async function salvarValor() {
    if (!alvo) return;
    const v = parseFloat(novoValor.replace(",", "."));
    if (isNaN(v) || v <= 0) return;
    setSaving(true);
    const { data } = await supabase
      .from("publicacoes")
      .update({ valor: v })
      .eq("id", alvo.id)
      .select()
      .single();
    if (data) setPubs(prev => prev.map(p => p.id === alvo.id ? data as Pub : p));
    fecharModal();
    showToast(`Valor atualizado para R$ ${fmt(v)}.`);
  }

  // ── Agendar pagamento ─────────────────────────────────────────────────────
  async function salvarAgendamento() {
    if (!alvo) return;
    setSaving(true);
    const { data } = await supabase
      .from("publicacoes")
      .update({ agendamento_data: dataAgendamento || null })
      .eq("id", alvo.id)
      .select()
      .single();
    if (data) setPubs(prev => prev.map(p => p.id === alvo.id ? data as Pub : p));
    fecharModal();
    showToast(dataAgendamento ? `Pagamento agendado para ${fmtDateOnly(dataAgendamento)}.` : "Agendamento removido.");
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const pendentes = pubs.filter(p => p.pagamento_status === "pendente");
  const pagos     = pubs.filter(p => p.pagamento_status === "pago");
  const totalPend = pendentes.reduce((s, p) => s + (p.valor ?? 100), 0);
  const totalPago = pagos.reduce((s, p) => s + (p.valor ?? 100), 0);
  const lista = aba === "pendente" ? pendentes : pagos;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 10, color: "var(--fg-muted)" }}>
      <span style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
      Carregando…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--fg)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", maxWidth: 360, animation: "fadeUp 0.2s ease" }}>
          ✓ {toast}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && fecharModal()}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, width: "100%", maxWidth: 420, padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,.5)" }}>

            {/* MARCAR PAGO */}
            {modal === "marcarPago" && alvo && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Confirmar pagamento</h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg-muted)" }}>{alvo.nome}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Valor recebido</label>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>R$ {fmt(alvo.valor)}</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Data do pagamento</label>
                    <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={confirmarPago} disabled={saving} style={{ ...btnPrimStyle, background: "#10b981" }}>{saving ? "Salvando…" : "Confirmar pago"}</button>
                </div>
              </>
            )}

            {/* REVERTER */}
            {modal === "reverter" && alvo && (
              <>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#f59e0b" }}>Reverter para pendente</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Reverter o pagamento de <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> para pendente?
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={reverterPendente} disabled={saving} style={{ ...btnPrimStyle, background: "#f59e0b" }}>{saving ? "Salvando…" : "Reverter"}</button>
                </div>
              </>
            )}

            {/* EDITAR VALOR */}
            {modal === "editarValor" && alvo && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Editar valor</h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg-muted)" }}>{alvo.nome}</p>
                <div>
                  <label style={labelStyle}>Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={novoValor}
                    onChange={e => setNovoValor(e.target.value)}
                    placeholder="100.00"
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={salvarValor} disabled={saving} style={btnPrimStyle}>{saving ? "Salvando…" : "Salvar valor"}</button>
                </div>
              </>
            )}

            {/* AGENDAR */}
            {modal === "agendar" && alvo && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Agendar pagamento</h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg-muted)" }}>{alvo.nome}</p>
                <div>
                  <label style={labelStyle}>Data prevista de pagamento</label>
                  <input type="date" value={dataAgendamento} onChange={e => setDataAgendamento(e.target.value)} style={inputStyle} />
                </div>
                {dataAgendamento && (
                  <button onClick={() => setDataAgendamento("")} style={{ background: "none", border: "none", fontSize: 12, color: "var(--fg-muted)", cursor: "pointer", padding: "6px 0" }}>
                    ✕ Remover agendamento
                  </button>
                )}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={salvarAgendamento} disabled={saving} style={btnPrimStyle}>{saving ? "Salvando…" : "Salvar"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="page-header">
        <h1 className="page-title">Pendentes</h1>
        <p className="page-sub">Controle de pagamentos por publicação gerada</p>
      </div>

      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <Tile label="Aguardando pagamento" value={pendentes.length.toString()}          sub="publicações"    color="#f59e0b" />
        <Tile label="A receber"            value={`R$ ${fmt(totalPend)}`}               sub="valor pendente"  color="#f87171" />
        <Tile label="Pagamentos recebidos" value={pagos.length.toString()}              sub="publicações"    color="#34d399" />
        <Tile label="Total recebido"       value={`R$ ${fmt(totalPago)}`}              sub="receita total"   color="var(--accent)" />
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["pendente", "pago"] as const).map(t => (
          <button key={t} onClick={() => setAba(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: "1px solid",
            fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s",
            background: aba === t ? "var(--accent)" : "transparent",
            borderColor: aba === t ? "var(--accent)" : "var(--border)",
            color: aba === t ? "#fff" : "var(--fg-muted)",
          }}>
            {t === "pendente" ? "Pendentes" : "Recebidos"}
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 700,
              background: aba === t ? "rgba(255,255,255,0.25)" : "var(--surface-2)",
              color: aba === t ? "#fff" : "var(--fg-muted)",
              padding: "1px 7px", borderRadius: 20,
            }}>
              {t === "pendente" ? pendentes.length : pagos.length}
            </span>
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {lista.length === 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <p style={{ marginTop: 14 }}>{aba === "pendente" ? "Nenhum pagamento pendente." : "Nenhum pagamento recebido ainda."}</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {(aba === "pendente"
                    ? ["Nome", "CPF", "Protocolo", "Data", "Valor", "Agendado para", ""]
                    : ["Nome", "CPF", "Protocolo", "Data", "Valor", "Pago em", ""]
                  ).map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const atrasado = aba === "pendente" && isAtrasado(p.agendamento_data);
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", transition: "background .12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                      <td style={{ padding: "13px 16px", fontWeight: 700, fontSize: 14, color: "var(--fg)", whiteSpace: "nowrap" }}>{p.nome}</td>
                      <td style={{ padding: "13px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{p.cpf}</td>
                      <td style={{ padding: "13px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--accent)", whiteSpace: "nowrap" }}>{p.protocolo || "—"}</td>
                      <td style={{ padding: "13px 16px", fontSize: 13, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{p.data || "—"}</td>

                      {/* Valor — clicável para editar */}
                      <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => abrirModal("editarValor", p)}
                          title="Editar valor"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 800, color: "var(--fg)", padding: 0, display: "flex", alignItems: "center", gap: 5 }}
                        >
                          R$ {fmt(p.valor ?? 100)}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      </td>

                      {/* Agendado / Pago em */}
                      <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                        {aba === "pendente" ? (
                          p.agendamento_data ? (
                            <button onClick={() => abrirModal("agendar", p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: atrasado ? "#f87171" : "#34d399", padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
                              {atrasado && <span title="Atrasado">⚠</span>}
                              {fmtDateOnly(p.agendamento_data)}
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          ) : (
                            <button onClick={() => abrirModal("agendar", p)} style={{ background: "none", border: "1px dashed var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--fg-muted)", padding: "3px 10px" }}>
                              + Agendar
                            </button>
                          )
                        ) : (
                          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{fmtDate(p.pagamento_data)}</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {aba === "pendente" ? (
                            <button
                              onClick={() => abrirModal("marcarPago", p)}
                              style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#10b981", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                            >
                              ✓ Marcar pago
                            </button>
                          ) : (
                            <button
                              onClick={() => abrirModal("reverter", p)}
                              style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                              onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = "#f59e0b"; b.style.color = "#f59e0b"; }}
                              onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = "var(--border)"; b.style.color = "var(--fg-muted)"; }}
                            >
                              Reverter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && lista.length > 0 && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--fg-muted)", display: "flex", justifyContent: "space-between" }}>
            <span>{lista.length} registro{lista.length !== 1 ? "s" : ""}</span>
            <span style={{ fontWeight: 700, color: "var(--fg)" }}>
              Total: R$ {fmt(lista.reduce((s, p) => s + (p.valor ?? 100), 0))}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="section-card" style={{ padding: "18px 20px", margin: 0 }}>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1, marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{sub}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "9px 14px", fontSize: 14, color: "var(--fg)", outline: "none", fontFamily: "var(--font)",
  boxSizing: "border-box",
};
const btnPrimStyle: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const btnSecStyle: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent",
  color: "var(--fg-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
