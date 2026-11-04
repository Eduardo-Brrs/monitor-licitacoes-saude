// Vigia dos agendamentos (2026-11-04). Separado da rota pra ser testável sem
// banco (lib/db.ts exige DATABASE_URL).
//
// Pergunta só se a rotina COMEÇOU no horário, não se teve sucesso: PNCP fora
// do ar grava rodada com erro e isso é assunto da tela /saude. O que o vigia
// pega é o cron-job.org parado, quando nenhuma rodada acontece.
//
// Grade conferida em sync_runs (04/11): igual todos os dias da semana.

export interface RotinaVigiada {
  tipo: string // tipo em sync_runs
  rota: string
  horarios: number[] // minutos desde 0h em Maceió
}

export interface RotinaParada {
  tipo: string
  rota: string
  esperadaEm: string
  ultimaEm: string | null
}

const tresVezesAoDia = (minuto: number) => [9, 14, 20].map((h) => h * 60 + minuto)

// De 7h às 21h, nos dois minutos da hora.
function aCada30Min(minuto: number): number[] {
  const horarios: number[] = []
  for (let h = 7; h <= 21; h++) horarios.push(h * 60 + minuto, h * 60 + minuto + 30)
  return horarios
}

export const ROTINAS_VIGIADAS: RotinaVigiada[] = [
  { tipo: 'sync', rota: '/api/sync', horarios: tresVezesAoDia(0) },
  { tipo: 'sync_doe', rota: '/api/sync-doe', horarios: tresVezesAoDia(1) },
  { tipo: 'sync_diarios_municipais', rota: '/api/sync-diarios-municipais', horarios: tresVezesAoDia(2) },
  { tipo: 'verificar_itens', rota: '/api/verificar-itens', horarios: aCada30Min(0) },
  { tipo: 'atualizar_detalhes', rota: '/api/atualizar-detalhes', horarios: aCada30Min(1) },
  { tipo: 'acompanhar', rota: '/api/acompanhar', horarios: aCada30Min(2) },
]

const MINUTO = 60_000
const DIA = 24 * 60 * MINUTO
const FUSO_MACEIO = 3 * 60 * MINUTO // UTC-3 o ano todo, sem horário de verão

// Horário só conta depois disso, pra rodada atrasada não virar alarme.
const TOLERANCIA = 60 * MINUTO
// Relógio do cron-job.org pode disparar um pouco antes do minuto cheio.
const FOLGA = 5 * MINUTO

// Último horário da grade que já devia ter rodado, com a tolerância.
export function ultimoHorarioEsperado(horarios: number[], agora: Date): Date {
  const limite = agora.getTime() - TOLERANCIA
  const inicioDoDia = Math.floor((limite - FUSO_MACEIO) / DIA) * DIA + FUSO_MACEIO
  for (const dia of [inicioDoDia, inicioDoDia - DIA]) {
    const candidatos = horarios.map((m) => dia + m * MINUTO).filter((t) => t <= limite)
    if (candidatos.length > 0) return new Date(Math.max(...candidatos))
  }
  throw new Error('rotina sem horários na grade')
}

export function rotinasParadas(ultimas: Map<string, Date>, agora: Date): RotinaParada[] {
  const paradas: RotinaParada[] = []
  for (const rotina of ROTINAS_VIGIADAS) {
    const esperada = ultimoHorarioEsperado(rotina.horarios, agora)
    const ultima = ultimas.get(rotina.tipo) ?? null
    if (ultima && ultima.getTime() >= esperada.getTime() - FOLGA) continue
    paradas.push({
      tipo: rotina.tipo,
      rota: rotina.rota,
      esperadaEm: esperada.toISOString(),
      ultimaEm: ultima?.toISOString() ?? null,
    })
  }
  return paradas
}
