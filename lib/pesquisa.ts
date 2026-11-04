import { sql } from '@/lib/db'
import { buscarAvisosDoPeriodo, type AvisoDeDiario } from '@/lib/diarios'
import { comFusoDeBrasilia, diaEmMaceio } from '@/lib/formato'
import { encontrarPalavrasChave, SEGMENTOS, SEGMENTO_CAPTURA_AMPLA, TERMOS_COMPOSTOS } from '@/lib/keywords'
import { listarMunicipios } from '@/lib/municipios'
import { rotuloDoOrgao, siglaDoOrgao } from '@/lib/orgaos'
import { buscarNoPortalPncp, type PncpResultadoPortal } from '@/lib/pncp'
import { prazoEstimadoDispensa } from '@/lib/prazo'
import { ehStatusInterno, type StatusInterno } from '@/lib/acompanhamento-tipos'
import { proximoPrazo, type ResultadoPesquisa } from '@/lib/pesquisa-tipos'

export { proximoPrazo, type ResultadoPesquisa }

// Tela "Pesquisa de licitações" (tela 07, pedido do usuário em 2026-10-06 —
// o "Encontrar licitação" do ConLicitação). Junta duas coisas numa lista só:
//   - o que já está no sistema (editais do PNCP e avisos de diário), com
//     estrela, visto e status;
//   - a busca ao vivo do portal do PNCP, em qualquer estado, pra achar o que
//     a captura automática não pegou ("fora do sistema").
// Filtros vêm da URL (formulário GET): dá pra salvar a busca no favorito do
// navegador e o CSV usa exatamente a mesma consulta.

export const UFS_NORDESTE = ['AL', 'PE', 'SE', 'BA', 'PB', 'RN', 'CE', 'PI', 'MA']
export const TODAS_UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

export type Esfera = 'M' | 'E' | 'F'
export const ESFERAS: { valor: Esfera; rotulo: string }[] = [
  { valor: 'M', rotulo: 'Municipal' },
  { valor: 'E', rotulo: 'Estadual' },
  { valor: 'F', rotulo: 'Federal' },
]

export type GrupoModalidade = 'pregao' | 'dispensa' | 'outras'
export const MODALIDADES_PESQUISA: { valor: GrupoModalidade; rotulo: string }[] = [
  { valor: 'pregao', rotulo: 'Pregão' },
  { valor: 'dispensa', rotulo: 'Dispensa' },
  { valor: 'outras', rotulo: 'Outras (credenciamento, concorrência…)' },
]
// Códigos de modalidade do PNCP. Pregão inclui o presencial (7).
const CODIGOS_MODALIDADE: Record<GrupoModalidade, number[]> = {
  pregao: [6, 7],
  dispensa: [8],
  outras: [1, 2, 3, 4, 5, 9, 10, 11, 12, 13],
}

export type Origem = 'pncp' | 'judicial' | 'cotacao' | 'diario'
export const ORIGENS: { valor: Origem; rotulo: string }[] = [
  { valor: 'pncp', rotulo: 'PNCP' },
  { valor: 'judicial', rotulo: 'Aquisição judicial' },
  { valor: 'cotacao', rotulo: 'Cotação' },
  { valor: 'diario', rotulo: 'Outros avisos de diário' },
]

export type FiltroStatus = 'favorita' | StatusInterno
export const STATUS_PESQUISA: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: 'favorita', rotulo: 'Favorita' },
  { valor: 'gerenciada', rotulo: 'Gerenciada' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'finalizada', rotulo: 'Finalizada' },
  { valor: 'ganha', rotulo: 'Ganha' },
]

export const NOMES_SEGMENTOS = SEGMENTOS.map((s) => s.nome)
export function rotuloDoSegmento(nome: string): string {
  return nome === SEGMENTO_CAPTURA_AMPLA ? 'Captura ampla' : nome
}

// "Carregar mais" busca mais uma página de 100 do PNCP. Teto pra uma
// renderização não passar de ~3 chamadas em paralelo.
export const MAX_PAGINAS_PNCP = 3

export interface FiltrosPesquisa {
  enviado: boolean
  q: string
  exata: boolean
  segmentos: string[]
  ufs: string[]
  cidade: string
  esferas: Esfera[]
  orgao: string
  numero: string
  modalidades: GrupoModalidade[]
  origens: Origem[]
  pubDe: string | null
  pubAte: string | null
  abDe: string | null
  abAte: string | null
  abertas: boolean
  comAnexos: boolean
  status: FiltroStatus[]
  paginasPncp: number
}

type Parametros = Record<string, string | string[] | undefined>

function lista(params: Parametros, nome: string): string[] {
  const v = params[nome]
  return (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.trim()).filter(Boolean)
}
function texto(params: Parametros, nome: string): string {
  const v = params[nome]
  return (Array.isArray(v) ? v[0] : (v ?? '')).trim()
}
function data(params: Parametros, nome: string): string | null {
  const v = texto(params, nome)
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Formulário GET: checkbox desmarcado não manda nada, então "f=1" diz que o
// formulário foi enviado — sem ele (primeira visita) valem os padrões.
export function lerFiltros(params: Parametros): FiltrosPesquisa {
  const enviado = texto(params, 'f') === '1'
  const hoje = diaEmMaceio(new Date())

  let ufs = lista(params, 'uf').map((u) => u.toUpperCase()).filter((u) => TODAS_UFS.includes(u))
  const extra = texto(params, 'uf_extra').toUpperCase()
  if (TODAS_UFS.includes(extra) && !ufs.includes(extra)) ufs.push(extra)
  const atalhoUf = texto(params, 'ufs_atalho')
  if (atalhoUf === 'al') ufs = ['AL']
  if (atalhoUf === 'nordeste') ufs = [...UFS_NORDESTE]
  if (atalhoUf === 'todos') ufs = [...TODAS_UFS]
  if (!enviado && ufs.length === 0) ufs = ['AL']

  let pubDe = data(params, 'pub_de')
  let pubAte = data(params, 'pub_ate')
  const periodo = texto(params, 'periodo')
  if (periodo === 'hoje') [pubDe, pubAte] = [hoje, hoje]
  if (periodo === 'ontem') [pubDe, pubAte] = [somarDias(hoje, -1), somarDias(hoje, -1)]
  if (periodo === '7dias') [pubDe, pubAte] = [somarDias(hoje, -6), hoje]

  const esferas = lista(params, 'esfera').filter((e): e is Esfera => ['M', 'E', 'F'].includes(e))
  const modalidades = lista(params, 'mod').filter((m): m is GrupoModalidade =>
    ['pregao', 'dispensa', 'outras'].includes(m)
  )
  const origens = lista(params, 'origem').filter((o): o is Origem =>
    ['pncp', 'judicial', 'cotacao', 'diario'].includes(o)
  )

  return {
    enviado,
    q: texto(params, 'q'),
    exata: texto(params, 'exata') === '1',
    segmentos: lista(params, 'seg').filter((s) => NOMES_SEGMENTOS.includes(s)),
    ufs,
    cidade: texto(params, 'cidade'),
    esferas: enviado ? esferas : ['M', 'E', 'F'],
    orgao: texto(params, 'orgao'),
    numero: texto(params, 'numero'),
    modalidades: enviado ? modalidades : ['pregao', 'dispensa'],
    origens: enviado ? origens : ['pncp', 'judicial', 'cotacao', 'diario'],
    pubDe,
    pubAte,
    abDe: data(params, 'ab_de'),
    abAte: data(params, 'ab_ate'),
    abertas: enviado ? texto(params, 'abertas') === '1' : true,
    comAnexos: texto(params, 'anexos') === '1',
    status: lista(params, 'st').filter((s): s is FiltroStatus => s === 'favorita' || ehStatusInterno(s)),
    paginasPncp: Math.min(MAX_PAGINAS_PNCP, Math.max(1, Number(texto(params, 'mais')) || 1)),
  }
}

// Volta pra URL — "Carregar mais" e o link do CSV repetem a mesma busca.
export function paraQueryString(f: FiltrosPesquisa, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams()
  p.set('f', '1')
  if (f.q) p.set('q', f.q)
  if (f.exata) p.set('exata', '1')
  f.segmentos.forEach((s) => p.append('seg', s))
  f.ufs.forEach((u) => p.append('uf', u))
  if (f.cidade) p.set('cidade', f.cidade)
  f.esferas.forEach((e) => p.append('esfera', e))
  if (f.orgao) p.set('orgao', f.orgao)
  if (f.numero) p.set('numero', f.numero)
  f.modalidades.forEach((m) => p.append('mod', m))
  f.origens.forEach((o) => p.append('origem', o))
  if (f.pubDe) p.set('pub_de', f.pubDe)
  if (f.pubAte) p.set('pub_ate', f.pubAte)
  if (f.abDe) p.set('ab_de', f.abDe)
  if (f.abAte) p.set('ab_ate', f.abAte)
  if (f.abertas) p.set('abertas', '1')
  if (f.comAnexos) p.set('anexos', '1')
  f.status.forEach((s) => p.append('st', s))
  if (f.paginasPncp > 1) p.set('mais', String(f.paginasPncp))
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p.toString()
}

// ---------------------------------------------------------------------------


export interface ResultadoDaPesquisa {
  itens: ResultadoPesquisa[]
  noSistema: number
  soNoPncp: number
  pncp:
    | { estado: 'ok'; total: number; temMais: boolean }
    | { estado: 'falhou'; erro: string }
    | { estado: 'nao_consultado' }
  cidadeNaoEncontrada: boolean
}

function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
const soDigitos = (t: string) => t.replace(/\D/g, '')

// Keyword → segmento, pro filtro de segmentos. Termo composto entra no
// segmento do termo de frase equivalente.
const SEGMENTO_DO_COMPOSTO: Record<string, string> = {
  'equipamento + hospital': 'Equipamentos hospitalares',
  'gás + medicinal': 'Gases',
  'suplemento + alimentar': 'Dieta enteral/parenteral',
  'suplemento + saúde': 'Dieta enteral/parenteral',
}
function segmentosDasKeywords(keywords: string[]): Set<string> {
  const nomes = new Set<string>()
  for (const k of keywords) {
    const composto = SEGMENTO_DO_COMPOSTO[k]
    if (composto) nomes.add(composto)
    for (const s of SEGMENTOS) if (s.termos.includes(k)) nomes.add(s.nome)
  }
  return nomes
}
// Garante que todo composto tem segmento — keyword nova composta sem entrada
// aqui sumiria do filtro sem aviso.
for (const { rotulo } of TERMOS_COMPOSTOS) {
  if (!SEGMENTO_DO_COMPOSTO[rotulo]) console.warn(`[pesquisa] termo composto sem segmento: ${rotulo}`)
}

function criarBateTexto(f: FiltrosPesquisa): (alvo: string) => boolean {
  const q = normalizar(f.q).trim()
  if (!q) return () => true
  const termos = f.exata ? [q.replace(/^"|"$/g, '')] : q.split(/\s+/)
  return (alvo) => {
    const n = normalizar(alvo)
    return termos.every((t) => n.includes(t))
  }
}

// Código da unidade compradora (UASG) — é o "órgão 926703" que o
// ConLicitação mostra (2026-10-07). Só dígitos e curto demais pra ser CNPJ.
function ehCodigoUnidade(t: string): boolean {
  return /^\d{4,7}$/.test(t.trim())
}

function bateOrgao(f: FiltrosPesquisa, cnpj: string | null, nome: string | null, unidade?: string | null): boolean {
  if (!f.orgao) return true
  if (ehCodigoUnidade(f.orgao)) return (unidade ?? '').trim() === f.orgao.trim()
  const digitos = soDigitos(f.orgao)
  if (digitos.length >= 8) return soDigitos(cnpj ?? '').startsWith(digitos)
  const alvo = normalizar(`${nome ?? ''} ${siglaDoOrgao(cnpj, nome) ?? ''}`)
  return alvo.includes(normalizar(f.orgao))
}

// Número de edital e de processo comparados por grupos de dígitos, sem zero à
// esquerda e com qualquer pontuação (2026-10-07, o usuário não achou o ARSER
// "63/2026"): "PE 63/2026" acha o edital nº 63 de 2026, "5800.51825/2026" acha
// o processo "5800.051825.2026", "63/26" vale como 2026. Antes o campo só
// comparava o texto inteiro, e "63/2026" não batia com numeroCompra "63".
function gruposDeDigitos(t: string): string[] {
  return (t.match(/\d+/g) ?? []).map((g) => g.replace(/^0+(?=\d)/, ''))
}

function grupoIgual(digitado: string, campo: string): boolean {
  if (digitado === campo) return true
  // Ano com 2 dígitos.
  return digitado.length === 2 && /^20\d\d$/.test(campo) && campo.endsWith(digitado)
}

function contemSequencia(campo: string[], digitado: string[]): boolean {
  for (let i = 0; i + digitado.length <= campo.length; i++) {
    if (digitado.every((g, j) => grupoIgual(g, campo[i + j]))) return true
  }
  return false
}

// "numeros" = número do edital ("63/2026") e processo, comparados por grupo.
// "textos" = identificadores longos (número de controle do PNCP), só pelo
// texto ou pela sequência inteira de dígitos.
function bateNumero(
  f: FiltrosPesquisa,
  numeros: (string | null | undefined)[],
  textos: (string | null | undefined)[] = []
): boolean {
  if (!f.numero) return true
  const alvo = normalizar(f.numero)
  const grupos = gruposDeDigitos(f.numero)
  const digitos = soDigitos(f.numero)
  if (grupos.length === 0) return [...numeros, ...textos].some((c) => c && normalizar(c).includes(alvo))
  return (
    numeros.some((c) => c && contemSequencia(gruposDeDigitos(c), grupos)) ||
    textos.some((c) => c && (normalizar(c).includes(alvo) || (digitos.length >= 6 && soDigitos(c).includes(digitos))))
  )
}

// O que vai pro "q" da busca do portal quando só o número foi preenchido.
// Testado em 2026-10-07: o portal acha pelo processo inteiro
// ("5800.051825.2026") e pelo número solto ("63"), mas "63/2026" volta lixo
// ou nada. O filtro de número do nosso lado confere o resto.
function numeroParaPortal(numero: string): string | undefined {
  const grupos = numero.match(/\d+/g) ?? []
  if (grupos.length === 0) return numero.trim() || undefined
  const pareceProcesso = grupos.some((g, i) => g.length >= 4 && !(i === grupos.length - 1 && /^(19|20)\d\d$/.test(g)))
  return pareceProcesso ? numero.trim() : grupos[0]
}

function noIntervalo(dia: string | null, de: string | null, ate: string | null): boolean {
  if (!de && !ate) return true
  if (!dia) return false
  return (!de || dia >= de) && (!ate || dia <= ate)
}

function bateSegmento(f: FiltrosPesquisa, keywords: string[]): boolean {
  if (f.segmentos.length === 0) return true
  const dos = segmentosDasKeywords(keywords)
  return f.segmentos.some((s) => dos.has(s))
}

function bateStatus(f: FiltrosPesquisa, favorito: boolean, statusInterno: string | null): boolean {
  if (f.status.length === 0) return true
  return f.status.some((s) => (s === 'favorita' ? favorito : statusInterno === s))
}

function grupoDaModalidade(id: number | null): GrupoModalidade {
  if (id === 6 || id === 7) return 'pregao'
  if (id === 8) return 'dispensa'
  return 'outras'
}

const ROTULO_ESFERA: Record<string, string> = { M: 'municipal', E: 'estadual', F: 'federal' }


function ordenar(itens: ResultadoPesquisa[]): ResultadoPesquisa[] {
  const prazo = (i: ResultadoPesquisa) => {
    const v = proximoPrazo(i)
    return v ? Date.parse(v) : Number.MAX_SAFE_INTEGER
  }
  return itens.sort((a, b) => prazo(a) - prazo(b) || (b.publicadoEm ?? '').localeCompare(a.publicadoEm ?? ''))
}

// --- Editais do sistema -----------------------------------------------------

type LinhaEdital = Record<string, unknown>

const COLUNAS_EDITAL = sql`
  e.id, e.numero_controle_pncp, e.objeto_compra, e.orgao_razao_social, e.orgao_cnpj, e.municipio_nome, e.uf,
  e.modalidade_id, e.modalidade_nome, e.raw_json->>'numeroCompra' AS numero_compra, e.raw_json->>'processo' AS processo,
  e.raw_json->'unidadeOrgao'->>'codigoUnidade' AS codigo_unidade,
  e.raw_json->'orgaoEntidade'->>'esferaId' AS esfera, e.ano_compra, e.valor_total_estimado, e.data_publicacao_pncp,
  e.data_abertura_proposta, e.data_encerramento_proposta, e.keywords_matched,
  jsonb_array_length(e.arquivos_json) AS anexos,
  (SELECT string_agg(i->>'descricao', ' ') FROM jsonb_array_elements(COALESCE(e.itens_json, '[]'::jsonb)) i) AS itens_texto,
  a.texto AS anotacao, COALESCE(s.favorito, FALSE) AS favorito, s.visto_em, s.status_interno
`

function prazoDoEdital(l: LinhaEdital): { abertura: string | null; estimado: string | null; limite: string | null } {
  const abertura = (l.data_abertura_proposta as string | null) ?? null
  const encerramento = (l.data_encerramento_proposta as string | null) ?? null
  const estimado = prazoEstimadoDispensa({
    modalidade: l.modalidade_nome as string | null,
    aberturaProposta: abertura,
    encerramentoProposta: encerramento,
    publicacao: l.data_publicacao_pncp as string | null,
  })
  return { abertura, estimado, limite: encerramento ?? abertura ?? estimado }
}

function resultadoDoEdital(l: LinhaEdital): ResultadoPesquisa {
  const { abertura, estimado } = prazoDoEdital(l)
  const numero = l.numero_compra ? `nº ${l.numero_compra}/${l.ano_compra}` : null
  const anexos = l.anexos === null ? null : Number(l.anexos)
  return {
    chave: `pncp:${l.numero_controle_pncp}`,
    tipo: 'pncp',
    itemId: l.id as number,
    numeroControlePncp: l.numero_controle_pncp as string,
    etiqueta: 'PNCP',
    judicial: false,
    titulo: l.objeto_compra as string,
    href: `/edital/${encodeURIComponent(l.numero_controle_pncp as string)}`,
    externo: false,
    metadados: [
      rotuloDoOrgao(l.orgao_cnpj as string | null, l.orgao_razao_social as string | null),
      l.municipio_nome && l.uf ? `${l.municipio_nome}/${l.uf}` : (l.municipio_nome as string | null),
      [l.modalidade_nome, numero].filter(Boolean).join(' '),
      l.processo ? `processo ${l.processo}` : null,
      anexos === null ? null : anexos === 0 ? 'sem anexo' : `${anexos} ${anexos === 1 ? 'anexo' : 'anexos'}`,
    ].filter(Boolean) as string[],
    valor: l.valor_total_estimado === null || Number(l.valor_total_estimado) === 0 ? null : Number(l.valor_total_estimado),
    abertura,
    encerramento: (l.data_encerramento_proposta as string | null) ?? null,
    prazoEstimado: abertura ? null : estimado,
    publicadoEm: l.data_publicacao_pncp ? diaEmMaceio(new Date(l.data_publicacao_pncp as string)) : null,
    favorito: Boolean(l.favorito),
    visto: l.visto_em !== null,
    statusInterno: ehStatusInterno(l.status_interno) ? l.status_interno : null,
  }
}

function editalPassa(f: FiltrosPesquisa, l: LinhaEdital, bateTexto: (t: string) => boolean, agora: number): boolean {
  if (!f.ufs.includes(String(l.uf))) return false
  if (!f.modalidades.includes(grupoDaModalidade(l.modalidade_id as number | null))) return false
  const esfera = l.esfera as string | null
  if (esfera && ['M', 'E', 'F'].includes(esfera) && !f.esferas.includes(esfera as Esfera)) return false
  if (f.cidade && normalizar(String(l.municipio_nome ?? '')) !== normalizar(f.cidade)) return false
  if (!bateOrgao(f, l.orgao_cnpj as string | null, l.orgao_razao_social as string | null, l.codigo_unidade as string | null))
    return false
  const numeroEdital = l.numero_compra ? `${l.numero_compra}/${l.ano_compra}` : null
  if (!bateNumero(f, [numeroEdital, l.processo as string | null], [l.numero_controle_pncp as string])) return false
  if (f.comAnexos && !(Number(l.anexos) > 0)) return false
  if (!bateSegmento(f, l.keywords_matched as string[])) return false
  if (!bateStatus(f, Boolean(l.favorito), l.status_interno as string | null)) return false

  const { limite } = prazoDoEdital(l)
  if (f.abertas && !(limite && Date.parse(limite) >= agora)) return false
  const pub = l.data_publicacao_pncp ? diaEmMaceio(new Date(l.data_publicacao_pncp as string)) : null
  if (!noIntervalo(pub, f.pubDe, f.pubAte)) return false
  const ab = limite ? diaEmMaceio(new Date(limite)) : null
  if (!noIntervalo(ab, f.abDe, f.abAte)) return false

  const sigla = siglaDoOrgao(l.orgao_cnpj as string | null, l.orgao_razao_social as string | null)
  return bateTexto(
    [
      l.objeto_compra, l.orgao_razao_social, sigla, l.municipio_nome, l.numero_compra, l.processo,
      l.numero_controle_pncp, (l.keywords_matched as string[]).join(' '), l.itens_texto, l.anotacao,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

// --- Avisos de diário -------------------------------------------------------

const DIAS_PRAZO_AVISO = 5

function origemDoAviso(a: AvisoDeDiario): Origem {
  if (a.fonte === 'judicial') return 'judicial'
  if (a.fonte === 'doe_cotacao' || a.tipo === 'Cotação') return 'cotacao'
  return 'diario'
}

// Mesma regra do boletim: cotação e aquisição judicial sem data contam como
// publicação + 5 dias.
function prazoDoAviso(a: AvisoDeDiario): { abertura: string | null; estimado: string | null } {
  if (a.dataSessao) return { abertura: a.dataSessao, estimado: null }
  if (a.fonte === 'judicial' || a.tipo === 'Cotação') {
    return { abertura: null, estimado: new Date(`${somarDias(a.dia, DIAS_PRAZO_AVISO)}T18:00:00-03:00`).toISOString() }
  }
  return { abertura: null, estimado: null }
}

function avisoPassa(
  f: FiltrosPesquisa,
  a: AvisoDeDiario,
  anotacao: string | undefined,
  bateTexto: (t: string) => boolean,
  agora: number,
  hoje: string
): boolean {
  if (!f.ufs.includes('AL')) return false
  if (!f.origens.includes(origemDoAviso(a))) return false
  const esfera: Esfera = a.fonte === 'municipal' ? 'M' : 'E'
  if (!f.esferas.includes(esfera)) return false
  if (f.cidade) {
    if (a.fonte !== 'municipal') return false
    if (!normalizar(a.entidade ?? '').startsWith(normalizar(f.cidade))) return false
  }
  if (f.orgao && !normalizar(a.entidade ?? '').includes(normalizar(f.orgao))) return false
  if (!bateNumero(f, [a.processo, a.origem], [a.entidade])) return false
  if (f.comAnexos) return false
  if (!bateSegmento(f, a.keywords)) return false
  if (!bateStatus(f, a.favorito, a.statusInterno)) return false

  const { abertura, estimado } = prazoDoAviso(a)
  const limite = abertura ?? estimado
  // Aviso sem data nenhuma: "aberto" se saiu na última semana.
  if (f.abertas && !(limite ? Date.parse(limite) >= agora : a.dia >= somarDias(hoje, -7))) return false
  if (!noIntervalo(a.dia, f.pubDe, f.pubAte)) return false
  if (!noIntervalo(limite ? diaEmMaceio(new Date(limite)) : null, f.abDe, f.abAte)) return false

  return bateTexto(
    [a.tipo, a.origem, a.entidade, a.texto, a.processo, a.keywords.join(' '), anotacao].filter(Boolean).join(' ')
  )
}

function resultadoDoAviso(a: AvisoDeDiario): ResultadoPesquisa {
  const { abertura, estimado } = prazoDoAviso(a)
  return {
    chave: a.chave,
    tipo: a.fonte,
    itemId: a.id,
    numeroControlePncp: null,
    etiqueta: a.tipo,
    judicial: a.fonte === 'judicial',
    titulo: a.texto,
    href: `/aviso/${a.fonte}/${a.id}`,
    externo: false,
    metadados: [a.entidade, a.origem, `publicado ${a.dia.slice(8, 10)}/${a.dia.slice(5, 7)}`].filter(Boolean) as string[],
    valor: null,
    abertura,
    encerramento: null,
    prazoEstimado: estimado,
    publicadoEm: a.dia,
    favorito: a.favorito,
    visto: a.visto,
    statusInterno: ehStatusInterno(a.statusInterno) ? a.statusInterno : null,
  }
}

// --- PNCP ao vivo ---------------------------------------------------------

// Página pública do edital no portal.
function linkDoPortal(r: PncpResultadoPortal): string {
  return `https://pncp.gov.br/app/editais${r.item_url.replace(/^\/compras/, '')}`
}

function resultadoDoPortal(r: PncpResultadoPortal): ResultadoPesquisa {
  const prazo = comFusoDeBrasilia(r.data_fim_vigencia)
  const esfera = r.esfera_id && r.esfera_id !== 'M' ? ROTULO_ESFERA[r.esfera_id] : null
  return {
    chave: `fora:${r.numero_controle_pncp}`,
    tipo: 'fora',
    itemId: null,
    numeroControlePncp: r.numero_controle_pncp,
    etiqueta: 'PNCP',
    judicial: false,
    titulo: r.description,
    href: linkDoPortal(r),
    externo: true,
    metadados: [
      rotuloDoOrgao(r.orgao_cnpj, r.orgao_nome),
      r.municipio_nome && r.uf ? `${r.municipio_nome}/${r.uf}` : r.municipio_nome,
      [r.modalidade_licitacao_nome, r.numero && r.ano ? `nº ${r.numero}/${r.ano}` : null].filter(Boolean).join(' '),
      esfera,
    ].filter(Boolean) as string[],
    valor: r.valor_global && r.valor_global > 0 ? r.valor_global : null,
    abertura: null,
    encerramento: prazo,
    prazoEstimado: null,
    publicadoEm: r.data_publicacao_pncp ? r.data_publicacao_pncp.slice(0, 10) : null,
    favorito: false,
    visto: false,
    statusInterno: null,
  }
}

function portalPassa(f: FiltrosPesquisa, r: PncpResultadoPortal, cidadeResolvida: boolean): boolean {
  if (r.cancelado) return false
  // Só no PNCP não tem anexo contado, status nem favorito nosso.
  if (f.comAnexos || f.status.length > 0) return false
  const esfera = r.esfera_id
  const todasEsferas = f.esferas.length === 3
  if (!todasEsferas && !(esfera && f.esferas.includes(esfera as Esfera))) return false
  if (f.cidade && !cidadeResolvida && normalizar(r.municipio_nome ?? '') !== normalizar(f.cidade)) return false
  if (!bateOrgao(f, r.orgao_cnpj, r.orgao_nome, r.unidade_codigo)) return false
  const numeroEdital = r.numero && r.ano ? `${r.numero}/${r.ano}` : null
  if (!bateNumero(f, [numeroEdital], [r.numero_controle_pncp])) return false
  if (!noIntervalo(r.data_publicacao_pncp?.slice(0, 10) ?? null, f.pubDe, f.pubAte)) return false
  if (!noIntervalo(r.data_fim_vigencia?.slice(0, 10) ?? null, f.abDe, f.abAte)) return false
  if (f.segmentos.length > 0) {
    // Mesmo motor de keyword da captura, no objeto que o portal devolve.
    if (!bateSegmento(f, encontrarPalavrasChave(`${r.description}`))) return false
  }
  return true
}

function modalidadesDoPortal(f: FiltrosPesquisa): number[] | undefined {
  if (f.modalidades.length === 3) return undefined
  return f.modalidades.flatMap((m) => CODIGOS_MODALIDADE[m])
}

// ---------------------------------------------------------------------------

export async function pesquisar(f: FiltrosPesquisa): Promise<ResultadoDaPesquisa> {
  const agora = Date.now()
  const hoje = diaEmMaceio(new Date())
  const bateTexto = criarBateTexto(f)

  // Cidade → código IBGE pro filtro do portal.
  let municipioIbge: string | undefined
  let cidadeNaoEncontrada = false
  if (f.cidade) {
    const municipios = await listarMunicipios(f.ufs.length <= 9 ? f.ufs : [])
    const achado = municipios.find((m) => normalizar(m.nome) === normalizar(f.cidade))
    municipioIbge = achado?.ibge
    cidadeNaoEncontrada = municipios.length > 0 && !achado
  }

  const consultarPortal = f.origens.includes('pncp') && f.ufs.length > 0 && f.modalidades.length > 0
  const q = f.q
    ? f.exata
      ? `"${f.q.replace(/"/g, '')}"`
      : f.q
    : f.numero
      ? numeroParaPortal(f.numero)
      : undefined

  const [editaisBruto, avisos, anotacoesAvisos, portal] = await Promise.all([
    f.origens.includes('pncp')
      ? (sql`
          SELECT ${COLUNAS_EDITAL}
          FROM editais e
          LEFT JOIN edital_status s ON s.edital_id = e.id
          LEFT JOIN LATERAL (
            SELECT string_agg(n.texto, ' ') AS texto FROM notas n
            WHERE n.fonte = 'pncp' AND n.item_id = e.id AND n.apagada_em IS NULL
          ) a ON TRUE
          WHERE e.uf = ANY(${f.ufs})
        ` as Promise<LinhaEdital[]>)
      : Promise.resolve([] as LinhaEdital[]),
    f.ufs.includes('AL') && f.origens.some((o) => o !== 'pncp')
      ? buscarAvisosDoPeriodo('2000-01-01', hoje)
      : Promise.resolve([] as AvisoDeDiario[]),
    sql`
      SELECT fonte, item_id, string_agg(texto, ' ') AS texto FROM notas
      WHERE fonte <> 'pncp' AND apagada_em IS NULL
      GROUP BY fonte, item_id
    ` as Promise<LinhaEdital[]>,
    consultarPortal
      ? Promise.allSettled(
          Array.from({ length: f.paginasPncp }, (_, i) =>
            buscarNoPortalPncp(
              {
                q,
                ufs: f.ufs,
                modalidades: modalidadesDoPortal(f),
                municipioIbge,
                somenteAbertas: f.abertas,
                pagina: i + 1,
              },
              // Quem está na tela não espera os 25s do cron.
              { timeoutMs: 10_000, orcamentoMs: 14_000 }
            )
          )
        )
      : Promise.resolve(null),
  ])

  const itens: ResultadoPesquisa[] = []
  const chaves = new Set<string>()
  const adicionar = (r: ResultadoPesquisa) => {
    if (chaves.has(r.chave)) return
    chaves.add(r.chave)
    itens.push(r)
  }

  for (const l of editaisBruto) {
    if (f.modalidades.length > 0 && editalPassa(f, l, bateTexto, agora)) adicionar(resultadoDoEdital(l))
  }

  const notas = new Map(anotacoesAvisos.map((n) => [`${n.fonte}:${n.item_id}`, String(n.texto)]))
  for (const a of avisos) {
    if (avisoPassa(f, a, notas.get(a.chave), bateTexto, agora, hoje)) adicionar(resultadoDoAviso(a))
  }

  let pncp: ResultadoDaPesquisa['pncp'] = { estado: 'nao_consultado' }
  let soNoPncp = 0
  if (portal) {
    const ok = portal.filter((p) => p.status === 'fulfilled').map((p) => p.value)
    const falha = portal.find((p): p is PromiseRejectedResult => p.status === 'rejected')
    if (ok.length === 0 && falha) {
      pncp = { estado: 'falhou', erro: falha.reason instanceof Error ? falha.reason.message : String(falha.reason) }
    } else {
      const total = ok[0]?.total ?? 0
      pncp = { estado: 'ok', total, temMais: f.paginasPncp * 100 < total && f.paginasPncp < MAX_PAGINAS_PNCP }
      const doPortal = ok.flatMap((p) => p.itens)

      // O que o portal achou e já está no sistema vira linha do sistema —
      // inclusive quando a nossa busca de texto não pegou (o portal olha os
      // itens com outro motor).
      const numeros = doPortal.map((r) => r.numero_controle_pncp)
      const jaNoSistema = numeros.length
        ? ((await sql`
            SELECT ${COLUNAS_EDITAL}
            FROM editais e
            LEFT JOIN edital_status s ON s.edital_id = e.id
            LEFT JOIN LATERAL (
            SELECT string_agg(n.texto, ' ') AS texto FROM notas n
            WHERE n.fonte = 'pncp' AND n.item_id = e.id AND n.apagada_em IS NULL
          ) a ON TRUE
            WHERE e.numero_controle_pncp = ANY(${numeros})
          `) as LinhaEdital[])
        : []
      const porNumero = new Map(jaNoSistema.map((l) => [l.numero_controle_pncp as string, l]))

      for (const r of doPortal) {
        const doSistema = porNumero.get(r.numero_controle_pncp)
        if (doSistema) {
          // Texto o portal já conferiu; o resto dos filtros vale igual.
          if (editalPassa(f, doSistema, () => true, agora)) adicionar(resultadoDoEdital(doSistema))
        } else if (portalPassa(f, r, Boolean(municipioIbge))) {
          adicionar(resultadoDoPortal(r))
          soNoPncp++
        }
      }
    }
  }

  return {
    itens: ordenar(itens),
    noSistema: itens.length - soNoPncp,
    soNoPncp,
    pncp,
    cidadeNaoEncontrada,
  }
}
