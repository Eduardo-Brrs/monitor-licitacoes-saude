'use client'

import { useState, useTransition } from 'react'
import { descartarSugestaoVitoria } from '@/app/actions/acompanhamento'
import { JanelaFinalizar } from '@/components/acompanhamento/janela-finalizar'

// Tela 04 do DESIGN.md: vitória detectada pelo CNPJ é sugestão, nunca escrita
// automática (regra 6). Confirmar abre a janela "Finalizar" já em "ganhamos
// todos os itens" (2026-10-27) — dá pra trocar pra parte, pôr o valor e a
// observação; o outro botão esconde a sugestão.
export function BannerVitoria({
  editalId,
  objeto,
  titulo,
  detalhe,
  valorHomologado,
}: {
  editalId: number
  objeto: string
  valorHomologado: number
  titulo: string
  detalhe: string
}) {
  const [pendente, iniciar] = useTransition()
  const [escondido, setEscondido] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
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
        onClick={() => setFinalizando(true)}
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
      <JanelaFinalizar
        fonte="pncp"
        itemId={editalId}
        rotulo={objeto}
        aberta={finalizando}
        aoFechar={() => setFinalizando(false)}
        sugerido="ganhou_todos"
        valorSugerido={valorHomologado > 0 ? valorHomologado : undefined}
        aoFinalizar={() => setEscondido(true)}
      />
    </div>
  )
}
