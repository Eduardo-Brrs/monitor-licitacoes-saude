'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// Janela por cima da tela, sem sair da página (2026-10-27: finalizar,
// tarefa e anotação a partir da lista do Gerenciar). <dialog> do navegador:
// Esc fecha, foco fica preso dentro, o resto da tela não responde.
export function Janela({
  aberta,
  aoFechar,
  titulo,
  subtitulo,
  larga = false,
  children,
}: {
  aberta: boolean
  aoFechar: () => void
  titulo: string
  subtitulo?: string
  larga?: boolean // formulários com várias colunas (item de ata)
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberta && !dialogo.open) dialogo.showModal()
    if (!aberta && dialogo.open) dialogo.close()
  }, [aberta])

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      // Clique no fundo escuro (fora da caixa) fecha.
      onClick={(e) => {
        if (e.target === ref.current) aoFechar()
      }}
      className={`m-auto ${larga ? 'w-[min(640px,calc(100vw-32px))]' : 'w-[min(460px,calc(100vw-32px))]'} rounded-card border border-border-strong bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/35`}
    >
      {aberta && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <h2 className="m-0 font-display text-[19px] font-semibold">{titulo}</h2>
              {subtitulo && <p className="m-0 line-clamp-2 text-[12.5px] text-muted">{subtitulo}</p>}
            </div>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="shrink-0 rounded p-1 text-faint hover:bg-bg hover:text-ink"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export const CAMPO_JANELA =
  'h-9 w-full rounded-control border border-border-strong bg-surface px-2.5 text-[13px] text-ink disabled:opacity-60'
export const BOTAO_PRINCIPAL =
  'h-11 w-full rounded-control border border-accent bg-accent px-4 text-[14px] font-semibold text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-50'
