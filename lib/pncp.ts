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
// cada nova tentativa.
// Existe por causa do maxDuration=60 das rotas: sem teto, 3 tentativas de 20s
// estourariam o limite da Vercel e a função seria morta antes de registrar a
// falha em sync_runs — o mesmo problema que o timeout de 20s resolveu em
// 2026-09-02. Em 25s o pior caso de uma chamada fica em ~25s, então até duas
// páginas sequenciais cabem nos 60s com folga.
//
// Nova tentativa usa como limite o que sobra do orçamento (até TIMEOUT_MS), e
// só acontece se sobrar pelo menos TENTATIVA_MINIMA_MS. Antes exigia um
// TIMEOUT_MS inteiro livre, e isso deixava sem repetir o caso mais comum de
// "fetch failed": o PNCP às vezes não aceita a conexão nova e o Node desiste
// em 10s (UND_ERR_CONNECT_TIMEOUT) — 10s + 20s passava do orçamento, mas a
// tentativa seguinte costuma passar em poucos segundos (reproduzido em
// 2026-10-22; é o que derrubava a rodada das 20h do sync quase toda noite).
const ORCAMENTO_RETRY_MS = 25_000
const TENTATIVA_MINIMA_MS = 3_000

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

function tentativas(n: number): string {
  return n > 1 ? `${n} tentativas` : '1 tentativa'
}

async function fetchComTimeout(url: string, limites: LimitesPncp = {}): Promise<Response> {
  const timeoutMs = limites.timeoutMs ?? TIMEOUT_MS
  const orcamentoMs = limites.orcamentoMs ?? ORCAMENTO_RETRY_MS
  const inicio = Date.now()

  let limiteDaTentativa = timeoutMs

  for (let tentativa = 1; ; tentativa++) {
    let resposta: Response | undefined
    let erro: unknown

    try {
      // O corpo é lido aqui dentro porque o limite de tempo vale também pra
      // leitura dele: o PNCP às vezes manda o cabeçalho e trava no meio do
      // corpo, e o res.json() do chamador estourava fora deste try — sem
      // repetir e com a mensagem crua "The operation was aborted due to
      // timeout" na tela de status (sync de 2026-10-22 às 14h).
      const bruta = await fetch(url, { signal: AbortSignal.timeout(limiteDaTentativa) })
      const semCorpo = bruta.status === 204 || bruta.status === 205 || bruta.status === 304
      resposta = new Response(semCorpo ? null : await bruta.arrayBuffer(), {
        status: bruta.status,
        statusText: bruta.statusText,
        headers: bruta.headers,
      })
      if (resposta.ok || !statusTransitorio(resposta.status)) return resposta
    } catch (err) {
      erro = err
    }

    const espera = BACKOFF_INICIAL_MS * 2 ** (tentativa - 1)
    const sobra = orcamentoMs - (Date.now() - inicio) - espera
    if (tentativa >= MAX_TENTATIVAS || sobra < TENTATIVA_MINIMA_MS) {
      // Devolve a resposta de erro pro chamador montar a mensagem de sempre
      // (com status e corpo), em vez de inventar uma mensagem nova aqui.
      if (resposta) return resposta
      if (erro instanceof Error && erro.name === 'TimeoutError') {
        throw new Error(`PNCP não respondeu em ${Math.round((Date.now() - inicio) / 1000)}s (timeout, ${tentativas(tentativa)}): ${url}`)
      }
      const causa = (erro as { cause?: { code?: string } } | undefined)?.cause?.code
      if (causa === 'UND_ERR_CONNECT_TIMEOUT') {
        throw new Error(`PNCP não respondeu ao pedido de conexão (${tentativas(tentativa)}): ${url}`)
      }
      throw erro
    }

    await esperar(espera)
    limiteDaTentativa = Math.min(timeoutMs, sobra)
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
  pagina: number,
  limites?: LimitesPncp
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
  const res = await fetchComTimeout(url, limites)

  // Nenhuma compra no filtro: 204 sem corpo. Nunca acontecia no sync (AL
  // inteiro sempre tem compra), mas filtrando por cidade é comum (2026-10-23).
  if (res.status === 204) {
    return { data: [], totalRegistros: 0, totalPaginas: 0, numeroPagina: pagina, paginasRestantes: 0, empty: true }
  }

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

// Histórico da compra (2026-10-07, tela Andamento): uma linha por mudança
// que o órgão fez no PNCP. Sem parâmetro devolve tudo (testado: 107 de 107).
// A maior parte é ruído de publicação ("Item de Contratação / Inclusão"); o
// que interessa é documento novo depois da publicação (errata, aviso de
// adiamento, resposta a esclarecimento, ata da sessão) e retificação da
// contratação — o filtro fica em lib/acompanhamento-pncp.ts.
export interface PncpHistorico {
  logManutencaoDataInclusao: string
  categoriaLogManutencaoNome: string // Contratação, Documento de Contratação, Item de Contratação...
  tipoLogManutencaoNome: string // Inclusão, Retificação, Exclusão
  justificativa?: string | null
  documentoTipo?: string | null
  documentoTitulo?: string | null
  documentoSequencial?: number | null
  itemNumero?: number | null
}

export async function buscarHistoricoDaCompra(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpHistorico[]> {
  const url = `${BASE_ARQUIVOS}/orgaos/${cnpj}/compras/${ano}/${sequencial}/historico`
  return lerListaOuVazia<PncpHistorico>(await fetchComTimeout(url, limites), 'histórico')
}

// Uma compra só, pelo trio da chave — mesmo formato de /contratacoes/publicacao,
// então dá pra gravar com salvarEdital. Usado pelo "trazer pro sistema" da
// Pesquisa (2026-10-06).
export async function buscarCompra(
  cnpj: string,
  ano: number,
  sequencial: number,
  limites?: LimitesPncp
): Promise<PncpContratacao> {
  const url = `${BASE_CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}`
  const res = await fetchComTimeout(url, limites)
  if (!res.ok) throw new Error(`PNCP respondeu ${res.status} ao buscar a compra: ${await res.text()}`)
  return res.json()
}

// Busca do próprio portal pncp.gov.br (a que o site usa — não documentada,
// mesmo princípio da API do DOE-AL). Texto livre que olha também os itens,
// vários estados, modalidade, cidade (código IBGE) e "recebendo proposta".
// Testada em 2026-10-06: separador de lista é "|" (vírgula devolve 0), filtro
// de esfera não responde (filtrar do nosso lado), não tem filtro de data,
// tam_pagina=100 funciona. Datas vêm em horário de Brasília sem fuso.
const BASE_BUSCA = 'https://pncp.gov.br/api/search/'

export interface PncpResultadoPortal {
  numero_controle_pncp: string
  title: string
  description: string
  item_url: string
  orgao_cnpj: string
  orgao_nome: string
  unidade_nome?: string | null
  unidade_codigo?: string | null // UASG, ex.: 926703
  esfera_id: string | null // M, E, F (N = não se aplica)
  municipio_nome: string | null
  uf: string | null
  modalidade_licitacao_id: string | null
  modalidade_licitacao_nome: string | null
  numero?: string | null
  ano?: string | null
  data_publicacao_pncp: string | null
  data_fim_vigencia: string | null // fim do recebimento de propostas
  valor_global: number | null
  cancelado?: boolean
}

export interface BuscaPortalParams {
  q?: string
  ufs: string[]
  modalidades?: number[]
  municipioIbge?: string
  somenteAbertas: boolean
  pagina: number
  tamanhoPagina?: number
}

export async function buscarNoPortalPncp(
  params: BuscaPortalParams,
  limites?: LimitesPncp
): Promise<{ total: number; itens: PncpResultadoPortal[] }> {
  const busca = new URLSearchParams({
    tipos_documento: 'edital',
    ordenacao: '-data',
    pagina: String(params.pagina),
    tam_pagina: String(params.tamanhoPagina ?? 100),
    status: params.somenteAbertas ? 'recebendo_proposta' : 'todos',
  })
  if (params.q) busca.set('q', params.q)
  if (params.ufs.length) busca.set('ufs', params.ufs.join('|'))
  if (params.modalidades?.length) busca.set('modalidades', params.modalidades.join('|'))
  if (params.municipioIbge) busca.set('municipios', params.municipioIbge)

  const res = await fetchComTimeout(`${BASE_BUSCA}?${busca.toString()}`, limites)
  if (!res.ok) throw new Error(`PNCP respondeu ${res.status} na busca: ${(await res.text()).slice(0, 200)}`)
  const corpo = (await res.json()) as { total?: number; items?: PncpResultadoPortal[] }
  return { total: corpo.total ?? 0, itens: corpo.items ?? [] }
}
