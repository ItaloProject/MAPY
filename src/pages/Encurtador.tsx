import { Fragment, useEffect, useMemo, useState } from "react";
import "../components/Layout.css";
import "./Encurtador.css";
import { supabase } from "../lib/supabase";
import { SLUG_RE, criarLinkCurto, destinoValido, linkCurtoUrl as linkCurto } from "../lib/links";

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
  const [busca, setBusca] = useState("");

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

        {carregando ? (
          <div className="enc-vazio">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="enc-vazio">{links.length === 0 ? "Nenhum link criado ainda." : "Nenhum link encontrado."}</div>
        ) : (
          <div className="enc-tabela-wrap">
            <table className="enc-tabela">
              <thead>
                <tr>
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
                        <td colSpan={5}>
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
