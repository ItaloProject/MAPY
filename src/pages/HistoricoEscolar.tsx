import { useCallback, useEffect, useRef, useState } from "react";
import FolhaHistorico from "./FolhaHistorico";
import {
  ASSINANTES, MODELOS_HISTORICO, assinanteDe, avisosDoHistorico, baixarBlob, carregarHistoricoEscolar, comCargaCalculada, completarDados, dadosIniciais, disciplinasDoModelo, excluirHistoricoEscolar, limparTituloTcc,
  gerarDocxHistorico, nomeArquivo, salvarHistoricoEscolar,
  type DadosHistoricoEscolar, type Disciplina, type FichaAluno,
} from "../lib/historicoEscolar";
import { baixarBytes, gerarPdfHistorico } from "../lib/historicoPdf";

const LOGO_URL = "/templates/estacio-logo.jpg";
import "./HistoricoEscolar.css";

type Tabela = "t1" | "t2";
type Meta = { criado: string; atualizado: string };

const COLUNAS: { id: keyof Disciplina; rotulo: string; placeholder?: string }[] = [
  { id: "sem", rotulo: "Sem.", placeholder: "1º" },
  { id: "ano", rotulo: "Ano", placeholder: "2020" },
  { id: "disciplina", rotulo: "Disciplina" },
  { id: "media", rotulo: "Média", placeholder: "8,0" },
  { id: "cm", rotulo: "CM", placeholder: "80" },
  { id: "situacao", rotulo: "Situação", placeholder: "A" },
];

const chaveRascunho = (pubId: string) => `he-rascunho:${pubId}`;

function lerRascunho(pubId: string): Partial<DadosHistoricoEscolar> | null {
  try {
    const bruto = sessionStorage.getItem(chaveRascunho(pubId));
    return bruto ? (JSON.parse(bruto) as Partial<DadosHistoricoEscolar>) : null;
  } catch { return null; }
}
function gravarRascunho(pubId: string, dados: DadosHistoricoEscolar | null) {
  try {
    if (dados) sessionStorage.setItem(chaveRascunho(pubId), JSON.stringify(dados));
    else sessionStorage.removeItem(chaveRascunho(pubId));
  } catch { /* sem armazenamento: segue sem rascunho local */ }
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Campo({ rotulo, valor, onChange, largo, placeholder, dica }: {
  rotulo: string; valor: string; onChange: (v: string) => void; largo?: boolean; placeholder?: string; dica?: string;
}) {
  return (
    <label className={`he-campo ${largo ? "he-campo--largo" : ""}`}>
      <span className="he-campo-rotulo">{rotulo}</span>
      <input className="edit-input" value={valor} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {dica && <span className="he-campo-dica">{dica}</span>}
    </label>
  );
}

function PreviaFolha({ dados }: { dados: DadosHistoricoEscolar }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ajustar = () => setZoom(Math.min(1, Math.max(0.3, (el.clientWidth - 2) / 794)));
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={caixa} className="he-previa">
      <div className="he-papel" style={{ zoom }}>
        <FolhaHistorico dados={dados} />
      </div>
    </div>
  );
}

function GradeDisciplinas({ titulo, subtitulo, linhas, onCampo, onAdicionar, onRemover, onMover }: {
  titulo: string;
  subtitulo: string;
  linhas: Disciplina[];
  onCampo: (i: number, campo: keyof Disciplina, valor: string) => void;
  onAdicionar: () => void;
  onRemover: (i: number) => void;
  onMover: (i: number, delta: -1 | 1) => void;
}) {
  return (
    <section className="he-secao">
      <header className="he-secao-cab">
        <h3>{titulo}</h3>
        <span>{subtitulo} · {linhas.length} {linhas.length === 1 ? "disciplina" : "disciplinas"}</span>
      </header>
      <div className="he-grade-rolagem">
        <div className="he-grade">
          <div className="he-grade-linha he-grade-linha--cab">
            {COLUNAS.map(c => <span key={c.id}>{c.rotulo}</span>)}
            <span />
          </div>
          {linhas.map((l, i) => (
            <div key={i} className="he-grade-linha">
              {COLUNAS.map(c => (
                <input key={c.id} className={`he-cel he-cel--${c.id}`} value={l[c.id]} placeholder={c.placeholder}
                  aria-label={`${c.rotulo}, linha ${i + 1}`}
                  onChange={e => onCampo(i, c.id, e.target.value)} />
              ))}
              <span className="he-grade-acoes">
                <button type="button" title="Subir" disabled={i === 0} onClick={() => onMover(i, -1)}>↑</button>
                <button type="button" title="Descer" disabled={i === linhas.length - 1} onClick={() => onMover(i, 1)}>↓</button>
                <button type="button" title="Remover" className="he-grade-del" onClick={() => onRemover(i)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <button type="button" className="btn-sm" onClick={onAdicionar}>+ Adicionar disciplina</button>
    </section>
  );
}

export default function HistoricoEscolar({ grupo, pubId, ficha, copiaveis, onSalvo }: {
  grupo: string;
  pubId: string;
  ficha: FichaAluno;
  copiaveis: { pubId: string; nome: string }[];
  onSalvo: () => void;
}) {
  const fichaRef = useRef(ficha);
  fichaRef.current = ficha;
  const [origemCopia, setOrigemCopia] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<DadosHistoricoEscolar | null>(null);
  const [base, setBase] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [recuperado, setRecuperado] = useState(false);
  const [sub, setSub] = useState<"editar" | "folha">("editar");
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const dadosRef = useRef<DadosHistoricoEscolar | null>(null);
  dadosRef.current = dados;

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro("");
    setAviso("");
    setErroAcao("");
    setRecuperado(false);
    setSub("editar");
    carregarHistoricoEscolar(pubId)
      .then(salvo => {
        if (!vivo) return;
        const doBanco = salvo ? completarDados(salvo.dados, fichaRef.current) : null;
        const rascunho = lerRascunho(pubId);
        const inicial = doBanco ?? dadosIniciais(fichaRef.current);
        const atual = rascunho ? completarDados(rascunho, fichaRef.current) : inicial;
        const mudouLocal = rascunho !== null && JSON.stringify(atual) !== JSON.stringify(inicial);
        setDados(mudouLocal ? atual : inicial);
        setBase(doBanco ? JSON.stringify(doBanco) : "");
        setMeta(salvo ? { criado: salvo.created_at, atualizado: salvo.updated_at } : null);
        setRecuperado(mudouLocal);
        if (!mudouLocal) gravarRascunho(pubId, null);
      })
      .catch(e => {
        console.error("[historico-escolar]", e);
        if (vivo) setErro("Não foi possível carregar o histórico escolar. Confirme se a migração 020_historicos_escolares.sql foi aplicada.");
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [pubId]);

  const sujo = dados !== null && JSON.stringify(dados) !== base;

  const alterar = useCallback((fn: (d: DadosHistoricoEscolar) => DadosHistoricoEscolar) => {
    setDados(anterior => {
      if (!anterior) return anterior;
      const novo = comCargaCalculada(fn(anterior));
      gravarRascunho(pubId, novo);
      return novo;
    });
    setAviso("");
    setErroAcao("");
  }, [pubId]);

  const definir = <K extends keyof DadosHistoricoEscolar>(campo: K, valor: DadosHistoricoEscolar[K]) =>
    alterar(d => ({ ...d, [campo]: valor }));

  const alterarLinha = (tab: Tabela, i: number, campo: keyof Disciplina, valor: string) =>
    alterar(d => ({ ...d, [tab]: d[tab].map((l, k) => (k === i ? { ...l, [campo]: valor } : l)) }));

  const adicionarLinha = (tab: Tabela) =>
    alterar(d => {
      const ultima = d[tab][d[tab].length - 1];
      const nova: Disciplina = { sem: ultima?.sem ?? "", ano: ultima?.ano ?? "", disciplina: "", media: "", cm: "", situacao: ultima?.situacao ?? "A" };
      return { ...d, [tab]: [...d[tab], nova] };
    });

  const removerLinha = (tab: Tabela, i: number) =>
    alterar(d => ({ ...d, [tab]: d[tab].filter((_, k) => k !== i) }));

  const moverLinha = (tab: Tabela, i: number, delta: -1 | 1) =>
    alterar(d => {
      const j = i + delta;
      if (j < 0 || j >= d[tab].length) return d;
      const lista = [...d[tab]];
      [lista[i], lista[j]] = [lista[j], lista[i]];
      return { ...d, [tab]: lista };
    });

  function descartarAlteracoes() {
    if (!window.confirm("Descartar as alterações não salvas deste histórico escolar?")) return;
    gravarRascunho(pubId, null);
    setDados(base ? (JSON.parse(base) as DadosHistoricoEscolar) : dadosIniciais(fichaRef.current));
    setRecuperado(false);
    setAviso("");
    setErroAcao("");
  }

  function recarregarModelo() {
    if (!window.confirm("Substituir as disciplinas das duas tabelas pelas do modelo? As linhas atuais serão perdidas (até você salvar).")) return;
    alterar(d => ({ ...d, ...disciplinasDoModelo() }));
  }

  function limparDisciplinas() {
    if (!window.confirm("Remover todas as disciplinas das duas tabelas?")) return;
    alterar(d => ({ ...d, t1: [], t2: [] }));
  }

  async function excluirHistorico() {
    if (!dados) return;
    if (!window.confirm(`Excluir o histórico escolar de ${dados.nome}? O registro volta para "Pendente" e os dados salvos são apagados. Essa ação não pode ser desfeita.`)) return;
    setErroAcao("");
    try {
      await excluirHistoricoEscolar(pubId);
      gravarRascunho(pubId, null);
      const novo = dadosIniciais(fichaRef.current);
      setDados(novo);
      setBase("");
      setMeta(null);
      setRecuperado(false);
      setAviso("Histórico excluído. O registro voltou para pendente.");
      onSalvo();
    } catch (e) {
      console.error("[historico-escolar/excluir]", e);
      setErroAcao("Não foi possível excluir o histórico escolar.");
    }
  }

  async function copiarDisciplinas() {
    const origem = copiaveis.find(c => c.pubId === origemCopia);
    if (!origem) return;
    if (!window.confirm(`Substituir as disciplinas deste histórico pelas de ${origem.nome}? Os dados do aluno não mudam (até você salvar).`)) return;
    setErroAcao("");
    try {
      const salvo = await carregarHistoricoEscolar(origem.pubId);
      if (!salvo) {
        setErroAcao("O histórico escolhido não foi encontrado.");
        return;
      }
      const { t1, t2, ano_total } = salvo.dados;
      alterar(d => ({
        ...d,
        t1: t1.map(l => ({ ...l })),
        t2: t2.map(l => ({ ...l })),
        ano_total,
      }));
      setAviso(`Disciplinas copiadas de ${origem.nome}.`);
      setOrigemCopia("");
    } catch (e) {
      console.error("[historico-escolar/copia]", e);
      setErroAcao("Não foi possível copiar as disciplinas.");
    }
  }

  const salvar = useCallback(async (): Promise<boolean> => {
    const atual = dadosRef.current;
    if (!atual) return false;
    if (!atual.nome.trim()) {
      setErroAcao("Informe o nome do aluno antes de salvar.");
      return false;
    }
    setSalvando(true);
    setErroAcao("");
    setAviso("");
    try {
      const r = await salvarHistoricoEscolar(pubId, grupo, atual);
      setBase(JSON.stringify(atual));
      setMeta({ criado: r.created_at, atualizado: r.updated_at });
      setRecuperado(false);
      gravarRascunho(pubId, null);
      setAviso("Histórico escolar salvo.");
      onSalvo();
      return true;
    } catch (e) {
      console.error("[historico-escolar/salvar]", e);
      setErroAcao("Não foi possível salvar o histórico escolar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }, [pubId, grupo, onSalvo]);

  async function gerarPdf() {
    if (!dados) return;
    if (!meta || sujo) {
      const ok = await salvar();
      if (!ok) return;
    }
    setGerandoPdf(true);
    setErroAcao("");
    try {
      const assinatura = assinanteDe(dados.assinante);
      const bytes = await gerarPdfHistorico(dados, {
        logo: await baixarBytes(LOGO_URL),
        assinatura: assinatura ? await baixarBytes(assinatura.imagem) : null,
      });
      baixarBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${nomeArquivo(dados)}.pdf`);
    } catch (e) {
      console.error("[historico-escolar/pdf]", e);
      setErroAcao("Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  async function baixarWord() {
    if (!dados) return;
    setBaixando(true);
    setErroAcao("");
    try {
      baixarBlob(await gerarDocxHistorico(dados), `${nomeArquivo(dados)}.docx`);
    } catch (e) {
      console.error("[historico-escolar/docx]", e);
      setErroAcao("Não foi possível gerar o arquivo Word.");
    } finally {
      setBaixando(false);
    }
  }

  if (carregando) {
    return <div className="hist-vazio"><span className="hist-spinner" /> Carregando histórico escolar...</div>;
  }
  if (erro || !dados) {
    return <div className="hist-erro">{erro || "Histórico escolar indisponível."}</div>;
  }

  return (
    <div className="he-editor">
      <div className="he-barra">
        <div className="he-status">
          {meta ? (
            <>
              <span className="he-pilula he-pilula--ok">Criado</span>
              <span className="he-status-txt">Última alteração em {dataHora(meta.atualizado)}</span>
            </>
          ) : (
            <>
              <span className="he-pilula he-pilula--pend">Pendente</span>
              <span className="he-status-txt">Ainda não salvo. Confira os dados e salve para criar o histórico.</span>
            </>
          )}
          {sujo && meta && <span className="he-pilula he-pilula--mod">Alterações não salvas</span>}
        </div>
        <div className="he-acoes">
          <button type="button" className="btn-primary he-btn" disabled={salvando || (!sujo && !!meta)} onClick={() => void salvar()}>
            {salvando ? "Salvando..." : meta ? "Salvar alterações" : "Criar histórico"}
          </button>
          <button type="button" className="btn-sm he-btn" disabled={salvando || gerandoPdf} onClick={() => void gerarPdf()}
            title="Baixa o histórico em PDF">
            {gerandoPdf ? "Gerando..." : "Gerar PDF"}
          </button>
          <button type="button" className="btn-sm he-btn" disabled={baixando} onClick={() => void baixarWord()}>
            {baixando ? "Gerando..." : "Baixar Word"}
          </button>
          {sujo && (
            <button type="button" className="btn-sm he-btn" onClick={descartarAlteracoes}>Descartar</button>
          )}
        </div>
      </div>

      {recuperado && (
        <div className="he-aviso he-aviso--info">Recuperamos alterações não salvas deste histórico. Salve para confirmá-las.</div>
      )}
      {aviso && <div className="he-aviso he-aviso--ok">{aviso}</div>}
      {erroAcao && <div className="he-aviso he-aviso--erro">{erroAcao}</div>}
      {dados && avisosDoHistorico(dados).map(texto => (
        <div key={texto} className="he-aviso he-aviso--erro">{texto}</div>
      ))}

      <div className="he-subabas" role="tablist">
        <button type="button" role="tab" aria-selected={sub === "editar"}
          className={`hist-filtro ${sub === "editar" ? "hist-filtro--on" : ""}`} onClick={() => setSub("editar")}>
          Editar dados
        </button>
        <button type="button" role="tab" aria-selected={sub === "folha"}
          className={`hist-filtro ${sub === "folha" ? "hist-filtro--on" : ""}`} onClick={() => setSub("folha")}>
          Pré-visualizar folha
        </button>
      </div>

      {sub === "folha" ? (
        <PreviaFolha dados={dados} />
      ) : (
        <div className="he-form">
          <section className="he-secao">
            <header className="he-secao-cab"><h3>Modelo do histórico</h3><span>Define como o documento termina</span></header>
            <div className="he-modelos" role="radiogroup" aria-label="Modelo do histórico">
              {MODELOS_HISTORICO.map(m => (
                <label key={m.id} className={`he-modelo ${dados.modelo === m.id ? "he-modelo--on" : ""}`}>
                  <input type="radio" name="he-modelo" checked={dados.modelo === m.id} onChange={() => definir("modelo", m.id)} />
                  <span className="he-modelo-nome">{m.rotulo}</span>
                  <span className="he-campo-dica">{m.descricao}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="he-secao">
            <header className="he-secao-cab"><h3>Aluno e curso</h3><span>Linhas do cabeçalho da folha</span></header>
            <div className="he-campos">
              <Campo rotulo="Nome" valor={dados.nome} onChange={v => definir("nome", v)} largo />
              <Campo rotulo="Nacionalidade" valor={dados.nacionalidade} onChange={v => definir("nacionalidade", v)} />
              <Campo rotulo="Grau" valor={dados.grau} placeholder="Bacharelado" onChange={v => definir("grau", v)} />
              <Campo rotulo="Curso" valor={dados.curso} placeholder="Medicina" onChange={v => definir("curso", v)} />
              <Campo rotulo="RG" valor={dados.rg} placeholder="1836098 ITEP RN" onChange={v => definir("rg", v)} />
              <Campo rotulo="Naturalidade (cidade)" valor={dados.naturalidade} onChange={v => definir("naturalidade", v)} />
              <Campo rotulo="UF" valor={dados.uf} placeholder="RN" onChange={v => definir("uf", v.toUpperCase().slice(0, 2))} />
              <Campo rotulo="RG (2º documento)" valor={dados.rg_2} placeholder="Opcional" onChange={v => definir("rg_2", v)}
                dica="Fica no canto direito do cabeçalho. Em branco, a linha some." />
            </div>
          </section>

          <section className="he-secao">
            <header className="he-secao-cab"><h3>Instituição e assinatura</h3><span>Caixa “HISTÓRICO” e responsável</span></header>
            <div className="he-campos">
              <Campo rotulo="Título da caixa" valor={dados.titulo} onChange={v => definir("titulo", v)} />
              <Campo rotulo="Data" valor={dados.data_emissao} placeholder="dd/mm/aaaa" onChange={v => definir("data_emissao", v)} />
              <Campo rotulo="Instituição" valor={dados.instituicao} onChange={v => definir("instituicao", v)} largo />
              <label className="he-campo he-campo--largo">
                <span className="he-campo-rotulo">Assinatura (texto sob a rubrica)</span>
                <select className="edit-input" value={assinanteDe(dados.assinante)?.nome ?? dados.assinante}
                  onChange={e => {
                    const nome = e.target.value;
                    const escolhido = assinanteDe(nome);
                    alterar(d => ({ ...d, assinante: nome, rg_2: escolhido ? escolhido.rg : d.rg_2 }));
                  }}>
                  {[...ASSINANTES.map(a => a.nome), ...(assinanteDe(dados.assinante) ? [] : [dados.assinante])].map(nome => (
                    <option key={nome} value={assinanteDe(nome)?.nome ?? nome}>{nome}</option>
                  ))}
                </select>
                <span className="he-campo-dica">Ao escolher, a assinatura e o RG do professor são trocados juntos.</span>
              </label>
            </div>
          </section>

          <GradeDisciplinas
            titulo="Disciplinas — tabela 1" subtitulo="Primeira tabela da folha" linhas={dados.t1}
            onCampo={(i, c, v) => alterarLinha("t1", i, c, v)} onAdicionar={() => adicionarLinha("t1")}
            onRemover={i => removerLinha("t1", i)} onMover={(i, d) => moverLinha("t1", i, d)} />

          <GradeDisciplinas
            titulo="Disciplinas — tabela 2" subtitulo="Segunda tabela da folha" linhas={dados.t2}
            onCampo={(i, c, v) => alterarLinha("t2", i, c, v)} onAdicionar={() => adicionarLinha("t2")}
            onRemover={i => removerLinha("t2", i)} onMover={(i, d) => moverLinha("t2", i, d)} />

          <section className="he-secao">
            <header className="he-secao-cab"><h3>Carga horária total</h3><span>Última linha da segunda tabela</span></header>
            <div className="he-campos">
              {dados.modelo === "simples" && (
                <Campo rotulo="Ano" valor={dados.ano_total} placeholder="2026" onChange={v => definir("ano_total", v)} />
              )}
              <div className="he-campo">
                <span className="he-campo-rotulo">Carga horária total do curso</span>
                <span className="he-campo-valor">{dados.carga_total}</span>
                <span className="he-campo-dica">Soma automática dos CM das duas tabelas.</span>
              </div>
            </div>
          </section>

          {dados.modelo === "completo" && (
            <section className="he-secao">
              <header className="he-secao-cab"><h3>Fechamento</h3><span>Bloco final do histórico</span></header>
              <div className="he-campos">
                <Campo rotulo="Título do trabalho de conclusão" valor={dados.titulo_tcc} onChange={v => definir("titulo_tcc", limparTituloTcc(v))} largo />
                <Campo rotulo="Nota do trabalho" valor={dados.nota_tcc} placeholder="10" onChange={v => definir("nota_tcc", v)} />
                <Campo rotulo="Orientador (a)" valor={dados.orientador} placeholder="Dra. Nome Sobrenome" onChange={v => definir("orientador", v)} />
              </div>
            </section>
          )}

          <section className="he-secao he-secao--ferramentas">
            <button type="button" className="btn-sm" onClick={recarregarModelo}>Recarregar disciplinas do modelo</button>
            <button type="button" className="btn-sm" onClick={limparDisciplinas}>Limpar disciplinas</button>
            {meta && (
              <button type="button" className="btn-sm he-btn-perigo" onClick={() => void excluirHistorico()}>
                Excluir histórico
              </button>
            )}
            {copiaveis.length > 0 && (
              <div className="he-copia">
                <select className="edit-input" value={origemCopia} onChange={e => setOrigemCopia(e.target.value)}
                  aria-label="Histórico de onde copiar as disciplinas">
                  <option value="">Copiar disciplinas de…</option>
                  {copiaveis.map(c => <option key={c.pubId} value={c.pubId}>{c.nome}</option>)}
                </select>
                <button type="button" className="btn-sm" disabled={!origemCopia} onClick={() => void copiarDisciplinas()}>
                  Copiar disciplinas
                </button>
              </div>
            )}
          </section>
        </div>
      )}

    </div>
  );
}
