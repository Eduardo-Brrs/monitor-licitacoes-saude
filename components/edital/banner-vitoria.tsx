'use client'

import { useState, useTransition } from 'react'
import { confirmarVitoria, descartarSugestaoVitoria } from '@/app/actions/acompanhamento'

// Tela 04 do DESIGN.md: vitória detectada pelo CNPJ é sugestão, nunca escrita
// automática (regra 6). Um clique confirma (status interno vira "Ganha"),
// outro esconde a sugestão.
export function BannerVitoria({ editalId, titulo, detalhe }: { editalId: number; titulo: string; detalhe: string }) {
  const [pendente, iniciar] = useTransition()
  const [escondido, setEscondido] = useState(false)
  if (escondido) return null

  return (
    <div className="flex items-center gap-3 border-b border-accent/30 bg-accent-soft px-6 py-3">
      <div className="flex grow flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-accent-strong">{titulo}</span>
        <span className="text-[12.5px] text-ink-2">{detalhe}</span>
      </div>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            await confirmarVitoria(editalId)
            setEscondido(true)
          })
        }
        className="h-9 rounded-control border border-accent bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        Confirmar como ganha
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            await descartarSugestaoVitoria(editalId)
            setEscondido(true)
          })
        }
        className="h-9 rounded-control border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-bg disabled:opacity-60"
      >
        Não é nosso
      </button>
    </div>
  )
}
