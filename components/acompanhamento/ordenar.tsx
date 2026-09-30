'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Ordenacao } from '@/lib/acompanhamento-tipos'

export function SeletorOrdem({ ordem }: { ordem: Ordenacao }) {
  const router = useRouter()
  const rota = usePathname()
  const params = useSearchParams()

  function mudar(valor: string) {
    const novos = new URLSearchParams(params)
    if (valor === 'abertura') novos.delete('ordem')
    else novos.set('ordem', valor)
    const query = novos.toString()
    router.push(query ? `${rota}?${query}` : rota)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="ordenar" className="text-[12.5px] text-muted">
        Ordenar
      </label>
      <select
        id="ordenar"
        value={ordem}
        onChange={(e) => mudar(e.target.value)}
        className="h-[34px] rounded-control border border-border-strong bg-surface px-2.5 text-[12.5px] text-ink"
      >
        <option value="abertura">Abertura mais próxima</option>
        <option value="valor">Maior valor</option>
      </select>
    </div>
  )
}
