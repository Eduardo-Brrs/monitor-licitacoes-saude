'use client'

import { useState, useTransition } from 'react'
import { verificarAgora } from '@/app/actions/acompanhamento'
import { formatarDataHora } from '@/lib/formato'

// Lateral da tela 04: "Situação no PNCP" (somente leitura, vem do sync —
// separada do status interno, regra 2) e verificação. Os fatos do PNCP
// aparecem na linha do tempo da coluna principal desde 2026-10-23.

type Props = {
  editalId: number
  acompanhado: boolean
  situacao: string | null
  verificadoEm: string | null
  proximaEm: string | null
  erro: string | null
}

const CARTAO = 'flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4'
const TITULO = 'm-0 text-[11px] font-medium uppercase tracking-[0.05em] text-faint'

export function SituacaoPncp({ editalId, acompanhado, situacao, verificadoEm, proximaEm, erro }: Props) {
  const [pendente, iniciar] = useTransition()
  const [erroAgora, setErroAgora] = useState<string | null>(null)

  function verificar() {
    setErroAgora(null)
    iniciar(async () => {
      const r = await verificarAgora(editalId)
      if (r.erro) setErroAgora(r.erro)
    })
  }

  const falha = erroAgora ?? erro

  return (
    <div className={CARTAO}>
      <div className="flex flex-col gap-1">
        <span className={TITULO}>Situação no PNCP</span>
        <span className="text-[13.5px] font-medium text-ink">
          {situacao ?? (acompanhado ? 'Ainda não verificado' : 'Não acompanhado')}
        </span>
        <span className="text-[11.5px] leading-snug text-faint">
          {acompanhado
            ? 'Somente leitura, vem do PNCP. Documentos novos, mudança de data, resultado, ata e contrato são conferidos a cada 12h e entram na linha do tempo.'
            : 'Favorite ou gerencie pra acompanhar documentos novos, mudança de data, resultado, ata e contrato.'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
        <span className="text-[11.5px] text-faint">
          {verificadoEm ? `Verificado em ${formatarDataHora(verificadoEm)}` : 'Nunca verificado'}
          {acompanhado && proximaEm && ` · próxima por volta de ${formatarDataHora(proximaEm)}`}
        </span>
        {falha && <span className="text-[11.5px] leading-snug text-warn">PNCP não respondeu na última tentativa. Tente de novo mais tarde.</span>}
        <button
          type="button"
          onClick={verificar}
          disabled={pendente}
          className="h-9 rounded-control border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-ink hover:bg-bg disabled:opacity-60"
        >
          {pendente ? 'Consultando o PNCP…' : 'Verificar agora'}
        </button>
      </div>
    </div>
  )
}
