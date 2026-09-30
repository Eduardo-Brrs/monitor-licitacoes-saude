import Link from 'next/link'
import { formatarDiaDoBoletim } from '@/lib/formato'

type Props = {
  dia: string
  nosFiltros: number
  naoVistos: number
  anterior: string | null
  proximo: string | null
  busca: string
  onBuscaChange: (valor: string) => void
}

function Seta({ direcao }: { direcao: 'anterior' | 'proximo' }) {
  return (
    <svg
      width={16}
      height={16}
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

const CLASSE_SETA =
  'flex size-[34px] items-center justify-center rounded-control border border-border-strong bg-surface text-ink'
const CLASSE_SETA_INATIVA =
  'flex size-[34px] items-center justify-center rounded-control border border-border bg-[#f2f0eb] text-[#b6b3ac]'

export function Cabecalho({ dia, nosFiltros, naoVistos, anterior, proximo, busca, onBuscaChange }: Props) {
  return (
    <header className="flex items-end gap-4 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
      <div className="flex grow flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          {anterior ? (
            <Link href={`/boletim/${anterior}`} aria-label="Boletim do dia anterior" className={CLASSE_SETA}>
              <Seta direcao="anterior" />
            </Link>
          ) : (
            <span aria-hidden="true" className={CLASSE_SETA_INATIVA}>
              <Seta direcao="anterior" />
            </span>
          )}

          <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">
            Boletim de {formatarDiaDoBoletim(dia)}
          </h1>

          {proximo ? (
            <Link href={`/boletim/${proximo}`} aria-label="Próximo boletim" className={CLASSE_SETA}>
              <Seta direcao="proximo" />
            </Link>
          ) : (
            <span aria-hidden="true" className={CLASSE_SETA_INATIVA}>
              <Seta direcao="proximo" />
            </span>
          )}

          <Link href={`/arquivo?mes=${dia.slice(0, 7)}`} className="text-[12.5px] text-accent hover:text-accent-strong">
            ver boletins anteriores
          </Link>
        </div>
        <p className="m-0 text-[13px] text-muted">
          {/* PNCP e diários somados (lista única, 2026-09-24) — quanto ficou
              fora dos filtros está no rodapé da lista. */}
          {nosFiltros} da área da saúde · {naoVistos} não {naoVistos === 1 ? 'visto' : 'vistos'}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <label htmlFor="busca" className="sr-only">
          Buscar edital
        </label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(evento) => onBuscaChange(evento.target.value)}
          placeholder="Buscar por objeto, órgão ou nº"
          className="h-10 w-[252px] rounded-control border border-border-strong bg-surface px-3 text-[13px] text-ink placeholder:text-faint"
        />
        {/* O que está dentro dos filtros no dia (a busca não restringe). */}
        <a
          href={`/boletim/${dia}/csv`}
          download
          title="Baixar a lista do dia (área da saúde) em planilha"
          className="flex h-10 items-center gap-2 rounded-control border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-bg"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
            <path d="M5 19h14" />
          </svg>
          Exportar CSV
        </a>
      </div>
    </header>
  )
}
