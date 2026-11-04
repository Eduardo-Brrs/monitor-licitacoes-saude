// Atas e contratos ganhos (2026-10-27) — tipos e contas que também rodam no
// navegador. Consultas em lib/atas.ts.

export type TipoAta = 'ata' | 'contrato'

export interface Ata {
  id: number
  tipo: TipoAta
  numero: string
  processo: string | null
  edital: string | null
  orgao: string
  destino: string | null
  prazoEntrega: string | null
  validade: string | null // YYYY-MM-DD
  prorrogacao: string | null
  observacao: string | null
  origem: { fonte: string; itemId: number; href: string } | null
}

export interface Pedido {
  id: number
  data: string | null // YYYY-MM-DD
  valor: number
  observacao: string | null
}

export interface ItemAta {
  id: number
  produto: string
  catmat: string | null
  marca: string | null
  fornecedor: string | null
  cotacaoOriginal: number | null
  cotacaoRevisada: number | null
  atualizacaoPrecos: string | null
  precoVenda: number | null
  quantidade: number | null
  quantidadeMinima: number | null
  pendencia: string | null
  pedidos: Pedido[]
}

// Campos que a tela edita (sem id nem pedidos).
export type DadosItem = Omit<ItemAta, 'id' | 'pedidos'>
export type DadosAta = Omit<Ata, 'id' | 'origem'>

export interface ContasItem {
  valorCompra: number | null
  valorVenda: number | null
  pedido: number
  saldo: number | null
  margemOriginal: number | null
  margemAtual: number | null
}

// Mesmas fórmulas da planilha (pedido do usuário, 2026-10-27): compra pela cotação
// original (orçamento da licitação), margem pela revisada — quando o
// fornecedor reajusta, a margem cai. Sem revisada, vale a original.
export function contasDoItem(i: Pick<ItemAta, 'cotacaoOriginal' | 'cotacaoRevisada' | 'precoVenda' | 'quantidade' | 'pedidos'>): ContasItem {
  const qtd = i.quantidade
  const valorCompra = i.cotacaoOriginal !== null && qtd !== null ? i.cotacaoOriginal * qtd : null
  const valorVenda = i.precoVenda !== null && qtd !== null ? i.precoVenda * qtd : null
  const pedido = i.pedidos.reduce((soma, p) => soma + p.valor, 0)
  const margem = (custo: number | null) =>
    i.precoVenda !== null && custo !== null && custo > 0 ? i.precoVenda / custo - 1 : null
  return {
    valorCompra,
    valorVenda,
    pedido,
    saldo: valorVenda === null ? null : valorVenda - pedido,
    margemOriginal: margem(i.cotacaoOriginal),
    margemAtual: margem(i.cotacaoRevisada ?? i.cotacaoOriginal),
  }
}

export interface ContasAta {
  itens: number
  valorCompra: number
  valorVenda: number
  pedido: number
  saldo: number
  // Margem da ata inteira pela cotação revisada, ponderada pela quantidade
  // (só itens com venda, custo e quantidade preenchidos).
  margemAtual: number | null
}

export function contasDaAta(itens: ItemAta[]): ContasAta {
  const total: ContasAta = { itens: itens.length, valorCompra: 0, valorVenda: 0, pedido: 0, saldo: 0, margemAtual: null }
  let venda = 0
  let custo = 0
  for (const i of itens) {
    const c = contasDoItem(i)
    total.valorCompra += c.valorCompra ?? 0
    total.valorVenda += c.valorVenda ?? 0
    total.pedido += c.pedido
    total.saldo += c.saldo ?? 0
    const custoUnit = i.cotacaoRevisada ?? i.cotacaoOriginal
    if (i.precoVenda !== null && custoUnit !== null && i.quantidade !== null) {
      venda += i.precoVenda * i.quantidade
      custo += custoUnit * i.quantidade
    }
  }
  total.margemAtual = custo > 0 ? venda / custo - 1 : null
  return total
}

export type SituacaoValidade = 'vigente' | 'vencendo' | 'vencida' | 'sem_validade'

// "Vencendo" = até 60 dias (prazo pra pedir prorrogação ou cobrar pedido).
export const DIAS_AVISO_VALIDADE = 60

export function situacaoDaValidade(validade: string | null, hoje: string): SituacaoValidade {
  if (!validade) return 'sem_validade'
  if (validade < hoje) return 'vencida'
  const dias = (Date.parse(`${validade}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000
  return dias <= DIAS_AVISO_VALIDADE ? 'vencendo' : 'vigente'
}

export function diasAte(validade: string, hoje: string): number {
  return Math.round((Date.parse(`${validade}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
}

// Número digitado em pt-BR: "6,17", "1.350", "1.234,5678", "R$ 9,91".
// Vazio → null; não entendido → NaN. Até 4 casas (preço unitário).
export function lerNumero(texto: string): number | null {
  const limpo = texto.replace(/r\$|\s|%/gi, '')
  if (limpo === '') return null
  const normalizado =
    limpo.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return /^-?\d+(\.\d{1,4})?$/.test(normalizado) ? Number(normalizado) : NaN
}

const PRECO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const PORCENTO = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const EDICAO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4, useGrouping: false })

export function formatarPreco(v: number | null): string {
  return v === null ? '—' : PRECO.format(v)
}
export function formatarDinheiro(v: number | null): string {
  return v === null ? '—' : DINHEIRO.format(v)
}
export function formatarQtd(v: number | null): string {
  return v === null ? '—' : QTD.format(v)
}
export function formatarMargem(v: number | null): string {
  return v === null ? '—' : PORCENTO.format(v)
}
// Valor de volta pro campo de edição ("6,17", sem separador de milhar).
export function paraCampo(v: number | null): string {
  return v === null ? '' : EDICAO.format(v)
}

export function formatarData(dia: string | null): string {
  if (!dia) return '—'
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}
