import Link from 'next/link'
import { EstrelaFavorito } from '@/components/acompanhamento/estrela'
import { SeletorOrdem } from '@/components/acompanhamento/ordenar'
import { listarAcompanhamento, ordenarAcompanhamento, passaNoFiltro } from '@/lib/acompanhamento'
import {
  ehFiltroAcompanhamento,
  FILTROS_ACOMPANHAMENTO,
  rotuloDoStatus,
  type FiltroAcompanhamento,
  type Ordenacao,
  type StatusInterno,
} from '@/lib/acompanhamento-tipos'
import { descreverPrazo, diasAteAbertura, formatarDiaMes, formatarValor, prazoEstaCurto } from '@/lib/formato'

// Tela 03 do DESIGN.md: tabela única (não kanban), pílulas de status com
// contagem, ordenação por abertura mais próxima. Editais do PNCP e avisos de
// diário favoritados ou com status interno.

const COR_STATUS: Record<StatusInterno | 'favoritada', string> = {
  favoritada: 'bg-[#edebe5] text-ink',
  gerenciada: 'bg-[#edebe5] text-ink',
  em_andamento: 'bg-warn-soft text-warn-strong',
  finalizada: 'bg-[#edebe5] text-ink-2',
  ganha: 'bg-accent-soft text-accent-strong',
}

const TH = 'border-b border-border-strong px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const TD = 'border-b border-[#e9e7e1] px-2 py-[9px] align-middle'

const VALOR_CURTO = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function hrefFiltro(filtro: FiltroAcompanhamento, ordem: Ordenacao): string {
  const params = new URLSearchParams()
  if (filtro !== 'todas') params.set('filtro', filtro)
  if (ordem !== 'abertura') params.set('ordem', ordem)
  const query = params.toString()
  return query ? `/acompanhamento?${query}` : '/acompanhamento'
}

export default async function Acompanhamento({ searchParams }: PageProps<'/acompanhamento'>) {
  const params = await searchParams
  const filtro: FiltroAcompanhamento = ehFiltroAcompanhamento(params.filtro) ? params.filtro : 'todas'
  const ordem: Ordenacao = params.ordem === 'valor' ? 'valor' : 'abertura'

  const todos = await listarAcompanhamento()
  const itens = ordenarAcompanhamento(
    todos.filter((i) => passaNoFiltro(i, filtro)),
    ordem
  )

  // Resumo do cabeçalho sobre a lista inteira, não o filtro da vez.
  const emDisputa = todos
    .filter((i) => i.statusInterno !== 'finalizada' && i.statusInterno !== 'ganha')
    .reduce((soma, i) => soma + (i.valorEstimado ?? 0), 0)
  const estaSemana = todos.filter((i) => {
    const dias = diasAteAbertura(i.abertura)
    return dias !== null && dias >= 0 && dias <= 7
  }).length

  const csv = `/acompanhamento/csv${filtro !== 'todas' ? `?filtro=${filtro}` : ''}`

  return (
    <>
      <header className="flex items-end gap-4 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
        <div className="flex grow flex-col gap-1">
          <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">Acompanhamento</h1>
          <p className="m-0 text-[13px] text-muted">
            {todos.length} {todos.length === 1 ? 'licitação' : 'licitações'}
            {emDisputa > 0 && ` · R$ ${VALOR_CURTO.format(emDisputa)} em disputa`}
            {` · ${estaSemana} com prazo esta semana`}
          </p>
        </div>
        <a
          href={csv}
          download
          className="flex h-10 items-center gap-2 rounded-control border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-bg"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
            <path d="M5 19h14" />
          </svg>
          Exportar CSV
        </a>
      </header>

      <div className="flex items-center gap-[7px] border-b border-border px-6 py-3.5">
        {FILTROS_ACOMPANHAMENTO.map(({ valor, rotulo }) => {
          const ativo = valor === filtro
          const contagem = todos.filter((i) => passaNoFiltro(i, valor)).length
          return (
            <Link
              key={valor}
              href={hrefFiltro(valor, ordem)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex h-[34px] items-center gap-1.5 rounded-full border px-[13px] text-[12.5px] no-underline ${
                ativo ? 'border-ink bg-ink font-medium text-white' : 'border-border-strong bg-surface text-ink hover:bg-bg'
              }`}
            >
              {rotulo}
              <span className={`font-mono ${ativo ? 'opacity-75' : 'text-faint'}`}>{contagem}</span>
            </Link>
          )
        })}
        <div className="grow" />
        <SeletorOrdem ordem={ordem} />
      </div>

      <div className="flex grow flex-col bg-bg px-6 py-3">
        {itens.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center text-[13px] text-muted">
            <p className="m-0">
              {todos.length === 0 ? 'Nada em acompanhamento ainda.' : 'Nenhuma licitação neste filtro.'}
            </p>
            {todos.length === 0 && (
              <p className="m-0 text-faint">
                Favorite um edital no boletim (tecla F) ou dê um status a ele na tela de detalhe.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[44px]" />
              <col />
              <col className="w-[128px]" />
              <col className="w-[84px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[210px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  <span className="sr-only">Favorito</span>
                </th>
                <th scope="col" className={TH}>
                  Edital
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={TH}>
                  Abertura
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Valor est.
                </th>
                <th scope="col" className={TH}>
                  Responsável
                </th>
                <th scope="col" className={TH}>
                  Próxima tarefa
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const statusChave = i.statusInterno ?? 'favoritada'
                const tarefa = i.proximaTarefa
                const prazoTarefa = tarefa ? descreverPrazo(tarefa.prazo) : null
                const aberturaPassou = (diasAteAbertura(i.abertura) ?? 0) < 0
                return (
                  <tr key={i.chave} className="hover:bg-surface-muted">
                    <td className={`${TD} pl-0`}>
                      <EstrelaFavorito fonte={i.fonte} itemId={i.id} favorito={i.favorito} rotulo={i.objeto} />
                    </td>
                    <td className={TD}>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Link
                          href={i.href}
                          className="line-clamp-2 font-medium text-ink no-underline hover:text-accent"
                          title={i.objeto}
                        >
                          {i.tipo && (
                            <span className="mr-1.5 rounded-badge border border-border-strong px-1 py-px align-[1px] text-[10px] font-medium uppercase tracking-[0.04em] text-muted">
                              {i.tipo}
                            </span>
                          )}
                          {i.objeto}
                        </Link>
                        <span className="truncate text-[12px] text-muted" title={i.detalhe}>
                          {i.detalhe}
                        </span>
                      </div>
                    </td>
                    <td className={TD}>
                      <span className={`inline-block rounded-badge px-[9px] py-1 text-[11.5px] ${COR_STATUS[statusChave]}`}>
                        {rotuloDoStatus(i)}
                      </span>
                    </td>
                    <td
                      className={`${TD} font-mono ${
                        prazoEstaCurto(i.abertura) ? 'text-warn' : aberturaPassou ? 'text-faint' : ''
                      }`}
                    >
                      {i.abertura ? formatarDiaMes(i.abertura) : '—'}
                    </td>
                    <td className={`${TD} text-right font-mono`}>{formatarValor(i.valorEstimado)}</td>
                    <td className={TD}>{tarefa?.responsavel?.nome ?? '—'}</td>
                    <td className={`${TD} text-[12px]`}>
                      {tarefa ? (
                        <span className="line-clamp-2">
                          {tarefa.descricao}
                          {tarefa.prazo && (
                            <span className={prazoTarefa?.urgente ? 'text-warn' : 'text-faint'}>
                              {' '}
                              · {formatarDiaMes(`${tarefa.prazo}T12:00:00Z`)}
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
