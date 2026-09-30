import Link from 'next/link'
import type { ResultadoDaBusca } from '@/lib/arquivo'
import { formatarDiaDoBoletim } from '@/lib/formato'
import { IconeEstrela } from '@/components/icons'

// Resultado leva pro edital (PNCP) ou pra publicação no diário, como o Enter
// no boletim; a data leva pro boletim daquele dia.
export function ResultadosDaBusca({ resultados }: { resultados: ResultadoDaBusca[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {resultados.map((r) => (
        <li
          key={r.chave}
          className={`flex items-start gap-4 rounded-card border border-border bg-surface px-[18px] py-3 ${
            r.descartado ? 'opacity-60' : ''
          }`}
        >
          <Link
            href={`/boletim/${r.dia}`}
            className="w-[120px] shrink-0 pt-0.5 text-[12.5px] text-accent hover:text-accent-strong"
            title="Abrir o boletim deste dia"
          >
            {formatarDiaDoBoletim(r.dia)}
          </Link>

          <div className="flex min-w-0 grow flex-col gap-1">
            <a
              href={r.href}
              {...(r.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="line-clamp-2 text-[13.5px] font-medium text-ink no-underline hover:text-accent"
            >
              {r.texto}
            </a>
            <span className="text-[12px] text-muted">
              {[r.tipo, r.entidade, r.origem].filter(Boolean).join(' · ')}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5 text-[11.5px]">
            {r.descartado && <span className="text-faint">descartado</span>}
            {!r.visto && !r.descartado && <span className="text-warn">não visto</span>}
            {r.favorito && (
              <span className="text-accent" title="Favoritado">
                <IconeEstrela />
                <span className="sr-only">Favoritado</span>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
