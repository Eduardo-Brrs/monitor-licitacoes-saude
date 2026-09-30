'use client'

import { useOptimistic, useTransition } from 'react'
import { alternarFavoritoAviso } from '@/app/actions/diario'
import { alternarFavorito } from '@/app/actions/edital'
import { IconeEstrela } from '@/components/icons'
import type { FonteItem } from '@/lib/acompanhamento-tipos'

// Estrela da coluna "Favorito" da tabela de acompanhamento — edital e aviso
// de diário gravam em tabelas diferentes.
export function EstrelaFavorito({
  fonte,
  itemId,
  favorito,
  rotulo,
}: {
  fonte: FonteItem
  itemId: number
  favorito: boolean
  rotulo: string
}) {
  const [, iniciar] = useTransition()
  const [marcado, marcarOtimista] = useOptimistic(favorito, (atual: boolean) => !atual)

  return (
    <button
      type="button"
      onClick={() =>
        iniciar(async () => {
          marcarOtimista(null)
          if (fonte === 'pncp') await alternarFavorito(itemId)
          else await alternarFavoritoAviso(fonte, itemId)
        })
      }
      aria-pressed={marcado}
      aria-label={`${marcado ? 'Desfavoritar' : 'Favoritar'}: ${rotulo}`}
      title={marcado ? 'Tirar dos favoritos' : 'Favoritar'}
      className={`flex size-8 items-center justify-center rounded-control ${
        marcado ? 'text-accent [&_svg]:fill-current' : 'text-faint hover:text-ink'
      }`}
    >
      <IconeEstrela size={15} />
    </button>
  )
}
