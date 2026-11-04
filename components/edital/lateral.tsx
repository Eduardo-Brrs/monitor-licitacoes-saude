'use client'

import { PainelAcompanhamento } from '@/components/acompanhamento/painel'
import type { DadosDaLateral } from '@/lib/acompanhamento-tipos'

type Props = {
  editalId: number
  objeto: string
  linkSistemaOrigem: string | null
  portal: string | null
  dados: DadosDaLateral
  // Situação no PNCP + linha do tempo (tela 04), montado pela página.
  situacaoPncp?: React.ReactNode
}

export function LateralEdital({ editalId, objeto, linkSistemaOrigem, portal, dados, situacaoPncp }: Props) {
  return (
    <aside className="flex w-[306px] shrink-0 flex-col gap-3.5">
      {/* Favoritar/Gerenciar ficam no painel, junto do seletor de status — um
          estado só pra etapa (2026-10-07). */}
      <PainelAcompanhamento
        fonte="pncp"
        itemId={editalId}
        rotulo={objeto}
        dados={dados}
        acaoPrincipal={
          <>
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
          </>
        }
      />

      {situacaoPncp}
    </aside>
  )
}
