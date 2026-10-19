import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DadosHistoricoEscolar, Disciplina } from "./historicoEscolar";

// Medidas em pt, na mesma origem do modelo (topo-esquerda). Batem com FolhaHistorico.css e com o PDF do Word.
const PAGINA_W = 595.5;
const PAGINA_H = 842;
const MARGEM_ESQ = 35.4;
const MARGEM_BASE = 42;
const LIMITE_BASE = PAGINA_H - MARGEM_BASE;
const TOPO_CONTINUACAO = 39.1;

const TAMANHO = 9;
const ALTURA_CABECALHO = 13.95;
const ALTURA_LINHA = 13.95;
const PASSO_LINHA = 10.35;
const BASE_NA_LINHA = 11.7;
const BASE_CABECALHO = 10.2;
const ESPESSURA = 1.5;
const COR_CABECALHO = rgb(0.945, 0.945, 0.945);

const COLUNAS = [40.8, 84.26, 126.98, 399.69, 450.58, 485.86, 554.4];
const CAB = ["Sem.", "Ano", "Disciplinas", "Média", "CM", "Situação"];

const y = (topo: number) => PAGINA_H - topo;

// pdf-lib mede com kerning, mas o texto desenhado não aplica kerning: medir por caractere mantém o alinhamento.
const largura = (fonte: PDFFont, texto: string, tamanho: number): number => {
  let total = 0;
  for (const c of texto) total += fonte.widthOfTextAtSize(c, tamanho);
  return total;
};

export type RecursosHistorico = { logo: Uint8Array; assinatura: Uint8Array | null };

type Linha = { altura: number; textos: string[]; fecha?: boolean; total?: boolean };

const PARA_PDF = /[^\x00-\xFFŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™]/g;
const seguro = (t: string) => t.replace(PARA_PDF, "?");

function quebrar(texto: string, fonte: PDFFont, larguraMax: number): string[] {
  const palavras = seguro(texto).trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (atual && largura(fonte, tentativa, TAMANHO) > larguraMax) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export async function gerarPdfHistorico(dados: DadosHistoricoEscolar, recursos: RecursosHistorico): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const preto = rgb(0, 0, 0);

  const texto = (pg: PDFPage, t: string, x: number, base: number, fonte: PDFFont = normal, tamanho = TAMANHO) =>
    pg.drawText(seguro(t), { x, y: y(base), size: tamanho, font: fonte, color: preto });

  const linhaReta = (pg: PDFPage, x1: number, t1: number, x2: number, t2: number, esp = ESPESSURA) =>
    pg.drawLine({ start: { x: x1, y: y(t1) }, end: { x: x2, y: y(t2) }, thickness: esp, color: preto });

  const novaPagina = () => doc.addPage([PAGINA_W, PAGINA_H]);

  const logo = await doc.embedJpg(recursos.logo);
  const assinatura = recursos.assinatura ? await doc.embedPng(recursos.assinatura) : null;

  // O modelo reserva 2 linhas para "Nome + Nacionalidade" e 3 para "Naturalidade + UF". Linhas a mais
  // empurram o RG, a caixa e a tabela para baixo (como o fluxo do Word), em vez de se sobreporem.
  const PASSO_CAB = 16.2;
  const linhasNome = quebrar(`Nome: ${dados.nome} Nacionalidade: ${dados.nacionalidade}`, normal, 149.15);
  const linhasNatur = quebrar(`Naturalidade: ${dados.naturalidade} UF: ${dados.uf}`, normal, 90.7);
  const extraNome = Math.max(0, linhasNome.length - 2) * PASSO_CAB;
  const extra = Math.max(extraNome, Math.max(0, linhasNatur.length - 3) * PASSO_CAB);

  function cabecalho(pg: PDFPage) {
    pg.drawImage(logo, { x: 253.9, y: y(36 + 68.98), width: 86.94, height: 68.98 });
    if (assinatura) pg.drawImage(assinatura, { x: 385.0, y: y(70.79 + 107.25), width: 149.25, height: 107.25 });

    const curso = [dados.grau, dados.curso].filter(s => s.trim()).join(" ");
    texto(pg, curso, 41.52, 134.42);

    linhasNome.forEach((l, i) => texto(pg, l, 41.52, 150.74 + i * PASSO_CAB));
    texto(pg, `RG: ${dados.rg}`, 41.52, 183.02 + extraNome);

    linhasNatur.forEach((l, i) => texto(pg, l, 213.29, 166.94 + i * PASSO_CAB));

    texto(pg, dados.assinante, 385.03, 167.18);
    if (dados.rg_2.trim()) texto(pg, `RG: ${dados.rg_2}`, 385.03, 183.26);

    pg.drawRectangle({
      x: 40.0, y: y(271.87 + extra), width: 515.25, height: 271.87 - 207.57,
      borderColor: preto, borderWidth: ESPESSURA,
    });
    const meio = largura(negrito, seguro(dados.titulo), 15);
    texto(pg, dados.titulo, 297.625 - meio / 2, 228.98 + extra, negrito, 15);
    texto(pg, `Instituição: ${dados.instituicao}`, 43.08, 245.18 + extra);
    texto(pg, `Data: ${dados.data_emissao}`, 43.08, 261.41 + extra);
  }

  function cabecalhoTabela(pg: PDFPage, topo: number) {
    pg.drawRectangle({
      x: COLUNAS[0], y: y(topo + ALTURA_CABECALHO), width: COLUNAS[6] - COLUNAS[0], height: ALTURA_CABECALHO,
      color: COR_CABECALHO,
    });
    CAB.forEach((t, k) => {
      const meio = (COLUNAS[k] + COLUNAS[k + 1]) / 2;
      texto(pg, t, meio - largura(negrito, t, TAMANHO) / 2 + 1.4, topo + BASE_CABECALHO, negrito);
    });
    linhaReta(pg, COLUNAS[0], topo, COLUNAS[6], topo);
    linhaReta(pg, COLUNAS[0], topo + ALTURA_CABECALHO, COLUNAS[6], topo + ALTURA_CABECALHO);
  }

  function celulas(pg: PDFPage, topo: number, linha: Linha) {
    linha.textos.forEach((t, k) => {
      if (!t) return;
      const ini = COLUNAS[k];
      const fim = COLUNAS[k + 1];
      const larguraCel = fim - ini;
      const base = topo + BASE_NA_LINHA + (linha.total ? 2.5 : 0);
      if (k <= 2) {
        const x = ini + (k === 0 ? 4.6 : 6.0);
        const disponivel = larguraCel - (k === 0 ? 4.6 : 6.0) - 2;
        quebrar(t, normal, disponivel).forEach((ln, i) => texto(pg, ln, x, base + i * PASSO_LINHA));
      } else {
        const w = largura(normal, seguro(t), TAMANHO);
        texto(pg, t, ini + larguraCel / 2 - w / 2 + 1.9, base);
      }
    });
  }

  function verticais(pg: PDFPage, topo: number, base: number) {
    COLUNAS.forEach(x => linhaReta(pg, x, topo, x, base));
  }

  const DISPONIVEL_DISCIPLINA = COLUNAS[3] - COLUNAS[2] - 6 - 2;
  const linhaDisciplina = (d: Disciplina, altura: number): Linha => {
    const linhasTexto = Math.max(1, quebrar(d.disciplina, normal, DISPONIVEL_DISCIPLINA).length);
    return {
      altura: altura + (linhasTexto - 1) * PASSO_LINHA,
      textos: [d.sem, d.ano, d.disciplina, d.media, d.cm, d.situacao],
    };
  };

  function tabela(linhas: Linha[], pagina: PDFPage, topo: number): { pagina: PDFPage; y: number } {
    let pg = pagina;
    let inicio = topo;
    let atual = topo;
    cabecalhoTabela(pg, atual);
    atual += ALTURA_CABECALHO;
    linhas.forEach(l => {
      if (atual + l.altura > LIMITE_BASE) {
        verticais(pg, inicio, atual);
        pg = novaPagina();
        inicio = TOPO_CONTINUACAO;
        atual = TOPO_CONTINUACAO;
        cabecalhoTabela(pg, atual);
        atual += ALTURA_CABECALHO;
      }
      celulas(pg, atual, l);
      atual += l.altura;
      if (l.fecha) {
        if (!l.total) atual += 1.2;
        linhaReta(pg, COLUNAS[0], atual, COLUNAS[6], atual);
      }
    });
    verticais(pg, inicio, atual);
    return { pagina: pg, y: atual };
  }

  const completo = dados.modelo === "completo";
  const todas: Linha[] = [...dados.t1, ...dados.t2].map((d, i, lista) => ({
    ...linhaDisciplina(d, ALTURA_LINHA), fecha: completo && i === lista.length - 1,
  }));
  if (!completo) {
    todas.push({
      altura: 18.2, total: true, fecha: true,
      textos: ["", dados.ano_total, `Carga Horária Total do Curso: ${dados.carga_total}`, "", "", ""],
    });
  }

  const pagina1 = novaPagina();
  cabecalho(pagina1);
  const fimT2 = tabela(todas, pagina1, 278.69 + extra);

  type Token = { t: string; f: PDFFont };
  const esp = largura(normal, " ", TAMANHO);
  const tokens = (segs: { t: string; b?: boolean; espacosApos?: number }[]): Token[] =>
    segs.flatMap(s => [
      ...seguro(s.t).split(/\s+/).filter(Boolean).map(t => ({ t, f: s.b ? negrito : normal })),
      ...Array.from({ length: s.espacosApos ?? 0 }, () => ({ t: "", f: normal })),
    ]);

  function quebrarRico(tks: Token[], larguraMax: number): Token[][] {
    const linhas: Token[][] = [];
    let atual: Token[] = [];
    let larg = 0;
    for (const tk of tks) {
      const w = largura(tk.f, tk.t, TAMANHO);
      const novo = atual.length ? larg + esp + w : w;
      if (atual.length && novo > larguraMax) {
        linhas.push(atual);
        atual = [tk];
        larg = w;
      } else {
        atual.push(tk);
        larg = novo;
      }
    }
    if (atual.length) linhas.push(atual);
    return linhas;
  }

  function desenharLinhas(pg: PDFPage, linhas: Token[][], x: number, base: number) {
    linhas.forEach((ln, i) => {
      let cx = x;
      ln.forEach(tk => {
        if (tk.t) pg.drawText(tk.t, { x: cx, y: y(base + i * ALTURA_TEXTO_FECHO), size: TAMANHO, font: tk.f, color: preto });
        cx += largura(tk.f, tk.t, TAMANHO) + esp;
      });
    });
  }

  const ALTURA_TEXTO_FECHO = 10.4;
  const PADDING_FECHO = 5;
  const PADDING_LATERAL_FECHO = 7.6;
  const ALTURA_PRIMEIRA_FECHO = PADDING_FECHO * 2 + ALTURA_TEXTO_FECHO + 3;
  const LARGURA_A = 340.2;
  const LARGURA_B = 173.6;
  const X_A = 33.2;
  const X_MEIO = X_A + LARGURA_A;
  const X_FIM = X_MEIO + LARGURA_B;
  const LARGURA_TEXTO_A = LARGURA_A - PADDING_LATERAL_FECHO * 2 + 1.5;
  const LARGURA_TEXTO_B = LARGURA_B - PADDING_LATERAL_FECHO * 2 - 1;

  function fechamento(pg: PDFPage, topo: number) {
    const a1 = quebrarRico(tokens([{ t: "TOTAL DA CARGA HORÁRIA CURSADA:", b: true }, { t: dados.carga_total }]), LARGURA_TEXTO_A);
    const b1 = quebrarRico(tokens([{ t: "DATA DE EMISSÃO:", b: true }, { t: dados.data_emissao }]), LARGURA_TEXTO_B);
    const a2 = quebrarRico(tokens([{ t: "TÍTULO DO TRABALHO DE CONCLUSÃO:", b: true }, { t: `“${dados.titulo_tcc}”`, espacosApos: 2 }, { t: "NOTA:", b: true }, { t: dados.nota_tcc }]), LARGURA_TEXTO_A);
    const b2Rotulo = quebrarRico(tokens([{ t: "ORIENTADOR (A):", b: true }]), LARGURA_TEXTO_B);
    const b2Nome = quebrarRico(tokens([{ t: dados.orientador }]), LARGURA_TEXTO_B);
    const folgaNome = 4;
    const alturaB = (b2Rotulo.length + b2Nome.length) * ALTURA_TEXTO_FECHO + folgaNome;
    const altura2 = PADDING_FECHO * 2 + Math.max(a2.length * ALTURA_TEXTO_FECHO, alturaB, ALTURA_TEXTO_FECHO);
    const fundo = topo + ALTURA_PRIMEIRA_FECHO + altura2;

    pg.drawRectangle({ x: X_A, y: y(fundo), width: X_FIM - X_A, height: fundo - topo, borderColor: preto, borderWidth: 1 });
    linhaReta(pg, X_A, topo + ALTURA_PRIMEIRA_FECHO, X_FIM, topo + ALTURA_PRIMEIRA_FECHO, 1);
    linhaReta(pg, X_MEIO, topo, X_MEIO, fundo, 1);

    const base1 = topo + PADDING_FECHO + 8.2;
    desenharLinhas(pg, a1, X_A + PADDING_LATERAL_FECHO, base1);
    desenharLinhas(pg, b1, X_MEIO + PADDING_LATERAL_FECHO, base1);
    const base2 = topo + ALTURA_PRIMEIRA_FECHO + PADDING_FECHO + 8.2;
    desenharLinhas(pg, a2, X_A + PADDING_LATERAL_FECHO, base2);
    desenharLinhas(pg, b2Rotulo, X_MEIO + PADDING_LATERAL_FECHO, base2);
    desenharLinhas(pg, b2Nome, X_MEIO + PADDING_LATERAL_FECHO, base2 + b2Rotulo.length * ALTURA_TEXTO_FECHO + 4);
    return fundo;
  }

  if (completo) {
    const topoFecho = fimT2.y + 15.3;
    let pgFecho = fimT2.pagina;
    let topoF = topoFecho;
    if (topoFecho + ALTURA_PRIMEIRA_FECHO + PADDING_FECHO * 2 + 3 * ALTURA_TEXTO_FECHO > LIMITE_BASE) {
      pgFecho = novaPagina();
      topoF = TOPO_CONTINUACAO;
    }
    fechamento(pgFecho, topoF);
  }

  return doc.save();
}

export async function baixarBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Recurso indisponível (HTTP ${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
