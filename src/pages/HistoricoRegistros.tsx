import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  adicionarNota, listarHistorico, rotuloCampo,
  type Alteracao, type EventoHistorico, type HistoricoEvento,
} from "../lib/historico";
import { listarHistoricosEscolares } from "../lib/historicoEscolar";
import HistoricoEscolar from "./HistoricoEscolar";
import "./HistoricoRegistros.css";

export type RegistroResumo = {
  pubId: string; nome: string; cpf: string; curso: string; protocolo: string; ativo: boolean;
  modalidade?: string; nacionalidade?: string; rg?: string; orgaoExpedidor?: string;
  naturalidade?: string; reitor?: string;
};

type Linha = {
  pubId: string;
  nome: string;
  cpf: string;
  curso: string;
  eventos: HistoricoEvento[];
  excluido: boolean;
  atual: RegistroResumo | null;
  escolarEm: string | null;
};

type Filtro = "todos" | "pendentes" | "criados" | "excluidos";

const EVENTO_META: Record<EventoHistorico, { rotulo: string; cor: string; icone: string }> = {
  criado:     { rotulo: "Criado",       cor: "#34d399", icone: "M12 5v14M5 12h14" },
  editado:    { rotulo: "Editado",      cor: "#60a5fa", icone: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  diploma:    { rotulo: "Diploma",      cor: "#a78bfa", icone: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" },
  ativado:    { rotulo: "Ativado",      cor: "#34d399", icone: "M20 6 9 17l-5-5" },
  desativado: { rotulo: "Desativado",   cor: "#f59e0b", icone: "M18 6 6 18M6 6l12 12" },
  pagamento:  { rotulo: "Pagamento",    cor: "#22d3ee", icone: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  acesso:     { rotulo: "Acesso SIA",   cor: "#f472b6", icone: "M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" },
  excluido:   { rotulo: "Excluído",     cor: "#f87171", icone: "M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" },
  nota:       { rotulo: "Anotação",     cor: "#94a3b8", icone: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  historico:  { rotulo: "Histórico escolar", cor: "#fbbf24", icone: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z" },
};

function Icone({ d, cor, size = 14 }: { d: string; cor: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function tempoDesde(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function rotuloDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function valor(v: unknown, campo: string): string {
  if (campo === "ativo") return v === true || v === "true" ? "Ativo" : "Desativado";
  if (v === null || v === undefined || v === "") return "vazio";
  const s = String(v);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

function Alteracoes({ itens }: { itens: Alteracao[] }) {
  const [todos, setTodos] = useState(false);
  const LIMITE = 4;
  const visiveis = todos ? itens : itens.slice(0, LIMITE);
  return (
    <div className="hist-diff">
      {visiveis.map(a => {
        const opaco = a.de === null && a.para === null;
        return (
          <div key={a.campo} className="hist-diff-row">
            <span className="hist-diff-campo">{rotuloCampo(a.campo)}</span>
            {opaco ? (
              <span className="hist-diff-novo">atualizado</span>
            ) : (
              <>
                <span className="hist-diff-antigo">{valor(a.de, a.campo)}</span>
                <span className="hist-diff-seta">→</span>
                <span className="hist-diff-novo">{valor(a.para, a.campo)}</span>
              </>
            )}
          </div>
        );
      })}
      {itens.length > LIMITE && (
        <button type="button" className="hist-diff-mais" onClick={() => setTodos(v => !v)}>
          {todos ? "Mostrar menos" : `Ver todos os ${itens.length} campos`}
        </button>
      )}
    </div>
  );
}

export default function HistoricoRegistros({ grupo, registros, selecionado, onSelecionar, onEditar }: {
  grupo: string;
  registros: RegistroResumo[];
  selecionado: string;
  onSelecionar: (pubId: string) => void;
  onEditar: (pubId: string) => void;
}) {
  const [eventos, setEventos] = useState<HistoricoEvento[]>([]);
  const [escolares, setEscolares] = useState<Map<string, string>>(new Map());
  const [escolarIndisponivel, setEscolarIndisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aba, setAba] = useState<"documento" | "linha">("documento");
  const [nota, setNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroNota, setErroNota] = useState("");

  const recarregar = useCallback(async () => {
    try {
      const [evs, esc] = await Promise.all([
        listarHistorico(grupo),
        listarHistoricosEscolares(grupo).then(m => ({ m, ok: true }), (e: unknown) => {
          console.error("[historico-escolar]", e);
          return { m: new Map<string, string>(), ok: false };
        }),
      ]);
      setEventos(evs);
      setEscolares(esc.m);
      setEscolarIndisponivel(!esc.ok);
      setErro("");
    } catch (e) {
      console.error("[historico]", e);
      setErro("Não foi possível carregar o histórico. Confirme se a migração 019_historico_publicacoes.sql foi aplicada.");
    } finally {
      setCarregando(false);
    }
  }, [grupo]);

  useEffect(() => { setAba("documento"); }, [selecionado]);

  useEffect(() => {
    setCarregando(true);
    void recarregar();
    const canal = supabase
      .channel(`historico-${grupo}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "historico_publicacoes", filter: `grupo=eq.${grupo}` },
        () => { void recarregar(); })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [grupo, recarregar]);

  const linhas = useMemo<Linha[]>(() => {
    const porPub = new Map<string, HistoricoEvento[]>();
    for (const ev of eventos) {
      const l = porPub.get(ev.pub_id);
      if (l) l.push(ev); else porPub.set(ev.pub_id, [ev]);
    }
    const atuais = new Map(registros.map(r => [r.pubId, r]));
    const ids = new Set<string>([...porPub.keys(), ...atuais.keys()]);
    const lista: Linha[] = [];
    ids.forEach(pubId => {
      const evs = porPub.get(pubId) ?? [];
      const atual = atuais.get(pubId) ?? null;
      lista.push({
        pubId,
        nome: atual?.nome ?? evs[0]?.nome ?? "",
        cpf: atual?.cpf ?? evs[0]?.cpf ?? "",
        curso: atual?.curso ?? "",
        eventos: evs,
        excluido: !atual,
        atual,
        escolarEm: escolares.get(pubId) ?? null,
      });
    });
    // Pendentes primeiro (é o que falta fazer); dentro de cada grupo, o evento mais recente no topo.
    const ultimo = (l: Linha) => l.eventos[0] ? new Date(l.eventos[0].created_at).getTime() : 0;
    const pendente = (l: Linha) => (!l.excluido && !l.escolarEm ? 0 : 1);
    return lista.sort((a, b) => pendente(a) - pendente(b) || ultimo(b) - ultimo(a));
  }, [eventos, registros, escolares]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = q.replace(/\D/g, "");
    return linhas.filter(l => {
      if (filtro === "pendentes" && (l.excluido || l.escolarEm)) return false;
      if (filtro === "criados" && (l.excluido || !l.escolarEm)) return false;
      if (filtro === "excluidos" && !l.excluido) return false;
      if (!q) return true;
      return l.nome.toLowerCase().includes(q)
        || (qDig.length >= 3 && l.cpf.replace(/\D/g, "").includes(qDig))
        || (l.atual?.protocolo ?? "").toLowerCase().includes(q);
    });
  }, [linhas, busca, filtro]);

  const atual = linhas.find(l => l.pubId === selecionado) ?? null;
  const totalExcluidos = linhas.filter(l => l.excluido).length;
  const totalCriados = linhas.filter(l => !l.excluido && l.escolarEm).length;
  const totalPendentes = linhas.length - totalExcluidos - totalCriados;
  const abaAtiva = atual?.excluido ? "linha" : aba;

  const porDia = useMemo(() => {
    if (!atual) return [];
    const grupos: { dia: string; itens: HistoricoEvento[] }[] = [];
    for (const ev of atual.eventos) {
      const dia = rotuloDia(ev.created_at);
      const ult = grupos[grupos.length - 1];
      if (ult && ult.dia === dia) ult.itens.push(ev); else grupos.push({ dia, itens: [ev] });
    }
    return grupos;
  }, [atual]);

  async function registrarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!atual || !nota.trim()) return;
    setSalvandoNota(true);
    setErroNota("");
    try {
      await adicionarNota({ pubId: atual.pubId, grupo, nome: atual.nome, cpf: atual.cpf }, nota);
      setNota("");
      await recarregar();
    } catch (err) {
      console.error("[historico/nota]", err);
      setErroNota("Não foi possível registrar a anotação.");
    } finally {
      setSalvandoNota(false);
    }
  }

  if (carregando) {
    return (
      <div className="tab-body hist-vazio">
        <span className="hist-spinner" /> Carregando histórico...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="tab-body">
        <div className="hist-erro">{erro}</div>
      </div>
    );
  }

  return (
    <div className="tab-body">
      <div className={`hist-layout ${atual ? "hist-layout--sel" : ""}`}>
        <aside className="hist-list">
          <div className="hist-resumo">
            <span><strong>{linhas.length - totalExcluidos}</strong> registros</span>
            {!escolarIndisponivel && <span><strong>{totalPendentes}</strong> pendentes</span>}
            {!escolarIndisponivel && <span><strong>{totalCriados}</strong> criados</span>}
            {totalExcluidos > 0 && <span><strong>{totalExcluidos}</strong> excluídos</span>}
          </div>
          {escolarIndisponivel && (
            <div className="hist-erro">
              Histórico escolar indisponível. Confirme se a migração 020_historicos_escolares.sql foi aplicada.
            </div>
          )}
          <input className="edit-input" placeholder="Buscar por nome, CPF ou protocolo"
            value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="hist-filtros">
            {([["todos", "Todos"], ["pendentes", "Pendentes"], ["criados", "Criados"], ["excluidos", "Excluídos"]] as const).map(([id, rot]) => (
              <button key={id} type="button"
                className={`hist-filtro ${filtro === id ? "hist-filtro--on" : ""}`}
                onClick={() => setFiltro(id)}>{rot}</button>
            ))}
          </div>
          <div className="hist-itens">
            {visiveis.length === 0 ? (
              <div className="hist-vazio">Nenhum registro encontrado.</div>
            ) : visiveis.map(l => {
              const ult = l.eventos[0];
              const meta = ult ? EVENTO_META[ult.evento] : null;
              return (
                <button key={l.pubId} type="button"
                  className={`hist-item ${l.pubId === selecionado ? "hist-item--on" : ""}`}
                  onClick={() => onSelecionar(l.pubId)}>
                  <span className="hist-avatar">{iniciais(l.nome)}</span>
                  <span className="hist-item-corpo">
                    <span className="hist-item-nome">{l.nome || "Sem nome"}</span>
                    <span className="hist-item-sub">
                      {meta && ult ? <><span style={{ color: meta.cor }}>{meta.rotulo}</span> · {tempoDesde(ult.created_at)}</> : "Sem eventos"}
                    </span>
                  </span>
                  <span className="hist-item-badges">
                    {l.excluido && <span className="hist-badge hist-badge--del">Excluído</span>}
                    {!l.excluido && !escolarIndisponivel && (l.escolarEm
                      ? <span className="hist-badge hist-badge--ok">Histórico criado</span>
                      : <span className="hist-badge hist-badge--pend">Pendente</span>)}
                    {l.atual && !l.atual.ativo && <span className="hist-badge hist-badge--off">Desativado</span>}
                    <span className="hist-contagem">{l.eventos.length}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="hist-detalhe">
          {!atual ? (
            <div className="hist-vazio hist-vazio--grande">
              Selecione um registro para ver tudo o que aconteceu com ele.
            </div>
          ) : (
            <>
              <button type="button" className="hist-voltar" onClick={() => onSelecionar("")}>← Voltar à lista</button>
              <header className="hist-cab">
                <span className="hist-avatar hist-avatar--lg">{iniciais(atual.nome)}</span>
                <div className="hist-cab-info">
                  <div className="hist-cab-nome">{atual.nome || "Sem nome"}</div>
                  <div className="hist-cab-sub">
                    {[atual.cpf, atual.curso, atual.atual?.protocolo && `Protocolo ${atual.atual.protocolo}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="hist-cab-acoes">
                  {atual.excluido
                    ? <span className="hist-badge hist-badge--del">Registro excluído</span>
                    : <button type="button" className="btn-sm" onClick={() => onEditar(atual.pubId)}>Editar na aba NOVO</button>}
                </div>
              </header>

              {!atual.excluido && (
                <div className="he-subabas" role="tablist">
                  <button type="button" role="tab" aria-selected={abaAtiva === "documento"}
                    className={`hist-filtro ${abaAtiva === "documento" ? "hist-filtro--on" : ""}`}
                    onClick={() => setAba("documento")}>Histórico escolar</button>
                  <button type="button" role="tab" aria-selected={abaAtiva === "linha"}
                    className={`hist-filtro ${abaAtiva === "linha" ? "hist-filtro--on" : ""}`}
                    onClick={() => setAba("linha")}>Linha do tempo ({atual.eventos.length})</button>
                </div>
              )}

              {!atual.excluido && abaAtiva === "documento" && atual.atual && (
                escolarIndisponivel ? (
                  <div className="hist-erro">
                    O histórico escolar ainda não está disponível. Aplique a migração 020_historicos_escolares.sql no Supabase.
                  </div>
                ) : (
                  <HistoricoEscolar
                    key={atual.pubId}
                    grupo={grupo}
                    pubId={atual.pubId}
                    copiaveis={linhas
                      .filter(l => !l.excluido && l.escolarEm && l.pubId !== atual.pubId)
                      .map(l => ({ pubId: l.pubId, nome: l.nome }))}
                    ficha={{
                      nome: atual.atual.nome, curso: atual.atual.curso, modalidade: atual.atual.modalidade,
                      nacionalidade: atual.atual.nacionalidade, rg: atual.atual.rg,
                      orgaoExpedidor: atual.atual.orgaoExpedidor, naturalidade: atual.atual.naturalidade,
                      reitor: atual.atual.reitor,
                    }}
                    onSalvo={recarregar}
                  />
                )
              )}

              {abaAtiva === "linha" && !atual.excluido && (
                <form className="hist-nota" onSubmit={registrarNota}>
                  <textarea className="edit-input" rows={2} maxLength={500}
                    placeholder="Registrar anotação neste histórico (ex.: aluno pediu segunda via)"
                    value={nota} onChange={e => setNota(e.target.value)} />
                  <button type="submit" className="btn-sm" disabled={salvandoNota || !nota.trim()}>
                    {salvandoNota ? "Salvando..." : "Registrar anotação"}
                  </button>
                  {erroNota && <span className="hist-erro-inline">{erroNota}</span>}
                </form>
              )}

              {abaAtiva !== "linha" ? null : atual.eventos.length === 0 ? (
                <div className="hist-vazio">Nenhum evento registrado para este registro.</div>
              ) : (
                <div className="hist-linha">
                  {porDia.map(g => (
                    <div key={g.dia} className="hist-dia">
                      <div className="hist-dia-rotulo">{g.dia}</div>
                      {g.itens.map(ev => {
                        const m = EVENTO_META[ev.evento] ?? EVENTO_META.editado;
                        return (
                          <article key={ev.id} className="hist-evento">
                            <span className="hist-ponto" style={{ borderColor: m.cor, background: `${m.cor}22` }}>
                              <Icone d={m.icone} cor={m.cor} />
                            </span>
                            <div className="hist-evento-corpo">
                              <div className="hist-evento-topo">
                                <span className="hist-evento-tag" style={{ color: m.cor }}>{m.rotulo}</span>
                                <span className="hist-evento-quando" title={dataHora(ev.created_at)}>{hora(ev.created_at)}</span>
                              </div>
                              <div className={`hist-evento-desc ${ev.evento === "nota" ? "hist-evento-desc--nota" : ""}`}>{ev.descricao}</div>
                              {ev.alteracoes?.length > 0 && <Alteracoes itens={ev.alteracoes} />}
                              <div className="hist-evento-autor">por {ev.autor_nome || "Sistema"}</div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
