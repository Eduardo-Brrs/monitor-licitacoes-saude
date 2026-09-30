'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconeAcompanhamento,
  IconeArquivo,
  IconeCaixaEntrada,
  IconeEstrela,
  IconeTarefas,
} from '@/components/icons'

// A estrutura da navegação é fixa (docs/design/DESIGN.md, "Estrutura"), então
// mora aqui mesmo; do servidor só vêm os números que dependem do banco.
type Props = {
  naoVistos: number
  // Tarefas pendentes vencidas ou que vencem hoje.
  tarefasUrgentes: number
}

const CLASSE_ITEM =
  'flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-[13.5px] no-underline transition-colors'

function Item({
  href,
  ativo,
  children,
  icone,
  badge,
}: {
  href: string
  ativo: boolean
  children: React.ReactNode
  icone: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      className={`${CLASSE_ITEM} ${
        ativo
          ? 'bg-sidebar-active font-medium text-white'
          : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white'
      }`}
    >
      <span className="shrink-0">{icone}</span>
      {/* truncate em vez de deixar quebrar: com o acumulado de não vistos o
          número pode ter 3 dígitos e empurrar o rótulo pra duas linhas. */}
      <span className="grow truncate">{children}</span>
      {badge}
    </Link>
  )
}

function Grupo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      {/* Tons próprios da barra lateral, fora da paleta de tokens: a spec define
          só --sidebar/--sidebar-active/--sidebar-text, e estes são os degraus
          intermediários que o desenho de referência usa. */}
      <span className="px-2.5 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-[#8a8a83]">
        {rotulo}
      </span>
      {children}
    </div>
  )
}

export function Nav({ naoVistos, tarefasUrgentes }: Props) {
  const rota = usePathname()
  const naCaixaDeEntrada = rota === '/' || rota.startsWith('/boletim')

  return (
    <>
      <Grupo rotulo="Licitações">
        <Item
          href="/"
          ativo={naCaixaDeEntrada}
          icone={<IconeCaixaEntrada />}
          badge={
            naoVistos > 0 ? (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] text-white">
                {naoVistos}
              </span>
            ) : undefined
          }
        >
          Caixa de entrada
        </Item>
        <Item href="/favoritos" ativo={rota.startsWith('/favoritos')} icone={<IconeEstrela />}>
          Favoritos
        </Item>
        <Item
          href="/acompanhamento"
          ativo={rota.startsWith('/acompanhamento')}
          icone={<IconeAcompanhamento />}
        >
          Acompanhamento
        </Item>
        <Item
          href="/tarefas"
          ativo={rota.startsWith('/tarefas')}
          icone={<IconeTarefas />}
          badge={
            tarefasUrgentes > 0 ? (
              <span
                title="Tarefas vencidas ou que vencem hoje"
                className="shrink-0 font-mono text-[11px] text-[#e3b7a4]"
              >
                {tarefasUrgentes}
              </span>
            ) : undefined
          }
        >
          Tarefas
        </Item>
      </Grupo>

      <Grupo rotulo="Arquivo">
        <Item href="/arquivo" ativo={rota.startsWith('/arquivo')} icone={<IconeArquivo />}>
          Boletins anteriores
        </Item>
      </Grupo>
    </>
  )
}
