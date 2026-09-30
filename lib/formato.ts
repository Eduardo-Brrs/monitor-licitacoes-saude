// Valores aparecem sem centavos (docs/design/telas: "R$ 1.120.000") — em
// edital o que importa é a ordem de grandeza, e centavo só polui a coluna.
const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

// Zero no PNCP quer dizer "não informado" (valor sigiloso ou campo não
// preenchido), não compra de graça — e é um terço da base, então exibir
// "R$ 0" enganaria em massa na hora da triagem.
export function formatarValor(valor: number | null): string {
  if (valor === null || valor === 0) return '—'
  return MOEDA.format(valor)
}

const DIA_MES = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  day: '2-digit',
  month: '2-digit',
})

export function formatarDiaMes(iso: string): string {
  return DIA_MES.format(new Date(iso))
}

const DIA_SEMANA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  weekday: 'long',
})

// "quinta, 18/09" — o título do boletim.
export function formatarDiaDoBoletim(dia: string): string {
  // Meio-dia UTC evita que o recuo de fuso jogue a data pro dia anterior ao
  // formatar em Maceió.
  const data = new Date(`${dia}T12:00:00Z`)
  return `${DIA_SEMANA.format(data)}, ${DIA_MES.format(data)}`
}

// Na tela de detalhe o valor aparece com centavos: ali a pessoa está avaliando
// o edital a sério, não varrendo a lista.
const MOEDA_COMPLETA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarValorCompleto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || valor === 0) return '—'
  return MOEDA_COMPLETA.format(valor)
}

const NUMERO = new Intl.NumberFormat('pt-BR')

export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—'
  return NUMERO.format(valor)
}

const DATA_COMPLETA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatarDataCompleta(iso: string | null): string {
  if (!iso) return '—'
  return DATA_COMPLETA.format(new Date(iso))
}

const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatarDataHora(iso: string | null): string {
  if (!iso) return '—'
  const data = new Date(iso)
  return `${DATA_COMPLETA.format(data)}, ${HORA.format(data).replace(':', 'h')}`
}

// Nome de anexo às vezes vem do PNCP com caractere codificado de URL
// ("PROC_N%C2%BA_0515009" em vez de "PROC_Nº_0515009"). Decodifica quando dá;
// "%" solto (ex: "desconto 10%") faria decodeURIComponent falhar, aí fica cru.
export function nomeDeArquivoLegivel(nome: string): string {
  if (!/%[0-9a-f]{2}/i.test(nome)) return nome
  try {
    return decodeURIComponent(nome)
  } catch {
    return nome
  }
}

export const DIAS_PARA_PRAZO_CURTO = 5

export function diaEmMaceio(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data)
}

// Abertura em até 5 dias é destacada em --warn (docs/design/DESIGN.md).
// A conta é em dias de calendário, não em horas: um edital que abre hoje às
// 09h é o caso mais urgente que existe, e comparar instantes o classificaria
// como "já passou" no fim da manhã.
export function prazoEstaCurto(abertura: string | null, hoje = new Date()): boolean {
  if (!abertura) return false

  const inicio = Date.parse(`${diaEmMaceio(hoje)}T00:00:00Z`)
  const fim = Date.parse(`${diaEmMaceio(new Date(abertura))}T00:00:00Z`)
  const dias = (fim - inicio) / 86_400_000

  return dias >= 0 && dias <= DIAS_PARA_PRAZO_CURTO
}

// Prazo de tarefa (data sem hora, YYYY-MM-DD): "vence hoje", "vence amanhã,
// 19/09", "venceu há 3 dias". `urgente` = vencida ou vence hoje/amanhã, que é
// o que a tela pinta em --warn.
export function descreverPrazo(prazo: string | null, hoje = new Date()): { texto: string; urgente: boolean } {
  if (!prazo) return { texto: 'sem prazo', urgente: false }
  const dias = (Date.parse(`${prazo}T00:00:00Z`) - Date.parse(`${diaEmMaceio(hoje)}T00:00:00Z`)) / 86_400_000
  const data = DIA_MES.format(new Date(`${prazo}T12:00:00Z`))
  if (dias < -1) return { texto: `venceu há ${-dias} dias, ${data}`, urgente: true }
  if (dias === -1) return { texto: `venceu ontem, ${data}`, urgente: true }
  if (dias === 0) return { texto: 'vence hoje', urgente: true }
  if (dias === 1) return { texto: `vence amanhã, ${data}`, urgente: true }
  return { texto: `vence ${data}`, urgente: false }
}

// Dias de calendário até a abertura; negativo quando já passou, null sem data.
export function diasAteAbertura(abertura: string | null, hoje = new Date()): number | null {
  if (!abertura) return null
  const inicio = Date.parse(`${diaEmMaceio(hoje)}T00:00:00Z`)
  const fim = Date.parse(`${diaEmMaceio(new Date(abertura))}T00:00:00Z`)
  return (fim - inicio) / 86_400_000
}
