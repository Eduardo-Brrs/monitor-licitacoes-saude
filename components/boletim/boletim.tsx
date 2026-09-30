'use client'

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarFavorito, descartar, desfazerDescarte, marcarVisto } from '@/app/actions/edital'
import { alternarFavoritoAviso, descartarAviso, desfazerDescarteAviso, marcarAvisoVisto } from '@/app/actions/diario'
import { Cabecalho } from '@/components/boletim/cabecalho'
import { FaixaFiltros } from '@/components/boletim/faixa-filtros'
import { LinhaAviso } from '@/components/boletim/linha-aviso'
import { LinhaEdital } from '@/components/boletim/linha-edital'
import type { EditalDoBoletim, ResumoDoDia } from '@/lib/boletim'
import type { AvisoDeDiario } from '@/lib/diarios'

type Props = {
  dia: string
  editais: EditalDoBoletim[]
  descartados: EditalDoBoletim[]
  avisos: AvisoDeDiario[]
  avisosDescartados: AvisoDeDiario[]
  resumo: ResumoDoDia
  anterior: string | null
  proximo: string | null
}

// Lista única de editais do PNCP e avisos de diário (decidido com o Eduardo em
// 2026-09-24: quem usa quer o que bate com os filtros, não importa de onde
// veio — a origem vira etiqueta na linha). Tudo trabalha sobre um item com
// chave única, já que os ids das tabelas colidem entre si.
type Item =
  | { secao: 'pncp'; chave: string; edital: EditalDoBoletim }
  | { secao: 'diario'; chave: string; aviso: AvisoDeDiario }

function itemDeEdital(edital: EditalDoBoletim): Item {
  return { secao: 'pncp', chave: `pncp:${edital.id}`, edital }
}

function itemDeAviso(aviso: AvisoDeDiario): Item {
  return { secao: 'diario', chave: aviso.chave, aviso }
}

function estaVisto(item: Item): boolean {
  return item.secao === 'pncp' ? item.edital.visto : item.aviso.visto
}

function textoDeBusca(item: Item): string {
  return item.secao === 'pncp'
    ? [item.edital.objeto, item.edital.orgao, item.edital.numeroCompra].filter(Boolean).join(' ')
    : [item.aviso.texto, item.aviso.entidade, item.aviso.processo, item.aviso.tipo].filter(Boolean).join(' ')
}

function tituloDe(item: Item): string {
  return item.secao === 'pncp' ? item.edital.objeto : item.aviso.texto
}

function subtituloDe(item: Item): string {
  return (item.secao === 'pncp' ? item.edital.orgao : item.aviso.entidade) ?? ''
}

type AcaoOtimista =
  | { tipo: 'favorito'; chave: string }
  | { tipo: 'descartar'; chave: string }
  | { tipo: 'visto'; chave: string }

function aplicar(item: Item, mudanca: Partial<{ visto: boolean; favorito: boolean }>): Item {
  return item.secao === 'pncp'
    ? { ...item, edital: { ...item.edital, ...mudanca } }
    : { ...item, aviso: { ...item.aviso, ...mudanca } }
}

// Janela do desfazer. Na triagem em rajada o D sai rápido e a percepção do
// erro vem alguns segundos depois, quando a lista já rolou — 10s fechava a
// janela antes disso.
const SEGUNDOS_PARA_DESFAZER = 20

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function DivisorVistos() {
  return (
    <div className="flex items-center gap-2.5 px-0.5 pb-1 pt-2.5">
      <span className="text-[11.5px] uppercase tracking-[0.06em] text-faint">Já vistos</span>
      <span className="h-px grow bg-border" />
    </div>
  )
}

// Cotação e aquisição judicial quase nunca trazem data, mas o prazo pra mandar
// proposta costuma ser de uns 5 dias úteis a partir da publicação — usar isso
// como data estimada põe esses avisos junto dos prazos curtos, que é onde
// eles competem por atenção. O resto sem data vai pro fim.
const DIAS_PRAZO_COTACAO = 5
const SEM_DATA = Number.MAX_SAFE_INTEGER

function urgencia(item: Item, dia: string): number {
  if (item.secao === 'pncp') {
    return item.edital.aberturaProposta ? Date.parse(item.edital.aberturaProposta) : SEM_DATA
  }
  if (item.aviso.dataSessao) return Date.parse(item.aviso.dataSessao)
  if (item.aviso.fonte === 'judicial' || item.aviso.tipo === 'Cotação') {
    return Date.parse(`${dia}T12:00:00Z`) + DIAS_PRAZO_COTACAO * 86_400_000
  }
  return SEM_DATA
}

function estaNosFiltros(item: Item): boolean {
  return item.secao === 'pncp' || item.aviso.relevante
}

export function Boletim({ dia, editais, descartados, avisos, avisosDescartados, resumo, anterior, proximo }: Props) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [selecionadoBruto, setSelecionado] = useState(0)
  const [descartadoRecente, setDescartadoRecente] = useState<Item | null>(null)
  const [mostrarDescartados, setMostrarDescartados] = useState(false)
  const [mostrarTodosAvisos, setMostrarTodosAvisos] = useState(false)
  const [restaurados, setRestaurados] = useState<string[]>([])
  const [, iniciarTransicao] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  const itensDoServidor = useMemo(
    () => [...editais.map(itemDeEdital), ...avisos.map(itemDeAviso)],
    [editais, avisos]
  )

  // Estado otimista: a triagem é por teclado e em rajada, então esperar a ida
  // ao servidor a cada tecla deixaria a lista sempre um passo atrás do dedo.
  const [lista, aplicarOtimista] = useOptimistic(itensDoServidor, (estado: Item[], acao: AcaoOtimista) => {
    switch (acao.tipo) {
      case 'favorito':
        return estado.map((item) => {
          if (item.chave !== acao.chave) return item
          const favorito = item.secao === 'pncp' ? item.edital.favorito : item.aviso.favorito
          return aplicar(item, { favorito: !favorito, visto: true })
        })
      case 'visto':
        return estado.map((item) => (item.chave === acao.chave ? aplicar(item, { visto: true }) : item))
      case 'descartar':
        return estado.filter((item) => item.chave !== acao.chave)
    }
  })

  // Ordem congelada enquanto o boletim está aberto. O servidor devolve não
  // vistos primeiro, mas se a lista se reordenasse a cada F o item saltaria
  // pro fim embaixo do cursor e o D seguinte acertaria outro — o componente é
  // remontado por dia (key no page), então a ordem volta a valer na próxima
  // abertura. Chaves novas entram no fim; as que saíram (descarte) caem fora.
  const [ordemInicial] = useState(() =>
    [...itensDoServidor]
      .sort((a, b) => Number(estaVisto(a)) - Number(estaVisto(b)) || urgencia(a, dia) - urgencia(b, dia))
      .map((item) => item.chave)
  )
  const [vistosAoAbrir] = useState(
    () => new Set(itensDoServidor.filter(estaVisto).map((item) => item.chave))
  )

  // Calculado na renderização em vez de sincronizado num efeito: chave
  // descartada continua na ordem (só deixa de ser renderizada, porque some da
  // lista), então o desfazer devolve o item na posição original em vez de
  // jogá-lo no fim.
  const ordem = useMemo(() => {
    const conhecidas = new Set(ordemInicial)
    const novas = itensDoServidor.filter((item) => !conhecidas.has(item.chave)).map((item) => item.chave)
    return novas.length === 0 ? ordemInicial : [...ordemInicial, ...novas]
  }, [ordemInicial, itensDoServidor])

  // Filtro no cliente: um dia tem dezenas de linhas, não milhares, então dá
  // resposta instantânea sem ida ao servidor a cada tecla. Aviso fora dos
  // filtros (sem keyword) só aparece com "mostrar" no rodapé — ou quando a
  // busca o encontra, porque procurar algo e não achar por causa de um filtro
  // invisível seria pior que o ruído.
  const termo = normalizar(busca.trim())
  const navegaveis = useMemo(() => {
    const porChave = new Map(lista.map((item) => [item.chave, item]))
    const naOrdem = ordem.map((chave) => porChave.get(chave)).filter((item): item is Item => item !== undefined)
    const casaBusca = (item: Item) => !termo || normalizar(textoDeBusca(item)).includes(termo)
    const aparece = (item: Item) => mostrarTodosAvisos || termo !== '' || estaNosFiltros(item)
    return naOrdem.filter((item) => casaBusca(item) && aparece(item))
  }, [lista, ordem, termo, mostrarTodosAvisos])

  // Seleção sempre dentro da lista, que encolhe com descarte e busca.
  const selecionado = Math.min(selecionadoBruto, Math.max(0, navegaveis.length - 1))

  const itensDescartados = useMemo(
    () =>
      [...descartados.map(itemDeEdital), ...avisosDescartados.map(itemDeAviso)].filter(
        (item) => !restaurados.includes(item.chave)
      ),
    [descartados, avisosDescartados, restaurados]
  )

  const favoritar = useCallback(
    (item: Item) => {
      iniciarTransicao(async () => {
        aplicarOtimista({ tipo: 'favorito', chave: item.chave })
        if (item.secao === 'pncp') await alternarFavorito(item.edital.id)
        else await alternarFavoritoAviso(item.aviso.fonte, item.aviso.id)
      })
    },
    [aplicarOtimista]
  )

  const marcarAberto = useCallback(
    (item: Item) => {
      iniciarTransicao(async () => {
        aplicarOtimista({ tipo: 'visto', chave: item.chave })
        if (item.secao === 'pncp') await marcarVisto(item.edital.id)
        else await marcarAvisoVisto(item.aviso.fonte, item.aviso.id)
      })
    },
    [aplicarOtimista]
  )

  const descartarItem = useCallback(
    (item: Item) => {
      setDescartadoRecente(item)
      iniciarTransicao(async () => {
        aplicarOtimista({ tipo: 'descartar', chave: item.chave })
        if (item.secao === 'pncp') await descartar(item.edital.id)
        else await descartarAviso(item.aviso.fonte, item.aviso.id)
      })
    },
    [aplicarOtimista]
  )

  const restaurar = useCallback((item: Item) => {
    setRestaurados((atual) => [...atual, item.chave])
    iniciarTransicao(async () => {
      if (item.secao === 'pncp') await desfazerDescarte(item.edital.id)
      else await desfazerDescarteAviso(item.aviso.fonte, item.aviso.id)
    })
  }, [])

  const desfazer = useCallback(() => {
    const alvo = descartadoRecente
    if (!alvo) return
    setDescartadoRecente(null)
    restaurar(alvo)
  }, [descartadoRecente, restaurar])

  useEffect(() => {
    if (!descartadoRecente) return
    const timer = setTimeout(() => setDescartadoRecente(null), SEGUNDOS_PARA_DESFAZER * 1000)
    return () => clearTimeout(timer)
  }, [descartadoRecente])


  const abrir = useCallback(
    (item: Item) => {
      marcarAberto(item)
      if (item.secao === 'pncp') router.push(`/edital/${encodeURIComponent(item.edital.numeroControlePncp)}`)
      // Aviso abre a tela do aviso no sistema (2026-09-28, pedido do Eduardo:
      // clicar e cair direto no PDF do diário confundia). A publicação
      // original continua a um clique, na seta da linha e na própria tela.
      else router.push(`/aviso/${item.aviso.fonte}/${item.aviso.id}`)
    },
    [marcarAberto, router]
  )

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      const alvo = evento.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return
      if (navegaveis.length === 0) return

      const atual = navegaveis[selecionado]

      switch (evento.key.toLowerCase()) {
        case 'j':
          evento.preventDefault()
          // Forma funcional: J segurado dispara vários keydown antes do próximo
          // render, e ler `selecionado` do closure faria todos andarem uma casa só.
          setSelecionado((i) => Math.min(Math.min(i, navegaveis.length - 1) + 1, navegaveis.length - 1))
          break
        case 'k':
          evento.preventDefault()
          setSelecionado((i) => Math.max(Math.min(i, navegaveis.length - 1) - 1, 0))
          break
        case 'f':
          evento.preventDefault()
          if (atual) favoritar(atual)
          break
        case 'd':
          evento.preventDefault()
          if (atual) descartarItem(atual)
          break
        case 'enter':
          evento.preventDefault()
          if (atual) abrir(atual)
          break
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [navegaveis, selecionado, favoritar, descartarItem, abrir])

  // Acompanha a seleção com a rolagem — sem isso o J leva o foco pra fora da
  // tela e a navegação por teclado fica cega.
  useEffect(() => {
    const linha = containerRef.current?.querySelector('[data-selecionado="true"]')
    linha?.scrollIntoView({ block: 'nearest' })
  }, [selecionado])

  // O divisor marca o que já estava visto quando o boletim foi aberto; o que
  // você marca agora fica onde está, só muda de estilo.
  function renderizar(itens: Item[]) {
    const primeiroVisto = itens.findIndex((item) => vistosAoAbrir.has(item.chave))
    return (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {itens.map((item, indice) => {
          const comum = {
            selecionado: indice === selecionado,
            onSelecionar: () => setSelecionado(indice),
            onFavoritar: () => favoritar(item),
            onDescartar: () => descartarItem(item),
            onAbrir: () => marcarAberto(item),
          }
          return (
            <div key={item.chave} className="contents">
              {indice === primeiroVisto && primeiroVisto > 0 && <DivisorVistos />}
              {item.secao === 'pncp' ? (
                <LinhaEdital edital={item.edital} {...comum} />
              ) : (
                <LinhaAviso aviso={item.aviso} {...comum} />
              )}
            </div>
          )
        })}
      </ul>
    )
  }

  // Contagens da lista inteira (não só do que a busca mostra): o cabeçalho
  // resume o dia. "Nos filtros" soma editais do PNCP e avisos relevantes.
  const nosFiltros = lista.filter(estaNosFiltros)
  const naoVistos = nosFiltros.filter((item) => !estaVisto(item)).length
  const avisosFora = lista.length - nosFiltros.length

  return (
    <>
      <Cabecalho
        dia={dia}
        nosFiltros={nosFiltros.length}
        naoVistos={naoVistos}
        anterior={anterior}
        proximo={proximo}
        busca={busca}
        onBuscaChange={setBusca}
      />
      <FaixaFiltros />

      <div ref={containerRef} className="flex grow flex-col gap-2 bg-bg px-6 py-4">
        {navegaveis.length === 0 ? (
          <p className="m-0 py-8 text-center text-[13px] text-muted">
            {termo ? 'Nada corresponde à busca.' : 'Nada da área da saúde neste dia.'}
          </p>
        ) : (
          renderizar(navegaveis)
        )}

        <div className="grow" />

        {itensDescartados.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center gap-2 px-0.5">
              <button
                type="button"
                onClick={() => setMostrarDescartados((atual) => !atual)}
                className="text-[12.5px] text-accent underline hover:text-accent-strong"
              >
                {itensDescartados.length} {itensDescartados.length === 1 ? 'descartado' : 'descartados'} neste dia
                {mostrarDescartados ? ' · ocultar' : ' · ver'}
              </button>
            </div>

            {mostrarDescartados && (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {itensDescartados.map((item) => (
                  <li
                    key={item.chave}
                    className="flex items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface-muted px-[18px] py-2.5"
                  >
                    <span className="min-w-0 grow truncate text-[13px] text-ink-2" title={tituloDe(item)}>
                      {tituloDe(item)}
                    </span>
                    <span className="shrink-0 text-[12px] text-faint">{subtituloDe(item)}</span>
                    <button
                      type="button"
                      onClick={() => restaurar(item)}
                      className="shrink-0 rounded-control border border-border-strong bg-surface px-2.5 py-1 text-[12.5px] font-medium text-ink hover:bg-bg"
                    >
                      Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Fora dos filtros: editais do PNCP sem palavra-chave (ficam na fila
            de checagem por item e não são listados aqui) e avisos de diário
            sem palavra-chave, que dá pra mostrar. */}
        {(resumo.foraDosFiltros > 0 || avisosFora > 0) && !termo && (
          <p className="m-0 flex flex-wrap items-center gap-1.5 px-0.5 py-1 text-[12.5px] text-muted">
            <span>
              {resumo.foraDosFiltros + avisosFora} publicações de outros assuntos (sem produto da área da saúde) ficaram de fora
              {resumo.foraDosFiltros > 0 && avisosFora > 0
                ? ` (${resumo.foraDosFiltros} do PNCP, ${avisosFora} dos diários)`
                : ''}
              .
            </span>
            {avisosFora > 0 && (
              <button
                type="button"
                onClick={() => setMostrarTodosAvisos((atual) => !atual)}
                className="text-accent underline hover:text-accent-strong"
              >
                {mostrarTodosAvisos ? 'esconder os dos diários' : `mostrar os ${avisosFora} dos diários`}
              </button>
            )}
          </p>
        )}
      </div>

      {descartadoRecente && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-card border border-border-strong bg-ink px-4 py-3 text-[13px] text-white shadow-lg"
        >
          <span className="max-w-80 truncate">Descartado: {tituloDe(descartadoRecente)}</span>
          <button
            type="button"
            onClick={desfazer}
            className="rounded-control border border-white/25 px-2.5 py-1 text-[12.5px] font-medium hover:bg-white/10"
          >
            Desfazer
          </button>
        </div>
      )}
    </>
  )
}
