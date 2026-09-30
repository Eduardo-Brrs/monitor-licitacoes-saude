'use client'

import { useState, useTransition } from 'react'
import { verificarAgora } from '@/app/actions/acompanhamento'
import { formatarDataHora, formatarDiaMes } from '@/lib/formato'

// Lateral da tela 04: "Situação no PNCP" (somente leitura, vem do sync —
// separada do status interno, regra 2), linha do tempo e verificação.

export interface EventoParaTela {
  tipo: string
  descricao: string
  dataFato: string | null
  capturadoEm: string | null
}

type Props = {
  editalId: number
  acompanhado: boolean
  situacao: string | null
  eventos: EventoParaTela[]
  verificadoEm: string | null
  proximaEm: string | null
  erro: string | null
}

const CARTAO = 'flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4'
const TITULO = 'm-0 text-[11px] font-medium uppercase tracking-[0.05em] text-faint'

export function SituacaoPncp({ editalId, acompanhado, situacao, eventos, verificadoEm, proximaEm, erro }: Props) {
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
            ? 'Somente leitura, vem do PNCP. Resultado, ata e contrato são conferidos a cada 12h.'
            : 'Favorite (ou dê um status) pra conferir resultado, ata e contrato automaticamente.'}
        </span>
      </div>

      {eventos.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-2.5">
          <span className={TITULO}>Linha do tempo</span>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {eventos.map((e, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    e.tipo === 'vitoria' ? 'bg-accent' : e.tipo === 'abertura' || e.tipo === 'publicacao' ? 'bg-border-strong' : 'bg-ink-2'
                  }`}
                />
                <div className="flex flex-col">
                  <span className={`text-[12.5px] ${e.tipo === 'vitoria' ? 'font-medium text-accent-strong' : 'text-ink'}`}>
                    {e.descricao}
                  </span>
                  <span className="text-[11.5px] text-faint">
                    {e.dataFato ? formatarDiaMes(e.dataFato) : 'sem data'}
                    {e.capturadoEm && ` · capturado ${formatarDataHora(e.capturadoEm)}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

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
