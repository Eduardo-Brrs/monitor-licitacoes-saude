// Regra do sistema (Eduardo, 2026-11-04): erro em um item nunca para a fila.
// Toda rotina que percorre itens passa por rodarFila. Sem banco aqui, pra ser
// testável; a memória de falhas fica em lib/fila-falhas.ts.
//
// Aconteceu duas vezes: em 03-04/10 um edital travado gastou 16 rodadas de
// anexos, e em 03/11 um PDF de 16 MB do DOE-AL segurou as edições seguintes.
// Ver docs/adr/0012-filas-resilientes.md.

export interface RegistroDeFalhas {
  falhou(chave: string, erro: string): Promise<void>
  deuCerto(chave: string): Promise<void>
}

export interface OpcoesDaFila<T> {
  itens: T[]
  chave: (item: T) => string
  processar: (item: T, restanteMs: number) => Promise<void>
  orcamentoMs: number
  minimoMs?: number // com menos tempo que isso, não começa item novo
  pausaMs?: number // entre itens, pra não bater em limite da fonte
  registro?: RegistroDeFalhas
}

export interface ResultadoDaFila {
  tentados: number
  concluidos: number
  naoTentados: number
  falhas: { chave: string; erro: string }[]
  ultimoErro: string | null
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// A memória de falhas é ajuda, não requisito: se o banco falhar aqui, a fila segue.
async function semDerrubarAFila(acao: () => Promise<void> | undefined) {
  try {
    await acao()
  } catch (err) {
    console.error('fila: falha ao registrar resultado do item', err)
  }
}

export async function rodarFila<T>(opcoes: OpcoesDaFila<T>): Promise<ResultadoDaFila> {
  const { itens, chave, processar, orcamentoMs, minimoMs = 0, pausaMs = 0, registro } = opcoes
  const inicio = Date.now()
  const resultado: ResultadoDaFila = { tentados: 0, concluidos: 0, naoTentados: 0, falhas: [], ultimoErro: null }

  for (const [indice, item] of itens.entries()) {
    const restanteMs = orcamentoMs - (Date.now() - inicio)
    if (restanteMs <= minimoMs) {
      resultado.naoTentados = itens.length - indice
      break
    }

    resultado.tentados++
    const id = chave(item)
    try {
      await processar(item, restanteMs)
      resultado.concluidos++
      await semDerrubarAFila(() => registro?.deuCerto(id))
    } catch (err) {
      const erro = mensagem(err)
      resultado.falhas.push({ chave: id, erro })
      resultado.ultimoErro = erro
      await semDerrubarAFila(() => registro?.falhou(id, erro))
    }

    if (pausaMs > 0) await esperar(pausaMs)
  }

  return resultado
}

// Quem nunca falhou mantém a ordem e vai na frente; quem falhou vai pro fim, em
// rodízio, começando pelo que falhou há mais tempo.
export function ordenarPorFalha<T>(itens: T[], chave: (item: T) => string, falhas: Map<string, Date>): T[] {
  const semFalha = itens.filter((i) => !falhas.has(chave(i)))
  const comFalha = itens
    .filter((i) => falhas.has(chave(i)))
    .sort((a, b) => falhas.get(chave(a))!.getTime() - falhas.get(chave(b))!.getTime())
  return [...semFalha, ...comFalha]
}

export interface FalhaGuardada {
  fila: string
  chave: string
  tentativas: number
  primeiraFalhaEm: Date
  falhouEm: Date
  erro: string | null
}

const HORA = 3_600_000
const TENTATIVAS_PARA_AVISAR = 3
const HORAS_PARA_AVISAR = 24
// Item que saiu da janela para de ser tentado; depois disso não é mais alarme.
const HORAS_FALHA_RECENTE = 48

// Preso = falhando há um dia, o bastante pra não avisar em queda curta de fonte.
export function itensPresos(falhas: FalhaGuardada[], agora: Date): FalhaGuardada[] {
  return falhas.filter(
    (f) =>
      f.tentativas >= TENTATIVAS_PARA_AVISAR &&
      agora.getTime() - f.primeiraFalhaEm.getTime() >= HORAS_PARA_AVISAR * HORA &&
      agora.getTime() - f.falhouEm.getTime() <= HORAS_FALHA_RECENTE * HORA
  )
}
