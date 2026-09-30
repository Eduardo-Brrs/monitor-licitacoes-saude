import { sql } from '@/lib/db'

// Seção "Só nos diários" do boletim (decidido com o Eduardo em 2026-09-24):
// oportunidades que chegam pelos diários oficiais e não estão entre os
// editais do PNCP. Quatro fontes, quatro tabelas, uma lista só na tela:
//
//   judicial       doe_al_matches              aquisição judicial (DOE-AL)
//   doe_licitacao  doe_al_licitacoes           pregão estadual (AMGESP/UNCISAL)
//   doe_cotacao    doe_al_cotacoes             cotação estadual não judicial (DOE-AL, 2026-09-30)
//   municipal      diario_municipal_materias   AMA e Maceió
//
// Relevância (o que aparece sem clicar em "ver todos"): aquisição judicial e
// cotação da SMS de Maceió (processo 5800) sempre — são os "CP" do boletim do
// ConLicitação e não têm keyword útil no texto; o resto só com keyword.

export type FonteDiario = 'judicial' | 'doe_licitacao' | 'doe_cotacao' | 'municipal'

export const FONTES_DIARIO: FonteDiario[] = ['judicial', 'doe_licitacao', 'doe_cotacao', 'municipal']

export function idsPorFonteVazio(): Record<FonteDiario, number[]> {
  return { judicial: [], doe_licitacao: [], doe_cotacao: [], municipal: [] }
}

export interface AvisoDeDiario {
  chave: string // `${fonte}:${id}` — id sozinho colide entre as tabelas
  fonte: FonteDiario
  id: number
  tipo: string
  origem: string
  entidade: string | null
  texto: string
  processo: string | null
  dataSessao: string | null
  url: string
  keywords: string[]
  relevante: boolean
  visto: boolean
  favorito: boolean
  dia: string // YYYY-MM-DD da publicação
  descartado: boolean
  statusInterno: string | null
}

// Consultas por período (e não por dia) desde a tela de boletins anteriores
// (2026-09-28): ela precisa dos mesmos números do boletim pra um mês inteiro,
// e rodar a consulta do dia 22 vezes seriam ~90 idas ao banco. Por ids pro
// acompanhamento — aí sem os filtros de duplicata com o PNCP: aviso que a
// pessoa favoritou aparece sempre.
type Periodo = { inicio: string; fim: string }
type Filtro = Periodo | { ids: number[] }

function porIds(filtro: Filtro): filtro is { ids: number[] } {
  return 'ids' in filtro
}

function paraDia(valor: unknown): string {
  return new Date(valor as string).toISOString().slice(0, 10)
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Cada página do DOE com aquisição judicial junta vários avisos no mesmo
// formato ("... AQUISIÇÃO JUDICIAL DO MEDICAMENTO: X. Para solicitar o Termo
// de Referência..."). Na linha interessa só o X de cada um.
function itensDaAquisicaoJudicial(snippet: string): string {
  const itens = snippet
    .split(/\s\n\s/)
    .map((trecho) => {
      const m = trecho.match(/aquisi[çc][ãa]o judicial\s*(?:d[oae]s?\s+)?(.+?)(?:\.\s*para solicitar|$)/i)
      return (m ? m[1] : trecho).replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
  return [...new Set(itens)].join(' · ')
}

function tipoDaMateriaMunicipal(titulo: string, corpo: string): string {
  const t = normalizar(`${titulo} ${corpo.slice(0, 400)}`)
  if (/cotacao|pesquisa mercadologica|pesquisa de preco|orcamento/.test(t)) return 'Cotação'
  if (/dispensa|contratacao direta/.test(t)) return 'Dispensa'
  if (/pregao|licitacao/.test(t)) return 'Licitação'
  return 'Aviso'
}

// Sem objeto extraído, o que sobra é o corpo inteiro — que começa com o
// cabeçalho padrão ("ESTADO DE ALAGOAS PREFEITURA MUNICIPAL DE X <órgão>
// <título>"). Corta até a última repetição do título nesse cabeçalho, onde
// começa o texto de verdade.
function textoSemCabecalho(corpo: string, titulo: string): string {
  const cabecalho = normalizar(corpo.slice(0, 700))
  const posicao = cabecalho.lastIndexOf(normalizar(titulo))
  const inicio = posicao === -1 ? 0 : posicao + titulo.length
  return corpo.slice(inicio, inicio + 400).trim()
}

// Área do diário de Maceió com atos de empresa (balanço, licença ambiental) —
// não é compra pública mesmo quando bate keyword.
const ORGAO_NAO_COMPRA = /publica[çc][õo]es privadas/i

// Nome do diário na etiqueta de origem da linha.
const NOME_DIARIO_MUNICIPAL: Record<string, string> = {
  ama: 'Diário dos Municípios (AMA)',
  maceio: 'Diário de Maceió',
  maceiosaude: 'Diário do Maceió Saúde',
}

function entidadeMunicipal(diario: string, entidade: string, orgao: string | null): string {
  // Entidade do diário próprio do Maceió Saúde é o nome jurídico longo
  // ("SERVIÇO SOCIAL AUTÔNOMO DE SAÚDE DA CIDADE DE MACEIÓ"); quem compra é
  // quase sempre o Hospital da Cidade, que o texto cita.
  if (diario === 'maceiosaude') return 'Maceió Saúde (Hospital da Cidade e unidades)'
  const municipio = entidade.replace(/^Prefeitura Municipal de /i, '')
  // Em Maceió a entidade é sempre a prefeitura — o órgão é o que distingue
  // (SMS, ALICC...). Na AMA a prefeitura já é a informação útil.
  return diario === 'maceio' && orgao ? `${municipio} · ${orgao}` : municipio
}

const TIPO_LICITACAO_DOE: Record<string, string> = {
  licitacao: 'Pregão',
  reabertura: 'Reabertura',
  revogacao: 'Revogação',
  adiamento: 'Adiamento',
  suspensao: 'Suspensão',
}

// Aviso municipal que também está no PNCP já aparece na seção de editais —
// sem isso o pregão de Maceió que o PNCP trouxe apareceria duas vezes. O
// número do pregão no diário não é chave confiável, então a regra é
// conservadora: mesmo município e o número "N/ano" de um edital do PNCP
// citado no título ou no começo do texto. Só esconde quando bate de verdade.
async function chavesMunicipaisNoPncp(
  linhas: { id: number; municipio: string; texto: string }[],
  { inicio, fim }: Periodo
): Promise<Set<number>> {
  if (linhas.length === 0) return new Set()
  const municipios = [...new Set(linhas.map((l) => normalizar(l.municipio)))]
  // Janela em volta do período consultado (não de hoje), pra valer também
  // num mês antigo da tela de boletins anteriores. Diário e PNCP saem com
  // até algumas semanas de diferença pra qualquer lado.
  const editais = (await sql`
    SELECT municipio_nome, raw_json->>'numeroCompra' AS numero, ano_compra
    FROM editais
    WHERE data_publicacao_pncp BETWEEN ${inicio}::date - 60 AND ${fim}::date + 30
  `) as { municipio_nome: string; numero: string | null; ano_compra: number }[]

  const porMunicipio = new Map<string, { numero: string; ano: number }[]>()
  for (const e of editais) {
    const m = normalizar(e.municipio_nome ?? '')
    const numero = e.numero?.match(/\d+/)?.[0]
    if (!municipios.includes(m) || !numero) continue
    porMunicipio.set(m, [...(porMunicipio.get(m) ?? []), { numero: String(Number(numero)), ano: e.ano_compra }])
  }

  const noPncp = new Set<number>()
  for (const linha of linhas) {
    const candidatos = porMunicipio.get(normalizar(linha.municipio)) ?? []
    const texto = normalizar(linha.texto)
    const bate = candidatos.some(({ numero, ano }) =>
      new RegExp(`(^|[^0-9.])0*${numero}\\s*/\\s*${ano}(?![0-9])`).test(texto)
    )
    if (bate) noPncp.add(linha.id)
  }
  return noPncp
}

async function avisosJudiciais(filtro: Filtro): Promise<AvisoDeDiario[]> {
  const onde = porIds(filtro)
    ? sql`m.id = ANY(${filtro.ids})`
    : sql`m.publication_date BETWEEN ${filtro.inicio}::date AND ${filtro.fim}::date`
  const linhas = (await sql`
    SELECT m.id, m.snippet, m.processo_numero, m.page_number, m.edition_number, m.pdf_url,
           m.keywords_matched, m.publication_date, s.visto_em, s.favorito, s.descartado_em, s.status_interno
    FROM doe_al_matches m
    LEFT JOIN diario_status s ON s.fonte = 'judicial' AND s.aviso_id = m.id
    WHERE ${onde}
    ORDER BY m.page_number
  `) as Record<string, unknown>[]

  return linhas.map((l) => ({
    chave: `judicial:${l.id}`,
    fonte: 'judicial' as const,
    id: l.id as number,
    tipo: 'Aquisição judicial',
    origem: `DOE/AL · ed. ${l.edition_number} · p. ${l.page_number}`,
    entidade: 'AMGESP · Secretaria de Estado da Saúde',
    texto: itensDaAquisicaoJudicial(l.snippet as string),
    processo: ((l.processo_numero as string | null) ?? null)?.replace(/^E:/, '') ?? null,
    dataSessao: null,
    url: l.pdf_url as string,
    keywords: l.keywords_matched as string[],
    relevante: true,
    visto: l.visto_em !== null,
    favorito: Boolean(l.favorito),
    dia: paraDia(l.publication_date),
    descartado: l.descartado_em !== null,
    statusInterno: (l.status_interno as string | null) ?? null,
  }))
}

async function avisosLicitacaoDoe(filtro: Filtro): Promise<AvisoDeDiario[]> {
  const onde = porIds(filtro)
    ? sql`l.id = ANY(${filtro.ids})`
    : sql`l.publication_date BETWEEN ${filtro.inicio}::date AND ${filtro.fim}::date
      -- Pregão que o PNCP já trouxe está na seção de editais.
      AND NOT EXISTS (
        SELECT 1 FROM editais e
        WHERE regexp_replace(e.raw_json->>'processo', '^E:\\s*', '') = l.processo
      )`
  const linhas = (await sql`
    SELECT l.id, l.tipo, l.processo, l.numero_pregao, l.orgao_sigla, l.objeto, l.data_realizacao,
           l.keywords_matched, l.edition_number, l.page_number, l.pdf_url, l.publication_date,
           s.visto_em, s.favorito, s.descartado_em, s.status_interno
    FROM doe_al_licitacoes l
    LEFT JOIN diario_status s ON s.fonte = 'doe_licitacao' AND s.aviso_id = l.id
    WHERE ${onde}
    ORDER BY l.data_realizacao NULLS LAST, l.id
  `) as Record<string, unknown>[]

  return linhas.map((l) => {
    const keywords = l.keywords_matched as string[]
    const tipo = TIPO_LICITACAO_DOE[l.tipo as string] ?? 'Aviso'
    return {
      chave: `doe_licitacao:${l.id}`,
      fonte: 'doe_licitacao' as const,
      id: l.id as number,
      tipo,
      origem: `DOE/AL · ed. ${l.edition_number} · p. ${l.page_number}`,
      entidade: `Pregão ${l.numero_pregao}`,
      texto: l.objeto as string,
      processo: l.processo as string,
      dataSessao: l.data_realizacao ? new Date(l.data_realizacao as string).toISOString() : null,
      url: l.pdf_url as string,
      keywords,
      relevante: keywords.length > 0 && (l.tipo === 'licitacao' || l.tipo === 'reabertura'),
      visto: l.visto_em !== null,
      favorito: Boolean(l.favorito),
      dia: paraDia(l.publication_date),
      descartado: l.descartado_em !== null,
      statusInterno: (l.status_interno as string | null) ?? null,
    }
  })
}

// Nome por extenso dos órgãos que mais publicam cotação, pra linha do boletim
// não mostrar só a sigla.
const ORGAO_ESTADUAL: Record<string, string> = {
  SESAU: 'Secretaria de Estado da Saúde',
  AMGESP: 'AMGESP',
  UNCISAL: 'UNCISAL',
}

async function avisosCotacaoDoe(filtro: Filtro): Promise<AvisoDeDiario[]> {
  const onde = porIds(filtro)
    ? sql`c.id = ANY(${filtro.ids})`
    : sql`c.publication_date BETWEEN ${filtro.inicio}::date AND ${filtro.fim}::date
      -- Cotação cujo processo já virou edital no PNCP está na seção de editais.
      AND NOT EXISTS (
        SELECT 1 FROM editais e
        WHERE c.processo IS NOT NULL AND regexp_replace(e.raw_json->>'processo', '^E:\\s*', '') = c.processo
      )`
  const linhas = (await sql`
    SELECT c.id, c.orgao, c.numero_cotacao, c.processo, c.objeto, LEFT(c.corpo, 400) AS corpo, c.keywords_matched,
           c.prazo, c.edition_number, c.page_number, c.pdf_url, c.publication_date,
           s.visto_em, s.favorito, s.descartado_em, s.status_interno
    FROM doe_al_cotacoes c
    LEFT JOIN diario_status s ON s.fonte = 'doe_cotacao' AND s.aviso_id = c.id
    WHERE ${onde}
    ORDER BY c.page_number, c.id
  `) as Record<string, unknown>[]

  return linhas.map((l) => {
    const keywords = l.keywords_matched as string[]
    const orgao = (l.orgao as string | null) ?? null
    const nomeOrgao = orgao ? (ORGAO_ESTADUAL[orgao] ?? orgao) : 'Órgão estadual'
    return {
      chave: `doe_cotacao:${l.id}`,
      fonte: 'doe_cotacao' as const,
      id: l.id as number,
      tipo: 'Cotação',
      origem: `DOE/AL · ed. ${l.edition_number} · p. ${l.page_number}`,
      entidade: l.numero_cotacao ? `${nomeOrgao} · Cotação ${(l.numero_cotacao as string).replace(/^\S+\s/, '')}` : nomeOrgao,
      texto: (l.objeto as string | null) ?? (l.corpo as string),
      processo: (l.processo as string | null) ?? null,
      dataSessao: l.prazo ? new Date(l.prazo as string).toISOString() : null,
      url: l.pdf_url as string,
      keywords,
      relevante: keywords.length > 0,
      visto: l.visto_em !== null,
      favorito: Boolean(l.favorito),
      dia: paraDia(l.publication_date),
      descartado: l.descartado_em !== null,
      statusInterno: (l.status_interno as string | null) ?? null,
    }
  })
}

async function avisosMunicipais(filtro: Filtro): Promise<AvisoDeDiario[]> {
  const onde = porIds(filtro)
    ? sql`m.id = ANY(${filtro.ids})`
    : sql`m.data_circulacao BETWEEN ${filtro.inicio}::date AND ${filtro.fim}::date`
  // Só o começo do corpo: é o que a checagem de duplicata com o PNCP e o
  // texto sem cabeçalho usam (até ~1.100 caracteres), e num mês inteiro o
  // corpo completo seria megabytes à toa.
  const linhas = (await sql`
    SELECT m.id, m.diario, m.titulo, m.entidade, m.orgao, m.processo, m.objeto,
           LEFT(m.corpo, 1200) AS corpo, m.keywords_matched, m.edicao, m.url, m.data_circulacao, m.data_sessao,
           s.visto_em, s.favorito, s.descartado_em, s.status_interno
    FROM diario_municipal_materias m
    LEFT JOIN diario_status s ON s.fonte = 'municipal' AND s.aviso_id = m.id
    WHERE ${onde}
    ORDER BY m.id
  `) as Record<string, unknown>[]

  const noPncp = porIds(filtro)
    ? new Set<number>()
    : await chavesMunicipaisNoPncp(
        // Maceió Saúde fica de fora: é serviço social autônomo, não publica no
        // PNCP, e o número da cotação dele ("126/2026") batia com pregão da
        // prefeitura de mesmo número, escondendo o aviso (visto em 2026-09-30).
        linhas
          .filter((l) => l.diario !== 'maceiosaude')
          .map((l) => ({
            id: l.id as number,
            municipio: (l.entidade as string).replace(/^Prefeitura Municipal de /i, ''),
            texto: `${l.titulo} ${(l.corpo as string).slice(0, 600)}`,
          })),
        filtro
      )

  return linhas
    .filter((l) => !noPncp.has(l.id as number))
    .map((l) => {
      const keywords = l.keywords_matched as string[]
      const processo = (l.processo as string | null) ?? null
      const cotacaoSmsMaceio = l.diario === 'maceio' && processo?.startsWith('5800.') === true
      const corpo = l.corpo as string
      return {
        chave: `municipal:${l.id}`,
        fonte: 'municipal' as const,
        id: l.id as number,
        tipo: tipoDaMateriaMunicipal(l.titulo as string, corpo),
        origem: `${NOME_DIARIO_MUNICIPAL[l.diario as string] ?? 'Diário municipal'}${l.edicao ? ` · ed. ${l.edicao}` : ''}`,
        entidade: entidadeMunicipal(l.diario as string, l.entidade as string, l.orgao as string | null),
        texto: (l.objeto as string | null) ?? textoSemCabecalho(corpo, l.titulo as string),
        processo,
        // Extraída do texto na captura (lib/diario-municipal.ts, 2026-09-28).
        dataSessao: l.data_sessao ? new Date(l.data_sessao as string).toISOString() : null,
        url: l.url as string,
        keywords,
        relevante: (keywords.length > 0 || cotacaoSmsMaceio) && !ORGAO_NAO_COMPRA.test((l.orgao as string | null) ?? ''),
        visto: l.visto_em !== null,
        favorito: Boolean(l.favorito),
        dia: paraDia(l.data_circulacao),
        descartado: l.descartado_em !== null,
        statusInterno: (l.status_interno as string | null) ?? null,
      }
    })
}

// Todos os avisos do período, descartados inclusive (campo `descartado`).
export async function buscarAvisosDoPeriodo(inicio: string, fim: string): Promise<AvisoDeDiario[]> {
  const periodo = { inicio, fim }
  return (
    await Promise.all([
      avisosJudiciais(periodo),
      avisosLicitacaoDoe(periodo),
      avisosCotacaoDoe(periodo),
      avisosMunicipais(periodo),
    ])
  ).flat()
}

// Texto inteiro publicado, pra tela do aviso (/aviso/[fonte]/[id]). Na
// aquisição judicial são os trechos da página que citam a frase-âncora.
export async function textoCompletoDoAviso(fonte: FonteDiario, id: number): Promise<string | null> {
  const linhas = (
    fonte === 'judicial'
      ? await sql`SELECT snippet AS texto FROM doe_al_matches WHERE id = ${id}`
      : fonte === 'doe_licitacao'
        ? await sql`SELECT COALESCE(trecho, objeto) AS texto FROM doe_al_licitacoes WHERE id = ${id}`
        : fonte === 'doe_cotacao'
          ? await sql`SELECT corpo AS texto FROM doe_al_cotacoes WHERE id = ${id}`
          : await sql`SELECT corpo AS texto FROM diario_municipal_materias WHERE id = ${id}`
  ) as { texto: string | null }[]
  return linhas[0]?.texto ?? null
}

// Avisos específicos, por fonte — pro acompanhamento (favoritados/com status).
export async function buscarAvisosPorIds(ids: Record<FonteDiario, number[]>): Promise<AvisoDeDiario[]> {
  const vazio = Promise.resolve([] as AvisoDeDiario[])
  return (
    await Promise.all([
      ids.judicial.length ? avisosJudiciais({ ids: ids.judicial }) : vazio,
      ids.doe_licitacao.length ? avisosLicitacaoDoe({ ids: ids.doe_licitacao }) : vazio,
      ids.doe_cotacao.length ? avisosCotacaoDoe({ ids: ids.doe_cotacao }) : vazio,
      ids.municipal.length ? avisosMunicipais({ ids: ids.municipal }) : vazio,
    ])
  ).flat()
}

// Mesma ordem do boletim: não vistos primeiro; dentro disso relevantes antes
// e aquisição judicial no topo (prazo de cotação é curto).
const PESO_FONTE: Record<FonteDiario, number> = { judicial: 0, doe_cotacao: 1, municipal: 1, doe_licitacao: 2 }

export async function buscarAvisosDoDia(dia: string): Promise<AvisoDeDiario[]> {
  const todos = (await buscarAvisosDoPeriodo(dia, dia)).filter((aviso) => !aviso.descartado)

  return todos
    .sort(
      (a, b) =>
        Number(a.visto) - Number(b.visto) ||
        Number(b.relevante) - Number(a.relevante) ||
        PESO_FONTE[a.fonte] - PESO_FONTE[b.fonte]
    )
}

export async function buscarAvisosDescartadosDoDia(dia: string): Promise<AvisoDeDiario[]> {
  return (await buscarAvisosDoPeriodo(dia, dia)).filter((aviso) => aviso.descartado)
}

// Dias com aviso de diário, pra navegação do boletim considerar também dia
// sem edital do PNCP mas com aviso (ex: PNCP fora do ar).
export async function diasComAviso(): Promise<string[]> {
  const linhas = (await sql`
    SELECT publication_date AS dia FROM doe_al_matches
    UNION SELECT publication_date FROM doe_al_licitacoes
    UNION SELECT publication_date FROM doe_al_cotacoes
    UNION SELECT data_circulacao FROM diario_municipal_materias
  `) as { dia: string }[]
  return linhas.map((l) => new Date(l.dia).toISOString().slice(0, 10))
}

// Badge da caixa de entrada: relevantes não vistos dos últimos 7 dias. Janela
// em vez de acumulado (como nos editais) porque o backfill do DOE-AL trouxe
// meses de aquisição judicial de uma vez, e cotação de diário tem prazo de
// poucos dias — aviso de 3 semanas atrás não é mais "o que falta triar".
//
// Uma consulta só, porque roda em toda navegação (barra lateral). Mesma regra
// de relevância de cima, menos a checagem de duplicata municipal com o PNCP
// (heurística em JS, cara pra rodar aqui) — pode contar a mais um pregão
// municipal que também está nos editais, nunca a menos.
export async function contarAvisosNaoVistosRecentes(): Promise<number> {
  const linhas = (await sql`
    WITH vistos AS (SELECT fonte, aviso_id FROM diario_status WHERE visto_em IS NOT NULL OR descartado_em IS NOT NULL)
    SELECT
      (SELECT COUNT(*) FROM doe_al_matches m
        WHERE m.publication_date >= CURRENT_DATE - 7
          AND NOT EXISTS (SELECT 1 FROM vistos v WHERE v.fonte = 'judicial' AND v.aviso_id = m.id))
    + (SELECT COUNT(*) FROM doe_al_licitacoes l
        WHERE l.publication_date >= CURRENT_DATE - 7
          AND cardinality(l.keywords_matched) > 0 AND l.tipo IN ('licitacao', 'reabertura')
          AND NOT EXISTS (SELECT 1 FROM editais e WHERE regexp_replace(e.raw_json->>'processo', '^E:\\s*', '') = l.processo)
          AND NOT EXISTS (SELECT 1 FROM vistos v WHERE v.fonte = 'doe_licitacao' AND v.aviso_id = l.id))
    + (SELECT COUNT(*) FROM doe_al_cotacoes c
        WHERE c.publication_date >= CURRENT_DATE - 7
          AND cardinality(c.keywords_matched) > 0
          AND NOT EXISTS (SELECT 1 FROM editais e WHERE c.processo IS NOT NULL AND regexp_replace(e.raw_json->>'processo', '^E:\\s*', '') = c.processo)
          AND NOT EXISTS (SELECT 1 FROM vistos v WHERE v.fonte = 'doe_cotacao' AND v.aviso_id = c.id))
    + (SELECT COUNT(*) FROM diario_municipal_materias d
        WHERE d.data_circulacao >= CURRENT_DATE - 7
          AND (cardinality(d.keywords_matched) > 0 OR (d.diario = 'maceio' AND d.processo LIKE '5800.%'))
          AND COALESCE(d.orgao, '') NOT ILIKE '%publica%privada%'
          AND NOT EXISTS (SELECT 1 FROM vistos v WHERE v.fonte = 'municipal' AND v.aviso_id = d.id))
    AS n
  `) as { n: string | number }[]
  return Number(linhas[0].n)
}
