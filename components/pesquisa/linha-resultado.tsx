'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useState, useTransition } from 'react'
import { alternarFavoritoAviso } from '@/app/actions/diario'
import { alternarFavorito } from '@/app/actions/edital'
import { trazerDoPncp } from '@/app/actions/pesquisa'
import { IconeEstrela } from '@/components/icons'
import { ROTULO_STATUS } from '@/lib/acompanhamento-tipos'
import { formatarDiaMes, formatarValor, prazoEstaCurto } from '@/lib/formato'
import { proximoPrazo, type ResultadoPesquisa } from '@/lib/pesquisa-tipos'

// Linha da Pesquisa (docs/design/telas/07-pesquisa.html). Mesma leitura da
// linha do boletim: etiqueta de origem, objeto, metadados, valor, prazo e
// estrela. "Fora do sistema" (só no portal do PNCP): sem ponto de "não visto",
// título abre o PNCP e a estrela traz o edital pro sistema já favoritado.
export function LinhaResultado({ item }: { item: ResultadoPesquisa }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [favorito, alternarOtimista] = useOptimistic(item.favorito, (atual: boolean) => !atual)
  const [erro, setErro] = useState<string | null>(null)
  const fora = item.tipo === 'fora'
  const visto = item.visto && !fora
  const prazo = proximoPrazo(item)
  const prazoCurto = prazoEstaCurto(prazo)

  function clicarEstrela() {
    setErro(null)
    iniciar(async () => {
      if (item.tipo === 'fora') {
        const r = await trazerDoPncp(item.numeroControlePncp as string)
        if (r.erro) setErro(r.erro)
        else router.refresh()
        return
      }
      alternarOtimista(null)
      if (item.tipo === 'pncp') await alternarFavorito(item.itemId as number)
      else await alternarFavoritoAviso(item.tipo, item.itemId as number)
    })
  }

  // Ano só quando não é o atual — pega data digitada errada pelo órgão (já
  // visto "5026" no PNCP) e prazo de registro de preço do ano seguinte.
  const dataCurta = (iso: string) => {
    const ano = new Date(iso).getFullYear()
    return ano === new Date().getFullYear() ? formatarDiaMes(iso) : `${formatarDiaMes(iso)}/${ano}`
  }
  const textoPrazo = !prazo
    ? 'sem data'
    : prazo === item.prazoEstimado && !item.abertura && !item.encerramento
      ? `até ~${dataCurta(prazo)}`
      : prazo === item.abertura
        ? `abre ${dataCurta(prazo)}`
        : `até ${dataCurta(prazo)}`

  // Com status a estrela não mexe: acender voltaria a etapa pra Favoritada
  // (etapa única, 2026-10-07). Status muda no Acompanhamento ou no detalhe.
  const comStatus = !fora && item.statusInterno !== null
  const rotuloEstrela = fora
    ? 'Trazer pro sistema e favoritar (ganha anexos, acompanhamento e tarefas)'
    : comStatus
      ? `Está como ${ROTULO_STATUS[item.statusInterno!]} — mude em Gerenciar licitações`
      : favorito
      ? 'Tirar dos favoritos'
      : 'Favoritar'

  return (
    <li
      className={`flex items-center gap-3.5 rounded-card border px-[18px] py-[15px] ${
        visto ? 'border-[#e9e7e1] bg-surface-muted' : 'border-border bg-surface'
      }`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${!fora && !item.visto ? 'bg-accent' : ''}`} />

      <div className="flex min-w-0 grow flex-col gap-[5px]">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={`mt-px shrink-0 rounded-badge px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] ${
              item.judicial ? 'bg-warn-soft text-warn-strong' : 'border border-border-strong bg-surface-muted text-muted'
            }`}
          >
            {item.etiqueta}
          </span>
          {fora && (
            <span
              title="Não está no sistema — a captura automática não pegou"
              className="mt-px shrink-0 rounded-badge border border-dashed border-faint px-1.5 py-0.5 text-[11px] font-medium text-muted"
            >
              fora do sistema
            </span>
          )}
          {item.externo ? (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              title={item.titulo}
              className="line-clamp-2 text-[15px] font-semibold leading-tight text-ink no-underline"
            >
              {item.titulo} ↗
            </a>
          ) : (
            <Link
              href={item.href}
              title={item.titulo}
              className={`line-clamp-2 text-[15px] leading-tight no-underline ${
                visto ? 'font-medium text-ink-2' : 'font-semibold text-ink'
              }`}
            >
              {item.titulo}
            </Link>
          )}
        </div>
        <div className={`flex flex-wrap items-center gap-[7px] text-[12.5px] ${visto ? 'text-faint' : 'text-muted'}`}>
          {item.metadados.map((texto, i) => (
            <span key={`${i}-${texto}`} className="flex items-center gap-[7px]">
              {i > 0 && <span aria-hidden="true">·</span>}
              <span>{texto}</span>
            </span>
          ))}
        </div>
        {erro && <p className="m-0 text-[12px] text-warn">{erro}</p>}
      </div>

      <span className={`w-[118px] shrink-0 text-right font-mono text-sm ${visto ? 'text-ink-2' : ''}`}>
        {formatarValor(item.valor)}
      </span>

      <span
        title={!item.abertura && item.prazoEstimado ? 'Data estimada — o órgão não informou o prazo' : undefined}
        className={`w-[92px] shrink-0 text-right text-[12.5px] ${
          visto ? 'text-faint' : prazoCurto ? 'font-medium text-warn' : 'text-muted'
        }`}
      >
        {textoPrazo}
      </span>

      <button
        type="button"
        onClick={clicarEstrela}
        disabled={(pendente && fora) || comStatus}
        aria-pressed={fora ? undefined : favorito}
        aria-label={rotuloEstrela}
        title={rotuloEstrela}
        className={`flex size-10 shrink-0 items-center justify-center rounded-control border disabled:cursor-default ${
          comStatus ? 'opacity-40' : ''
        } ${
          favorito && !fora
            ? 'border-accent bg-accent-soft text-accent-strong [&_svg]:fill-current'
            : 'border-border-strong bg-surface text-ink hover:bg-bg'
        } ${pendente && fora ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <IconeEstrela size={17} />
      </button>
    </li>
  )
}
