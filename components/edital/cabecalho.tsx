import Link from 'next/link'
import type { EditalDetalhe } from '@/lib/edital'
import { diasAteAbertura, formatarDataCompleta, formatarDataHora } from '@/lib/formato'
import { EXPLICACAO_PRAZO_ESTIMADO } from '@/lib/prazo'

function chipDePrazo(abertura: string | null, prazoEstimado: string | null) {
  if (!abertura && prazoEstimado) {
    const dias = diasAteAbertura(prazoEstimado) ?? 0
    const quando = formatarDataHora(prazoEstimado)
    if (dias < 0) return { texto: `Prazo estimado passou — ${quando}`, urgente: false, estimado: true }
    return { texto: `Prazo estimado — ${quando}`, urgente: dias <= 2, estimado: true }
  }
  const dias = diasAteAbertura(abertura)
  if (dias === null) return { texto: 'Sem data de abertura', urgente: false }

  const quando = formatarDataHora(abertura)
  if (dias < 0) return { texto: `Abertura passou — ${quando}`, urgente: false }
  if (dias === 0) return { texto: `Abre hoje — ${quando}`, urgente: true }
  if (dias === 1) return { texto: `Abre amanhã — ${quando}`, urgente: true }
  return { texto: `Abertura em ${dias} dias — ${quando}`, urgente: dias <= 5 }
}

export function CabecalhoEdital({ edital }: { edital: EditalDetalhe }) {
  // Limite da proposta (dia da sessão), não o início do recebimento (2026-10-14).
  const prazo = chipDePrazo(edital.encerramentoProposta ?? edital.aberturaProposta, edital.prazoEstimado)

  const identificacao = [
    edital.modalidade && edital.numeroCompra
      ? `${edital.modalidade} nº ${edital.numeroCompra}/${edital.anoCompra}`
      : edital.modalidade,
    edital.processo ? `processo ${edital.processo}` : null,
    edital.dataPublicacao ? `publicado em ${formatarDataCompleta(edital.dataPublicacao)}` : null,
  ].filter(Boolean) as string[]

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
      <Link
        href="/"
        className="flex w-fit items-center gap-1.5 text-[12.5px] text-accent hover:text-accent-strong"
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m14 6-6 6 6 6" />
        </svg>
        Voltar para a caixa de entrada
      </Link>

      <div className="flex items-start gap-4">
        <div className="flex min-w-0 grow flex-col gap-1.5">
          <h1 className="m-0 font-display text-[25px] font-semibold leading-tight -tracking-[0.01em]">
            {edital.objeto}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {edital.orgao && <span>{edital.orgao}</span>}
            {identificacao.map((texto) => (
              <span key={texto} className="flex items-center gap-2">
                <span aria-hidden="true">·</span>
                <span>{texto}</span>
              </span>
            ))}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-control border px-3 py-[7px] text-[12.5px] font-medium ${
            prazo.urgente
              ? 'border-[#ebd3c7] bg-warn-soft text-warn'
              : 'border-border-strong bg-surface text-muted'
          }`}
          title={"estimado" in prazo ? EXPLICACAO_PRAZO_ESTIMADO : undefined}
        >
          {prazo.texto}
        </span>
      </div>
    </header>
  )
}
