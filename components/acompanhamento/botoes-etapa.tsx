'use client'

import { IconeEstrela, IconeGerenciar } from '@/components/icons'
import {
  etapaAoFavoritar,
  etapaAoGerenciar,
  etapaAvancada,
  ROTULO_ETAPA,
  type Etapa,
} from '@/lib/acompanhamento-tipos'

// Os dois primeiros degraus da etapa na lateral do detalhe: Favoritar
// (avaliando) e Gerenciar (vai participar). Um apaga o outro. Daí pra frente
// (em andamento, finalizada, ganha) só pelo seletor do painel.

const BOTAO = 'flex h-10 grow basis-0 items-center justify-center gap-2 rounded-control border text-[13px] font-medium'
const LIGADO = 'border-accent bg-accent-soft text-accent-strong'
const DESLIGADO = 'border-border-strong bg-surface text-ink hover:bg-bg'

export function BotoesEtapa({ etapa, onMudar }: { etapa: Etapa | null; onMudar: (nova: Etapa | null) => void }) {
  const travado = etapaAvancada(etapa)
  const avisoTravado = travado ? `Está como ${ROTULO_ETAPA[etapa as Etapa]} — mude no status abaixo` : undefined
  const favoritada = etapa === 'favoritada'
  const gerenciada = etapa === 'gerenciada'

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onMudar(etapaAoFavoritar(etapa))}
        disabled={travado}
        aria-pressed={favoritada}
        title={avisoTravado ?? (favoritada ? 'Tirar dos favoritos' : 'Favoritar: vou avaliar se vale participar')}
        className={`${BOTAO} ${favoritada ? `${LIGADO} [&_svg]:fill-current` : DESLIGADO} disabled:cursor-default disabled:opacity-50`}
      >
        <IconeEstrela size={16} />
        {favoritada ? 'Favoritada' : 'Favoritar'}
      </button>
      <button
        type="button"
        onClick={() => onMudar(etapaAoGerenciar(etapa))}
        disabled={travado}
        aria-pressed={gerenciada}
        title={avisoTravado ?? (gerenciada ? 'Tirar de gerenciadas' : 'Gerenciar: vamos participar')}
        className={`${BOTAO} ${gerenciada ? LIGADO : DESLIGADO} disabled:cursor-default disabled:opacity-50`}
      >
        <IconeGerenciar size={16} />
        {gerenciada ? 'Gerenciada' : 'Gerenciar'}
      </button>
    </div>
  )
}
