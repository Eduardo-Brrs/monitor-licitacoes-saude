// Cliente pros diários oficiais municipais de Alagoas na plataforma SIGPub
// (diariomunicipal.com.br): o da AMA (Associação dos Municípios Alagoanos),
// onde publica a maioria das prefeituras do estado, e o de Maceió, que tem
// diário próprio na mesma plataforma. Adicionado em 2026-09-23 — ver
// o log de validação (privado), "2026-09-23 (parte 2)" e "(parte 3)".
//
// Por que: é backup pro PNCP nas quedas dele (cobre ~80% dos editais
// municipais que já pegamos, no mesmo dia ou no seguinte, às vezes antes) e
// traz uma etapa que o PNCP não mostra — a pesquisa de preço/aviso de cotação
// que a prefeitura publica ANTES da dispensa (ex: Rio Largo, cadeiras de rodas).
//
// Mesmo princípio do PNCP e do DOE-AL: é o que o próprio site usa. A busca
// avançada é GET sem captcha nem login e devolve um cartão por matéria
// (publicação individual) com código identificador único; o texto de cada
// matéria sai em HTML, sem precisar ler PDF.

const BASE = 'https://www.diariomunicipal.com.br'
const TIMEOUT_MS = 20_000
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; monitor-licitacoes-alagoas-medical)' }

export interface DiarioMunicipal {
  slug: string // caminho no site: diariomunicipal.com.br/{slug}
  nome: string
}

export const DIARIOS_MUNICIPAIS: DiarioMunicipal[] = [
  { slug: 'ama', nome: 'AMA' },
  { slug: 'maceio', nome: 'Maceió' },
  // Diário próprio do SSA Maceió Saúde, que administra o Hospital da Cidade
  // (HC). É onde saem as cotações do HC — os "CP/125", "CP/126" do boletim do
  // ConLicitação, que não estão no PNCP nem em outro diário. Achado em
  // 2026-09-30 pelo link "Diário Oficial" do site maceiosaude.com.
  { slug: 'maceiosaude', nome: 'Maceió Saúde' },
]

// Pausas antes de cada nova tentativa quando a conexão cai. Desde 26/09/2026
// o site derruba conexões vindas da Vercel ("fetch failed") numa das páginas
// da busca de pregão da AMA em quase toda rodada; daqui do Brasil a mesma
// busca passa. Timeout não é repetido: 20s a mais estouraria o maxDuration.
const PAUSAS_RETENTATIVA_MS = [1_500, 3_000]

async function fetchComTimeout(url: string): Promise<Response> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error(`Diário municipal não respondeu em ${TIMEOUT_MS / 1000}s (timeout): ${url}`)
      }
      if (tentativa >= PAUSAS_RETENTATIVA_MS.length) throw err
      await new Promise((r) => setTimeout(r, PAUSAS_RETENTATIVA_MS[tentativa]))
    }
  }
}

export interface CartaoMateria {
  codigo: string
  titulo: string
  entidade: string
  orgao: string | null
  dataCirculacao: string // YYYY-MM-DD
  edicao: number | null
}

const ENTIDADES_NOMEADAS: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', Agrave: 'À', ordm: 'º', ordf: 'ª', deg: '°',
  ndash: '–', mdash: '—',
}

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (e, nome) => ENTIDADES_NOMEADAS[nome] ?? e)
}

function htmlParaTexto(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function extrairCartoes(html: string): CartaoMateria[] {
  const cartoes: CartaoMateria[] = []
  for (const bloco of html.split('<li class="materia-card">').slice(1)) {
    const codigo = bloco.match(/\/materia\/([0-9A-F]+)"/)?.[1]
    const titulo = bloco.match(/materia-card__titulo">\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1]
    const entidade = bloco.match(/materia-card__entidade">([^<]*)</)?.[1]
    const data = bloco.match(/Circula[^<]*<\/dt>\s*<dd>\s*(\d{2})\/(\d{2})\/(\d{4})/)
    if (!codigo || !titulo || !entidade || !data) continue
    cartoes.push({
      codigo,
      titulo: htmlParaTexto(titulo),
      entidade: htmlParaTexto(entidade),
      orgao: bloco.match(/materia-card__orgao">([^<]*)</)?.[1] ? htmlParaTexto(bloco.match(/materia-card__orgao">([^<]*)</)![1]) : null,
      dataCirculacao: `${data[3]}-${data[2]}-${data[1]}`,
      edicao: Number(bloco.match(/Edi[çc][ãa]o<\/dt>\s*<dd>\s*(\d+)/)?.[1]) || null,
    })
  }
  return cartoes
}

const MAX_PAGINAS = 30 // segurança contra loop se a paginação deles quebrar

// Busca full-text no período (datas YYYY-MM-DD, inclusive), todas as páginas.
export async function buscarMaterias(
  diario: DiarioMunicipal,
  texto: string,
  dataInicio: string,
  dataFim: string
): Promise<CartaoMateria[]> {
  const todos: CartaoMateria[] = []
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const params = new URLSearchParams({
      'busca_avancada[texto]': texto,
      'busca_avancada[dataInicio]': dataInicio,
      'busca_avancada[dataFim]': dataFim,
      'busca_avancada[pagina]': String(pagina),
    })
    const url = `${BASE}/${diario.slug}/pesquisar?${params}`
    const res = await fetchComTimeout(url)
    if (!res.ok) throw new Error(`Diário ${diario.nome} respondeu ${res.status} na busca: ${url}`)
    const html = await res.text()
    const cartoes = extrairCartoes(html)
    todos.push(...cartoes)
    if (cartoes.length === 0 || !html.includes('rel="next"')) break
  }
  return todos
}

// Títulos de ato posterior à disputa (homologação, extrato, contrato...) —
// não são edital aberto, só geram ruído. Filtrados antes de baixar a matéria.
// Revogação/suspensão/errata também ficam de fora nesta primeira versão.
// Também fica de fora o que não é compra (acórdão/citação do conselho
// tributário, termo de fomento, chamamento público de cultura/OSC, instrução
// normativa) — visto no teste contra o diário de Maceió.
const TITULO_POSTERIOR =
  /homolog|resultado|extrato|s[úu]mula|ratifica|adjudica|contrato|\bata\b|notifica|revoga|errata|suspens|autoriza|anula|cancela|convoca[çc][ãa]o para assinatura|aditivo|apostilamento|penalidade|san[çc][ãa]o|julgamento|impugna|recurso|decis[ãa]o|portaria|decreto|\blei\b|ac[óo]rd[ãa]o|\bcita[çc][ãa]o|fomento|chamamento|instru[çc][ãa]o normativa|retifica/i

export function tituloEhAvisoAberto(titulo: string): boolean {
  return !TITULO_POSTERIOR.test(titulo)
}

export interface MateriaCompleta {
  corpo: string // texto da matéria, sem cabeçalho do site e sem rodapé de autenticação
  objeto: string | null
  processo: string | null
}

// Número do processo administrativo, quando dá pra achar — agrupa aviso e
// reaviso do mesmo processo. Em Maceió é o que liga a cotação da SMS ao
// "CP/5800.xxxxx" do boletim do ConLicitação (ex: "5800.93002.2026", CPAP).
export function extrairProcesso(texto: string): string | null {
  const m = texto.match(/processo(?:\s+administrativo)?\s*(?:n[º°o]?\.?|:)?\s*:?\s*([0-9][0-9./-]{5,30}[0-9])/i)
  return m ? m[1] : null
}

// "Secretaria/Fundo Municipal de Saúde" aparece no cabeçalho e no objeto de
// quase todo aviso da área e fazia a keyword ampla `saúde` bater em tudo
// (gráfica, software, internação...). Tirado só do texto que vai pro motor de
// keyword — o texto guardado fica inteiro.
//
// Mesmo problema com o nome do Maceió Saúde (2026-09-30): "SSA Maceió Saúde"
// aparece no objeto e fazia `saúde` bater na locação de carro sedan. E
// "Saúde e Segurança do Trabalho" é serviço de RH, não produto.
export function textoParaKeyword(materia: MateriaCompleta): string {
  return (materia.objeto ?? materia.corpo)
    .replace(/\b(?:secretaria|secret\.|fundo|s\.)\s*(?:municipal|mun\.|m\.)?\s*(?:de\s+)?sa[úu]de\b/gi, ' ')
    .replace(/\b(?:(?:SSA|servi[çc]o social aut[ôo]nomo)\s*(?:-\s*)?)?macei[óo]\s+sa[úu]de\b/gi, ' ')
    .replace(/\bservi[çc]o social aut[ôo]nomo de sa[úu]de\b/gi, ' ')
    .replace(/\bsa[úu]de e seguran[çc]a do trabalho\b/gi, ' ')
}

// Baixa o texto de uma matéria. O corpo começa em "ESTADO DE ALAGOAS" (todo
// cabeçalho de matéria começa assim, conferido nas 625 matérias da
// investigação) e termina em "Publicado por" — ou, quando falta (~5%), em
// "Código Identificador".
export async function baixarMateria(diario: DiarioMunicipal, codigo: string): Promise<MateriaCompleta> {
  const url = urlMateria(diario, codigo)
  const res = await fetchComTimeout(url)
  if (!res.ok) throw new Error(`Diário ${diario.nome} respondeu ${res.status} na matéria ${codigo}`)
  const texto = htmlParaTexto(await res.text())

  const inicio = texto.indexOf('ESTADO DE ALAGOAS')
  let fim = texto.indexOf('Publicado por', inicio)
  if (fim === -1) fim = texto.search(/C[óo]digo Identificador/i)
  const corpo = texto.slice(inicio === -1 ? 0 : inicio, fim === -1 ? undefined : fim).trim()

  return { corpo, objeto: extrairObjeto(corpo), processo: extrairProcesso(corpo) }
}

// Melhor esforço: a maioria dos avisos tem "Objeto:", mas cotação/pesquisa de
// preço costuma usar "visando à AQUISIÇÃO DE ..." ou "cujo objeto é ...".
// Quando nada bate, fica nulo e a keyword roda no corpo inteiro.
function extrairObjeto(corpo: string): string | null {
  const m =
    corpo.match(/objeto\s*(?:[:\-–]|é|e)\s*(.{15,600}?)(?=\s*(?:data|abertura|valor|prazo|local|disponibilidade|o edital|edital|sess[ãa]o|horário|informa[çc])\b|$)/i) ??
    corpo.match(/(?:visando|objetivando|que visa)\s*(?:à|a)?\s*((?:aquisi[çc][ãa]o|contrata[çc][ãa]o|fornecimento)\s.{10,500}?)(?=\s*(?:processo|para suprir|as especifica|data|$))/i)
  return m ? m[1].replace(/[\s.;,–-]+$/, '').trim() : null
}

export function urlMateria(diario: DiarioMunicipal, codigo: string): string {
  return `${BASE}/${diario.slug}/materia/${codigo}`
}

// ---------------------------------------------------------------------------
// Data da sessão / prazo de proposta (2026-09-28). Aviso municipal não tem
// campo de data — ela está no texto, em formatos variados, medidos nas 211
// matérias do banco: "Data da Disputa: 09 de outubro de 2026, às 09h15min",
// "Data de realização: 08 de outubro de 2026 às 08:00h", "sessão pública
// ocorrerá no dia 24/09/2026, às 13:00", "Abertura das Propostas: 08/10/2026
// às 09:00h", "DATA DO PREGÃO: 06 de outubro de 2026", e nas cotações da SMS
// de Maceió "até o dia 02/10/2026, oportunidade em que...".
//
// Só vale data ancorada numa dessas expressões (data solta no texto costuma
// ser de lei, decreto ou do próprio ato) e nunca antes da publicação.

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

const DATA = String.raw`(\d{1,2})\s*(?:[/.]\s*(\d{1,2})\s*[/.]\s*(\d{2,4})|de\s+([a-z]+)\s+(?:de\s+)?(\d{4}))`
const HORA = String.raw`(?:[^\d]{0,25}?(\d{1,2})\s*(?:h|:)\s*(\d{2})?)?`

// Da âncora mais forte (sessão/disputa) pra mais fraca (prazo de proposta).
const ANCORAS = [
  String.raw`data\s+(?:da|de|do)\s+(?:disputa|sess[aã]o|realiza[cç][aã]o|abertura|preg[aã]o|certame|licita[cç][aã]o)`,
  String.raw`sess[aã]o\s+(?:p[uú]blica|de\s+disputa)[^0-9]{0,40}?`,
  String.raw`abertura\s+(?:da\s+sess[aã]o|das\s+propostas|do\s+certame|dos\s+envelopes)`,
  String.raw`data\s*/\s*hor[aá]rio|data,?\s+hora\s+e\s+local|data\s+e\s+hora`,
  String.raw`(?:recebimento|envio|entrega|acolhimento)\s+(?:das\s+|de\s+)?propostas?[^0-9]{0,40}?`,
  String.raw`at[eé]\s+o\s+dia`,
]

function normalizarData(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function extrairDataSessao(corpo: string, publicadoEm: string): string | null {
  const texto = normalizarData(corpo)
  const piso = Date.parse(`${publicadoEm.slice(0, 10)}T00:00:00-03:00`)

  for (const ancora of ANCORAS) {
    const re = new RegExp(`(?:${ancora})[^0-9]{0,30}?(?:dia\s+)?${DATA}${HORA}`, 'g')
    for (const m of texto.matchAll(re)) {
      const dia = Number(m[1])
      const mes = m[2] ? Number(m[2]) : MESES[m[4] ?? '']
      let ano = Number(m[3] ?? m[5])
      if (ano < 100) ano += 2000
      if (!mes || dia < 1 || dia > 31 || mes > 12) continue

      const hora = m[6] !== undefined ? Number(m[6]) : null
      const minuto = m[7] !== undefined ? Number(m[7]) : 0
      const hh = hora !== null && hora < 24 ? String(hora).padStart(2, '0') : '12'
      const mm = hora !== null && hora < 24 ? String(minuto).padStart(2, '0') : '00'
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${hh}:${mm}:00-03:00`
      const instante = Date.parse(iso)
      if (Number.isNaN(instante) || instante < piso) continue
      // Mais de 6 meses à frente é quase certo que não é a sessão.
      if (instante - piso > 183 * 86_400_000) continue
      return new Date(instante).toISOString()
    }
  }
  return prazoRelativo(texto, publicadoEm)
}

// Cotação costuma dar prazo relativo: "prazo de 03 (três) dias úteis a partir
// desta publicação", "propostas: 05(cinco) dias". Conta a partir do dia da
// publicação (dia útil = seg-sex, sem feriado) e fecha às 18h de Maceió.
function prazoRelativo(texto: string, publicadoEm: string): string | null {
  const m = texto.match(
    /(?:prazo|propostas?)[^.]{0,80}?\b(\d{1,2})\s*(?:\([a-z\s]+\)\s*)?dias?(\s+uteis)?/
  )
  if (!m) return null
  const dias = Number(m[1])
  if (dias < 1 || dias > 30) return null

  const data = new Date(`${publicadoEm.slice(0, 10)}T12:00:00Z`)
  let restantes = dias
  while (restantes > 0) {
    data.setUTCDate(data.getUTCDate() + 1)
    const semana = data.getUTCDay()
    if (!m[2] || (semana !== 0 && semana !== 6)) restantes--
  }
  return new Date(`${data.toISOString().slice(0, 10)}T18:00:00-03:00`).toISOString()
}
