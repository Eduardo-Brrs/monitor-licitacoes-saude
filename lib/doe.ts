// Cliente pro Diário Oficial do Estado de Alagoas (DOE-AL). API não documentada
// oficialmente — reconstruída em 2026-09-10 a partir do bundle JS do site público
// (https://diario.imprensaoficial.al.gov.br), mesmo princípio já usado com o PNCP:
// é a mesma API que o site usa, chamada direto em vez de clicar no botão de busca.
//
// Achado que motivou isso: os itens "AQUISIÇÃO JUDICIAL" (OPME/medicamento) do
// boletim do ConLicitação não existem no PNCP nem no Diário do Município de
// Maceió (já investigado à exaustão), mas são publicados pela AMGESP aqui, no
// Diário Oficial do ESTADO — com número de processo e instrução pra solicitar
// o Termo de Referência. Canal público de verdade, só não onde a gente olhava.

const BASE_DOE = 'https://diario.imprensaoficial.al.gov.br/apinova/api'

const TIMEOUT_MS = 20_000

async function fetchComTimeout(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`Diário Oficial AL não respondeu em ${TIMEOUT_MS / 1000}s (timeout): ${url}`)
    }
    throw err
  }
}

export interface DoePaginaMatch {
  id: number // id único de página retornado pela API — usado como chave de dedup
  edition_id: number
  edition_number: number
  page_number: number
  publication_date: string // YYYY-MM-DD
  highlight: string[]
}

interface DoeSearchResponse {
  status: string
  result: {
    items: DoePaginaMatch[]
    total_rows: { value: number; relation: string }
  }
}

const MAX_PAGINAS = 10 // segurança — evita loop longo se o corte de data nunca bater

// Busca full-text por uma frase exata no DOE-AL, mais recente primeiro. O campo
// de filtro de data da API (periodo_inicial/periodo_final) existe no formulário
// do site mas não filtra de forma confiável — testado em 2026-09-10, devolveu
// itens fora do intervalo pedido. Por isso pagina com order=novo e para
// manualmente quando encontra uma página publicada antes de `dataCorte`, em vez
// de confiar no filtro da API.
export async function buscarPorFraseExata(frase: string, dataCorte: Date): Promise<DoePaginaMatch[]> {
  const encontrados: DoePaginaMatch[] = []

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const res = await fetchComTimeout(`${BASE_DOE}/editions/searchES?page=${pagina}&bucket_size=10`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: frase,
        searchType: 'frase_exata',
        order: 'novo',
      }),
    })

    if (!res.ok) {
      throw new Error(`Diário Oficial AL respondeu ${res.status} na busca: ${await res.text()}`)
    }

    const json: DoeSearchResponse = await res.json()
    const items = json.result.items ?? []

    if (items.length === 0) break

    for (const item of items) {
      if (new Date(item.publication_date) < dataCorte) {
        return encontrados
      }
      encontrados.push(item)
    }
  }

  return encontrados
}

// Exportado à parte pra correção dos ids republicados (ver
// corrigirIdsRepublicados em app/api/sync-doe/route.ts), que monta a URL no SQL.
export const PREFIXO_URL_PDF = `${BASE_DOE}/editions/viewPdf/`

export function urlPdfEdicao(editionId: number): string {
  return `${PREFIXO_URL_PDF}${editionId}`
}

// --- Fallback: lê o PDF direto, sem depender da busca full-text (searchES) ---
//
// Achado em 2026-09-14: o índice de busca deles travou/regrediu pra um estado
// de ~7 meses atrás (qualquer busca, com ou sem "order", devolve edição de
// 13/02/2026 como "mais recente") — confirmado que o problema é do lado
// deles (o próprio bundle JS do site chama o mesmo endpoint quebrado) e não
// do publicador em si (o PDF das edições recentes continua servido normal,
// com Last-Modified correto). Esse fallback usa `editions/published` (lista
// cronológica simples, sem depender de índice de busca nenhum) pra descobrir
// quais edições existem, baixa o PDF e lê o texto localmente.
//
// Decisão de design ligada a escalabilidade (ver a conversa de
// 2026-09-14): o achado bruto (trecho + processo) não é filtrado por keyword
// de cliente nenhum aqui — mesmo critério já usado no caminho via busca desde
// o fix de 2026-09-10. Isso mantém o dado neutro: se um dia vender pra outro
// cliente do setor médico em AL, o mesmo "aquisição judicial" bruto serve pra
// qualquer um, sem precisar rebuscar/reprocessar nada.

export interface DoeEdicaoPublicada {
  id: number
  number: number
  publication_date: string // YYYY-MM-DD
  suplement: boolean
}

interface DoeEdicoesPublicadasResponse {
  status: string
  editions: DoeEdicaoPublicada[]
}

async function buscarEdicoesDoMes(ano: number, mes: number): Promise<DoeEdicaoPublicada[]> {
  const mesFormatado = String(mes).padStart(2, '0')
  const res = await fetchComTimeout(`${BASE_DOE}/editions/published/${ano}/${mesFormatado}`)

  if (!res.ok) {
    throw new Error(`Diário Oficial AL respondeu ${res.status} ao listar edições de ${ano}-${mesFormatado}: ${await res.text()}`)
  }

  const json: DoeEdicoesPublicadasResponse = await res.json()
  return json.editions ?? []
}

// Lista as edições publicadas, em ordem cronológica — endpoint separado da
// busca full-text, não afetado pelo travamento do índice (ver achado de
// 2026-09-14 em o log de validação (privado)).
//
// `editions/published?page=N` (sem ano/mês) existe mas está com a paginação
// quebrada — testado com page 1 a 10, sempre devolve as mesmas 5 edições mais
// recentes, ignorando o parâmetro. `editions/published/{ano}/{mes}` devolve o
// mês inteiro de verdade (confirmado: setembro/2026 trouxe as 16
// edições+suplementos do mês inteiro, incluindo dias que a versão por page
// nunca alcançava). Busca o mês atual e o anterior — cobre com folga a janela
// de reconsulta de 14 dias mesmo perto da virada do mês, sem precisar
// calcular quais meses exatos ela cruza.
export async function listarEdicoesPublicadas(): Promise<DoeEdicaoPublicada[]> {
  const hoje = new Date()
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)

  const [doMesAtual, doMesAnterior] = await Promise.all([
    buscarEdicoesDoMes(hoje.getFullYear(), hoje.getMonth() + 1),
    buscarEdicoesDoMes(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1),
  ])

  return [...doMesAtual, ...doMesAnterior]
}

// Uma por PÁGINA com pelo menos uma ocorrência, não uma por ocorrência —
// mesma granularidade que a busca full-text deles já usa (um "id" de página
// por resultado, com os até ~5 highlights daquela página concatenados juntos
// no snippet salvo). Uma página de aviso em lote pode ter dezenas de
// processos juntos (ex: lista de medicamentos) — `trechos` guarda o contexto
// de cada um.
export interface DoePaginaComOcorrencias {
  pageNumber: number
  trechos: string[]
}

// Remove acentos pra comparação — mesma técnica de lib/keywords.ts. Como cada
// caractere acentuado do português decompõe (NFD) em base + 1 marca
// combinante, remover a marca preserva o tamanho em caracteres — importante
// aqui porque a posição achada no texto normalizado é usada pra recortar o
// trecho no texto ORIGINAL (com acento).
function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const CONTEXTO_ANTES = 80
const CONTEXTO_DEPOIS = 200

// Fallback pra caso o próprio aviso não use a frase-âncora principal — achado
// em 2026-09-14 comparando um boletim real: um aviso genuíno ("Processo
// E:02000.0000034719/2025. Aquisição de OPME DE CARDIOLOGIA.") não continha
// a palavra "judicial" em lugar nenhum, só a descrição curta do OPME. Todo
// aviso desse tipo que já vimos, sem exceção, tem esse e-mail de contato
// (às vezes com "2" no final, às vezes sem) — marcador administrativo bem
// mais específico que qualquer palavra do texto, baixo risco de ruído.
const FRASE_SECUNDARIA = 'cotacaojudicial'

// Distância máxima (em caracteres, no texto já normalizado) entre a frase
// principal e o fim de um aviso pra considerar as duas ocorrências como o
// MESMO aviso (evita gerar um trecho duplicado quando a frase principal já
// bateu naquele aviso, só que longe do e-mail de contato — o aviso mais
// longo já visto, com uma lista de procedimentos concatenados, passa de 600
// caracteres do processo até o e-mail).
const DISTANCIA_MAX_MESMO_AVISO = 800

export interface DoePaginaTexto {
  num: number
  text: string
}

// Baixa o PDF de uma edição e extrai o texto, página por página. Separado da
// busca em si desde 2026-09-23: a mesma edição agora é lida por dois
// extratores (aquisição judicial e avisos de licitação), e baixar/extrair o
// PDF é a parte cara — faz uma vez só por edição.
export async function extrairPaginasPdf(editionId: number): Promise<DoePaginaTexto[]> {
  const res = await fetchComTimeout(`${BASE_DOE}/editions/viewPdf/${editionId}`)

  if (!res.ok) {
    throw new Error(`Diário Oficial AL respondeu ${res.status} ao baixar PDF da edição ${editionId}: ${await res.text()}`)
  }

  // Import dinâmico: só carrega a lib de PDF (e o worker do pdf.js por trás
  // dela) quando o fallback é realmente usado, não em todo request da rota.
  //
  // 'pdf-parse/worker' precisa ser importado ANTES de 'pdf-parse' — é ele que
  // registra os polyfills globais (DOMMatrix/Path2D/ImageData, via
  // @napi-rs/canvas) que o pdfjs-dist exige por baixo mesmo só extraindo
  // texto. Sem isso funciona local (`next dev`/`next start`) mas quebra em
  // produção na Vercel com "ReferenceError: DOMMatrix is not defined" — só
  // aparece quando existe uma edição nova de verdade pra processar, por isso
  // não tinha sido pego antes do deploy. Achado ao vivo em 2026-09-15.
  await import('pdf-parse/worker')
  const { PDFParse } = await import('pdf-parse')

  const buffer = Buffer.from(await res.arrayBuffer())
  const parser = new PDFParse({ data: buffer })

  try {
    const resultado = await parser.getText()
    return resultado.pages.map((pagina) => ({ num: pagina.num, text: pagina.text }))
  } finally {
    await parser.destroy()
  }
}

// Procura ocorrências da frase-âncora (e, como complemento, do e-mail de
// contato — ver FRASE_SECUNDARIA acima) no texto já extraído de uma edição,
// devolvendo um trecho de contexto ao redor de cada aviso, agrupado por
// página — o equivalente ao "highlight" que a busca full-text devolvia, só que
// lendo o PDF direto em vez de depender do índice deles.
export function buscarFraseNasPaginas(paginas: DoePaginaTexto[], frase: string): DoePaginaComOcorrencias[] {
  const fraseNormalizada = normalizarTexto(frase)
  const fraseSecundariaNormalizada = normalizarTexto(FRASE_SECUNDARIA)
  const paginasComOcorrencia: DoePaginaComOcorrencias[] = []

  for (const pagina of paginas) {
    const textoNormalizado = normalizarTexto(pagina.text)
    const trechos: string[] = []
    const posicoesPrincipais: number[] = []

    let posicao = textoNormalizado.indexOf(fraseNormalizada)
    while (posicao !== -1) {
      posicoesPrincipais.push(posicao)
      const inicio = Math.max(0, posicao - CONTEXTO_ANTES)
      const fim = Math.min(pagina.text.length, posicao + fraseNormalizada.length + CONTEXTO_DEPOIS)
      trechos.push(pagina.text.slice(inicio, fim).replace(/\s+/g, ' ').trim())
      posicao = textoNormalizado.indexOf(fraseNormalizada, posicao + fraseNormalizada.length)
    }

    // Segunda passada: só considera a frase secundária se não tiver uma
    // ocorrência da frase principal "por perto" antes dela — senão é o
    // mesmo aviso que a primeira passada já capturou, só que o e-mail de
    // contato ficou fora da janela de contexto (aviso longo).
    let posicaoSecundaria = textoNormalizado.indexOf(fraseSecundariaNormalizada)
    while (posicaoSecundaria !== -1) {
      const jaCoberta = posicoesPrincipais.some(
        (p) => posicaoSecundaria - p >= 0 && posicaoSecundaria - p <= DISTANCIA_MAX_MESMO_AVISO
      )
      if (!jaCoberta) {
        const inicio = Math.max(0, posicaoSecundaria - DISTANCIA_MAX_MESMO_AVISO)
        const fim = Math.min(pagina.text.length, posicaoSecundaria + fraseSecundariaNormalizada.length + CONTEXTO_DEPOIS)
        trechos.push(pagina.text.slice(inicio, fim).replace(/\s+/g, ' ').trim())
      }
      posicaoSecundaria = textoNormalizado.indexOf(fraseSecundariaNormalizada, posicaoSecundaria + fraseSecundariaNormalizada.length)
    }

    if (trechos.length > 0) paginasComOcorrencia.push({ pageNumber: pagina.num, trechos })
  }

  return paginasComOcorrencia
}

// ---------------------------------------------------------------------------
// Avisos de licitação (Pregão Eletrônico) de órgãos estaduais — fonte de
// backup pro PNCP, adicionada em 2026-09-23.
//
// Motivo: o PNCP cai com frequência (outage de mais de um dia em 21/09 e
// 22-23/09). Cruzando as edições de 08-23/09 com o banco, 24 de 24 pregões da
// AMGESP (central de compras do Estado — correlatos, medicamentos, OPME,
// dietas) aparecem aqui, no mesmo dia ou até antes do PNCP. Não cobre
// prefeituras (0 de 73 municipais/federais do mesmo período) — município
// publica no diário da AMA, não aqui. Detalhe em o log de validação (privado),
// seção "2026-09-23".
//
// A AMGESP publica cada pregão como um registro de formato fixo, vários
// seguidos sob um mesmo cabeçalho:
//
//   AVISO DE LICITAÇÃO
//   AMGESP N.º 138/2026 - DOE, DOU e Jornal Diário De Grande Circulação.
//   Processo: E:04105.0000001293/2026; Modalidade: Pregão Eletrônico n.º
//   AMGESP - 90.252/2026; Contratação n.º 29/2026; Tipo: Menor Preço por Item;
//   Objeto: Registro de Preços para ... Medicamentos CEAF; Data de realização:
//   30 de setembro de 2026, às 09:00, horário de Brasília.
//
// A UNCISAL usa o mesmo formato, então o extrator é pelo formato, não pelo
// órgão. Pegadinha: AVISO DE REVOGAÇÃO (e de reabertura) repete o registro
// idêntico — o tipo só é distinguível pelo cabeçalho acima dele, por isso cada
// registro é classificado pelo último "AVISO DE ..." que o precede.
// ---------------------------------------------------------------------------

export type TipoAvisoLicitacao = 'licitacao' | 'reabertura' | 'revogacao' | 'adiamento' | 'suspensao' | 'outro'

export interface DoeAvisoLicitacao {
  tipo: TipoAvisoLicitacao
  processo: string // sem o prefixo "E:" — mesmo formato de `processo` no PNCP
  numeroPregao: string // ex: "AMGESP - 90.252/2026"
  orgaoSigla: string | null // ex: "AMGESP", tirado do número do pregão
  numeroContratacao: string | null
  objeto: string
  dataRealizacao: string | null // ISO, horário de Brasília
  pageNumber: number
  trecho: string
}

// Início de cada registro. Tolerante a acento perdido e a variações vistas
// ("n.º", "nº", "SRP", "Processo nº.", processo com e sem o prefixo "E:").
const PROCESSO = String.raw`Processo(?:\s*n\.?\s*[º°o]?\.?)?\s*:?\s*(?:E:\s?)?(\d{4,6}\.\d{6,12}\/\d{4})`
const MODALIDADE = String.raw`Modalidade\s*:\s*Preg[ãa]o\s+Eletr[ôo]nico\s*(?:SRP\s*)?n\.?\s*[º°o]?\.?\s*`

// Formato da AMGESP: "Processo: ...; Modalidade: Pregão Eletrônico n.º ...;"
const REGEX_REGISTRO_PROCESSO_PRIMEIRO = new RegExp(`${PROCESSO}\\s*;\\s*${MODALIDADE}([^;]{1,60}?)\\s*;`, 'gi')

// Formato da UNCISAL: uma linha por campo, modalidade antes do processo.
//   Modalidade: Pregão Eletrônico nº UNCISAL 83/2026
//   Processo: 41010.0000016784/2026
const REGEX_REGISTRO_MODALIDADE_PRIMEIRO = new RegExp(`${MODALIDADE}([^;\\n]{1,60}?)\\s*[;\\n]\\s*${PROCESSO}`, 'gi')

function encontrarInicios(texto: string): { index: number; processo: string; numeroPregao: string }[] {
  return [
    ...[...texto.matchAll(REGEX_REGISTRO_PROCESSO_PRIMEIRO)].map((m) => ({ index: m.index!, processo: m[1], numeroPregao: m[2] })),
    ...[...texto.matchAll(REGEX_REGISTRO_MODALIDADE_PRIMEIRO)].map((m) => ({ index: m.index!, processo: m[2], numeroPregao: m[1] })),
  ].sort((a, b) => a.index - b.index)
}

// Cabeçalho no começo de linha — sem a âncora de linha, frases corridas como
// "No AVISO DE LICITAÇÃO, PREGÃO ELETRÔNICO Nº ..." (errata) seriam lidas como
// cabeçalho.
const REGEX_CABECALHO = /^\s*AVISO\s+DE\s+([^\n]{0,60})/gim

const TAMANHO_MAX_REGISTRO = 1500

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

function classificarCabecalho(cabecalho: string): TipoAvisoLicitacao {
  const c = normalizarTexto(cabecalho)
  if (c.startsWith('reabertura')) return 'reabertura'
  if (c.startsWith('revogacao')) return 'revogacao'
  if (c.startsWith('adiamento')) return 'adiamento'
  if (c.startsWith('suspensao')) return 'suspensao'
  if (c.startsWith('licitacao')) return 'licitacao'
  return 'outro'
}

function extrairDataRealizacao(registro: string): string | null {
  const m = normalizarTexto(registro).match(
    // "de" antes do ano opcional — visto "13 de outubro 2026" em aviso real.
    /data\s+de\s+(?:realizacao|reabertura)\s*:\s*(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})(?:\s*,?\s*as\s*(\d{1,2})\s*[:h]\s*(\d{2})?)?/
  )
  if (!m) return null
  const mes = MESES[m[2]]
  if (!mes) return null
  const p = (n: string | number) => String(n).padStart(2, '0')
  return `${m[3]}-${p(mes)}-${p(m[1])}T${p(m[4] ?? 0)}:${p(m[5] ?? 0)}:00-03:00`
}

// Edição inteira num texto só: registro e cabeçalho podem estar em páginas
// diferentes (registro quebrado na virada da página, ou cabeçalho no fim da
// anterior). `paginaDe` devolve o número da página de uma posição do texto.
function juntarPaginas(paginas: DoePaginaTexto[]): { texto: string; paginaDe: (offset: number) => number } {
  let texto = ''
  const inicioPagina: { num: number; offset: number }[] = []
  for (const pagina of paginas) {
    inicioPagina.push({ num: pagina.num, offset: texto.length })
    texto += pagina.text + '\n'
  }
  const paginaDe = (offset: number) => {
    let num = inicioPagina[0]?.num ?? 1
    for (const p of inicioPagina) {
      if (p.offset > offset) break
      num = p.num
    }
    return num
  }
  return { texto, paginaDe }
}

export function extrairAvisosLicitacao(paginas: DoePaginaTexto[]): DoeAvisoLicitacao[] {
  const { texto, paginaDe } = juntarPaginas(paginas)

  const cabecalhos = [...texto.matchAll(REGEX_CABECALHO)].map((m) => ({ offset: m.index!, tipo: classificarCabecalho(m[1]) }))
  const inicios = encontrarInicios(texto)
  const avisos: DoeAvisoLicitacao[] = []

  inicios.forEach((m, i) => {
    const inicio = m.index
    const fim = Math.min(inicios[i + 1]?.index ?? texto.length, inicio + TAMANHO_MAX_REGISTRO)
    const registro = texto.slice(inicio, fim).replace(/\s+/g, ' ').trim()

    // Objeto termina em "Data de realização/reabertura" — o separador antes
    // varia (";" ou " - ").
    const objeto = registro.match(/Objeto\s*:\s*(.+?)\s*[;\-–]?\s*Data\s+de\s+(?:realiza|reabertura)/i)?.[1]
    if (!objeto) return

    let tipo: TipoAvisoLicitacao = 'outro'
    for (const c of cabecalhos) {
      if (c.offset > inicio) break
      tipo = c.tipo
    }

    const numeroPregao = m.numeroPregao.replace(/\s+/g, ' ').trim()
    avisos.push({
      tipo,
      processo: m.processo,
      numeroPregao,
      orgaoSigla: numeroPregao.match(/^([A-ZÀ-Ú]{2,})/)?.[1] ?? null,
      numeroContratacao: registro.match(/Contrata[çc][ãa]o\s*n\.?\s*[º°o]?\.?\s*(\d+\/\d{4})/i)?.[1] ?? null,
      objeto: objeto.trim(),
      dataRealizacao: extrairDataRealizacao(registro),
      pageNumber: paginaDe(inicio),
      trecho: registro.slice(0, 800),
    })
  })

  return avisos
}

// ---------------------------------------------------------------------------
// Avisos de cotação estaduais que não são aquisição judicial (SESAU, AMGESP,
// UNCISAL e outros órgãos) — adicionado em 2026-09-30.
//
// Motivo: comparando os boletins do ConLicitação de 23-25/09, esse era um
// canal que a gente não lia — dieta enteral emergencial da SESAU,
// equipamentos médico-hospitalares da AMGESP (Cotação AMGESP 169/2026),
// acessórios de monitor e de cardioversor, reagentes, medicamentos
// emergenciais. Detalhe em o log de validação (privado), "2026-09-29 (parte 2)".
//
// Cada edição traz de 14 a 49 "AVISO DE COTAÇÃO", a maioria de aquisição
// judicial (já lida pela frase-âncora, fica de fora daqui) e o resto de
// qualquer área (viaturas, softwares, rastreador). Por isso aqui a keyword
// filtra de verdade na tela; a tabela guarda todos, pra poder mudar keyword
// sem reler o PDF. Formatos vistos:
//
//   AVISO DE COTAÇÃO
//   A Secretaria de Estado da Saúde de Alagoas - SESAU/AL, por meio do seu
//   Setor de Compras, convoca empresas do ramo ... no prazo máximo de 05
//   (cinco) dias úteis ... processo: Processo: E:02000.0000041667/2026-
//   Aquisição EMERGENCIAL DE DIETA ENTERAL. Para solicitar o Termo de ...
//   Protocolo 1117369
//
//   AVISO DE COTAÇÃO AMGESP N. º 169/2026
//   À Agência de Modernização da Gestão de Processos - AMGESP, ...
//   Processo nº - E:04105.0000001632/2024
//   Objeto: AQUISIÇÃO DE EQUIPAMENTOS E ACESSÓRIOS MÉDICO - HOSPITALARES ...
//
//   AVISO DE COTAÇÃO DE PREÇOS
//   A UNCISAL ... estimativa de preços para: LOCAÇÃO DE IMÓVEL URBANO -
//   Proc. E:41010.0000016312/2026). ...
//
// Todo aviso termina em "Protocolo NNNNNNN", número único da publicação no
// diário — é a chave. O processo vem em vários formatos
// ("E:02000.0000041667/2026", "00000.0000019355/2026", "2000/16523/2024").
// ---------------------------------------------------------------------------

export interface DoeAvisoCotacao {
  protocolo: string | null
  orgao: string | null
  numeroCotacao: string | null // ex: "AMGESP 169/2026", quando o cabeçalho traz
  processo: string | null // sem o prefixo "E:"
  objeto: string | null
  corpo: string
  pageNumber: number
}

const REGEX_CABECALHO_COTACAO = /^[ \t]*AVISO\s+DE\s+COTA[ÇC][ÃA]O[^\n]*/gim
const REGEX_PROTOCOLO = /Protocolo\s+(\d{5,9})/i
const TAMANHO_MAX_COTACAO = 2500
const REGEX_PROCESSO_COTACAO = /(?:E:\s?)?(\d{4,6}\.\d{6,12}\/\d{4}|\d{3,5}\/\d{4,6}\/\d{4})/

// Onde o objeto termina — o que vem depois é instrução de envio e contato.
// "especi" e não "especifica": a extração do PDF perde a ligadura "fi"
// ("especiicações").
const FIM_OBJETO =
  /\s*(?:\.\s*)?(?:Para solicitar|Mais informa[çc][õo]es|Informa[çc][õo]es\s*:|As propostas|(?:O\s+)?prazo\s+(?:para|m[áa]ximo|de)|,?\s*conforme (?:as\s+)?(?:especi|termo|quantidades)|visando atender|Especi\S* t[ée]cnica|Macei[óo]\s*\/\s*AL,|Protocolo\s+\d)/i

function cortarObjeto(texto: string): string | null {
  const fim = texto.search(FIM_OBJETO)
  const objeto = (fim === -1 ? texto : texto.slice(0, fim))
    .slice(0, 400)
    .replace(/^[\s\-–:;)]+|[\s\-–;,.]+$/g, '')
  return objeto.length >= 5 ? objeto : null
}

function extrairObjetoCotacao(corpo: string): string | null {
  const rotulado = corpo.match(/Objeto\s*:\s*([\s\S]+)/i)
  if (rotulado) return cortarObjeto(rotulado[1])

  // UNCISAL: objeto antes do processo ("preços para: X - Proc. E:...").
  const antes = corpo.match(/pre[çc]os para\s*:\s*([\s\S]+?)\s*[-–]\s*Proc/i)
  if (antes) return cortarObjeto(antes[1])

  // SESAU e parecidos: objeto logo depois do número do processo.
  const processo = corpo.match(REGEX_PROCESSO_COTACAO)
  if (processo) return cortarObjeto(corpo.slice(processo.index! + processo[0].length))
  return null
}

// Quem publicou: a sigla depois do nome ("... de Alagoas - SESAU/AL"), senão o
// nome até o verbo ("O Departamento Estadual de Aviação informa ...").
function extrairOrgaoCotacao(corpo: string): string | null {
  const inicio = corpo.slice(0, 300)
  const sigla = inicio.match(/\s[-–]\s([A-Z]{3,}(?:\/[A-Z]{2})?)\b/)
  if (sigla) return sigla[1].replace(/\/AL$/, '')
  // Sem âncora de início: o cabeçalho às vezes continua na linha de baixo
  // ("AVISO DE COTAÇÃO SECRETARIA DE ESTADO DA CULTURA E / ECONOMIA CRIATIVA").
  const nome = inicio.match(
    /(?:^|\s)(?:A|O|À)\s+([A-ZÀ-Ú][^,]{2,89}?)(?:,|\s+(?:por meio|informa|torna|convoca|representad|inscrit|solicita))/
  )
  return nome ? nome[1].trim() : null
}

export function extrairAvisosCotacao(paginas: DoePaginaTexto[]): DoeAvisoCotacao[] {
  const { texto, paginaDe } = juntarPaginas(paginas)
  const cabecalhos = [...texto.matchAll(REGEX_CABECALHO_COTACAO)]
  const avisos: DoeAvisoCotacao[] = []

  cabecalhos.forEach((m, i) => {
    const inicio = m.index!
    let fim = Math.min(cabecalhos[i + 1]?.index ?? texto.length, inicio + TAMANHO_MAX_COTACAO)
    const protocolo = texto.slice(inicio, fim).match(REGEX_PROTOCOLO)
    if (protocolo) fim = inicio + protocolo.index! + protocolo[0].length

    const corpo = texto.slice(inicio, fim).replace(/\s+/g, ' ').trim()
    // Aquisição judicial já é lida pela frase-âncora (doe_al_matches): mesmo
    // critério de lá, a palavra "judicial" ou o e-mail cotacaojudicial.
    if (/judicial/.test(normalizarTexto(corpo))) return

    const cabecalho = m[0].replace(/\s+/g, ' ').trim()
    const semCabecalho = corpo.slice(cabecalho.length).trim()
    // Cabeçalho do tipo "AVISO DE COTAÇÃO AMGESP N. º 169/2026".
    const numero = cabecalho.match(/COTA[ÇC][ÃA]O\s+([A-Z]{3,})\s*N[.\s]*[º°o]?\s*\.?\s*(\d+\/\d{4})/i)

    avisos.push({
      protocolo: protocolo?.[1] ?? null,
      orgao: numero?.[1] ?? extrairOrgaoCotacao(semCabecalho),
      numeroCotacao: numero ? `${numero[1]} ${numero[2]}` : null,
      processo: semCabecalho.match(REGEX_PROCESSO_COTACAO)?.[1] ?? null,
      objeto: extrairObjetoCotacao(semCabecalho),
      corpo,
      pageNumber: paginaDe(inicio),
    })
  })

  return avisos
}
