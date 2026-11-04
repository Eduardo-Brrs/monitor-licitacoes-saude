import { sql } from '@/lib/db'
import { comFusoDeBrasilia, formatarDataHora, nomeDeArquivoLegivel, paraData } from '@/lib/formato'
import {
  buscarAtasDaCompra,
  buscarCompra,
  buscarContratosDaCompra,
  buscarHistoricoDaCompra,
  buscarItensComSituacao,
  buscarResultadosDoItem,
  type LimitesPncp,
  type PncpContratacao,
  type PncpHistorico,
} from '@/lib/pncp'

// Acompanhamento automático (item 9 do MVP, 2026-09-28). A situação geral da
// compra no PNCP fica em "Divulgada no PNCP" pra sempre (169 de 170 editais
// em 22/09, e os homologados também) — o que muda de verdade é:
//   - a situação de cada item (Em andamento -> Homologado / Deserto / ...)
//   - o resultado por item (vencedor, CNPJ, valor homologado)
//   - ata de registro de preços (pregão SRP) e contrato assinado
// Isso vira um retrato (editais.acompanhamento_json) e uma linha do tempo só
// de acréscimo (edital_eventos).
//
// Tela "Andamento" (2026-10-07): entra também o histórico da compra
// (documento novo depois da publicação, retificação) e a comparação das datas
// e da situação da compra com o que está gravado — adiamento vira "Abertura
// alterada" e a linha do edital passa a ter a data nova.

// CNPJ da empresa (env CNPJ_EMPRESA), só dígitos. Resultado ou contrato com ele
// vira sugestão de "ganha" — nunca escrita automática (regra 6 do DESIGN.md).
const CNPJ_EMPRESA = (process.env.CNPJ_EMPRESA ?? '').replace(/\D/g, '')
export const NOME_EMPRESA = process.env.NOME_EMPRESA ?? 'sua empresa'

// Sem CNPJ configurado nada é "nosso" — fornecedor sem CNPJ vem como ''.
export function ehCnpjDaEmpresa(cnpj: string): boolean {
  return CNPJ_EMPRESA !== '' && cnpj === CNPJ_EMPRESA
}

export interface ResultadoSalvo {
  fornecedor: string
  cnpj: string
  valorUnitario: number | null
  valorTotal: number | null
  quantidade: number | null
  data: string | null
  situacao: string | null
  cancelado: boolean
}

export interface ItemSalvo {
  numero: number
  descricao: string
  situacaoId: number | null
  situacao: string | null
  atualizadoEm: string | null
  temResultado: boolean
  resultados: ResultadoSalvo[] | null // null = ainda não buscado
}

export interface ContratoSalvo {
  sequencial: number
  numero: string | null
  fornecedor: string
  cnpj: string
  valorGlobal: number | null
  assinatura: string | null
  vigenciaFim: string | null
  tipo: string | null
}

export interface AtaSalva {
  sequencial: number
  numero: string | null
  assinatura: string | null
  vigenciaFim: string | null
  cancelada: boolean
}

export interface RetratoPncp {
  itens: ItemSalvo[]
  contratos: ContratoSalvo[]
  atas: AtaSalva[]
  // Itens com resultado ainda não buscado (edital grande que não coube no
  // tempo de uma rodada) — a próxima continua de onde parou.
  resultadosPendentes: number
}

// Situação da compra enquanto nada aconteceu — 169 de 170 editais em 22/09.
const SITUACAO_DIVULGADA = 'Divulgada no PNCP'

const SITUACAO_EM_ANDAMENTO = 1
const SITUACAO_HOMOLOGADO = 2

// ---------------------------------------------------------------------------
// Verificação

export interface EditalParaVerificar {
  id: number
  orgaoCnpj: string
  anoCompra: number
  sequencialCompra: number
}

export interface ResultadoVerificacao {
  completo: boolean
  eventosNovos: number
  erro: string | null
}

const PAUSA_ENTRE_CHAMADAS_MS = 250

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mapearResultado(r: import('@/lib/pncp').PncpResultadoItem): ResultadoSalvo {
  return {
    fornecedor: r.nomeRazaoSocialFornecedor,
    cnpj: (r.niFornecedor ?? '').replace(/\D/g, ''),
    valorUnitario: r.valorUnitarioHomologado ?? null,
    valorTotal: r.valorTotalHomologado ?? null,
    quantidade: r.quantidadeHomologada ?? null,
    data: r.dataResultado ?? null,
    situacao: r.situacaoCompraItemResultadoNome ?? null,
    cancelado: Boolean(r.dataCancelamento),
  }
}

// Consulta itens, atas e contratos e o resultado dos itens que mudaram desde
// o último retrato. `orcamentoMs` limita o tempo gasto nos resultados (um por
// item): o que não couber fica pendente pra próxima rodada, e o retrato
// parcial é salvo mesmo assim.
export async function verificarEdital(
  edital: EditalParaVerificar,
  orcamentoMs: number,
  limites?: LimitesPncp
): Promise<ResultadoVerificacao> {
  const inicio = Date.now()
  const { orgaoCnpj: cnpj, anoCompra: ano, sequencialCompra: seq } = edital

  await sql`UPDATE editais SET acompanhamento_tentado_em = NOW() WHERE id = ${edital.id}`

  try {
    const [anteriorBruto] = (await sql`
      SELECT acompanhamento_json, data_abertura_proposta, data_encerramento_proposta, situacao_nome
      FROM editais WHERE id = ${edital.id}
    `) as (GravadoDaCompra & { acompanhamento_json: RetratoPncp | null })[]
    const anterior = anteriorBruto?.acompanhamento_json ?? null
    const itensAnteriores = new Map((anterior?.itens ?? []).map((i) => [i.numero, i]))

    const itensPncp = await buscarItensComSituacao(cnpj, ano, seq, limites)
    // Histórico e compra são extras da tela Andamento: se um deles falhar, o
    // resto da verificação (resultado, ata, contrato) continua valendo.
    const [atasPncp, contratosPncp, historico, compra] = await Promise.all([
      buscarAtasDaCompra(cnpj, ano, seq, limites),
      buscarContratosDaCompra(cnpj, ano, seq, limites),
      buscarHistoricoDaCompra(cnpj, ano, seq, limites).catch(() => null),
      buscarCompra(cnpj, ano, seq, limites).catch(() => null),
    ])

    const itens: ItemSalvo[] = []
    let pendentes = 0
    for (const it of itensPncp) {
      const antes = itensAnteriores.get(it.numeroItem)
      const mudou = !antes || antes.atualizadoEm !== (it.dataAtualizacao ?? null) || antes.resultados === null
      let resultados: ResultadoSalvo[] | null = antes?.resultados ?? null

      if (!it.temResultado) {
        resultados = []
      } else if (mudou) {
        if (Date.now() - inicio < orcamentoMs) {
          resultados = (await buscarResultadosDoItem(cnpj, ano, seq, it.numeroItem, limites)).map(mapearResultado)
          await esperar(PAUSA_ENTRE_CHAMADAS_MS)
        } else {
          pendentes++
          // Mantém o resultado antigo (se houver) e marca o item como não
          // atualizado, pra próxima rodada tentar de novo.
          itens.push({
            numero: it.numeroItem,
            descricao: it.descricao,
            situacaoId: it.situacaoCompraItem ?? null,
            situacao: it.situacaoCompraItemNome ?? null,
            atualizadoEm: antes?.atualizadoEm ?? null,
            temResultado: true,
            resultados: antes?.resultados ?? null,
          })
          continue
        }
      }

      itens.push({
        numero: it.numeroItem,
        descricao: it.descricao,
        situacaoId: it.situacaoCompraItem ?? null,
        situacao: it.situacaoCompraItemNome ?? null,
        atualizadoEm: it.dataAtualizacao ?? null,
        temResultado: Boolean(it.temResultado),
        resultados,
      })
    }

    const retrato: RetratoPncp = {
      itens: itens.sort((a, b) => a.numero - b.numero),
      contratos: contratosPncp.map((c) => ({
        sequencial: c.sequencialContrato,
        numero: c.numeroContratoEmpenho ?? null,
        fornecedor: c.nomeRazaoSocialFornecedor,
        cnpj: (c.niFornecedor ?? '').replace(/\D/g, ''),
        valorGlobal: c.valorGlobal ?? c.valorInicial ?? null,
        assinatura: c.dataAssinatura ?? null,
        vigenciaFim: c.dataVigenciaFim ?? null,
        tipo: c.tipoContrato?.nome ?? null,
      })),
      atas: atasPncp.map((a) => ({
        sequencial: a.sequencialAta,
        numero: a.numeroAtaRegistroPreco ?? null,
        assinatura: a.dataAssinatura ?? null,
        vigenciaFim: a.dataVigenciaFim ?? null,
        cancelada: Boolean(a.cancelado),
      })),
      resultadosPendentes: pendentes,
    }

    const completo = pendentes === 0
    await sql`
      UPDATE editais
      SET acompanhamento_json = ${JSON.stringify(retrato)}::jsonb,
          acompanhamento_erro = NULL,
          acompanhamento_em = CASE WHEN ${completo} THEN NOW() ELSE acompanhamento_em END
      WHERE id = ${edital.id}
    `

    const eventos = [...eventosDoRetrato(retrato)]
    if (historico) eventos.push(...eventosDoHistorico(historico))
    if (compra && anteriorBruto) {
      eventos.push(...mudancasDaCompra(anteriorBruto, compra, ultimaRetificacao(historico)))
      await atualizarDadosDaCompra(edital.id, compra)
    }
    const eventosNovos = await gravarEventos(edital.id, eventos)
    return { completo, eventosNovos, erro: null }
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err)
    await sql`UPDATE editais SET acompanhamento_erro = ${erro.slice(0, 500)} WHERE id = ${edital.id}`
    return { completo: false, eventosNovos: 0, erro }
  }
}

// ---------------------------------------------------------------------------
// Linha do tempo

interface EventoNovo {
  chave: string
  tipo: string
  descricao: string
  dataFato: string | null
  dados?: unknown
}

function maiorData(datas: (string | null | undefined)[]): string | null {
  const validas = datas.filter((d): d is string => Boolean(d)).sort()
  return validas.length ? validas[validas.length - 1] : null
}

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

// Fatos que o retrato mostra. A chave inclui a contagem, então "3 de 10
// homologados" e depois "10 de 10" viram dois eventos — a linha do tempo
// mostra a evolução, e nada é reescrito.
export function eventosDoRetrato(retrato: RetratoPncp): EventoNovo[] {
  const eventos: EventoNovo[] = []
  const total = retrato.itens.length

  const homologados = retrato.itens.filter((i) => i.situacaoId === SITUACAO_HOMOLOGADO)
  if (homologados.length > 0) {
    eventos.push({
      chave: `homologados:${homologados.length}`,
      tipo: 'homologacao',
      descricao:
        total === 1
          ? 'Item homologado'
          : homologados.length === total
            ? `Todos os ${total} itens homologados`
            : `${homologados.length} de ${total} itens homologados`,
      dataFato: maiorData(homologados.flatMap((i) => (i.resultados ?? []).map((r) => r.data))),
    })
  }

  // Outras situações de item (deserto, fracassado, cancelado...) — nome cru
  // do PNCP, sem interpretar (regra 5).
  const outras = new Map<string, ItemSalvo[]>()
  for (const item of retrato.itens) {
    if (item.situacaoId === null || item.situacaoId === SITUACAO_EM_ANDAMENTO || item.situacaoId === SITUACAO_HOMOLOGADO) continue
    const nome = item.situacao ?? `situação ${item.situacaoId}`
    outras.set(nome, [...(outras.get(nome) ?? []), item])
  }
  for (const [nome, itens] of outras) {
    eventos.push({
      chave: `situacao_item:${nome}:${itens.length}`,
      tipo: 'situacao_item',
      descricao: `${plural(itens.length, 'item', 'itens')} com situação “${nome}”`,
      dataFato: maiorData(itens.map((i) => i.atualizadoEm)),
    })
  }

  const ganhos = itensGanhos(retrato)
  if (ganhos.length > 0) {
    eventos.push({
      chave: `ganhos:${ganhos.length}`,
      tipo: 'vitoria',
      descricao: `${NOME_EMPRESA} venceu ${plural(ganhos.length, 'item', 'itens')}`,
      dataFato: maiorData(ganhos.flatMap((i) => (i.resultados ?? []).map((r) => r.data))),
      dados: { itens: ganhos.map((i) => i.numero) },
    })
  }

  for (const ata of retrato.atas) {
    eventos.push({
      chave: `ata:${ata.sequencial}`,
      tipo: 'ata',
      descricao: `Ata de registro de preços${ata.numero ? ` nº ${ata.numero}` : ''} assinada`,
      dataFato: ata.assinatura,
    })
    if (ata.cancelada) {
      eventos.push({
        chave: `ata_cancelada:${ata.sequencial}`,
        tipo: 'ata',
        descricao: `Ata de registro de preços${ata.numero ? ` nº ${ata.numero}` : ''} cancelada`,
        dataFato: null,
      })
    }
  }

  for (const c of retrato.contratos) {
    const nosso = ehCnpjDaEmpresa(c.cnpj)
    eventos.push({
      chave: `contrato:${c.sequencial}`,
      tipo: nosso ? 'vitoria' : 'contrato',
      descricao: `Contrato${c.numero ? ` nº ${c.numero}` : ''} assinado com ${nosso ? NOME_EMPRESA : c.fornecedor}`,
      dataFato: c.assinatura,
      dados: { valorGlobal: c.valorGlobal },
    })
  }

  return eventos
}

// --- Histórico da compra -------------------------------------------------

// Documento incluído até 1h depois da publicação é o pacote original do
// edital (medido em 07/10: o órgão sobe edital, TR e anexos em poucos
// minutos), não movimentação.
const JANELA_PUBLICACAO_MS = 60 * 60 * 1000

function instante(valor: string): number {
  return Date.parse(comFusoDeBrasilia(valor) as string)
}

function inicioDaCompra(historico: PncpHistorico[]): number {
  const inclusao = historico
    .filter((h) => h.categoriaLogManutencaoNome === 'Contratação' && h.tipoLogManutencaoNome === 'Inclusão')
    .map((h) => instante(h.logManutencaoDataInclusao))
  return Math.min(...(inclusao.length ? inclusao : historico.map((h) => instante(h.logManutencaoDataInclusao))))
}

function tituloDoDocumento(h: PncpHistorico): string {
  const titulo = nomeDeArquivoLegivel(h.documentoTitulo ?? '')
    .replace(/\.(pdf|zip|docx?|xlsx?|odt|rar)$/i, '')
    .replace(/_+/g, ' ')
    .trim()
  const tipo = h.documentoTipo && h.documentoTipo !== 'Outros Documentos' ? h.documentoTipo : null
  if (tipo && titulo) return `${tipo} (${titulo})`
  return tipo ?? (titulo || 'documento')
}

const ACAO_DOCUMENTO: Record<string, string> = {
  Inclusão: 'Novo documento',
  Retificação: 'Documento substituído',
  Exclusão: 'Documento retirado',
}

// Movimentação do órgão depois da publicação. Item e resultado ficam de fora:
// a situação dos itens e o resultado já vêm do retrato, e o histórico deles é
// ruído (769 "Item de Contratação / Retificação" em 30 editais, 07/10).
export function eventosDoHistorico(historico: PncpHistorico[]): EventoNovo[] {
  if (historico.length === 0) return []
  const corte = inicioDaCompra(historico) + JANELA_PUBLICACAO_MS
  const eventos: EventoNovo[] = []
  for (const h of historico) {
    if (instante(h.logManutencaoDataInclusao) <= corte) continue
    const justificativa = h.justificativa?.trim() ? `: ${h.justificativa.trim()}` : ''

    if (h.categoriaLogManutencaoNome === 'Documento de Contratação') {
      eventos.push({
        chave: `doc:${h.tipoLogManutencaoNome}:${h.documentoSequencial ?? h.documentoTitulo}:${h.logManutencaoDataInclusao}`,
        tipo: 'documento',
        descricao: `${ACAO_DOCUMENTO[h.tipoLogManutencaoNome] ?? h.tipoLogManutencaoNome}: ${tituloDoDocumento(h)}`,
        dataFato: h.logManutencaoDataInclusao,
      })
    } else if (h.categoriaLogManutencaoNome === 'Contratação') {
      eventos.push({
        chave: `compra:${h.tipoLogManutencaoNome}:${h.logManutencaoDataInclusao}`,
        tipo: 'retificacao',
        descricao:
          h.tipoLogManutencaoNome === 'Exclusão'
            ? `Licitação excluída do PNCP pelo órgão${justificativa}`
            : `Órgão retificou a licitação no PNCP${justificativa}`,
        dataFato: h.logManutencaoDataInclusao,
      })
    }
  }
  return eventos
}

function ultimaRetificacao(historico: PncpHistorico[] | null): string | null {
  return maiorData(
    (historico ?? [])
      .filter((h) => h.categoriaLogManutencaoNome === 'Contratação' && h.tipoLogManutencaoNome === 'Retificação')
      .map((h) => h.logManutencaoDataInclusao)
  )
}

interface GravadoDaCompra {
  data_abertura_proposta: Date | string | null
  data_encerramento_proposta: Date | string | null
  situacao_nome: string | null
}

function mesmoInstante(gravado: Date | string | null, doPncp: string | null | undefined): boolean {
  const a = gravado ? paraData(gravado).getTime() : null
  const b = doPncp ? instante(doPncp) : null
  return a === b
}

// O sync grava o edital uma vez e nunca mais atualiza (ON CONFLICT DO
// NOTHING). Pros acompanhados, a verificação compara datas e situação com o
// PNCP: adiamento e suspensão viram evento e a linha passa a mostrar o novo.
export function mudancasDaCompra(
  gravado: GravadoDaCompra,
  compra: PncpContratacao,
  dataRetificacao: string | null
): EventoNovo[] {
  const eventos: EventoNovo[] = []
  const campos = [
    { nome: 'Abertura', chave: 'abertura', antes: gravado.data_abertura_proposta, depois: compra.dataAberturaProposta },
    {
      nome: 'Encerramento das propostas',
      chave: 'encerramento',
      antes: gravado.data_encerramento_proposta,
      depois: compra.dataEncerramentoProposta,
    },
  ]
  for (const c of campos) {
    if (mesmoInstante(c.antes, c.depois)) continue
    const de = c.antes ? formatarDataHora(paraData(c.antes).toISOString()) : 'sem data'
    const para = c.depois ? formatarDataHora(comFusoDeBrasilia(c.depois)) : 'sem data'
    eventos.push({
      chave: `${c.chave}:${c.depois ?? 'nenhuma'}`,
      tipo: 'retificacao',
      descricao: `${c.nome} alterada: ${de} → ${para}`,
      dataFato: dataRetificacao,
    })
  }
  if (compra.situacaoCompraNome && gravado.situacao_nome && compra.situacaoCompraNome !== gravado.situacao_nome) {
    eventos.push({
      chave: `situacao_compra:${compra.situacaoCompraNome}`,
      tipo: 'retificacao',
      descricao: `Situação da licitação: ${compra.situacaoCompraNome}`,
      dataFato: dataRetificacao,
    })
  }
  return eventos
}

async function atualizarDadosDaCompra(editalId: number, compra: PncpContratacao): Promise<void> {
  // Data do PNCP sempre com fuso de Brasília antes de ir pro banco.
  await sql`
    UPDATE editais
    SET data_abertura_proposta = ${comFusoDeBrasilia(compra.dataAberturaProposta)},
        data_encerramento_proposta = ${comFusoDeBrasilia(compra.dataEncerramentoProposta)},
        situacao_id = ${String(compra.situacaoCompraId)},
        situacao_nome = ${compra.situacaoCompraNome}
    WHERE id = ${editalId}
  `
}

async function gravarEventos(editalId: number, eventos: EventoNovo[]): Promise<number> {
  let novos = 0
  for (const e of eventos) {
    // Data do PNCP vem sem fuso: sem hora vira meio-dia, com hora ganha
    // -03:00 (lib/formato.ts, comFusoDeBrasilia).
    const dataFato = comFusoDeBrasilia(e.dataFato)
    const inseridos = await sql`
      INSERT INTO edital_eventos (edital_id, chave, tipo, descricao, data_fato, dados)
      VALUES (${editalId}, ${e.chave}, ${e.tipo}, ${e.descricao}, ${dataFato}, ${e.dados ? JSON.stringify(e.dados) : null}::jsonb)
      ON CONFLICT (edital_id, chave) DO NOTHING
      RETURNING id
    `
    if (inseridos.length > 0) novos++
  }
  return novos
}

// ---------------------------------------------------------------------------
// Leitura pra tela

export function itensGanhos(retrato: RetratoPncp): ItemSalvo[] {
  return retrato.itens.filter((i) => (i.resultados ?? []).some((r) => ehCnpjDaEmpresa(r.cnpj) && !r.cancelado))
}

// Situação resumida pro campo somente leitura "Situação no PNCP". Derivada do
// retrato, do sinal mais forte pro mais fraco.
export function situacaoResumida(retrato: RetratoPncp | null): string | null {
  if (!retrato) return null
  const total = retrato.itens.length
  const homologados = retrato.itens.filter((i) => i.situacaoId === SITUACAO_HOMOLOGADO).length
  const emAndamento = retrato.itens.filter((i) => i.situacaoId === SITUACAO_EM_ANDAMENTO).length

  if (retrato.contratos.length > 0) return retrato.contratos.length === 1 ? 'Contrato assinado' : `${retrato.contratos.length} contratos assinados`
  if (retrato.atas.some((a) => !a.cancelada)) return 'Ata de registro de preços assinada'
  if (total > 0 && homologados === total) return 'Homologado'
  if (homologados > 0) return `Homologação parcial (${homologados} de ${total} itens)`
  if (total > 0 && emAndamento === 0) {
    const nomes = [...new Set(retrato.itens.map((i) => i.situacao).filter(Boolean))]
    return nomes.length === 1 ? String(nomes[0]) : 'Encerrado sem homologação'
  }
  return 'Em andamento'
}

export interface EventoDaLinhaDoTempo {
  tipo: string
  descricao: string
  dataFato: string | null
  capturadoEm: string | null
}

export interface AcompanhamentoDoEdital {
  retrato: RetratoPncp | null
  situacao: string | null
  eventos: EventoDaLinhaDoTempo[]
  verificadoEm: string | null
  tentadoEm: string | null
  erro: string | null
  vitoriaDescartada: boolean
  // Fato do PNCP ainda não visto (o "novo" do Andamento) — a tela marca como
  // visto ao abrir.
  movimentacaoNova: boolean
  // Sugestão de "ganha": itens ou contrato no CNPJ da empresa.
  vitoria: { itens: number; contrato: ContratoSalvo | null; valorHomologado: number } | null
}

export async function carregarAcompanhamento(editalId: number): Promise<AcompanhamentoDoEdital> {
  const [[linha], eventosPncp] = await Promise.all([
    sql`
      SELECT e.acompanhamento_json, e.acompanhamento_em, e.acompanhamento_tentado_em, e.acompanhamento_erro,
             e.situacao_nome,
             s.vitoria_descartada_em,
             EXISTS (
               SELECT 1 FROM edital_eventos ev
               WHERE ev.edital_id = e.id AND ev.capturado_em > COALESCE(s.movimentacao_vista_em, '-infinity')
             ) AS movimentacao_nova
      FROM editais e LEFT JOIN edital_status s ON s.edital_id = e.id
      WHERE e.id = ${editalId}
    ` as Promise<Record<string, unknown>[]>,
    sql`
      SELECT tipo, descricao, data_fato, capturado_em FROM edital_eventos
      WHERE edital_id = ${editalId}
    ` as Promise<Record<string, unknown>[]>,
  ])

  const retrato = (linha?.acompanhamento_json as RetratoPncp | null) ?? null
  const iso = (v: unknown) => (v ? paraData(v as string).toISOString() : null)

  let vitoria: AcompanhamentoDoEdital['vitoria'] = null
  if (retrato) {
    const ganhos = itensGanhos(retrato)
    const contrato = retrato.contratos.find((c) => ehCnpjDaEmpresa(c.cnpj)) ?? null
    if (ganhos.length > 0 || contrato) {
      const valorHomologado = ganhos
        .flatMap((i) => (i.resultados ?? []).filter((r) => ehCnpjDaEmpresa(r.cnpj) && !r.cancelado))
        .reduce((soma, r) => soma + (r.valorTotal ?? 0), 0)
      vitoria = { itens: ganhos.length, contrato, valorHomologado }
    }
  }

  return {
    retrato,
    // Suspensa/revogada/anulada (atualizada pela verificação, mudancasDaCompra)
    // vale mais que o resumo dos itens.
    situacao:
      linha?.situacao_nome && linha.situacao_nome !== SITUACAO_DIVULGADA
        ? (linha.situacao_nome as string)
        : situacaoResumida(retrato),
    // Etapa, notas e tarefas entram na linha do tempo em lib/linha-do-tempo.ts.
    eventos: eventosPncp.map((e) => ({
      tipo: e.tipo as string,
      descricao: e.descricao as string,
      dataFato: iso(e.data_fato),
      capturadoEm: iso(e.capturado_em),
    })),
    verificadoEm: iso(linha?.acompanhamento_em),
    tentadoEm: iso(linha?.acompanhamento_tentado_em),
    erro: (linha?.acompanhamento_erro as string | null) ?? null,
    vitoriaDescartada: Boolean(linha?.vitoria_descartada_em),
    movimentacaoNova: Boolean(linha?.movimentacao_nova),
    vitoria,
  }
}

export const HORAS_ENTRE_VERIFICACOES = 12
