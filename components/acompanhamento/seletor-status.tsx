'use client'

import { useOptimistic, useTransition } from 'react'
import { definirEtapa } from '@/app/actions/acompanhamento'
import {
  ETAPAS_ABERTAS,
  ETIQUETA_RESULTADO,
  etapaFinal,
  ROTULO_ETAPA,
  type Etapa,
  type Finalizacao,
  type FonteItem,
} from '@/lib/acompanhamento-tipos'

// Etapa direto na linha do Acompanhamento (2026-10-07, pedido do usuário:
// favorita, decide se vai participar e passa pra "Gerenciada" sem abrir o
// edital). Mesma ação do seletor da lateral do detalhe. Finalizar e remover
// ficam no menu de ações (2026-10-27): finalizar pede o resultado. Item
// finalizado mostra o resultado e pode ser reaberto escolhendo uma etapa.

const COR_ETAPA: Record<Etapa, string> = {
  favoritada: 'bg-[#edebe5] text-ink',
  gerenciada: 'bg-[#edebe5] text-ink',
  em_andamento: 'bg-warn-soft text-warn-strong',
  finalizada: 'bg-[#edebe5] text-ink-2',
  ganha: 'bg-accent-soft text-accent-strong',
}

export function SeletorStatus({
  fonte,
  itemId,
  etapa,
  finalizacao,
  rotulo,
}: {
  fonte: FonteItem
  itemId: number
  etapa: Etapa | null
  finalizacao: Finalizacao | null
  rotulo: string
}) {
  const [, iniciar] = useTransition()
  const [atual, mudarOtimista] = useOptimistic(etapa, (_: Etapa | null, nova: Etapa | null) => nova)

  function mudar(valor: string) {
    const nova = valor === '' ? null : (valor as Etapa)
    iniciar(async () => {
      mudarOtimista(nova)
      await definirEtapa(fonte, itemId, nova)
    })
  }

  return (
    <div className="relative flex w-full">
      <select
        value={atual ?? ''}
        onChange={(e) => mudar(e.target.value)}
        aria-label={`Status: ${rotulo}`}
        title="Mudar status"
        className={`w-full min-w-0 cursor-pointer appearance-none truncate rounded-badge py-1 pl-[9px] pr-6 text-[11.5px] outline-offset-2 hover:brightness-95 ${COR_ETAPA[atual ?? 'favoritada']}`}
      >
        {atual !== null && etapaFinal(atual) && (
          <option value={atual} disabled>
            {finalizacao ? ETIQUETA_RESULTADO[finalizacao.resultado] : ROTULO_ETAPA[atual]}
          </option>
        )}
        {ETAPAS_ABERTAS.map((e) => (
          <option key={e} value={e}>
            {atual !== null && etapaFinal(atual) ? `Reabrir: ${ROTULO_ETAPA[e]}` : ROTULO_ETAPA[e]}
          </option>
        ))}
      </select>
      <svg
        width={10}
        height={10}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-[8px] top-1/2 -translate-y-1/2 opacity-60"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}
