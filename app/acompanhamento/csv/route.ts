import { listarAcompanhamento, ordenarAcompanhamento, passaNoFiltro } from '@/lib/acompanhamento'
import { ehFiltroAcompanhamento, rotuloDoStatus } from '@/lib/acompanhamento-tipos'
import { dataCsv, montarCsv, numeroCsv, respostaCsv } from '@/lib/csv'
import { diaEmMaceio } from '@/lib/formato'

// Mesmo filtro da tela (?filtro=), mesma ordem padrão.
export async function GET(request: Request) {
  const filtroParam = new URL(request.url).searchParams.get('filtro')
  const filtro = ehFiltroAcompanhamento(filtroParam) ? filtroParam : 'todas'
  const base = new URL(request.url).origin

  const itens = ordenarAcompanhamento(
    (await listarAcompanhamento()).filter((i) => passaNoFiltro(i, filtro)),
    'abertura'
  )

  const csv = montarCsv(
    [
      'Status',
      'Favorito',
      'Origem',
      'Objeto',
      'Órgão / publicação',
      'Abertura',
      'Valor estimado (R$)',
      'Responsável',
      'Próxima tarefa',
      'Prazo da tarefa',
      'Link no sistema',
      'Link externo',
    ],
    itens.map((i) => [
      rotuloDoStatus(i),
      i.favorito ? 'sim' : '',
      i.tipo ?? 'PNCP',
      i.objeto,
      i.detalhe,
      dataCsv(i.abertura, true),
      numeroCsv(i.valorEstimado),
      i.proximaTarefa?.responsavel?.nome ?? '',
      i.proximaTarefa?.descricao ?? '',
      i.proximaTarefa?.prazo ? dataCsv(`${i.proximaTarefa.prazo}T12:00:00Z`) : '',
      `${base}${i.href}`,
      i.linkPortal ?? '',
    ])
  )

  return respostaCsv(csv, `acompanhamento-${filtro}-${diaEmMaceio(new Date())}.csv`)
}
