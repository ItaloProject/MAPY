import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../components/Layout.css";
import "./Encurtador.css";
import { supabase } from "../lib/supabase";
import {
  BASES_DESTINO, SLUG_RE, criarLinkCurto, destinoValido, linkCurtoUrl as linkCurto, origemDe, trocarOrigem,
} from "../lib/links";

type Link = {
  slug: string;
  target: string;
  clicks: number;
  created_at: string;
  updated_at: string;
};

const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR");

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export default function Encurtador() {
  const [links, setLinks] = useState<Link[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [params] = useSearchParams();
  const [busca, setBusca] = useState(params.get("q") ?? ""); // ?q=<apelido> abre já filtrado (vem do modal do QR)

  const [destino, setDestino] = useState("");
  const [apelido, setApelido] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState("");
  const [criado, setCriado] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [novoDestino, setNovoDestino] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEdit, setErroEdit] = useState("");

  const [copiado, setCopiado] = useState<string | null>(null);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [msgLote, setMsgLote] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("links")
      .select("slug,target,clicks,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      setErroLista("Não foi possível carregar os links. Confirme se a migração 023_links_encurtador.sql foi aplicada no Supabase.");
    } else {
      setErroLista("");
      setLinks((data ?? []) as Link[]);
    }
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return links;
    return links.filter(l => l.slug.toLowerCase().includes(q) || l.target.toLowerCase().includes(q));
  }, [links, busca]);

  // Quantos destinos estão em cada domínio (os que não são de nenhum dos dois entram em "outros")
  const contagemBases = useMemo(() => {
    const c: Record<string, number> = { outros: 0 };
    for (const l of links) {
      const o = origemDe(l.target);
      if (BASES_DESTINO.includes(o)) c[o] = (c[o] ?? 0) + 1;
      else c.outros++;
    }
    return c;
  }, [links]);

  const todosMarcados = filtrados.length > 0 && filtrados.every(l => sel.has(l.slug));

  function alternar(slug: string) {
    setSel(prev => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug); else n.add(slug);
      return n;
    });
  }

  function alternarTodos() {
    setSel(todosMarcados ? new Set() : new Set(filtrados.map(l => l.slug)));
  }

  // Troca o domínio do destino dos links marcados. O link curto e o QR não mudam.
  async function trocarDominio(base: string) {
    setMsgLote(null);
    const marcados = links.filter(l => sel.has(l.slug));
    const planos = marcados.map(l => ({ l, novo: trocarOrigem(l.target, base) }));
    const mudar = planos.filter(p => p.novo !== null && p.novo !== p.l.target);
    const jaEstavam = planos.filter(p => p.novo !== null && p.novo === p.l.target).length;
    const foraDosDois = planos.filter(p => p.novo === null).length;

    if (mudar.length === 0) {
      setMsgLote({ tipo: "err", texto: `Nada a alterar: ${jaEstavam} já estão em ${base}${foraDosDois ? ` e ${foraDosDois} têm destino em outro site` : ""}.` });
      return;
    }
    if (!confirm(`Trocar o destino de ${mudar.length} link(s) para ${base}?\nOs links curtos e os QR codes não mudam.`)) return;

    setAplicando(true);
    const agora = new Date().toISOString();
    let falhas = 0;
    for (let i = 0; i < mudar.length; i += 8) {
      const resultados = await Promise.all(
        mudar.slice(i, i + 8).map(({ l, novo }) =>
          supabase.from("links").update({ target: novo as string, updated_at: agora }).eq("slug", l.slug)),
      );
      falhas += resultados.filter(r => r.error).length;
    }
    setAplicando(false);
    await carregar();
    setSel(new Set());

    const partes = [`${mudar.length - falhas} destino(s) alterado(s) para ${base}.`];
    if (jaEstavam) partes.push(`${jaEstavam} já estavam nesse domínio.`);
    if (foraDosDois) partes.push(`${foraDosDois} ignorado(s): destino em outro site.`);
    if (falhas) partes.push(`${falhas} falharam — tente de novo.`);
    setMsgLote({ tipo: falhas ? "err" : "ok", texto: partes.join(" ") });
  }

  async function copiar(slug: string) {
    if (await copiarTexto(linkCurto(slug))) {
      setCopiado(slug);
      setTimeout(() => setCopiado(c => (c === slug ? null : c)), 1500);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErroCriar("");
    setCriado(null);
    const target = destino.trim();
    const apelidoLimpo = apelido.trim();
    if (!destinoValido(target)) {
      setErroCriar("Destino inválido. Use uma URL completa começando com http:// ou https://");
      return;
    }
    if (apelidoLimpo && !SLUG_RE.test(apelidoLimpo)) {
      setErroCriar("O apelido deve ter de 3 a 40 caracteres: letras, números, - ou _");
      return;
    }
    setCriando(true);
    try {
      const slug = await criarLinkCurto(target, apelidoLimpo);
      setCriado(slug);
      setDestino("");
      setApelido("");
      await carregar();
    } catch (err) {
      setErroCriar(err instanceof Error ? err.message : "Erro ao criar o link.");
    } finally {
      setCriando(false);
    }
  }

  function abrirEdicao(l: Link) {
    setEditando(l.slug);
    setNovoDestino(l.target);
    setErroEdit("");
  }

  async function salvarDestino(slug: string) {
    const target = novoDestino.trim();
    if (!destinoValido(target)) {
      setErroEdit("Destino inválido. Use uma URL completa começando com http:// ou https://");
      return;
    }
    setSalvando(true);
    setErroEdit("");
    const { error } = await supabase
      .from("links")
      .update({ target, updated_at: new Date().toISOString() })
      .eq("slug", slug);
    setSalvando(false);
    if (error) {
      setErroEdit("Erro ao salvar: " + error.message);
      return;
    }
    setEditando(null);
    await carregar();
  }

  async function excluir(slug: string) {
    if (!confirm(`Excluir o link ${linkCurto(slug)}?\nQuem já tem o QR code verá "Link não encontrado".`)) return;
    const { error } = await supabase.from("links").delete().eq("slug", slug);
    if (error) setErroLista("Erro ao excluir: " + error.message);
    else await carregar();
  }

  return (
    <div className="enc">
      <div className="page-header">
        <h1 className="page-title">Encurtador</h1>
        <p className="page-sub">Crie links curtos para QR codes. Ao trocar o destino, o link e o QR continuam os mesmos.</p>
      </div>

      <section className="enc-card">
        <form className="enc-form" onSubmit={criar}>
          <label className="enc-field enc-field--grow">
            <span>Destino (URL completa)</span>
            <input
              type="url"
              value={destino}
              onChange={e => setDestino(e.target.value)}
              placeholder="https://exemplo.com/pagina"
              required
            />
          </label>
          <label className="enc-field">
            <span>Apelido (opcional)</span>
            <input
              value={apelido}
              onChange={e => setApelido(e.target.value)}
              placeholder="gerado automaticamente"
              maxLength={40}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={criando}>
            {criando ? "Criando..." : "Criar link"}
          </button>
        </form>
        {erroCriar && <div className="enc-msg enc-msg--err">{erroCriar}</div>}
        {criado && (
          <div className="enc-msg enc-msg--ok">
            <span>Link criado: <strong className="enc-mono">{linkCurto(criado)}</strong></span>
            <button type="button" className="btn-sm" onClick={() => copiar(criado)}>
              {copiado === criado ? "Copiado!" : "Copiar"}
            </button>
          </div>
        )}
      </section>

      <section className="enc-card enc-card--lista">
        <div className="enc-toolbar">
          <strong>Seus links ({links.length})</strong>
          <input
            className="enc-busca"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por apelido ou destino..."
          />
        </div>

        {erroLista && <div className="enc-msg enc-msg--err">{erroLista}</div>}

        {links.length > 0 && (
          <div className="enc-lote">
            <div className="enc-lote-resumo">
              {BASES_DESTINO.map(b => (
                <span key={b} className="enc-chip">{b.replace("https://", "")}: <strong>{contagemBases[b] ?? 0}</strong></span>
              ))}
              {contagemBases.outros > 0 && <span className="enc-chip">outros: <strong>{contagemBases.outros}</strong></span>}
            </div>
            <div className="enc-lote-acao">
              <span>{sel.size} selecionado(s). Trocar o domínio dos destinos para:</span>
              {BASES_DESTINO.map(b => (
                <button key={b} type="button" className="btn-sm" disabled={aplicando || sel.size === 0} onClick={() => trocarDominio(b)}>
                  {aplicando ? "Aplicando..." : b.replace("https://", "")}
                </button>
              ))}
            </div>
            {msgLote && <div className={`enc-msg enc-msg--${msgLote.tipo}`}>{msgLote.texto}</div>}
          </div>
        )}

        {carregando ? (
          <div className="enc-vazio">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="enc-vazio">{links.length === 0 ? "Nenhum link criado ainda." : "Nenhum link encontrado."}</div>
        ) : (
          <div className="enc-tabela-wrap">
            <table className="enc-tabela">
              <thead>
                <tr>
                  <th className="enc-col-sel">
                    <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todos" />
                  </th>
                  <th>Link curto</th>
                  <th>Destino</th>
                  <th>Cliques</th>
                  <th>Atualizado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => (
                  <Fragment key={l.slug}>
                    <tr>
                      <td className="enc-col-sel">
                        <input type="checkbox" checked={sel.has(l.slug)} onChange={() => alternar(l.slug)} aria-label={`Selecionar ${l.slug}`} />
                      </td>
                      <td>
                        <a className="enc-mono enc-link" href={linkCurto(l.slug)} target="_blank" rel="noreferrer">
                          /g/{l.slug}
                        </a>
                      </td>
                      <td className="enc-destino">{l.target}</td>
                      <td className="enc-num">{l.clicks}</td>
                      <td className="enc-data">{fmtData(l.updated_at)}</td>
                      <td className="enc-acoes">
                        <button type="button" className="btn-sm" onClick={() => copiar(l.slug)}>
                          {copiado === l.slug ? "Copiado!" : "Copiar"}
                        </button>
                        <button type="button" className="btn-sm" onClick={() => abrirEdicao(l)}>Editar destino</button>
                        <button type="button" className="btn-sm enc-perigo" onClick={() => excluir(l.slug)}>Excluir</button>
                      </td>
                    </tr>
                    {editando === l.slug && (
                      <tr className="enc-linha-edicao">
                        <td colSpan={6}>
                          <div className="enc-edicao">
                            <input
                              type="url"
                              value={novoDestino}
                              onChange={e => setNovoDestino(e.target.value)}
                              aria-label="Novo destino"
                              autoFocus
                            />
                            <button type="button" className="btn-primary" disabled={salvando} onClick={() => salvarDestino(l.slug)}>
                              {salvando ? "Salvando..." : "Salvar"}
                            </button>
                            <button type="button" className="btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                          </div>
                          {erroEdit && <div className="enc-msg enc-msg--err">{erroEdit}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
