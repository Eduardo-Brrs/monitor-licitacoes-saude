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

// Etapa = favorito e status como uma escada só (2026-10-07, pedido do usuário):
// Favoritada (avaliando se vai participar) → Gerenciada (vai participar) →
// Em andamento → Finalizada / Ganha. No banco continuam duas colunas, mas
// app/actions/acompanhamento.ts#definirEtapa nunca deixa as duas ligadas:
// status apaga a estrela, e voltar pra Favoritada apaga o status.
export type Etapa = 'favoritada' | StatusInterno
export const ETAPAS: Etapa[] = ['favoritada', ...STATUS_INTERNO]
export const ROTULO_ETAPA: Record<Etapa, string> = { favoritada: 'Favoritada', ...ROTULO_STATUS }

export function ehEtapa(valor: unknown): valor is Etapa {
  return valor === 'favoritada' || ehStatusInterno(valor)
}

// Etapas que se escolhem no seletor. Finalizada e Ganha só pela janela
// "Finalizar" (2026-10-27), que pede o resultado.
export const ETAPAS_ABERTAS: Etapa[] = ['favoritada', 'gerenciada', 'em_andamento']

export function etapaFinal(etapa: Etapa | null): boolean {
  return etapa === 'finalizada' || etapa === 'ganha'
}

// Resultado ao finalizar (pedido do usuário, 2026-10-27). Os dois primeiros contam como
// vitória (status "ganha" e valor ganho); o resto vira "finalizada".
export const RESULTADOS = [
  'ganhou_todos',
  'ganhou_parte',
  'nao_ganhou',
  'anulada',
  'fracassada',
  'revogada',
  'desistimos',
] as const
export type Resultado = (typeof RESULTADOS)[number]

export const ROTULO_RESULTADO: Record<Resultado, string> = {
  ganhou_todos: 'Ganhamos todos os itens',
  ganhou_parte: 'Ganhamos parte dos itens',
  nao_ganhou: 'Não ganhamos nenhum item',
  anulada: 'Licitação anulada',
  fracassada: 'Licitação fracassada',
  revogada: 'Licitação revogada',
  desistimos: 'Decidimos não participar',
}

// Etiqueta curta da lista.
export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  ganhou_todos: 'Ganha',
  ganhou_parte: 'Ganha em parte',
  nao_ganhou: 'Perdida',
  anulada: 'Anulada',
  fracassada: 'Fracassada',
  revogada: 'Revogada',
  desistimos: 'Não participamos',
}

export function ehResultado(valor: unknown): valor is Resultado {
  return typeof valor === 'string' && (RESULTADOS as readonly string[]).includes(valor)
}

export function resultadoGanhou(resultado: Resultado): boolean {
  return resultado === 'ganhou_todos' || resultado === 'ganhou_parte'
}

export interface Finalizacao {
  resultado: Resultado
  valorGanho: number | null
  observacao: string | null
  em: string | null // ISO
}

export function mapearFinalizacao(l: {
  resultado: unknown
  valor_ganho: unknown
  observacao_final: unknown
  finalizada_em: unknown
}): Finalizacao | null {
  if (!ehResultado(l.resultado)) return null
  return {
    resultado: l.resultado,
    valorGanho: l.valor_ganho === null || l.valor_ganho === undefined ? null : Number(l.valor_ganho),
    observacao: (l.observacao_final as string | null) ?? null,
    em: l.finalizada_em ? new Date(l.finalizada_em as string).toISOString() : null,
  }
}

// "12.345,67", "12345.67", "R$ 1.000" → número; vazio → null; lixo → NaN.
export function lerValorEmReais(texto: string): number | null {
  const limpo = texto.replace(/r\$|\s/gi, '')
  if (limpo === '') return null
  const normalizado =
    limpo.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return /^\d+(\.\d{1,2})?$/.test(normalizado) ? Number(normalizado) : NaN
}

export function etapaDe(item: { favorito: boolean; statusInterno: StatusInterno | string | null }): Etapa | null {
  if (ehStatusInterno(item.statusInterno)) return item.statusInterno
  return item.favorito ? 'favoritada' : null
}

// Botões rápidos (estrela e "Gerenciar") só mexem nas duas primeiras etapas —
// daí pra frente um clique errado desfaria "Ganha", então só pelo seletor.
export function etapaAvancada(etapa: Etapa | null): boolean {
  return etapa !== null && etapa !== 'favoritada' && etapa !== 'gerenciada'
}

export function etapaAoFavoritar(etapa: Etapa | null): Etapa | null {
  return etapa === 'favoritada' ? null : 'favoritada'
}

export function etapaAoGerenciar(etapa: Etapa | null): Etapa | null {
  return etapa === 'gerenciada' ? null : 'gerenciada'
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
  favorito: boolean
  statusInterno: StatusInterno | null
  finalizacao: Finalizacao | null
  // Atas/contratos registrados a partir deste item (lib/atas.ts).
  atas: { id: number; numero: string }[]
  tarefas: Tarefa[]
  responsaveis: Responsavel[]
}

// Linha do tempo do item (2026-10-23, pedido do usuário): notas de quem trabalha no
// edital, respostas às tarefas, mudança de etapa, tarefas e fatos do PNCP,
// numa lista só por data (lib/linha-do-tempo.ts monta).
export type TipoEventoLinha =
  | 'nota'
  | 'resposta'
  | 'etapa'
  | 'tarefa_criada'
  | 'tarefa_concluida'
  | 'ligacao'
  | 'publicacao'
  | 'abertura'
  | 'retificacao'
  | 'vitoria'
  | 'pncp'

export interface NotaDaLinha {
  id: number
  texto: string
  autor: string | null
  editadaEm: string | null
  // Resposta a uma tarefa: a descrição dela (null = tarefa excluída depois).
  tarefa: { descricao: string | null } | null
}

export interface EventoLinha {
  chave: string
  tipo: TipoEventoLinha
  descricao: string
  quando: string | null // ISO
  capturadoEm: string | null // fato do PNCP: quando o sistema viu
  nota: NotaDaLinha | null
}

export function ehNotaDaLinha(e: EventoLinha): boolean {
  return e.tipo === 'nota' || e.tipo === 'resposta'
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
