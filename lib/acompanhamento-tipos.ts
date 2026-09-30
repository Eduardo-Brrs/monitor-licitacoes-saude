// Tipos e constantes do acompanhamento que também rodam no navegador (painel
// da lateral, tabela) — separados de lib/acompanhamento.ts, que fala com o
// banco e não pode ir pro bundle do cliente.

export type FonteItem = 'pncp' | 'judicial' | 'doe_licitacao' | 'doe_cotacao' | 'municipal'
export const FONTES_ITEM: FonteItem[] = ['pncp', 'judicial', 'doe_licitacao', 'doe_cotacao', 'municipal']

export function ehFonteItem(valor: unknown): valor is FonteItem {
  return typeof valor === 'string' && (FONTES_ITEM as string[]).includes(valor)
}

// Status interno do pipeline, manual. "Favoritada" não é um status: é o que
// aparece quando o item está favoritado e ainda sem status (regra 1).
export const STATUS_INTERNO = ['gerenciada', 'em_andamento', 'finalizada', 'ganha'] as const
export type StatusInterno = (typeof STATUS_INTERNO)[number]

export const ROTULO_STATUS: Record<StatusInterno, string> = {
  gerenciada: 'Gerenciada',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
  ganha: 'Ganha',
}

export function ehStatusInterno(valor: unknown): valor is StatusInterno {
  return typeof valor === 'string' && (STATUS_INTERNO as readonly string[]).includes(valor)
}

export function rotuloDoStatus(item: { favorito: boolean; statusInterno: StatusInterno | null }): string {
  if (item.statusInterno) return ROTULO_STATUS[item.statusInterno]
  return item.favorito ? 'Favoritada' : '—'
}

export interface Responsavel {
  id: number
  nome: string
}

export interface Tarefa {
  id: number
  fonte: FonteItem
  itemId: number
  descricao: string
  responsavel: Responsavel | null
  prazo: string | null // YYYY-MM-DD
  concluida: boolean
}

export interface DadosDaLateral {
  statusInterno: StatusInterno | null
  anotacao: { texto: string; atualizadoEm: string } | null
  tarefas: Tarefa[]
  responsaveis: Responsavel[]
}

export type FiltroAcompanhamento = 'todas' | 'favoritadas' | StatusInterno

export const FILTROS_ACOMPANHAMENTO: { valor: FiltroAcompanhamento; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'favoritadas', rotulo: 'Favoritadas' },
  { valor: 'gerenciada', rotulo: 'Gerenciadas' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'finalizada', rotulo: 'Finalizadas' },
  { valor: 'ganha', rotulo: 'Ganhas' },
]

export function ehFiltroAcompanhamento(valor: unknown): valor is FiltroAcompanhamento {
  return FILTROS_ACOMPANHAMENTO.some((f) => f.valor === valor)
}

export type Ordenacao = 'abertura' | 'valor'
