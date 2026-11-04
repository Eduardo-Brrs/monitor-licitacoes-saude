import type { StatusInterno } from '@/lib/acompanhamento-tipos'
import type { FonteDiario } from '@/lib/diarios'

// Tipo da linha da Pesquisa e a regra do prazo — separados de lib/pesquisa.ts
// porque a linha roda no navegador e lib/pesquisa.ts fala com o banco.

export interface ResultadoPesquisa {
  chave: string
  // pncp = edital no sistema; fora = só no portal do PNCP; o resto é aviso.
  tipo: 'pncp' | 'fora' | FonteDiario
  itemId: number | null // id do edital/aviso no sistema (null quando fora)
  numeroControlePncp: string | null
  etiqueta: string
  judicial: boolean
  titulo: string
  href: string
  externo: boolean
  metadados: string[]
  valor: number | null
  abertura: string | null // abertura de proposta / sessão (ISO)
  // Fim do recebimento de propostas. No PNCP a "abertura" é o INÍCIO do
  // recebimento — com ela já passada, o que interessa é até quando vai.
  encerramento: string | null
  prazoEstimado: string | null // quando não há abertura e a data é estimada
  publicadoEm: string | null // YYYY-MM-DD
  favorito: boolean
  visto: boolean
  statusInterno: StatusInterno | null
}

// O que a linha mostra e a ordem usa: abertura se ainda vai acontecer, senão
// o encerramento, senão a data estimada.
export function proximoPrazo(i: ResultadoPesquisa, agora = Date.now()): string | null {
  if (i.abertura && Date.parse(i.abertura) >= agora) return i.abertura
  return i.encerramento ?? i.abertura ?? i.prazoEstimado
}
