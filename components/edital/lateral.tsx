'use client'

import { useOptimistic, useTransition } from 'react'
import { alternarFavorito } from '@/app/actions/edital'
import { PainelAcompanhamento } from '@/components/acompanhamento/painel'
import { IconeEstrela } from '@/components/icons'
import type { DadosDaLateral } from '@/lib/acompanhamento-tipos'

type Props = {
  editalId: number
  favorito: boolean
  linkSistemaOrigem: string | null
  portal: string | null
  dados: DadosDaLateral
  // Situação no PNCP + linha do tempo (tela 04), montado pela página.
  situacaoPncp?: React.ReactNode
}

export function LateralEdital({ editalId, favorito, linkSistemaOrigem, portal, dados, situacaoPncp }: Props) {
  const [, iniciarTransicao] = useTransition()
  const [marcado, marcarOtimista] = useOptimistic(favorito, (atual: boolean) => !atual)

  function favoritar() {
    iniciarTransicao(async () => {
      marcarOtimista(null)
      await alternarFavorito(editalId)
    })
  }

  return (
    <aside className="flex w-[306px] shrink-0 flex-col gap-3.5">
      <button
        type="button"
        onClick={favoritar}
        aria-pressed={marcado}
        className={`flex h-10 items-center justify-center gap-2 rounded-control border text-[13px] font-medium ${
          marcado
            ? 'border-accent bg-accent-soft text-accent-strong'
            : 'border-border-strong bg-surface text-ink hover:bg-bg'
        }`}
      >
        <IconeEstrela size={16} />
        {marcado ? 'Favoritado' : 'Favoritar'}
      </button>

      {/* O sistema serve pra ler o edital inteiro aqui dentro; o portal é só
          pra hora de participar da disputa de fato. */}
      {linkSistemaOrigem && (
        <a
          href={linkSistemaOrigem}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 items-center justify-center gap-2 rounded-control border border-accent bg-accent text-[13px] font-medium text-white hover:bg-accent-strong"
        >
          Participar {portal ? `no ${portal}` : 'no portal'}
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
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
      )}

      <PainelAcompanhamento fonte="pncp" itemId={editalId} dados={dados} />

      {situacaoPncp}
    </aside>
  )
}
