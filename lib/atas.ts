import { sql } from '@/lib/db'
import { DIAS_AVISO_VALIDADE, type Ata, type ItemAta, type Pedido, type TipoAta } from '@/lib/atas-tipos'
import { diaEmMaceio } from '@/lib/formato'

// Atas e contratos ganhos (2026-10-27). Volume pequeno (dezenas de atas,
// centenas de itens) — a lista carrega tudo de uma vez e faz as contas na tela.

function dia(valor: unknown): string | null {
  if (!valor) return null
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10)
}

function numero(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : Number(valor)
}

function mapearAta(l: Record<string, unknown>): Ata {
  const fonte = l.fonte as string | null
  const itemId = l.item_id as number | null
  let href: string | null = null
  if (fonte === 'pncp' && l.numero_controle_pncp) href = `/edital/${encodeURIComponent(l.numero_controle_pncp as string)}`
  else if (fonte && fonte !== 'pncp' && itemId !== null) href = `/aviso/${fonte}/${itemId}`
  return {
    id: l.id as number,
    tipo: l.tipo as TipoAta,
    numero: l.numero as string,
    processo: (l.processo as string | null) ?? null,
    edital: (l.edital as string | null) ?? null,
    orgao: l.orgao as string,
    destino: (l.destino as string | null) ?? null,
    prazoEntrega: (l.prazo_entrega as string | null) ?? null,
    validade: dia(l.validade),
    prorrogacao: (l.prorrogacao as string | null) ?? null,
    observacao: (l.observacao as string | null) ?? null,
    origem: fonte && itemId !== null && href ? { fonte, itemId, href } : null,
  }
}

async function carregarItens(ataIds: number[]): Promise<Map<number, ItemAta[]>> {
  const porAta = new Map<number, ItemAta[]>()
  if (ataIds.length === 0) return porAta
  const [itens, pedidos] = (await Promise.all([
    sql`SELECT * FROM ata_itens WHERE ata_id = ANY(${ataIds}) ORDER BY id`,
    sql`
      SELECT p.* FROM ata_pedidos p JOIN ata_itens i ON i.id = p.ata_item_id
      WHERE i.ata_id = ANY(${ataIds})
      ORDER BY p.data NULLS FIRST, p.id
    `,
  ])) as Record<string, unknown>[][]

  const pedidosPorItem = new Map<number, Pedido[]>()
  for (const p of pedidos) {
    const lista = pedidosPorItem.get(p.ata_item_id as number) ?? []
    lista.push({ id: p.id as number, data: dia(p.data), valor: Number(p.valor), observacao: (p.observacao as string | null) ?? null })
    pedidosPorItem.set(p.ata_item_id as number, lista)
  }

  for (const i of itens) {
    const lista = porAta.get(i.ata_id as number) ?? []
    lista.push({
      id: i.id as number,
      produto: i.produto as string,
      catmat: (i.catmat as string | null) ?? null,
      marca: (i.marca as string | null) ?? null,
      fornecedor: (i.fornecedor as string | null) ?? null,
      cotacaoOriginal: numero(i.cotacao_original),
      cotacaoRevisada: numero(i.cotacao_revisada),
      atualizacaoPrecos: (i.atualizacao_precos as string | null) ?? null,
      precoVenda: numero(i.preco_venda),
      quantidade: numero(i.quantidade),
      quantidadeMinima: numero(i.quantidade_minima),
      pendencia: (i.pendencia as string | null) ?? null,
      pedidos: pedidosPorItem.get(i.id as number) ?? [],
    })
    porAta.set(i.ata_id as number, lista)
  }
  return porAta
}

const SELECT_ATA = sql`
  SELECT a.*, e.numero_controle_pncp
  FROM atas a
  LEFT JOIN editais e ON a.fonte = 'pncp' AND e.id = a.item_id
`

export interface AtaComItens extends Ata {
  itens: ItemAta[]
}

export async function listarAtas(): Promise<AtaComItens[]> {
  const atas = ((await sql`${SELECT_ATA} ORDER BY a.validade NULLS LAST, a.id`) as Record<string, unknown>[]).map(mapearAta)
  const itens = await carregarItens(atas.map((a) => a.id))
  return atas.map((a) => ({ ...a, itens: itens.get(a.id) ?? [] }))
}

export async function buscarAta(id: number): Promise<AtaComItens | null> {
  const [linha] = (await sql`${SELECT_ATA} WHERE a.id = ${id}`) as Record<string, unknown>[]
  if (!linha) return null
  const ata = mapearAta(linha)
  return { ...ata, itens: (await carregarItens([ata.id])).get(ata.id) ?? [] }
}

// Atas registradas a partir de uma licitação do sistema (lateral do edital).
export async function atasDaOrigem(fonte: string, itemId: number): Promise<{ id: number; numero: string }[]> {
  return (await sql`
    SELECT id, numero FROM atas WHERE fonte = ${fonte} AND item_id = ${itemId} ORDER BY id
  `) as { id: number; numero: string }[]
}

// Badge do menu: atas vigentes que vencem em até 60 dias.
export async function contarAtasVencendo(): Promise<number> {
  const hoje = diaEmMaceio(new Date())
  const [l] = (await sql`
    SELECT COUNT(*)::int AS n FROM atas
    WHERE validade >= ${hoje}::date AND validade <= ${hoje}::date + ${DIAS_AVISO_VALIDADE}::int
  `) as { n: number }[]
  return l.n
}
