'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Quem está escrevendo (2026-10-23). Sem login: cada um escolhe uma vez no
// próprio computador e o navegador lembra. Compartilhado entre a caixa da
// linha do tempo e o "Responder" das tarefas — mudar num muda no outro.

const CHAVE = 'licitacoes:autor'
const EVENTO = 'licitacoes:autor-mudou'

// Reserva pra navegador sem armazenamento: vale até recarregar a página.
let emMemoria = ''

function ler(): string {
  try {
    return localStorage.getItem(CHAVE) ?? emMemoria
  } catch {
    return emMemoria
  }
}

function assinar(aviso: () => void): () => void {
  window.addEventListener(EVENTO, aviso)
  window.addEventListener('storage', aviso)
  return () => {
    window.removeEventListener(EVENTO, aviso)
    window.removeEventListener('storage', aviso)
  }
}

// '' = ninguém escolhido ainda.
export function useAutor(): [string, (id: string) => void] {
  const autor = useSyncExternalStore(assinar, ler, () => '')
  const definir = useCallback((id: string) => {
    emMemoria = id
    try {
      localStorage.setItem(CHAVE, id)
    } catch {
      // Fica só emMemoria.
    }
    window.dispatchEvent(new Event(EVENTO))
  }, [])
  return [autor, definir]
}
