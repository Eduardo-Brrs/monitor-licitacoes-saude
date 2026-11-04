import { dataCsv, montarCsv, numeroCsv, respostaCsv } from '@/lib/csv'
import { diaEmMaceio } from '@/lib/formato'
import { lerFiltros, pesquisar, proximoPrazo } from '@/lib/pesquisa'

export const maxDuration = 60

// Mesma busca da tela (os filtros vêm na URL), com o que a lista mostra.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const params: Record<string, string[]> = {}
  for (const [k, v] of url.searchParams) (params[k] ??= []).push(v)
  const filtros = lerFiltros({ ...params, f: '1' })
  const { itens } = await pesquisar(filtros)

  const linhas = itens.map((i) => [
    i.tipo === 'fora' ? 'PNCP (fora do sistema)' : i.etiqueta,
    i.titulo,
    i.metadados.join(' · '),
    numeroCsv(i.valor),
    dataCsv(proximoPrazo(i), true),
    !i.abertura && !i.encerramento && i.prazoEstimado ? 'estimado' : '',
    i.publicadoEm ? dataCsv(`${i.publicadoEm}T12:00:00-03:00`) : '',
    i.favorito ? 'sim' : '',
    i.externo ? i.href : `${url.origin}${i.href}`,
  ])

  const csv = montarCsv(
    ['Origem', 'Objeto', 'Órgão · local · modalidade', 'Valor estimado', 'Abertura / prazo', 'Observação', 'Publicado em', 'Favorito', 'Link'],
    linhas
  )
  return respostaCsv(csv, `pesquisa-${diaEmMaceio(new Date())}.csv`)
}
