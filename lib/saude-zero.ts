// Alerta de fonte que respondeu sem nenhum item (2026-11-03). Separado de
// lib/saude.ts pra ser testável sem banco (lib/db.ts exige DATABASE_URL).
//
// Zero só é alerta onde é anormal — medido em sync_runs (30 dias até 03/11):
// PNCP e diários municipais nunca voltaram zero; o DOE volta zero em metade
// das rodadas, mas dia útil inteiro sem item só em feriado (16/09, 12/10,
// 02/11) e em 11/09, quando a busca deles travou e respondia "sucesso" vazio.
// As rotinas de 30 min voltam zero quase sempre e ficam de fora.

// 'na_rodada': última rodada sem erro voltou zero.
// diasUteis: N dias úteis (seg-sex, Maceió) seguidos com rodada ok e zero
// item. Dia sem rodada ok não conta — cron parado já é pego pela regra de
// horas sem sucesso.
export type AlertaZero = 'na_rodada' | { diasUteis: number }

export interface ExecucaoFonte {
  started_at: string
  erro: string | null
  total_api: number | null
}

const DIA_EM_MACEIO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' })
const DIA_DA_SEMANA_EM_MACEIO = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Maceio', weekday: 'short' })

// execucoes: mais recente primeiro (como sai de saudeDasFontes).
export function avaliarZero(regra: AlertaZero | undefined, execucoes: ExecucaoFonte[]): string | null {
  if (!regra) return null
  const ok = execucoes.filter((e) => e.erro === null)
  if (ok.length === 0) return null

  if (regra === 'na_rodada') {
    return (ok[0].total_api ?? 0) === 0 ? 'a última consulta voltou sem nenhum item' : null
  }

  // Agrupa as rodadas ok por dia, do mais recente pro mais antigo, até achar
  // um dia com item.
  const dias = new Map<string, { comItem: boolean; util: boolean }>()
  for (const e of ok) {
    const data = new Date(e.started_at)
    const dia = DIA_EM_MACEIO.format(data)
    const atual = dias.get(dia) ?? { comItem: false, util: !['Sat', 'Sun'].includes(DIA_DA_SEMANA_EM_MACEIO.format(data)) }
    if ((e.total_api ?? 0) > 0) atual.comItem = true
    dias.set(dia, atual)
  }

  let diasUteisVazios = 0
  for (const { comItem, util } of dias.values()) {
    if (comItem) break
    if (util) diasUteisVazios++
  }
  return diasUteisVazios >= regra.diasUteis ? `nenhum item lido em ${diasUteisVazios} dias úteis` : null
}
