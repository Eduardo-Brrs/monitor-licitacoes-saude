'use client'

import { useOptimistic, useTransition } from 'react'
import { alternarFavoritoAviso } from '@/app/actions/diario'
import { IconeEstrela } from '@/components/icons'
import type { FonteDiario } from '@/lib/diarios'

// Mesmo botão da lateral do edital, na tabela de status dos diários.
export function BotaoFavoritarAviso({
  fonte,
  avisoId,
  favorito,
}: {
  fonte: FonteDiario
  avisoId: number
  favorito: boolean
}) {
  const [, iniciar] = useTransition()
  const [marcado, marcarOtimista] = useOptimistic(favorito, (atual: boolean) => !atual)

  return (
    <button
      type="button"
      onClick={() =>
        iniciar(async () => {
          marcarOtimista(null)
          await alternarFavoritoAviso(fonte, avisoId)
        })
      }
      aria-pressed={marcado}
      className={`flex h-10 items-center justify-center gap-2 rounded-control border text-[13px] font-medium ${
        marcado ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border-strong bg-surface text-ink hover:bg-bg'
      }`}
    >
      <IconeEstrela size={16} />
      {marcado ? 'Favoritado' : 'Favoritar'}
    </button>
  )
}
