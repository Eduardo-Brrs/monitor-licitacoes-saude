import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TabelaDoMes } from '@/components/arquivo/tabela-do-mes'
import { ResultadosDaBusca } from '@/components/arquivo/resultados-da-busca'
import { buscarNoArquivo, mesMaisRecente, mesValido, resumoDoMes } from '@/lib/arquivo'

const NOME_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function nomeDoMes(mes: string): string {
  return NOME_MES.format(new Date(`${mes}-15T12:00:00Z`))
}

const CLASSE_SETA =
  'flex size-8 items-center justify-center rounded-control border border-border-strong bg-surface text-ink hover:bg-bg'
const CLASSE_SETA_INATIVA =
  'flex size-8 items-center justify-center rounded-control border border-border bg-[#f2f0eb] text-[#b6b3ac]'

function Seta({ direcao }: { direcao: 'anterior' | 'proximo' }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direcao === 'anterior' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
    </svg>
  )
}

export default async function BoletinsAnteriores({ searchParams }: PageProps<'/arquivo'>) {
  const params = await searchParams
  const mesParam = typeof params.mes === 'string' ? params.mes : undefined
  const termo = typeof params.q === 'string' ? params.q.trim() : ''

  if (mesParam !== undefined && !mesValido(mesParam)) redirect('/arquivo')
  const mes = mesValido(mesParam) ? mesParam : await mesMaisRecente()
  // Busca com 1 letra devolveria meio banco — a partir de 2.
  const buscando = termo.length >= 2

  const [resumo, busca] = await Promise.all([
    buscando ? null : resumoDoMes(mes),
    buscando ? buscarNoArquivo(termo) : null,
  ])

  return (
    <>
      <header className="flex items-end gap-4 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
        <div className="flex grow flex-col gap-1">
          <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">Boletins anteriores</h1>
          <p className="m-0 text-[13px] text-muted">
            Todo boletim fica guardado. A busca cobre todos os meses, vistos ou não.
          </p>
        </div>
        <form action="/arquivo" method="get" className="flex items-center gap-2">
          <label htmlFor="busca-arquivo" className="sr-only">
            Buscar em todos os boletins
          </label>
          {/* Mantém o mês ao limpar a busca pelo botão do campo. */}
          <input type="hidden" name="mes" value={mes} />
          <input
            id="busca-arquivo"
            type="search"
            name="q"
            defaultValue={termo}
            placeholder="Buscar objeto, órgão, nº ou termo"
            className="h-10 w-[300px] rounded-control border border-border-strong bg-surface px-3 text-[13px] text-ink placeholder:text-faint"
          />
        </form>
      </header>

      {busca ? (
        <div className="flex grow flex-col gap-3 bg-bg px-6 py-4">
          <div className="flex items-center gap-3 text-[12.5px] text-muted">
            <span>
              {busca.total === 0
                ? `Nada encontrado para “${termo}”.`
                : `${busca.total} ${busca.total === 1 ? 'resultado' : 'resultados'} para “${termo}”`}
              {busca.total > busca.resultados.length && ` · mostrando os ${busca.resultados.length} mais recentes`}
            </span>
            <Link href={`/arquivo?mes=${mes}`} className="text-accent underline hover:text-accent-strong">
              limpar busca
            </Link>
          </div>
          {busca.resultados.length > 0 && <ResultadosDaBusca resultados={busca.resultados} />}
        </div>
      ) : (
        resumo && (
          <>
            <div className="flex items-center gap-3 border-b border-border px-6 py-3.5">
              <div className="flex items-center gap-2">
                {resumo.anterior ? (
                  <Link href={`/arquivo?mes=${resumo.anterior}`} aria-label="Mês anterior" className={CLASSE_SETA}>
                    <Seta direcao="anterior" />
                  </Link>
                ) : (
                  <span aria-hidden="true" className={CLASSE_SETA_INATIVA}>
                    <Seta direcao="anterior" />
                  </span>
                )}
                <span className="min-w-[128px] text-center text-[13.5px] font-semibold">{nomeDoMes(mes)}</span>
                {resumo.proximo ? (
                  <Link href={`/arquivo?mes=${resumo.proximo}`} aria-label="Próximo mês" className={CLASSE_SETA}>
                    <Seta direcao="proximo" />
                  </Link>
                ) : (
                  <span aria-hidden="true" className={CLASSE_SETA_INATIVA}>
                    <Seta direcao="proximo" />
                  </span>
                )}
              </div>
              <div className="grow" />
              <span className="text-[12.5px] text-muted">
                {nomeDoMes(mes).split(' ')[0]}: {resumo.totais.nosFiltros} da área da saúde ·{' '}
                {resumo.totais.favoritados} {resumo.totais.favoritados === 1 ? 'favoritado' : 'favoritados'} ·{' '}
                {resumo.totais.naoVistos} ainda não {resumo.totais.naoVistos === 1 ? 'visto' : 'vistos'}
              </span>
            </div>

            <div className="flex grow flex-col bg-bg px-6 py-3">
              {resumo.dias.length === 0 ? (
                <p className="m-0 py-8 text-center text-[13px] text-muted">Nenhum boletim neste mês.</p>
              ) : (
                <TabelaDoMes dias={resumo.dias} />
              )}
              <p className="m-0 mt-3.5 px-0.5 text-[12.5px] text-muted">
                Fim de semana e feriado não geram boletim. Dia útil sem publicação aparece com zero, não some da lista.
              </p>
            </div>
          </>
        )
      )}
    </>
  )
}
