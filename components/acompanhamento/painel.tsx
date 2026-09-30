'use client'

import { useState, useTransition } from 'react'
import {
  alternarTarefaConcluida,
  criarTarefa,
  definirStatusInterno,
  excluirTarefa,
  salvarAnotacao,
} from '@/app/actions/acompanhamento'
import {
  ROTULO_STATUS,
  STATUS_INTERNO,
  type DadosDaLateral,
  type FonteItem,
  type StatusInterno,
} from '@/lib/acompanhamento-tipos'
import { descreverPrazo, formatarDataHora } from '@/lib/formato'

// Status no pipeline, anotação e tarefas — a parte da lateral do detalhe que
// é igual pra edital do PNCP e aviso de diário (docs/design/telas/02).

type Props = {
  fonte: FonteItem
  itemId: number
  dados: DadosDaLateral
}

const CARTAO = 'flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4'
const TITULO = 'm-0 text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const CAMPO =
  'h-9 w-full rounded-control border border-border-strong bg-surface px-2.5 text-[13px] text-ink disabled:opacity-60'
const BOTAO =
  'h-9 rounded-control border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-ink hover:bg-bg disabled:cursor-default disabled:opacity-50'

function iniciais(nome: string): string {
  return nome.slice(0, 2).toUpperCase()
}

export function PainelAcompanhamento({ fonte, itemId, dados }: Props) {
  // Uma transição por seção: salvar o status não pode travar o botão da nota.
  const [, iniciarStatus] = useTransition()
  const [salvandoNota, iniciarNota] = useTransition()
  const [salvandoTarefa, iniciarTarefa] = useTransition()

  // Status: aplica na hora (select muda o valor exibido antes do servidor).
  const [status, setStatus] = useState<StatusInterno | null>(dados.statusInterno)
  function mudarStatus(valor: string) {
    const novo = valor === '' ? null : (valor as StatusInterno)
    setStatus(novo)
    iniciarStatus(() => definirStatusInterno(fonte, itemId, novo))
  }

  // Anotação
  const textoSalvo = dados.anotacao?.texto ?? ''
  const [nota, setNota] = useState(textoSalvo)
  const notaMudou = nota.trim() !== textoSalvo
  function salvarNota() {
    iniciarNota(() => salvarAnotacao(fonte, itemId, nota))
  }

  // Nova tarefa
  const [descricao, setDescricao] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [prazo, setPrazo] = useState('')
  function criar(evento: React.FormEvent) {
    evento.preventDefault()
    if (descricao.trim() === '') return
    iniciarTarefa(async () => {
      await criarTarefa(fonte, itemId, descricao, responsavelId ? Number(responsavelId) : null, prazo || null)
      setDescricao('')
      setPrazo('')
    })
  }

  return (
    <>
      <div className={CARTAO}>
        <label htmlFor="status" className={TITULO}>
          Status no pipeline
        </label>
        <select id="status" value={status ?? ''} onChange={(e) => mudarStatus(e.target.value)} className={CAMPO}>
          <option value="">Sem status</option>
          {STATUS_INTERNO.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS[s]}
            </option>
          ))}
        </select>
        <p className="m-0 text-[11.5px] leading-snug text-faint">
          Você controla este campo, nada do PNCP sobrescreve. Com status, o item fica no Acompanhamento mesmo sem favorito.
        </p>
      </div>

      <div className={CARTAO}>
        <h2 className={TITULO}>Anotações</h2>
        <label htmlFor="nota" className="sr-only">
          Escrever anotação
        </label>
        <textarea
          id="nota"
          rows={4}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Observações sobre este edital…"
          className="w-full resize-y rounded-control border border-border-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={salvarNota} disabled={!notaMudou || salvandoNota} className={BOTAO}>
            Salvar nota
          </button>
          <span className="text-[11.5px] text-faint">
            {notaMudou
              ? 'alterações não salvas'
              : dados.anotacao
                ? `salva em ${formatarDataHora(dados.anotacao.atualizadoEm)}`
                : ''}
          </span>
        </div>
      </div>

      <div className={CARTAO}>
        <h2 className={TITULO}>Tarefas</h2>

        {dados.tarefas.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {dados.tarefas.map((t) => {
              const prazoTarefa = descreverPrazo(t.prazo)
              return (
                <li key={t.id} className="group flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={t.concluida}
                    onChange={() => iniciarTarefa(() => alternarTarefaConcluida(t.id))}
                    aria-label={t.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
                    className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span
                    title={t.responsavel?.nome ?? 'Sem responsável'}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[10.5px] font-semibold text-accent-strong"
                  >
                    {t.responsavel ? iniciais(t.responsavel.nome) : '—'}
                  </span>
                  <div className="flex min-w-0 grow flex-col">
                    <span className={`text-[13px] ${t.concluida ? 'text-faint line-through' : 'text-ink'}`}>
                      {t.descricao}
                    </span>
                    <span
                      className={`text-[11.5px] ${!t.concluida && prazoTarefa.urgente ? 'text-warn' : 'text-faint'}`}
                    >
                      {t.responsavel?.nome ?? 'sem responsável'} · {t.concluida ? 'concluída' : prazoTarefa.texto}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => iniciarTarefa(() => excluirTarefa(t.id))}
                    aria-label={`Excluir tarefa ${t.descricao}`}
                    title="Excluir tarefa"
                    className="shrink-0 rounded p-1 text-faint opacity-0 hover:text-warn focus:opacity-100 group-hover:opacity-100"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={criar} className="flex flex-col gap-2 border-t border-border pt-2.5">
          <label htmlFor="tarefa-descricao" className="sr-only">
            Nova tarefa
          </label>
          <input
            id="tarefa-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Nova tarefa…"
            className={CAMPO}
          />
          <div className="flex gap-2">
            <label htmlFor="tarefa-responsavel" className="sr-only">
              Responsável
            </label>
            <select
              id="tarefa-responsavel"
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              className={CAMPO}
            >
              <option value="">Responsável…</option>
              {dados.responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
            <label htmlFor="tarefa-prazo" className="sr-only">
              Prazo
            </label>
            <input
              id="tarefa-prazo"
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className={CAMPO}
            />
          </div>
          <button type="submit" disabled={descricao.trim() === '' || salvandoTarefa} className={BOTAO}>
            Criar tarefa
          </button>
        </form>
      </div>
    </>
  )
}
