import { buscarEditaisDoDia } from '@/lib/boletim'
import { dataCsv, montarCsv, numeroCsv, respostaCsv } from '@/lib/csv'
import { buscarAvisosDoDia } from '@/lib/diarios'

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/

// O que está dentro dos filtros no boletim do dia: editais do PNCP e avisos
// de diário relevantes, sem os descartados — o mesmo que a lista mostra.
export async function GET(request: Request, { params }: RouteContext<'/boletim/[dia]/csv'>) {
  const { dia } = await params
  if (!FORMATO_DIA.test(dia)) return new Response('dia inválido', { status: 400 })
  const base = new URL(request.url).origin

  const [editais, avisos] = await Promise.all([buscarEditaisDoDia(dia), buscarAvisosDoDia(dia)])

  const linhas = [
    ...editais.map((e) => [
      'PNCP',
      e.modalidade ?? '',
      e.objeto,
      e.orgao ?? '',
      [e.municipio, e.uf].filter(Boolean).join('/'),
      e.numeroCompra ? `${e.numeroCompra}/${e.anoCompra}` : '',
      numeroCsv(e.valorEstimado),
      dataCsv(e.aberturaProposta, true),
      e.visto ? 'sim' : '',
      e.favorito ? 'sim' : '',
      `${base}/edital/${encodeURIComponent(e.numeroControlePncp)}`,
    ]),
    ...avisos
      .filter((a) => a.relevante)
      .map((a) => [
        a.origem,
        a.tipo,
        a.texto,
        a.entidade ?? '',
        '',
        a.processo ?? '',
        '',
        dataCsv(a.dataSessao, true),
        a.visto ? 'sim' : '',
        a.favorito ? 'sim' : '',
        a.url,
      ]),
  ]

  const csv = montarCsv(
    [
      'Origem',
      'Modalidade / tipo',
      'Objeto',
      'Órgão',
      'Município',
      'Nº / processo',
      'Valor estimado (R$)',
      'Abertura / sessão',
      'Visto',
      'Favorito',
      'Link',
    ],
    linhas
  )

  return respostaCsv(csv, `boletim-${dia}.csv`)
}
