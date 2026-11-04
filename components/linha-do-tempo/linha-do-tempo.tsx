'use client'

import { useState, useTransition } from 'react'
import { apagarNota, criarNota, editarNota } from '@/app/actions/acompanhamento'
import { useAutor } from '@/components/linha-do-tempo/autor'
import {
  ehNotaDaLinha,
  type EventoLinha,
  type FonteItem,
  type NotaDaLinha,
  type Responsavel,
} from '@/lib/acompanhamento-tipos'
import { formatarDataHora, formatarDiaMes } from '@/lib/formato'

// Linha do tempo do edital/aviso (2026-10-23, pedido do usuário): a caixa de
// escrever no topo e, abaixo, tudo o que aconteceu, mais recente em cima.
// Cada nota é uma entrada com data e autor — o dono vai anotando a cada
// fase e o responsável de licitações acompanha e responde.

type Props = {
  fonte: FonteItem
  itemId: number
  eventos: EventoLinha[]
  responsaveis: Responsavel[]
}

const CARTAO = 'flex flex-col gap-3 rounded-card border border-border bg-surface p-5'
const TITULO = 'm-0 text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const BOTAO =
  'h-9 rounded-control border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-ink hover:bg-bg disabled:cursor-default disabled:opacity-50'
const BOTAO_PRIMARIO =
  'h-9 rounded-control border border-accent bg-accent px-3.5 text-[12.5px] font-medium text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-50'
const LINK = 'text-[11.5px] font-medium text-muted hover:text-ink'
const AREA =
  'w-full resize-y rounded-control border border-border-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint'

type Filtro = 'tudo' | 'notas'

function corDoPonto(tipo: EventoLinha['tipo']): string {
  if (tipo === 'nota' || tipo === 'resposta') return 'bg-accent'
  if (tipo === 'vitoria') return 'bg-accent'
  if (tipo === 'retificacao') return 'bg-warn'
  if (tipo === 'pncp' || tipo === 'ligacao') return 'bg-ink-2'
  return 'bg-border-strong'
}

function quandoTexto(e: EventoLinha): string {
  if (!e.quando) return 'sem data'
  // Fato do PNCP: o dia do fato, e quando o sistema viu. O resto foi feito
  // aqui dentro, então vale a hora exata.
  if (e.capturadoEm) return `${formatarDiaMes(e.quando)} · capturado ${formatarDataHora(e.capturadoEm)}`
  return formatarDataHora(e.quando)
}

export function LinhaDoTempo({ fonte, itemId, eventos, responsaveis }: Props) {
  const [autor, setAutor] = useAutor()
  const [texto, setTexto] = useState('')
  const [salvando, iniciar] = useTransition()
  const [filtro, setFiltro] = useState<Filtro>('tudo')

  const autorValido = responsaveis.some((r) => String(r.id) === autor) ? autor : ''
  const qtdNotas = eventos.filter(ehNotaDaLinha).length
  const visiveis = filtro === 'notas' ? eventos.filter(ehNotaDaLinha) : eventos

  function salvar() {
    if (texto.trim() === '' || salvando) return
    iniciar(async () => {
      await criarNota(fonte, itemId, texto, autorValido ? Number(autorValido) : null)
      setTexto('')
    })
  }

  return (
    <section className={CARTAO} aria-labelledby="titulo-linha-do-tempo">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-linha-do-tempo" className={TITULO}>
          Linha do tempo
        </h2>
        <div role="group" aria-label="Mostrar" className="flex gap-1">
          {(
            [
              ['tudo', 'Tudo'],
              ['notas', `Só anotações${qtdNotas ? ` (${qtdNotas})` : ''}`],
            ] as [Filtro, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={`h-7 rounded-control px-2.5 text-[12px] font-medium ${
                filtro === valor ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-bg hover:text-ink'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="nova-nota" className="sr-only">
          Nova anotação
        </label>
        <textarea
          id="nova-nota"
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              salvar()
            }
          }}
          placeholder="O que aconteceu nesta fase? Ex.: arrematamos os itens 21 e 22, aguardando julgamento…"
          className={AREA}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="autor-nota" className="text-[12px] text-muted">
            Escrevendo como
          </label>
          <select
            id="autor-nota"
            value={autorValido}
            onChange={(e) => setAutor(e.target.value)}
            className="h-9 rounded-control border border-border-strong bg-surface px-2 text-[12.5px] text-ink"
          >
            <option value="">Escolha…</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={salvar}
            disabled={texto.trim() === '' || salvando}
            title="Salvar nota (Ctrl+Enter)"
            className={`${BOTAO_PRIMARIO} ml-auto`}
          >
            {salvando ? 'Salvando…' : 'Salvar nota'}
          </button>
        </div>
        {!autorValido && (
          <p className="m-0 text-[11.5px] text-faint">
            Escolha seu nome uma vez — este computador lembra. Sem nome, a nota fica sem autor.
          </p>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="m-0 border-t border-border pt-3 text-[12.5px] text-faint">
          {filtro === 'notas' ? 'Nenhuma anotação ainda.' : 'Nada registrado ainda.'}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col border-t border-border p-0 pt-3">
          {visiveis.map((e, i) => (
            <li key={e.chave} className="relative flex gap-3 pb-3.5 last:pb-0">
              {/* Fio vertical ligando os pontos. */}
              {i < visiveis.length - 1 && (
                <span aria-hidden="true" className="absolute left-[3.5px] top-3.5 bottom-0 w-px bg-border" />
              )}
              <span aria-hidden="true" className={`relative mt-1.5 size-2 shrink-0 rounded-full ${corDoPonto(e.tipo)}`} />
              {e.nota ? (
                <Nota evento={e} nota={e.nota} />
              ) : (
                <div className="flex min-w-0 flex-col">
                  <span
                    className={`break-words text-[12.5px] ${
                      e.tipo === 'vitoria'
                        ? 'font-medium text-accent-strong'
                        : e.tipo === 'etapa' || e.tipo.startsWith('tarefa')
                          ? 'text-muted'
                          : 'text-ink'
                    }`}
                  >
                    {e.descricao}
                  </span>
                  <span className="text-[11.5px] text-faint">{quandoTexto(e)}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Nota({ evento, nota }: { evento: EventoLinha; nota: NotaDaLinha }) {
  const [editando, setEditando] = useState(false)
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)
  const [texto, setTexto] = useState(nota.texto)
  const [pendente, iniciar] = useTransition()

  function salvarEdicao() {
    if (texto.trim() === '') return
    iniciar(async () => {
      await editarNota(nota.id, texto)
      setEditando(false)
    })
  }

  const cabecalho = [
    nota.autor ?? 'Sem autor',
    nota.tarefa ? `respondeu à tarefa ${nota.tarefa.descricao ? `"${nota.tarefa.descricao}"` : '(excluída)'}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="group flex min-w-0 grow flex-col gap-1 rounded-control border border-border bg-surface-muted px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[12px] font-medium text-ink">{cabecalho}</span>
        <span className="text-[11.5px] text-faint">
          {evento.quando ? formatarDataHora(evento.quando) : ''}
          {nota.editadaEm && ` · editada em ${formatarDataHora(nota.editadaEm)}`}
        </span>
        {!editando && !confirmandoApagar && (
          <span className="ml-auto flex gap-3 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" onClick={() => setEditando(true)} className={LINK}>
              Editar
            </button>
            <button type="button" onClick={() => setConfirmandoApagar(true)} className={`${LINK} hover:text-warn`}>
              Apagar
            </button>
          </span>
        )}
      </div>

      {editando ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`editar-nota-${nota.id}`} className="sr-only">
            Editar anotação
          </label>
          <textarea
            id={`editar-nota-${nota.id}`}
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={AREA}
          />
          <div className="flex gap-2">
            <button type="button" onClick={salvarEdicao} disabled={pendente || texto.trim() === ''} className={BOTAO}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTexto(nota.texto)
                setEditando(false)
              }}
              className={LINK}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="m-0 whitespace-pre-line break-words text-[13px] leading-relaxed text-ink">{nota.texto}</p>
      )}

      {confirmandoApagar && (
        <div className="flex items-center gap-3 pt-1 text-[12px]">
          <span className="text-warn-strong">Apagar esta anotação?</span>
          <button
            type="button"
            disabled={pendente}
            onClick={() => iniciar(() => apagarNota(nota.id))}
            className="font-medium text-warn hover:text-warn-strong"
          >
            Apagar
          </button>
          <button type="button" onClick={() => setConfirmandoApagar(false)} className={LINK}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
