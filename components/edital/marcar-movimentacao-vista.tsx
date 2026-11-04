'use client'

import { useEffect } from 'react'
import { marcarMovimentacaoVista } from '@/app/actions/edital'

// Abrir o edital apaga o "novo" da movimentação no Andamento. Feito no
// navegador, não na renderização do servidor: um prefetch de link não pode
// contar como "visto".
export function MarcarMovimentacaoVista({ editalId }: { editalId: number }) {
  useEffect(() => {
    marcarMovimentacaoVista(editalId)
  }, [editalId])
  return null
}
