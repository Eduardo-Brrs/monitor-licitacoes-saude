'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { procurarEditalAgora } from '@/app/actions/acompanhamento'
import type { FonteLigavel } from '@/lib/ligar-avisos'

// "Procurar no PNCP agora" na tela do aviso (2026-10-23) — a mesma busca que
// o sistema faz sozinho a cada 12h. Achou: vai direto pro edital.
export function ProcurarEdital({ fonte, avisoId }: { fonte: FonteLigavel; avisoId: number }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [mensagem, setMensagem] = useState<string | null>(null)

  function procurar() {
    setMensagem(null)
    iniciar(async () => {
      const r = await procurarEditalAgora(fonte, avisoId)
      if (r.numero) {
        router.push(`/edital/${encodeURIComponent(r.numero)}`)
      } else {
        setMensagem(r.erro ? 'O PNCP não respondeu agora. Tente de novo em instantes.' : 'Ainda não está no PNCP.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1">
      <button
        type="button"
        onClick={procurar}
        disabled={pendente}
        className="h-9 rounded-control border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-ink hover:bg-bg disabled:opacity-60"
      >
        {pendente ? 'Procurando no PNCP…' : 'Procurar no PNCP agora'}
      </button>
      {mensagem && <span className="text-[12px] text-muted">{mensagem}</span>}
    </div>
  )
}
