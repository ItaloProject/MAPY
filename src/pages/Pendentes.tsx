import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useIsAdmin } from "../lib/auth";
import "../components/Layout.css";
import "./Pendentes.css";

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

type ModalTipo = "marcarPago" | "agendar" | "editarValor" | "reverter" | "apagar" | null;

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
  const isAdmin = useIsAdmin();
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

  // ── Apagar publicação ──────────────────────────────────────────────────────
  async function apagarPub() {
    if (!alvo) return;
    setSaving(true);
    const { error } = await supabase
      .from("publicacoes")
      .delete()
      .eq("id", alvo.id);
    setSaving(false);
    if (error) { showToast("Erro ao apagar registro."); return; }
    const nome = alvo.nome;
    setPubs(prev => prev.filter(p => p.id !== alvo.id));
    fecharModal();
    showToast(`Registro de ${nome} apagado.`);
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
        <div className="pnd-toast" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--fg)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", maxWidth: 360, animation: "fadeUp 0.2s ease" }}>
          ✓ {toast}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="pnd-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && fecharModal()}>
          <div className="pnd-sheet" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, width: "100%", maxWidth: 420, padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,.5)" }}>

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
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
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
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
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
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
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
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={salvarAgendamento} disabled={saving} style={btnPrimStyle}>{saving ? "Salvando…" : "Salvar"}</button>
                </div>
              </>
            )}

            {/* APAGAR */}
            {modal === "apagar" && alvo && (
              <>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#f87171" }}>Apagar registro</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Esta ação é <strong>irreversível</strong>. A publicação de{" "}
                  <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> será removida por completo,
                  incluindo o controle de pagamento, e o QR Code dela deixará de funcionar.
                </p>
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={apagarPub} disabled={saving} style={{ ...btnPrimStyle, background: "#ef4444" }}>{saving ? "Apagando…" : "Apagar"}</button>
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
      <div className="pnd-tiles">
        <Tile label="Aguardando pagamento" value={pendentes.length.toString()}          sub="publicações"    color="#f59e0b" />
        <Tile label="A receber"            value={`R$ ${fmt(totalPend)}`}               sub="valor pendente"  color="#f87171" />
        <Tile label="Pagamentos recebidos" value={pagos.length.toString()}              sub="publicações"    color="#34d399" />
        <Tile label="Total recebido"       value={`R$ ${fmt(totalPago)}`}              sub="receita total"   color="var(--accent)" />
      </div>

      {/* Abas */}
      <div className="pnd-tabs">
        {(["pendente", "pago"] as const).map(t => (
          <button key={t} onClick={() => setAba(t)} className={`pnd-tab${aba === t ? " is-active" : ""}`}>
            {t === "pendente" ? "Pendentes" : "Recebidos"}
            <span className="pnd-tab-count">{t === "pendente" ? pendentes.length : pagos.length}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className={`section-card pnd-card${lista.length > 0 ? " pnd-card--list" : ""}`}>
        <div className="pnd-scroll">
          {lista.length === 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <p style={{ marginTop: 14 }}>{aba === "pendente" ? "Nenhum pagamento pendente." : "Nenhum pagamento recebido ainda."}</p>
            </div>
          ) : (
            <table className="pnd-table">
              <thead>
                <tr>
                  {(aba === "pendente"
                    ? ["Nome", "CPF", "Protocolo", "Data", "Valor", "Agendado para", ""]
                    : ["Nome", "CPF", "Protocolo", "Data", "Valor", "Pago em", ""]
                  ).map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const atrasado = aba === "pendente" && isAtrasado(p.agendamento_data);
                  const iconeEditar = (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  );
                  return (
                    <tr key={p.id} className={`pnd-row${atrasado ? " is-late" : ""}`}>
                      <td className="pnd-nome">{p.nome}</td>
                      <td className="pnd-line pnd-cpf" data-label="CPF">{p.cpf}</td>
                      <td className="pnd-line pnd-proto" data-label="Protocolo">{p.protocolo || "—"}</td>
                      <td className="pnd-line pnd-data" data-label="Data">{p.data || "—"}</td>

                      {/* Valor — clicável para editar (somente admin) */}
                      <td className="pnd-valor">
                        {isAdmin ? (
                          <button className="pnd-valor-btn" onClick={() => abrirModal("editarValor", p)} title="Editar valor" aria-label="Editar valor">
                            R$ {fmt(p.valor ?? 100)}
                            <span style={{ color: "var(--fg-muted)", display: "flex" }}>{iconeEditar}</span>
                          </button>
                        ) : (
                          <span className="pnd-valor-txt">R$ {fmt(p.valor ?? 100)}</span>
                        )}
                      </td>

                      {/* Agendado / Pago em */}
                      <td className="pnd-line pnd-sched" data-label={aba === "pendente" ? "Agendado para" : "Pago em"}>
                        {aba === "pendente" ? (
                          p.agendamento_data ? (
                            isAdmin ? (
                              <button className="pnd-sched-btn" onClick={() => abrirModal("agendar", p)} style={{ color: atrasado ? "#f87171" : "#34d399" }}>
                                {atrasado && <span title="Atrasado">⚠</span>}
                                {fmtDateOnly(p.agendamento_data)}
                                {iconeEditar}
                              </button>
                            ) : (
                              <span className="pnd-sched-txt" style={{ color: atrasado ? "#f87171" : "#34d399" }}>
                                {atrasado && <span title="Atrasado">⚠</span>}
                                {fmtDateOnly(p.agendamento_data)}
                              </span>
                            )
                          ) : (
                            isAdmin ? (
                              <button className="pnd-agendar" onClick={() => abrirModal("agendar", p)}>+ Agendar</button>
                            ) : (
                              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>—</span>
                            )
                          )
                        ) : (
                          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{fmtDate(p.pagamento_data)}</span>
                        )}
                      </td>

                      {/* Ações (somente admin) */}
                      <td className="pnd-acoes">
                        {isAdmin ? (
                          <div className="pnd-btns">
                            {aba === "pendente" ? (
                              <button className="pnd-btn pnd-btn--pay" onClick={() => abrirModal("marcarPago", p)}>✓ Marcar pago</button>
                            ) : (
                              <button className="pnd-btn pnd-btn--rev" onClick={() => abrirModal("reverter", p)}>Reverter</button>
                            )}
                            <button className="pnd-btn pnd-btn--del" onClick={() => abrirModal("apagar", p)} title="Apagar registro" aria-label="Apagar registro">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="pnd-status-txt">{aba === "pendente" ? "Pendente" : "Pago"}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {lista.length > 0 && (
          <div className="pnd-foot">
            <span>{lista.length} registro{lista.length !== 1 ? "s" : ""}</span>
            <span className="pnd-foot-total">
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
    <div className="section-card pnd-tile">
      <div className="pnd-tile-label">{label}</div>
      <div className="pnd-tile-value" style={{ color }}>{value}</div>
      <div className="pnd-tile-sub">{sub}</div>
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
