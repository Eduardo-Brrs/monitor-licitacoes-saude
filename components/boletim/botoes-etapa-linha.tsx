import { IconeEstrela, IconeGerenciar } from '@/components/icons'
import { etapaAvancada, ROTULO_ETAPA, type Etapa } from '@/lib/acompanhamento-tipos'

// Estrela (F) e Gerenciar (G) na linha do boletim, pra edital e aviso
// (2026-10-07). Favoritada = avaliando se vai participar, gerenciada = vai
// participar; um apaga o outro. Etapa avançada trava os dois (só pelo seletor
// do Acompanhamento ou do detalhe) — o boletim é triagem em rajada e um F
// errado não pode desfazer "Ganha".
export function BotoesEtapaLinha({
  etapa,
  visto,
  onFavoritar,
  onGerenciar,
}: {
  etapa: Etapa | null
  visto: boolean
  onFavoritar: () => void
  onGerenciar: () => void
}) {
  const travado = etapaAvancada(etapa)
  const avisoTravado = travado ? `Está como ${ROTULO_ETAPA[etapa as Etapa]} — mude em Gerenciar licitações` : undefined
  const desligado = visto
    ? 'border-[#e0ddd6] bg-surface text-muted hover:text-ink'
    : 'border-border-strong bg-surface text-ink'
  const ligado = 'border-accent bg-accent-soft text-accent-strong'
  const base = 'flex size-10 items-center justify-center rounded-control border disabled:cursor-default disabled:opacity-40'
  const favoritada = etapa === 'favoritada'
  const gerenciada = etapa === 'gerenciada'

  return (
    <>
      <button
        type="button"
        onClick={onFavoritar}
        disabled={travado}
        aria-label={favoritada ? 'Tirar dos favoritos' : 'Favoritar'}
        // Tooltip nativo com o atalho: sem ele o ícone sozinho não diz o que
        // faz, e é o jeito de descobrir o teclado sem ler a faixa de filtros.
        title={avisoTravado ?? (favoritada ? 'Tirar dos favoritos (F)' : 'Favoritar — vou avaliar (F)')}
        aria-pressed={favoritada}
        className={`${base} ${favoritada ? ligado : desligado}`}
      >
        <IconeEstrela size={17} />
      </button>
      <button
        type="button"
        onClick={onGerenciar}
        disabled={travado}
        aria-label={gerenciada ? 'Tirar de gerenciadas' : 'Gerenciar'}
        title={avisoTravado ?? (gerenciada ? 'Tirar de gerenciadas (G)' : 'Gerenciar — vamos participar (G)')}
        aria-pressed={gerenciada}
        className={`${base} ${gerenciada || travado ? ligado : desligado}`}
      >
        <IconeGerenciar size={17} />
      </button>
    </>
  )
}
