import { diaEmMaceio } from '@/lib/formato'

// Prazo estimado de Dispensa sem data (2026-10-06). 51 das 93 Dispensas do
// banco (todas as da BLL, art. 75 II, "Não se aplica" como modo de disputa)
// vêm do PNCP sem data de abertura nem de encerramento, e nem a página da
// BLL nem o anexo informam prazo. Sem data a linha ia pro fim da ordem de
// urgência e o edital passava batido (caso FUNDEPES DL/104241/2026).
//
// A conta é a mesma que o ConLicitação usa: publicação + 3 dias úteis, até
// 23h59 — o prazo mínimo de divulgação da dispensa na Lei 14.133 (art. 75,
// §3º). Feriado não é descontado. É estimativa: a tela sempre diz isso.
const DIAS_UTEIS_DISPENSA = 3

export function prazoEstimadoDispensa(edital: {
  modalidade: string | null
  aberturaProposta: string | null
  encerramentoProposta?: string | null
  publicacao: string | null
}): string | null {
  if (edital.aberturaProposta || edital.encerramentoProposta || !edital.publicacao) return null
  if (!/dispensa/i.test(edital.modalidade ?? '')) return null

  const dia = new Date(diaEmMaceio(new Date(edital.publicacao)) + 'T12:00:00Z')
  let faltam = DIAS_UTEIS_DISPENSA
  while (faltam > 0) {
    dia.setUTCDate(dia.getUTCDate() + 1)
    const semana = dia.getUTCDay()
    if (semana !== 0 && semana !== 6) faltam--
  }
  return new Date(`${dia.toISOString().slice(0, 10)}T23:59:00-03:00`).toISOString()
}

export const EXPLICACAO_PRAZO_ESTIMADO =
  'Estimado: publicação + 3 dias úteis (prazo mínimo da dispensa na Lei 14.133). O PNCP não informa o prazo desta dispensa.'
