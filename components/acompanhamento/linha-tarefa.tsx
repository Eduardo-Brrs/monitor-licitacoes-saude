'use client'

import Link from 'next/link'
import { useOptimistic, useTransition } from 'react'
import { alternarTarefaConcluida, excluirTarefa } from '@/app/actions/acompanhamento'
import { descreverPrazo } from '@/lib/formato'

type Props = {
  id: number
  descricao: string
  responsavel: string | null
  prazo: string | null
  concluida: boolean
  itemObjeto: string
  itemHref: string
}

export function LinhaTarefa({ id, descricao, responsavel, prazo, concluida, itemObjeto, itemHref }: Props) {
  const [, iniciar] = useTransition()
  const [feita, marcarOtimista] = useOptimistic(concluida, (atual: boolean) => !atual)
  const prazoTarefa = descreverPrazo(prazo)

  return (
    <li className="group flex items-start gap-3 rounded-card border border-border bg-surface px-4 py-3">
      <input
        type="checkbox"
        checked={feita}
        onChange={() =>
          iniciar(async () => {
            marcarOtimista(null)
            await alternarTarefaConcluida(id)
          })
        }
        aria-label={feita ? 'Reabrir tarefa' : 'Concluir tarefa'}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className={`text-[13.5px] ${feita ? 'text-faint line-through' : 'font-medium text-ink'}`}>{descricao}</span>
        <Link href={itemHref} className="truncate text-[12px] text-muted no-underline hover:text-accent" title={itemObjeto}>
          {itemObjeto}
        </Link>
      </div>
      <span className="w-[90px] shrink-0 pt-0.5 text-[12.5px] text-ink-2">{responsavel ?? '—'}</span>
      <span
        className={`w-[150px] shrink-0 pt-0.5 text-right text-[12.5px] ${
          !feita && prazoTarefa.urgente ? 'font-medium text-warn' : 'text-faint'
        }`}
      >
        {feita ? 'concluída' : prazoTarefa.texto}
      </span>
      <button
        type="button"
        onClick={() => iniciar(() => excluirTarefa(id))}
        aria-label={`Excluir tarefa ${descricao}`}
        title="Excluir tarefa"
        className="shrink-0 rounded p-1 text-faint opacity-0 hover:text-warn focus:opacity-100 group-hover:opacity-100"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  )
}
