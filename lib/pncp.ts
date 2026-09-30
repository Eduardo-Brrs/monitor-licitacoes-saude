const BASE_CONSULTA = 'https://pncp.gov.br/api/consulta/v1'
const BASE_ARQUIVOS = 'https://pncp.gov.br/api/pncp/v1'

// Sem isso, se o PNCP travar sem responder (em vez de devolver um erro rápido
// tipo 504), o fetch fica pendurado até a função da Vercel estourar
// maxDuration e ser matada pela plataforma — nem cai no catch do /api/sync,
// então a falha nem chega a ser registrada em sync_runs. Achado ao vivo em
// 2026-09-02 (run das 16:15 UTC apareceu como "failure" no GitHub Actions
// sem nenhuma linha correspondente no banco).
const TIMEOUT_MS = 20_000

// Retry com backoff. O PNCP oscila entre responder normal (~1s) e devolver
// 502/503 de um request pro outro — confirmado ao vivo em 2026-09-22, quando
// 4 runs seguidos do cron falharam, o disparo manual seguinte também pegou um
// 502, e o disparo logo depois passou sem nenhuma mudança de código. Sem
// retry, um único 502 em qualquer página de qualquer modalidade aborta o run
// inteiro e zera o resultado.
const MAX_TENTATIVAS = 3
const BACKOFF_INICIAL_MS = 500

// Teto de tempo pra TODAS as tentativas de uma mesma chamada, checado antes de
// cada nova tentativa contando o pior caso dela (mais um TIMEOUT_MS inteiro).
// Existe por causa do maxDuration=60 das rotas: sem teto, 3 tentativas de 20s
// estourariam o limite da Vercel e a função seria morta antes de registrar a
// falha em sync_runs — o mesmo problema que o timeout de 20s resolveu em
// 2026-09-02. Em 25s o pior caso de uma chamada fica em ~25s, então até duas
// páginas sequenciais cabem nos 60s com folga.
//
// Efeito prático: falha rápida (502, conexão recusada) sobra orçamento e é
// repetida; falha por timeout consome o orçamento sozinha e não é. Isso bate
// com o comportamento observado — 502 é intermitente e passa na tentativa
// seguinte, enquanto timeout é outage de verdade do lado deles, que dura horas
// e não melhora repetindo 20s depois.
const ORCAMENTO_RETRY_MS = 25_000

// 5xx é instabilidade deles e 429 é rate limit (já visto ao bater muitas
// chamadas seguidas) — os dois costumam passar na tentativa seguinte. Erro 4xx
// de cliente é determinístico, repetir só gasta tempo.
function statusTransitorio(status: number): boolean {
  return status >= 500 || status === 429
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Limites de tempo de uma chamada. O padrão serve pros jobs (cron), que têm
// até 60s; a tela de detalhe passa um limite bem menor — quem está olhando a
// página não pode esperar 25s pelo PNCP fora do ar quando já temos a cópia
// salva pra mostrar (2026-09-24).
export interface LimitesPncp {
  timeoutMs?: number
  orcamentoMs?: number
}

async function fetchComTimeout(url: string, limites: LimitesPncp = {}): Promise<Response> {
  const timeoutMs = limites.timeoutMs ?? TIMEOUT_MS
  const orcamentoMs = limites.orcamentoMs ?? ORCAMENTO_RETRY_MS
  const inicio = Date.now()

  for (let tentativa = 1; ; tentativa++) {
    let resposta: Response | undefined
    let erro: unknown

    try {
      resposta = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (resposta.ok || !statusTransitorio(resposta.status)) return resposta
    } catch (err) {
      erro = err
    }

    const temOrcamento = Date.now() - inicio + timeoutMs <= orcamentoMs
    if (tentativa >= MAX_TENTATIVAS || !temOrcamento) {
      // Devolve a resposta de erro pro chamador montar a mensagem de sempre
      // (com status e corpo), em vez de inventar uma mensagem nova aqui.
      if (resposta) return resposta
      if (erro instanceof Error && erro.name === 'TimeoutError') {
        throw new Error(`PNCP não respondeu em ${timeoutMs / 1000}s (timeout): ${url}`)
      }
      throw erro
    }

    await esperar(BACKOFF_INICIAL_MS * 2 ** (tentativa - 1))
  }
}

export const MODALIDADE_PREGAO_ELETRONICO = 6
export const MODALIDADE_DISPENSA = 8

// Fonte única do que o sync realmente monitora — a interface mostra isso na
// faixa de filtros, então deixar a constante aqui evita a tela anunciar um
// filtro diferente do que o sync aplica de fato.
export const UF_MONITORADA = 'AL'

export const MODALIDADES_MONITORADAS = [
  { codigo: MODALIDADE_PREGAO_ELETRONICO, nome: 'Pregão Eletrônico' },
  { codigo: MODALIDADE_DISPENSA, nome: 'Dispensa' },
]

export interface PncpOrgaoEntidade {
  cnpj: string
  razaoSocial: string
  poderId?: string
  esferaId?: string
}

export interface PncpUnidadeOrgao {
  ufSigla: string
  ufNome?: string
  municipioNome: string
  codigoIbge?: string
  codigoUnidade?: string
  nomeUnidade?: string
}

export interface PncpContratacao {
  numeroControlePNCP: string
  numeroCompra: string
  anoCompra: number
  sequencialCompra: number
  processo?: string
  objetoCompra: string
  informacaoComplementar?: string | null
  modalidadeId: number
  modalidadeNome: string
  situacaoCompraId: number
  situacaoCompraNome: string
  srp: boolean
  valorTotalEstimado?: number | null
  dataPublicacaoPncp: string
  dataAberturaProposta?: string | null
  dataEncerramentoProposta?: string | null
  linkSistemaOrigem?: string | null
  orgaoEntidade: PncpOrgaoEntidade
  unidadeOrgao: PncpUnidadeOrgao
}

interface PncpBuscaResponse {
  data: PncpContratacao[]
  totalRegistros: number
  totalPaginas: number
  numeroPagina: number
  paginasRestantes: number
  empty: boolean
}

export interface BuscarContratacoesParams {
  dataInicial: string // YYYYMMDD
  dataFinal: string // YYYYMMDD
  codigoModalidadeContratacao: number
  uf?: string
  cnpj?: string
  codigoMunicipioIbge?: string
  codigoModoDisputa?: number
  codigoUnidadeAdministrativa?: string
  tamanhoPagina?: number // mínimo 10, máximo 50
}

export async function buscarContratacoes(
  params: BuscarContratacoesParams,
  pagina: number
): Promise<PncpBuscaResponse> {
  const searchParams = new URLSearchParams({
    dataInicial: params.dataInicial,
    dataFinal: params.dataFinal,
    codigoModalidadeContratacao: String(params.codigoModalidadeContratacao),
    pagina: String(pagina),
    tamanhoPagina: String(params.tamanhoPagina ?? 50),
  })

  if (params.uf) searchParams.set('uf', params.uf)
  if (params.cnpj) searchParams.set('cnpj', params.cnpj)
  if (params.codigoMunicipioIbge) searchParams.set('codigoMunicipioIbge', params.codigoMunicipioIbge)
  if (params.codigoModoDisputa) searchParams.set('codigoModoDisputa', String(params.codigoModoDisputa))
  if (params.codigoUnidadeAdministrativa) {
    searchParams.set('codigoUnidadeAdministrativa', params.codigoUnidadeAdministrativa)
  }

  const url = `${BASE_CONSULTA}/contratacoes/publicacao?${searchParams.toString()}`
  const res = await fetchComTimeout(url)

  if (!res.ok) {
    throw new Error(`PNCP respondeu ${res.status} ao buscar contratações: ${await res.text()}`)
  }

  return res.json()
}

// Percorre todas as páginas do período informado e retorna a lista completa.
export async function buscarTodasContratacoes(
  params: BuscarContratacoesParams
): Promise<PncpContratacao[]> {
  const todas: PncpContratacao[] = []
  let pagina = 1
  let totalPaginas = 1

  do {
    const resposta = await buscarContratacoes(params, pagina)
    todas.push(...resposta.data)
    totalPaginas = resposta.totalPaginas
    pagina++
  } while (pagina <= totalPaginas)

  return todas
}

// A resposta real traz "titulo" (o nome do arquivo); "nomeArquivo" não vem em
// todos os registros, por isso é opcional. Não existe campo de tamanho — a
// tela não tem como exibir peso do anexo sem baixar o arquivo antes.
export interface PncpArquivo {
  uri: string
  url: string
  sequencialDocumento: number
  nomeArquivo?: string
  titulo?: string
  tipoDocumentoNome?: string
  dataPublicacaoPncp?: string
  statusAtivo?: boolean
}

export async function buscarArquivos(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpArquivo[]> {
  const url = `${BASE_ARQUIVOS}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`
  const res = await fetchComTimeout(url, limites)

  if (!res.ok) {
    throw new Error(`PNCP respondeu ${res.status} ao buscar arquivos: ${await res.text()}`)
  }

  return res.json()
}

export interface PncpItem {
  numeroItem: number
  descricao: string
  materialOuServicoNome?: string
  quantidade?: number | null
  unidadeMedida?: string | null
  valorUnitarioEstimado?: number | null
  valorTotal?: number | null
  // true quando o órgão declarou orçamento sigiloso — explica valor zerado sem
  // que isso signifique "de graça".
  orcamentoSigiloso?: boolean
}

// O campo de classificação oficial (catalogo/CATMAT) quase nunca vem
// preenchido na prática (testado em editais reais de AL) — por isso o match
// aqui é feito na descrição do item, não por código de catálogo.
//
// Bug corrigido em 2026-09-28: sem `tamanhoPagina` o endpoint devolve só os
// 10 primeiros itens (edital com 47 itens vinha com 10) — a checagem em
// segundo plano e os "itens de interesse" só viam esses 10. Agora pede
// páginas grandes e segue enquanto vier página cheia.
const ITENS_POR_PAGINA = 500
const MAX_PAGINAS_ITENS = 10

export async function buscarItens(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpItem[]> {
  const todos: PncpItem[] = []
  for (let pagina = 1; pagina <= MAX_PAGINAS_ITENS; pagina++) {
    const url = `${BASE_ARQUIVOS}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${ITENS_POR_PAGINA}`
    const res = await fetchComTimeout(url, limites)

    if (!res.ok) {
      throw new Error(`PNCP respondeu ${res.status} ao buscar itens: ${await res.text()}`)
    }

    // Página depois da última vem vazia (200 sem itens ou 204 sem corpo).
    const texto = await res.text()
    const itens = texto.trim() === '' ? [] : (JSON.parse(texto) as PncpItem[])
    todos.push(...itens)
    if (itens.length < ITENS_POR_PAGINA) break
  }
  return todos
}

// ---------------------------------------------------------------------------
// Acompanhamento de edital (item 9 do MVP) — endpoints confirmados ao vivo em
// 2026-09-18 e 2026-09-28. Lista vazia vem de jeitos diferentes conforme o
// endpoint (404 nos contratos, 204 sem corpo nas atas), então os três
// normalizam "não tem" pra [].

// Itens com os campos de situação, que buscarItens ignora. situacaoCompraItem:
// 1 Em andamento, 2 Homologado, 3 Anulado/Revogado/Cancelado, 4 Deserto,
// 5 Fracassado (só 1 e 2 vistos até agora) — guardar o nome cru que vier.
export interface PncpItemSituacao extends PncpItem {
  situacaoCompraItem?: number
  situacaoCompraItemNome?: string
  temResultado?: boolean
  dataAtualizacao?: string
}

export interface PncpResultadoItem {
  numeroItem: number
  sequencialResultado?: number
  niFornecedor: string
  nomeRazaoSocialFornecedor: string
  valorUnitarioHomologado?: number | null
  valorTotalHomologado?: number | null
  quantidadeHomologada?: number | null
  dataResultado?: string | null
  dataCancelamento?: string | null
  situacaoCompraItemResultadoId?: number
  situacaoCompraItemResultadoNome?: string
}

export interface PncpContrato {
  sequencialContrato: number
  numeroContratoEmpenho?: string
  anoContrato?: number
  niFornecedor: string
  nomeRazaoSocialFornecedor: string
  valorGlobal?: number | null
  valorInicial?: number | null
  dataAssinatura?: string | null
  dataVigenciaInicio?: string | null
  dataVigenciaFim?: string | null
  objetoContrato?: string
  tipoContrato?: { nome?: string }
}

export interface PncpAta {
  sequencialAta: number
  numeroAtaRegistroPreco?: string
  anoAta?: number
  dataAssinatura?: string | null
  dataVigenciaInicio?: string | null
  dataVigenciaFim?: string | null
  cancelado?: boolean
  dataCancelamento?: string | null
}

async function lerListaOuVazia<T>(res: Response, oQue: string): Promise<T[]> {
  if (res.status === 404 || res.status === 204) return []
  if (!res.ok) throw new Error(`PNCP respondeu ${res.status} ao buscar ${oQue}: ${await res.text()}`)
  const texto = await res.text()
  if (texto.trim() === '') return []
  const json = JSON.parse(texto) as T[] | { data?: T[] }
  return Array.isArray(json) ? json : (json.data ?? [])
}

export async function buscarItensComSituacao(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpItemSituacao[]> {
  // Mesma chamada paginada de buscarItens — a resposta já traz os campos de
  // situação, só a tipagem é mais completa.
  return (await buscarItens(cnpj, ano, sequencial, limites)) as PncpItemSituacao[]
}

export async function buscarResultadosDoItem(
  cnpj: string,
  ano: number,
  sequencial: number,
  numeroItem: number,
  limites?: LimitesPncp
): Promise<PncpResultadoItem[]> {
  const url = `${BASE_ARQUIVOS}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${numeroItem}/resultados`
  return lerListaOuVazia<PncpResultadoItem>(await fetchComTimeout(url, limites), `resultado do item ${numeroItem}`)
}

export async function buscarContratosDaCompra(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpContrato[]> {
  const url = `${BASE_ARQUIVOS}/orgaos/${cnpj}/contratos/contratacao/${ano}/${sequencial}?pagina=1`
  return lerListaOuVazia<PncpContrato>(await fetchComTimeout(url, limites), 'contratos')
}

export async function buscarAtasDaCompra(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpAta[]> {
  const url = `${BASE_ARQUIVOS}/orgaos/${cnpj}/compras/${ano}/${sequencial}/atas?pagina=1`
  return lerListaOuVazia<PncpAta>(await fetchComTimeout(url, limites), 'atas')
}
