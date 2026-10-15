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
  grupo: string;
}

type Grupo = "publicacao" | "estacio";
type Tela  = "pubs" | "sistema" | "totais";

interface SistemaItem {
  id: number;
  nome: string;
  valor: number;
  num_parcelas: number;
  parcelas_pagas: number[];
  created_at: string;
}

type ModalTipo = "marcarPago" | "agendar" | "editarValor" | "reverter" | "apagar" | "definirTodos"
               | "addSistema" | "editSistema" | "apagarSistema" | "gerenciarParcelas" | null;

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function mascaraMoeda(input: string): string {
  const digitos = input.replace(/\D/g, "");
  if (!digitos) return "";
  const num = parseInt(digitos, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMoeda(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
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
  const [grupo,    setGrupo]    = useState<Grupo>("publicacao");
  const [tela,     setTela]     = useState<Tela>("pubs");
  const [aba,      setAba]      = useState<"pendente" | "pago">("pendente");
  const [modal,    setModal]    = useState<ModalTipo>(null);
  const [alvo,     setAlvo]     = useState<Pub | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);

  // form states — publicações
  const [novoValor,      setNovoValor]      = useState("");
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [dataPagamento,   setDataPagamento]   = useState("");
  const [valorTodos,      setValorTodos]      = useState("");

  // sistema
  const [sistemaItens,   setSistemaItens]   = useState<SistemaItem[]>([]);
  const [sistemaLoading, setSistemaLoading] = useState(false);
  const [sistemaAlvo,    setSistemaAlvo]    = useState<SistemaItem | null>(null);
  const [sNome,          setSNome]          = useState("");
  const [sValor,         setSValor]         = useState("");
  const [sParcelas,      setSParcelas]      = useState(1);
  const [sParcelasPagas, setSParcelasPagas] = useState<number[]>([]);
  const [totaisView,     setTotaisView]     = useState<"geral" | "detalhado">("geral");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("publicacoes")
      .select("id,pub_id,nome,cpf,protocolo,data,curso,valor,pagamento_status,pagamento_data,agendamento_data,created_at,grupo")
      .order("created_at", { ascending: false });
    setPubs((data ?? []) as Pub[]);
    setLoading(false);
  }

  async function carregarSistema() {
    setSistemaLoading(true);
    const { data } = await supabase
      .from("sistema_itens")
      .select("id,nome,valor,num_parcelas,parcelas_pagas,created_at")
      .order("created_at", { ascending: true });
    setSistemaItens((data ?? []) as SistemaItem[]);
    setSistemaLoading(false);
  }

  async function salvarSistemaItem() {
    const v = parseMoeda(sValor);
    if (!sNome.trim() || isNaN(v) || v <= 0) return;
    setSaving(true);
    if (sistemaAlvo) {
      const { data } = await supabase
        .from("sistema_itens").update({ nome: sNome.trim(), valor: v })
        .eq("id", sistemaAlvo.id).select().single();
      if (data) setSistemaItens(prev => prev.map(i => i.id === sistemaAlvo.id ? data as SistemaItem : i));
      showToast("Item atualizado.");
    } else {
      const { data } = await supabase
        .from("sistema_itens").insert({ nome: sNome.trim(), valor: v }).select().single();
      if (data) setSistemaItens(prev => [...prev, data as SistemaItem]);
      showToast("Item adicionado.");
    }
    fecharModal();
  }

  async function apagarSistemaItem() {
    if (!sistemaAlvo) return;
    setSaving(true);
    await supabase.from("sistema_itens").delete().eq("id", sistemaAlvo.id);
    setSistemaItens(prev => prev.filter(i => i.id !== sistemaAlvo.id));
    fecharModal();
    showToast("Item removido.");
  }

  function abrirSistemaModal(tipo: "addSistema" | "editSistema" | "apagarSistema", item?: SistemaItem) {
    setSistemaAlvo(item ?? null);
    setSNome(item?.nome ?? "");
    setSValor(item ? fmt(item.valor) : "");
    setModal(tipo);
  }

  function abrirParcelasModal(item: SistemaItem) {
    setSistemaAlvo(item);
    setSParcelas(item.num_parcelas ?? 1);
    setSParcelasPagas(item.parcelas_pagas ?? []);
    setModal("gerenciarParcelas");
  }

  function toggleParcela(n: number) {
    setSParcelasPagas(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  }

  async function salvarParcelas() {
    if (!sistemaAlvo) return;
    setSaving(true);
    const { data } = await supabase
      .from("sistema_itens")
      .update({ num_parcelas: sParcelas, parcelas_pagas: sParcelasPagas })
      .eq("id", sistemaAlvo.id)
      .select("id,nome,valor,num_parcelas,parcelas_pagas,created_at")
      .single();
    if (data) setSistemaItens(prev => prev.map(i => i.id === sistemaAlvo.id ? data as SistemaItem : i));
    fecharModal();
    const pagas = sParcelasPagas.length;
    showToast(sParcelas === 1
      ? (pagas ? "Item marcado como pago." : "Item marcado como pendente.")
      : `${pagas}/${sParcelas} parcelas pagas.`
    );
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

  function fecharModal() { setModal(null); setAlvo(null); setSistemaAlvo(null); setSaving(false); }

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
    const v = parseMoeda(novoValor);
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

  // ── Definir valor para todos ──────────────────────────────────────────────
  async function salvarValorTodos() {
    const v = parseMoeda(valorTodos);
    if (isNaN(v) || v <= 0) return;
    setSaving(true);
    const ids = lista.map(p => p.id);
    const { data: atualizados } = await supabase
      .from("publicacoes")
      .update({ valor: v })
      .in("id", ids)
      .select();
    if (atualizados) {
      const map = new Map((atualizados as Pub[]).map(p => [p.id, p]));
      setPubs(prev => prev.map(p => map.has(p.id) ? map.get(p.id)! : p));
    }
    fecharModal();
    showToast(`Valor R$ ${fmt(v)} aplicado a ${ids.length} registro${ids.length !== 1 ? "s" : ""}.`);
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const grupoAtual = pubs.filter(p => p.grupo === grupo);
  const pendentes  = grupoAtual.filter(p => p.pagamento_status === "pendente");
  const pagos      = grupoAtual.filter(p => p.pagamento_status === "pago");
  const totalPend  = pendentes.reduce((s, p) => s + (p.valor ?? 100), 0);
  const totalPago  = pagos.reduce((s, p) => s + (p.valor ?? 100), 0);
  const lista      = aba === "pendente" ? pendentes : pagos;

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
                  <label style={labelStyle}>Valor</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", left: 14, fontSize: 14, fontWeight: 700, color: "var(--fg-muted)", pointerEvents: "none" }}>R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={novoValor}
                      onChange={e => setNovoValor(mascaraMoeda(e.target.value))}
                      placeholder="0,00"
                      style={{ ...inputStyle, paddingLeft: 40, textAlign: "right", fontSize: 20, fontWeight: 800, letterSpacing: "0.01em" }}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={salvarValor} disabled={saving || !novoValor} style={btnPrimStyle}>{saving ? "Salvando…" : "Salvar valor"}</button>
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

            {/* DEFINIR VALOR PARA TODOS */}
            {modal === "definirTodos" && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Definir valor para todos</h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg-muted)" }}>
                  Aplica o mesmo valor a <strong style={{ color: "var(--fg)" }}>{lista.length} registro{lista.length !== 1 ? "s" : ""}</strong> da aba atual.
                </p>
                <div>
                  <label style={labelStyle}>Valor</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", left: 14, fontSize: 14, fontWeight: 700, color: "var(--fg-muted)", pointerEvents: "none" }}>R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={valorTodos}
                      onChange={e => setValorTodos(mascaraMoeda(e.target.value))}
                      placeholder="0,00"
                      style={{ ...inputStyle, paddingLeft: 40, textAlign: "right", fontSize: 20, fontWeight: 800, letterSpacing: "0.01em" }}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={salvarValorTodos} disabled={saving || !valorTodos} style={btnPrimStyle}>
                    {saving ? "Salvando…" : `Aplicar a ${lista.length} registro${lista.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}

            {/* SISTEMA — GERENCIAR PARCELAS */}
            {modal === "gerenciarParcelas" && sistemaAlvo && (() => {
              const valorParcela = sistemaAlvo.valor / sParcelas;
              const todasPagas   = sParcelasPagas.length === sParcelas;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Forma de pagamento</h3>
                  </div>
                  <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg-muted)" }}>{sistemaAlvo.nome}</p>

                  {/* Toggle À vista / Parcelado */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                    {[{ label: "À vista", val: 1 }, { label: "Parcelado", val: sParcelas > 1 ? sParcelas : 2 }].map(opt => (
                      <button key={opt.label}
                        onClick={() => { const n = opt.label === "À vista" ? 1 : (sParcelas > 1 ? sParcelas : 2); setSParcelas(n); setSParcelasPagas([]); }}
                        style={{
                          flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid",
                          borderColor: (opt.label === "À vista" ? sParcelas === 1 : sParcelas > 1) ? "var(--accent)" : "var(--border)",
                          background: (opt.label === "À vista" ? sParcelas === 1 : sParcelas > 1) ? "rgba(var(--accent-rgb,99,102,241),.12)" : "transparent",
                          color: (opt.label === "À vista" ? sParcelas === 1 : sParcelas > 1) ? "var(--accent)" : "var(--fg-muted)",
                          fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all .15s",
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Número de parcelas (só quando parcelado) */}
                  {sParcelas > 1 && (
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelStyle}>Número de parcelas</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button onClick={() => { if (sParcelas > 2) { setSParcelas(p => p - 1); setSParcelasPagas([]); } }}
                          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: 18, cursor: "pointer" }}>−</button>
                        <span style={{ fontSize: 24, fontWeight: 800, color: "var(--fg)", minWidth: 32, textAlign: "center" }}>{sParcelas}</span>
                        <button onClick={() => { if (sParcelas < 60) { setSParcelas(p => p + 1); setSParcelasPagas([]); } }}
                          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: 18, cursor: "pointer" }}>+</button>
                        <span style={{ fontSize: 13, color: "var(--fg-muted)", marginLeft: 4 }}>
                          {sParcelas}x de <strong style={{ color: "var(--fg)" }}>R$ {fmt(valorParcela)}</strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Chips de parcelas */}
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{sParcelas === 1 ? "Status do pagamento" : `Parcelas — ${sParcelasPagas.length}/${sParcelas} pagas`}</span>
                      {sParcelas > 1 && (
                        <button onClick={() => setSParcelasPagas(todasPagas ? [] : Array.from({ length: sParcelas }, (_, i) => i + 1))}
                          style={{ background: "none", border: "none", fontSize: 11, color: "var(--accent)", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                          {todasPagas ? "Desmarcar todas" : "Marcar todas"}
                        </button>
                      )}
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {Array.from({ length: sParcelas }, (_, i) => i + 1).map(n => {
                        const paga = sParcelasPagas.includes(n);
                        return (
                          <button key={n} onClick={() => toggleParcela(n)}
                            style={{
                              padding: sParcelas === 1 ? "10px 24px" : "8px 14px",
                              borderRadius: 10, border: "1px solid",
                              borderColor: paga ? "#10b981" : "var(--border)",
                              background: paga ? "rgba(16,185,129,.12)" : "transparent",
                              color: paga ? "#10b981" : "var(--fg-muted)",
                              fontWeight: 700, fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 6, transition: "all .15s",
                            }}>
                            {paga
                              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              : <span style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--border)", display: "inline-block" }} />}
                            {sParcelas === 1 ? (paga ? "Pago" : "Pendente") : `${n}ª de R$ ${fmt(valorParcela)}`}
                          </button>
                        );
                      })}
                    </div>
                    {sParcelas > 1 && (
                      <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: "#10b981", width: `${(sParcelasPagas.length / sParcelas) * 100}%`, transition: "width .3s ease" }} />
                      </div>
                    )}
                  </div>

                  <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                    <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                    <button onClick={salvarParcelas} disabled={saving} style={btnPrimStyle}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </>
              );
            })()}

            {/* SISTEMA — ADICIONAR / EDITAR */}
            {(modal === "addSistema" || modal === "editSistema") && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>
                  {modal === "addSistema" ? "Adicionar item" : "Editar item"}
                </h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg-muted)" }}>Descreva o serviço e defina o valor cobrado.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Descrição do item</label>
                    <input
                      type="text"
                      value={sNome}
                      onChange={e => setSNome(e.target.value)}
                      placeholder="Ex: Módulo de Publicação"
                      style={{ ...inputStyle, marginBottom: 0 }}
                      autoFocus={modal === "addSistema"}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Valor</label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <span style={{ position: "absolute", left: 14, fontSize: 14, fontWeight: 700, color: "var(--fg-muted)", pointerEvents: "none" }}>R$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sValor}
                        onChange={e => setSValor(mascaraMoeda(e.target.value))}
                        placeholder="0,00"
                        style={{ ...inputStyle, paddingLeft: 40, textAlign: "right", fontSize: 20, fontWeight: 800, letterSpacing: "0.01em", marginBottom: 0 }}
                      />
                    </div>
                  </div>
                </div>
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={salvarSistemaItem} disabled={saving || !sNome.trim() || !sValor} style={btnPrimStyle}>
                    {saving ? "Salvando…" : modal === "addSistema" ? "Adicionar" : "Salvar"}
                  </button>
                </div>
              </>
            )}

            {/* SISTEMA — APAGAR */}
            {modal === "apagarSistema" && sistemaAlvo && (
              <>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#f87171" }}>Remover item</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Remover <strong style={{ color: "var(--fg)" }}>{sistemaAlvo.nome}</strong> da precificação do sistema?
                </p>
                <div className="pnd-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={apagarSistemaItem} disabled={saving} style={{ ...btnPrimStyle, background: "#ef4444" }}>
                    {saving ? "Removendo…" : "Remover"}
                  </button>
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

      {/* Seletor de grupo */}
      <div className="pnd-grupo-tabs">
        <button
          className={`pnd-grupo-tab${tela === "pubs" && grupo === "publicacao" ? " is-active" : ""}`}
          onClick={() => { setTela("pubs"); setGrupo("publicacao"); setAba("pendente"); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Publicação
          <span className="pnd-grupo-count">{pubs.filter(p => p.grupo === "publicacao").length}</span>
        </button>
        <button
          className={`pnd-grupo-tab${tela === "pubs" && grupo === "estacio" ? " is-active is-estacio" : ""}`}
          onClick={() => { setTela("pubs"); setGrupo("estacio"); setAba("pendente"); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M7 8h10M7 12h10M7 16h6"/>
          </svg>
          Estácio
          <span className="pnd-grupo-count">{pubs.filter(p => p.grupo === "estacio").length}</span>
        </button>
        <button
          className={`pnd-grupo-tab${tela === "sistema" ? " is-active is-sistema" : ""}`}
          onClick={() => { setTela("sistema"); if (!sistemaItens.length && !sistemaLoading) carregarSistema(); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          Sistema
          {sistemaItens.length > 0 && <span className="pnd-grupo-count">{sistemaItens.length}</span>}
        </button>
        <button
          className={`pnd-grupo-tab${tela === "totais" ? " is-active is-totais" : ""}`}
          onClick={() => { setTela("totais"); if (!sistemaItens.length && !sistemaLoading) carregarSistema(); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
          </svg>
          Totais
        </button>
      </div>

      {tela === "pubs" && <>
      {/* Métricas */}
      <div className="pnd-tiles">
        <Tile label="Aguardando pagamento" value={pendentes.length.toString()}          sub="publicações"    color="#f59e0b" />
        <Tile label="A receber"            value={`R$ ${fmt(totalPend)}`}               sub="valor pendente"  color="#f87171" />
        <Tile label="Pagamentos recebidos" value={pagos.length.toString()}              sub="publicações"    color="#34d399" />
        <Tile label="Total recebido"       value={`R$ ${fmt(totalPago)}`}              sub="receita total"   color="var(--accent)" />
      </div>

      {/* Abas + botão definir valor */}
      <div className="pnd-tabs-row">
        <div className="pnd-tabs">
          {(["pendente", "pago"] as const).map(t => (
            <button key={t} onClick={() => setAba(t)} className={`pnd-tab${aba === t ? " is-active" : ""}`}>
              {t === "pendente" ? "Pendentes" : "Recebidos"}
              <span className="pnd-tab-count">{t === "pendente" ? pendentes.length : pagos.length}</span>
            </button>
          ))}
        </div>
        {isAdmin && lista.length > 0 && (
          <button
            className="pnd-btn-valor-todos"
            onClick={() => { setValorTodos(""); setModal("definirTodos"); }}
            title="Definir o mesmo valor para todos os registros desta aba"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Definir valor para todos
          </button>
        )}
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
      </>}

      {/* ── TELA SISTEMA ────────────────────────────────────────────────────── */}
      {tela === "sistema" && (
        <>
          {/* Resumo */}
          {(() => {
            const total = sistemaItens.reduce((s, i) => s + i.valor, 0);
            const recebido = sistemaItens.reduce((s, i) => {
              const np = i.num_parcelas ?? 1;
              const pp = i.parcelas_pagas ?? [];
              return s + (pp.length / np) * i.valor;
            }, 0);
            const pendente = total - recebido;
            return (
              <div className="pnd-tiles">
                <Tile label="Itens precificados"    value={sistemaItens.length.toString()}  sub="serviços / módulos" color="var(--accent)" />
                <Tile label="Valor total do sistema" value={`R$ ${fmt(total)}`}              sub="receita contratada"  color="var(--fg)" />
                <Tile label="Já recebido"            value={`R$ ${fmt(recebido)}`}           sub="pagamentos confirmados" color="#10b981" />
                <Tile label="A receber"              value={`R$ ${fmt(pendente)}`}           sub="saldo pendente"       color="#f59e0b" />
              </div>
            );
          })()}

          {/* Header da seção */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", margin: 0 }}>Precificação do sistema</h2>
            {isAdmin && (
              <button className="pnd-btn-valor-todos" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                onClick={() => abrirSistemaModal("addSistema")}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Adicionar item
              </button>
            )}
          </div>

          {/* Lista de itens */}
          <div className={`section-card pnd-card${sistemaItens.length > 0 ? " pnd-card--list" : ""}`}>
            {sistemaLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10, color: "var(--fg-muted)" }}>
                <span style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                Carregando…
              </div>
            ) : sistemaItens.length === 0 ? (
              <div className="empty-state" style={{ padding: "60px 0" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                <p style={{ marginTop: 14 }}>Nenhum item adicionado ainda.</p>
                {isAdmin && (
                  <button className="pnd-btn pnd-btn--pay" style={{ marginTop: 16, padding: "10px 22px", borderRadius: 10 }}
                    onClick={() => abrirSistemaModal("addSistema")}>
                    + Adicionar primeiro item
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="pnd-scroll">
                  <table className="pnd-table">
                    <thead>
                      <tr>
                        {["#", "Descrição", "Valor", "Pagamento", ""].map((h, i) => <th key={i}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sistemaItens.map((item, idx) => (
                        <tr key={item.id} className="pnd-row">
                          <td style={{ width: 44, color: "var(--fg-muted)", fontSize: 13, textAlign: "center" }}>{idx + 1}</td>
                          <td className="pnd-nome">{item.nome}</td>
                          <td className="pnd-valor">
                            {isAdmin ? (
                              <button className="pnd-valor-btn" onClick={() => abrirSistemaModal("editSistema", item)}>
                                R$ {fmt(item.valor)}
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-muted)" }}>
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            ) : (
                              <span className="pnd-valor-txt">R$ {fmt(item.valor)}</span>
                            )}
                          </td>

                          {/* Coluna pagamento */}
                          <td className="pnd-line" data-label="Pagamento" style={{ textAlign: "center" }}>
                            {(() => {
                              const np = item.num_parcelas ?? 1;
                              const pp = item.parcelas_pagas ?? [];
                              const avista = np === 1;
                              const pago   = avista ? pp.includes(1) : pp.length === np;
                              const parcial = !avista && pp.length > 0 && pp.length < np;
                              const cor = pago ? "#10b981" : parcial ? "#f59e0b" : "var(--fg-muted)";
                              const label = avista
                                ? (pago ? "✓ Pago" : "À vista")
                                : `${np}x de R$ ${fmt(item.valor / np)}`;
                              const sub = !avista ? `${pp.length}/${np} pagas` : null;

                              const iconeEdit = (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-muted)", flexShrink: 0 }}>
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              );
                              return isAdmin ? (
                                <button className="pnd-valor-btn" onClick={() => abrirParcelasModal(item)}
                                  style={{ flexDirection: "column", alignItems: "center", gap: 2, color: cor }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 13 }}>
                                    {label}
                                    {iconeEdit}
                                  </span>
                                  {sub && <span style={{ fontSize: 11, color: parcial ? "#f59e0b" : pago ? "#10b981" : "var(--fg-muted)" }}>{sub}</span>}
                                  {!avista && (
                                    <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden", marginTop: 2 }}>
                                      <div style={{ height: "100%", borderRadius: 2, background: pago ? "#10b981" : "#f59e0b", width: `${(pp.length / np) * 100}%`, transition: "width .3s" }} />
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <div style={{ flexDirection: "column", alignItems: "center", gap: 2, color: cor, display: "flex" }}>
                                  <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
                                  {sub && <span style={{ fontSize: 11 }}>{sub}</span>}
                                </div>
                              );
                            })()}
                          </td>

                          <td className="pnd-acoes">
                            {isAdmin && (
                              <div className="pnd-btns">
                                <button className="pnd-btn pnd-btn--del" onClick={() => abrirSistemaModal("apagarSistema", item)} title="Remover item">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pnd-foot">
                  <span>{sistemaItens.length} item{sistemaItens.length !== 1 ? "s" : ""}</span>
                  <span style={{ display: "flex", gap: 20 }}>
                    {(() => {
                      const recebido = sistemaItens.reduce((s, i) => {
                        const np = i.num_parcelas ?? 1;
                        const pp = i.parcelas_pagas ?? [];
                        return s + (pp.length / np) * i.valor;
                      }, 0);
                      const total = sistemaItens.reduce((s, i) => s + i.valor, 0);
                      return <>
                        <span style={{ color: "#10b981" }}>Recebido: R$ {fmt(recebido)}</span>
                        <span className="pnd-foot-total">Total: R$ {fmt(total)}</span>
                      </>;
                    })()}
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── TELA TOTAIS ─────────────────────────────────────────────────────── */}
      {tela === "totais" && (() => {
        const pubPend  = pubs.filter(p => p.grupo === "publicacao" && p.pagamento_status === "pendente").reduce((s,p) => s+(p.valor??0), 0);
        const pubPago  = pubs.filter(p => p.grupo === "publicacao" && p.pagamento_status === "pago").reduce((s,p) => s+(p.valor??0), 0);
        const pubTotal = pubPend + pubPago;
        const pubN     = pubs.filter(p => p.grupo === "publicacao").length;

        const estPend  = pubs.filter(p => p.grupo === "estacio" && p.pagamento_status === "pendente").reduce((s,p) => s+(p.valor??0), 0);
        const estPago  = pubs.filter(p => p.grupo === "estacio" && p.pagamento_status === "pago").reduce((s,p) => s+(p.valor??0), 0);
        const estTotal = estPend + estPago;
        const estN     = pubs.filter(p => p.grupo === "estacio").length;

        const sisTotal = sistemaItens.reduce((s,i) => s+i.valor, 0);
        const sisPago  = sistemaItens.reduce((s,i) => s+((i.parcelas_pagas?.length??0)/(i.num_parcelas??1))*i.valor, 0);
        const sisPend  = sisTotal - sisPago;
        const sisN     = sistemaItens.length;

        const grand      = pubTotal + estTotal + sisTotal;
        const grandPago  = pubPago  + estPago  + sisPago;
        const grandPend  = pubPend  + estPend  + sisPend;

        const allSlices = [
          { label: "Publicação", value: pubTotal, color: "#6366f1", pago: pubPago, pendente: pubPend, n: pubN, icon: "📄" },
          { label: "Estácio",    value: estTotal, color: "#10b981", pago: estPago, pendente: estPend, n: estN, icon: "🏛" },
          { label: "Sistema",    value: sisTotal, color: "#f59e0b", pago: sisPago, pendente: sisPend, n: sisN, icon: "🖥" },
        ];
        const slices = allSlices.filter(s => s.value > 0);

        return (
          <TotaisView
            allSlices={allSlices} slices={slices} grand={grand}
            grandPago={grandPago} grandPend={grandPend}
            pubN={pubN} estN={estN} sisN={sisN}
            totaisView={totaisView} setTotaisView={setTotaisView}
          />
        );
      })()}
    </>
  );
}

// ── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(target * ease);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ── Donut animado + interativo ────────────────────────────────────────────────
type DonutSlice = { label: string; value: number; color: string };

function DonutChart({
  slices, total, hovered, onHover,
}: {
  slices: DonutSlice[]; total: number;
  hovered: number | null; onHover: (i: number | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);

  const size = 240, base = 30;
  const cx = size / 2, cy = size / 2;
  const r = (size - base * 2) / 2;
  const circ = 2 * Math.PI * r;

  let cumPct = 0;
  const segs = slices.map((s, i) => {
    const pct = total > 0 ? s.value / total : 0;
    const rotate = cumPct * 360 - 90;
    const len = mounted ? Math.max(0, pct * circ - 2.5) : 0;
    const thick = hovered === i ? base + 8 : base;
    cumPct += pct;
    return { ...s, i, pct, len, rotate, thick };
  });

  const hov = hovered !== null ? segs[hovered] : null;
  const animTotal = useCountUp(total);

  return (
    <div style={{ width: "100%", maxWidth: 240, flexShrink: 0, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={base} />

        {segs.map(seg => (
          <circle key={seg.i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color}
            strokeWidth={seg.thick}
            strokeOpacity={hovered !== null && hovered !== seg.i ? 0.25 : 1}
            strokeDasharray={`${seg.len} ${circ}`}
            transform={`rotate(${seg.rotate} ${cx} ${cy})`}
            strokeLinecap="butt"
            style={{
              transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1), stroke-opacity 0.2s, stroke-width 0.2s",
              cursor: "pointer",
            }}
            onMouseEnter={() => onHover(seg.i)}
            onMouseLeave={() => onHover(null)}
          />
        ))}

        {/* Centro — muda no hover */}
        {hov ? (
          <>
            <text x={cx} y={cy - 18} textAnchor="middle" fill={hov.color} fontSize="11" fontWeight="800" fontFamily="inherit" style={{ transition: "all .15s" }}>{hov.label.toUpperCase()}</text>
            <text x={cx} y={cy + 2}  textAnchor="middle" fill="var(--fg)" fontSize="12" fontWeight="900" fontFamily="inherit">R$ {fmt(hov.value)}</text>
            <text x={cx} y={cy + 20} textAnchor="middle" fill={hov.color} fontSize="16" fontWeight="900" fontFamily="inherit">{Math.round(hov.pct * 100)}%</text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 14} textAnchor="middle" fill="var(--fg-muted)" fontSize="10" fontFamily="inherit" letterSpacing="2">TOTAL</text>
            <text x={cx} y={cy + 6}  textAnchor="middle" fill="var(--fg)" fontSize="13" fontWeight="800" fontFamily="inherit">R$ {fmt(animTotal)}</text>
            <text x={cx} y={cy + 22} textAnchor="middle" fill="var(--fg-muted)" fontSize="10" fontFamily="inherit">{slices.length} grupo{slices.length !== 1 ? "s" : ""}</text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── TotaisView — componente isolado para usar hooks ───────────────────────────
type TotaisSlice = { label: string; value: number; color: string; pago: number; pendente: number; n: number };

function TotaisView({
  allSlices, slices, grand, grandPago, grandPend,
  pubN, estN, sisN, totaisView, setTotaisView,
}: {
  allSlices: TotaisSlice[]; slices: TotaisSlice[];
  grand: number; grandPago: number; grandPend: number;
  pubN: number; estN: number; sisN: number;
  totaisView: "geral" | "detalhado";
  setTotaisView: (v: "geral" | "detalhado") => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [barsMounted, setBarsMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setBarsMounted(true), 200); return () => clearTimeout(t); }, []);

  const animGrand    = useCountUp(grand);
  const animPago     = useCountUp(grandPago);
  const animPend     = useCountUp(grandPend);
  const animPct      = useCountUp(grand > 0 ? Math.round(grandPago / grand * 100) : 0);

  return (
    <>
      {/* Tiles animados */}
      <div className="pnd-tiles">
        {[
          { label: "Total Geral",    val: animGrand, pre: "R$ ", suf: "",  sub: "todos os grupos",        color: "var(--fg)" },
          { label: "Total Recebido", val: animPago,  pre: "R$ ", suf: "",  sub: "pagamentos confirmados", color: "#10b981" },
          { label: "A Receber",      val: animPend,  pre: "R$ ", suf: "",  sub: "saldo pendente",         color: "#f59e0b" },
          { label: "% Recebido",     val: animPct,   pre: "",    suf: "%", sub: "do total contratado",    color: "var(--accent)" },
        ].map(t => (
          <div key={t.label} className="section-card pnd-tile">
            <div className="pnd-tile-label">{t.label}</div>
            <div className="pnd-tile-value" style={{ color: t.color }}>
              {t.pre}{t.pre === "R$ " ? fmt(t.val) : Math.round(t.val)}{t.suf}
            </div>
            <div className="pnd-tile-sub">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Gráfico + legenda */}
      <div className="section-card tot-chart-card">
        <div className="tot-chart-inner">
          <DonutChart slices={slices} total={grand} hovered={hovered} onHover={setHovered} />

          <div className="tot-legend">
            {allSlices.map((s, i) => {
              const pct = grand > 0 ? Math.round(s.value / grand * 100) : 0;
              const isHov = hovered === i;
              const dimmed = hovered !== null && !isHov;
              return (
                <div key={s.label} className="tot-legend-row"
                  style={{ opacity: dimmed ? 0.4 : 1, transition: "opacity .2s" }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: isHov ? 14 : 10, height: isHov ? 14 : 10, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0, transition: "all .2s" }} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{s.n} {s.n !== 1 ? "itens" : "item"}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: isHov ? s.color : "var(--fg)" }}>R$ {fmt(s.value)}</span>
                      <span style={{ fontSize: 12, color: isHov ? s.color : "var(--fg-muted)", marginLeft: 6, fontWeight: 700 }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: s.color, width: barsMounted ? `${pct}%` : "0%", transition: "width .7s cubic-bezier(0.4,0,0.2,1)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div className="pnd-tabs-row">
        <div className="pnd-tabs">
          <button className={`pnd-tab${totaisView === "geral"     ? " is-active" : ""}`} onClick={() => setTotaisView("geral")}>Visão Geral</button>
          <button className={`pnd-tab${totaisView === "detalhado" ? " is-active" : ""}`} onClick={() => setTotaisView("detalhado")}>Detalhado</button>
        </div>
      </div>

      {/* Geral */}
      {totaisView === "geral" && (
        <div className="tot-cards-grid">
          {allSlices.map((s, i) => {
            const pctPago = s.value > 0 ? s.pago / s.value * 100 : 0;
            return (
              <div key={s.label} className="section-card tot-group-card"
                style={{ borderTop: `3px solid ${s.color}`, opacity: hovered !== null && hovered !== i ? 0.5 : 1, transition: "opacity .2s, transform .2s", transform: hovered === i ? "translateY(-2px)" : "none" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  <span style={{ fontWeight: 800, fontSize: 15, color: "var(--fg)" }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, marginBottom: 6 }}>R$ {fmt(s.value)}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, marginBottom: 12 }}>
                  <span style={{ color: "#10b981" }}>✓ R$ {fmt(s.pago)}</span>
                  <span style={{ color: s.pendente > 0 ? "#f59e0b" : "var(--fg-muted)" }}>⏳ R$ {fmt(s.pendente)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: "#10b981", width: barsMounted ? `${pctPago}%` : "0%", transition: "width .8s cubic-bezier(0.4,0,0.2,1)" }} />
                </div>
                <div style={{ marginTop: 5, fontSize: 11, color: "var(--fg-muted)", textAlign: "right" }}>{Math.round(pctPago)}% recebido</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalhado */}
      {totaisView === "detalhado" && (
        <div className="section-card pnd-card--list">
          <div className="pnd-scroll">
            <table className="pnd-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>{["Grupo", "Itens", "Total", "Recebido", "Pendente", "Progresso"].map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {allSlices.map((s, i) => {
                  const pctPago = s.value > 0 ? s.pago / s.value * 100 : 0;
                  return (
                    <tr key={s.label} className="pnd-row"
                      style={{ opacity: hovered !== null && hovered !== i ? 0.4 : 1, transition: "opacity .2s" }}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
                          <span className="pnd-nome">{s.label}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>{s.n}</td>
                      <td className="pnd-valor"><span className="pnd-valor-txt">R$ {fmt(s.value)}</span></td>
                      <td><span style={{ fontWeight: 800, fontSize: 14, color: "#10b981" }}>R$ {fmt(s.pago)}</span></td>
                      <td><span style={{ fontWeight: 800, fontSize: 14, color: s.pendente > 0 ? "#f59e0b" : "var(--fg-muted)" }}>R$ {fmt(s.pendente)}</span></td>
                      <td style={{ minWidth: 140 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 3, background: pctPago >= 100 ? "#10b981" : s.color, width: barsMounted ? `${pctPago}%` : "0%", transition: "width .8s cubic-bezier(0.4,0,0.2,1)" }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{Math.round(pctPago)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td><span style={{ fontWeight: 800, fontSize: 13, color: "var(--fg)" }}>TOTAL</span></td>
                  <td style={{ textAlign: "center", fontWeight: 700, fontSize: 13 }}>{pubN + estN + sisN}</td>
                  <td className="pnd-valor"><span className="pnd-valor-txt">R$ {fmt(grand)}</span></td>
                  <td><span style={{ fontWeight: 800, fontSize: 14, color: "#10b981" }}>R$ {fmt(grandPago)}</span></td>
                  <td><span style={{ fontWeight: 800, fontSize: 14, color: grandPend > 0 ? "#f59e0b" : "var(--fg-muted)" }}>R$ {fmt(grandPend)}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: grand > 0 && grandPago >= grand ? "#10b981" : "#6366f1", width: barsMounted ? `${grand > 0 ? grandPago/grand*100 : 0}%` : "0%", transition: "width .9s cubic-bezier(0.4,0,0.2,1)" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--fg)", whiteSpace: "nowrap" }}>{grand > 0 ? Math.round(grandPago/grand*100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
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
