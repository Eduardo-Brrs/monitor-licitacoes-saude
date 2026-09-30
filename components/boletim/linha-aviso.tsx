import Link from 'next/link'
import { IconeEstrela } from '@/components/icons'
import type { AvisoDeDiario } from '@/lib/diarios'
import { formatarDiaMes, prazoEstaCurto } from '@/lib/formato'

// Linha de aviso de diário na lista do boletim. Não é a linha de edital: aviso de diário
// não tem valor estimado nem modalidade do PNCP, e o que ajuda a decidir é o
// tipo (aquisição judicial, cotação...), quem publicou e o processo. O título
// (e o Enter) abre a tela do aviso no sistema (/aviso/[fonte]/[id]); a seta
// abre a publicação original no diário.
type Props = {
  aviso: AvisoDeDiario
  selecionado: boolean
  onSelecionar: () => void
  onFavoritar: () => void
  onDescartar: () => void
  onAbrir: () => void
}

function IconeX() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function IconeExterno() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

export function LinhaAviso({ aviso, selecionado, onSelecionar, onFavoritar, onDescartar, onAbrir }: Props) {
  const { visto, favorito } = aviso
  const judicial = aviso.fonte === 'judicial'
  const prazoCurto = prazoEstaCurto(aviso.dataSessao)

  const metadados = [aviso.entidade, aviso.origem].filter(Boolean) as string[]

  return (
    <li
      data-selecionado={selecionado}
      onMouseDown={onSelecionar}
      className={`flex items-center gap-3.5 rounded-card border px-[18px] py-[15px] ${
        visto ? 'border-[#e9e7e1] bg-surface-muted' : 'border-border bg-surface'
      } ${selecionado ? 'outline outline-2 outline-offset-1 outline-accent' : ''}`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${visto ? '' : 'bg-accent'}`} />

      <div className="flex min-w-0 grow flex-col gap-[5px]">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={`mt-px shrink-0 rounded-badge px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] ${
              judicial ? 'bg-warn-soft text-warn-strong' : 'border border-border-strong bg-surface-muted text-muted'
            }`}
          >
            {aviso.tipo}
          </span>
          <Link
            href={`/aviso/${aviso.fonte}/${aviso.id}`}
            onClick={onAbrir}
            className={`line-clamp-2 text-[15px] leading-tight no-underline ${
              visto ? 'font-medium text-ink-2' : 'font-semibold text-ink'
            }`}
            title={aviso.texto}
          >
            {aviso.texto}
          </Link>
        </div>
        <div className={`flex flex-wrap items-center gap-[7px] text-[12.5px] ${visto ? 'text-faint' : 'text-muted'}`}>
          {metadados.map((texto, indice) => (
            <span key={texto} className="flex items-center gap-[7px]">
              {indice > 0 && <span aria-hidden="true">·</span>}
              <span>{texto}</span>
            </span>
          ))}
          {aviso.processo && (
            <span className="flex items-center gap-[7px]">
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[12px]">proc. {aviso.processo}</span>
            </span>
          )}
        </div>
      </div>

      {/* Mesma largura da coluna de valor da linha de edital: na lista única as
          datas precisam cair na mesma coluna. Aviso de diário não tem valor. */}
      <span aria-hidden="true" className="w-[118px] shrink-0" />

      <span
        className={`w-[92px] shrink-0 text-right text-[12.5px] ${
          visto ? 'text-faint' : prazoCurto ? 'font-medium text-warn' : 'text-muted'
        }`}
      >
        {aviso.dataSessao ? `sessão ${formatarDiaMes(aviso.dataSessao)}` : ''}
      </span>

      <div className="flex shrink-0 gap-1.5">
        <a
          href={aviso.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onAbrir}
          aria-label="Abrir publicação no diário"
          title="Abrir a publicação original no diário"
          className={`flex size-10 items-center justify-center rounded-control border bg-surface ${
            visto ? 'border-[#e0ddd6] text-faint hover:text-ink' : 'border-border-strong text-muted hover:text-ink'
          }`}
        >
          <IconeExterno />
        </a>
        <button
          type="button"
          onClick={onFavoritar}
          aria-label={favorito ? 'Desfavoritar aviso' : 'Favoritar aviso'}
          // Tooltip nativo com o atalho: sem ele o ícone sozinho não diz o que
          // faz, e é o jeito de descobrir o teclado sem ler a faixa de filtros.
          title={favorito ? 'Tirar dos favoritos (F)' : 'Favoritar (F)'}
          aria-pressed={favorito}
          className={`flex size-10 items-center justify-center rounded-control border ${
            favorito
              ? 'border-accent bg-accent-soft text-accent-strong'
              : visto
                ? 'border-[#e0ddd6] bg-surface text-muted hover:text-ink'
                : 'border-border-strong bg-surface text-ink'
          }`}
        >
          <IconeEstrela size={17} />
        </button>
        <button
          type="button"
          onClick={onDescartar}
          aria-label="Descartar aviso"
          title="Descartar (D) — dá pra desfazer"
          className={`flex size-10 items-center justify-center rounded-control border bg-surface ${
            visto ? 'border-[#e0ddd6] text-faint hover:text-ink' : 'border-border-strong text-muted hover:text-ink'
          }`}
        >
          <IconeX />
        </button>
      </div>
    </li>
  )
}
