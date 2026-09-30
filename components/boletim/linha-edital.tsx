import Link from 'next/link'
import { IconeEstrela } from '@/components/icons'
import type { EditalDoBoletim } from '@/lib/boletim'
import { formatarDiaMes, formatarValor, prazoEstaCurto } from '@/lib/formato'

// As seis informações da linha são fechadas por decisão de design
// (docs/design/DESIGN.md): objeto, órgão, município/UF, modalidade, valor e
// abertura — mais o número do edital, que a referência mostra junto dos
// metadados. Não acrescentar campo aqui sem revisar a spec.
type Props = {
  edital: EditalDoBoletim
  selecionado: boolean
  onSelecionar: () => void
  onFavoritar: () => void
  onDescartar: () => void
  onAbrir: () => void
}

function IconeX() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function LinhaEdital({
  edital,
  selecionado,
  onSelecionar,
  onFavoritar,
  onDescartar,
  onAbrir,
}: Props) {
  const { visto, favorito } = edital
  const prazoCurto = prazoEstaCurto(edital.aberturaProposta)

  const metadados = [
    edital.orgao,
    edital.municipio && edital.uf ? `${edital.municipio}/${edital.uf}` : edital.municipio,
    edital.modalidade,
    edital.numeroCompra ? `nº ${edital.numeroCompra}/${edital.anoCompra}` : null,
    // Anexo é o que se lê pra decidir (pedido de 2026-09-24): a contagem na
    // linha mostra que estão lá antes de abrir. Sem cópia ainda, não diz nada.
    edital.anexos === null ? null : edital.anexos === 0 ? 'sem anexo' : `${edital.anexos} ${edital.anexos === 1 ? 'anexo' : 'anexos'}`,
  ].filter(Boolean) as string[]

  return (
    <li
      data-selecionado={selecionado}
      onMouseDown={onSelecionar}
      className={`flex items-center gap-3.5 rounded-card border px-[18px] py-[15px] ${
        visto ? 'border-[#e9e7e1] bg-surface-muted' : 'border-border bg-surface'
      } ${selecionado ? 'outline outline-2 outline-offset-1 outline-accent' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${visto ? '' : 'bg-accent'}`}
      />

      <div className="flex min-w-0 grow flex-col gap-[5px]">
        {/* Lista única com os avisos de diário (2026-09-24): a etiqueta diz de
            onde veio e, com isso, pra onde o clique leva (detalhe aqui, a
            publicação original no aviso). */}
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-px shrink-0 rounded-badge border border-border-strong bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            PNCP
          </span>
          <Link
            href={`/edital/${encodeURIComponent(edital.numeroControlePncp)}`}
            onClick={onAbrir}
            // Objeto do PNCP não tem limite de tamanho — quase metade da base
            // passa de 120 caracteres e há casos de 565, que empurrariam a linha
            // pra cinco alturas e matariam a leitura em varredura.
            className={`line-clamp-2 text-[15px] leading-tight no-underline ${
              visto ? 'font-medium text-ink-2' : 'font-semibold text-ink'
            }`}
            title={edital.objeto}
          >
            {edital.objeto}
          </Link>
        </div>
        <div
          className={`flex flex-wrap items-center gap-[7px] text-[12.5px] ${
            visto ? 'text-faint' : 'text-muted'
          }`}
        >
          {metadados.map((texto, indice) => (
            <span key={texto} className="flex items-center gap-[7px]">
              {indice > 0 && <span aria-hidden="true">·</span>}
              <span>{texto}</span>
            </span>
          ))}
        </div>
      </div>

      <span
        className={`w-[118px] shrink-0 text-right font-mono text-sm ${visto ? 'text-ink-2' : ''}`}
      >
        {formatarValor(edital.valorEstimado)}
      </span>

      <span
        className={`w-[92px] shrink-0 text-right text-[12.5px] ${
          visto ? 'text-faint' : prazoCurto ? 'font-medium text-warn' : 'text-muted'
        }`}
      >
        {edital.aberturaProposta ? `abre ${formatarDiaMes(edital.aberturaProposta)}` : 'sem data'}
      </span>

      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={onFavoritar}
          aria-label={favorito ? 'Desfavoritar edital' : 'Favoritar edital'}
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
          aria-label="Descartar edital"
          title="Descartar (D) — dá pra desfazer"
          className={`flex size-10 items-center justify-center rounded-control border bg-surface ${
            visto
              ? 'border-[#e0ddd6] text-faint hover:text-ink'
              : 'border-border-strong text-muted hover:text-ink'
          }`}
        >
          <IconeX />
        </button>
      </div>
    </li>
  )
}
