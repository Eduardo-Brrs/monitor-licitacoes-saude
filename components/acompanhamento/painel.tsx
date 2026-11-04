'use client'

import Link from 'next/link'
import { useState, useTransition, type ReactNode } from 'react'
import {
  alternarTarefaConcluida,
  criarNota,
  criarTarefa,
  definirEtapa,
  excluirTarefa,
} from '@/app/actions/acompanhamento'
import { BotoesEtapa } from '@/components/acompanhamento/botoes-etapa'
import { JanelaFinalizar } from '@/components/acompanhamento/janela-finalizar'
import { useAutor } from '@/components/linha-do-tempo/autor'
import {
  ETAPAS_ABERTAS,
  etapaDe,
  etapaFinal,
  ETIQUETA_RESULTADO,
  resultadoGanhou,
  ROTULO_ETAPA,
  ROTULO_RESULTADO,
  type DadosDaLateral,
  type Etapa,
  type FonteItem,
  type Responsavel,
  type Tarefa,
} from '@/lib/acompanhamento-tipos'
import { descreverPrazo, formatarDataHora, formatarValorCompleto } from '@/lib/formato'

// Status no pipeline e tarefas — a parte da lateral do detalhe que
// é igual pra edital do PNCP e aviso de diário (docs/design/telas/02).
// As anotações saíram daqui em 2026-10-23: viraram a linha do tempo, na
// coluna principal (components/linha-do-tempo).

type Props = {
  fonte: FonteItem
  itemId: number
  rotulo: string // objeto, no topo da janela de finalizar
  dados: DadosDaLateral
  // Botão principal da tela (participar no portal / abrir no diário), entre
  // os botões de etapa e o resto da lateral.
  acaoPrincipal?: ReactNode
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

export function PainelAcompanhamento({ fonte, itemId, rotulo, dados, acaoPrincipal }: Props) {
  // Uma transição por seção: salvar o status não pode travar o botão da tarefa.
  const [, iniciarStatus] = useTransition()
  const [salvandoTarefa, iniciarTarefa] = useTransition()

  // Etapa (favorito + status): aplica na hora, antes da resposta do servidor.
  // Botões e seletor dividem o mesmo estado pra nunca mostrarem coisas diferentes.
  const [etapa, setEtapa] = useState<Etapa | null>(etapaDe(dados))
  function mudarEtapa(nova: Etapa | null) {
    setEtapa(nova)
    iniciarStatus(() => definirEtapa(fonte, itemId, nova))
  }
  const [finalizando, setFinalizando] = useState(false)
  const etapaEncerrada = etapa !== null && etapaFinal(etapa) ? etapa : null
  const final = etapaEncerrada !== null
  const fin = final ? dados.finalizacao : null

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
      <BotoesEtapa etapa={etapa} onMudar={mudarEtapa} />

      {acaoPrincipal}

      <div className={CARTAO}>
        <label htmlFor="status" className={TITULO}>
          Status no pipeline
        </label>
        <select
          id="status"
          value={etapa ?? ''}
          onChange={(e) => mudarEtapa(e.target.value === '' ? null : (e.target.value as Etapa))}
          className={CAMPO}
        >
          <option value="">Fora de Gerenciar licitações</option>
          {etapaEncerrada && (
            <option value={etapaEncerrada} disabled>
              {fin ? ETIQUETA_RESULTADO[fin.resultado] : ROTULO_ETAPA[etapaEncerrada]}
            </option>
          )}
          {ETAPAS_ABERTAS.map((e) => (
            <option key={e} value={e}>
              {final ? `Reabrir: ${ROTULO_ETAPA[e]}` : ROTULO_ETAPA[e]}
            </option>
          ))}
        </select>

        {fin && (
          <div className="flex flex-col gap-1 rounded-control bg-surface-muted px-3 py-2.5 text-[12.5px]">
            <span className={`font-medium ${resultadoGanhou(fin.resultado) ? 'text-accent-strong' : 'text-ink'}`}>
              {ROTULO_RESULTADO[fin.resultado]}
            </span>
            {fin.valorGanho ? <span className="font-mono">Ganho: {formatarValorCompleto(fin.valorGanho)}</span> : null}
            {fin.observacao && <span className="whitespace-pre-wrap text-ink-2">{fin.observacao}</span>}
            {fin.em && <span className="text-[11.5px] text-faint">Finalizada em {formatarDataHora(fin.em)}</span>}
          </div>
        )}

        {/* Depois de ganhar, os itens vão pra Atas e contratos (2026-10-27). */}
        {fin && resultadoGanhou(fin.resultado) && (
          <div className="flex flex-col gap-1">
            {dados.atas.map((a) => (
              <Link key={a.id} href={`/atas/${a.id}`} className="text-[12.5px] font-medium text-accent no-underline hover:text-accent-strong">
                Ver {a.numero} em Atas e contratos →
              </Link>
            ))}
            <Link
              href={`/atas/nova?fonte=${fonte}&item=${itemId}`}
              className={`${BOTAO} flex items-center justify-center no-underline`}
            >
              {dados.atas.length === 0 ? 'Registrar itens ganhos' : 'Registrar outra ata/contrato'}
            </Link>
          </div>
        )}

        {etapa !== null && (
          <button
            type="button"
            onClick={() => setFinalizando(true)}
            className={final ? BOTAO : 'h-9 rounded-control border border-accent bg-accent px-3 text-[12.5px] font-medium text-white hover:bg-accent-strong'}
          >
            {final ? 'Mudar resultado…' : 'Finalizar licitação…'}
          </button>
        )}

        <p className="m-0 text-[11.5px] leading-snug text-faint">
          Favoritada: avaliando se vai participar. Gerenciada: vai participar. Finalizar pede o resultado. Você controla
          este campo, nada do PNCP sobrescreve.
        </p>
      </div>

      <JanelaFinalizar
        fonte={fonte}
        itemId={itemId}
        rotulo={rotulo}
        aberta={finalizando}
        aoFechar={() => setFinalizando(false)}
        atual={fin}
        aoFinalizar={(r) => setEtapa(resultadoGanhou(r) ? 'ganha' : 'finalizada')}
      />

      <div className={CARTAO}>
        <h2 className={TITULO}>Tarefas</h2>

        {dados.tarefas.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {dados.tarefas.map((t) => (
              <LinhaTarefa key={t.id} fonte={fonte} itemId={itemId} tarefa={t} responsaveis={dados.responsaveis} />
            ))}
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

// Tarefa da lateral, com "Responder" (2026-10-23): o responsável de licitações responde aqui o
// que o dono pediu, e a resposta vai pra linha do tempo ligada à tarefa.
function LinhaTarefa({
  fonte,
  itemId,
  tarefa: t,
  responsaveis,
}: {
  fonte: FonteItem
  itemId: number
  tarefa: Tarefa
  responsaveis: Responsavel[]
}) {
  const [pendente, iniciar] = useTransition()
  const [respondendo, setRespondendo] = useState(false)
  const [resposta, setResposta] = useState('')
  const [autor] = useAutor()
  const autorValido = responsaveis.some((r) => String(r.id) === autor) ? Number(autor) : null
  const nomeAutor = responsaveis.find((r) => r.id === autorValido)?.nome
  const prazoTarefa = descreverPrazo(t.prazo)

  function responder(concluir: boolean) {
    if (resposta.trim() === '') return
    iniciar(async () => {
      await criarNota(fonte, itemId, resposta, autorValido, t.id, concluir)
      setResposta('')
      setRespondendo(false)
    })
  }

  return (
    <li className="group flex flex-col gap-1.5">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={t.concluida}
          onChange={() => iniciar(() => alternarTarefaConcluida(t.id))}
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
          <span className={`text-[13px] ${t.concluida ? 'text-faint line-through' : 'text-ink'}`}>{t.descricao}</span>
          <span className={`text-[11.5px] ${!t.concluida && prazoTarefa.urgente ? 'text-warn' : 'text-faint'}`}>
            {t.responsavel?.nome ?? 'sem responsável'} · {t.concluida ? 'concluída' : prazoTarefa.texto}
          </span>
          {!respondendo && (
            <button
              type="button"
              onClick={() => setRespondendo(true)}
              className="w-fit text-[11.5px] font-medium text-accent hover:text-accent-strong"
            >
              Responder
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => iniciar(() => excluirTarefa(t.id))}
          aria-label={`Excluir tarefa ${t.descricao}`}
          title="Excluir tarefa"
          className="shrink-0 rounded p-1 text-faint opacity-0 hover:text-warn focus:opacity-100 group-hover:opacity-100"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {respondendo && (
        <div className="ml-[26px] flex flex-col gap-1.5">
          <label htmlFor={`resposta-${t.id}`} className="sr-only">
            Resposta à tarefa {t.descricao}
          </label>
          <textarea
            id={`resposta-${t.id}`}
            rows={3}
            autoFocus
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="O que foi feito…"
            className="w-full resize-y rounded-control border border-border-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
          />
          <span className="text-[11px] text-faint">
            {nomeAutor ? `Como ${nomeAutor}` : 'Sem autor — escolha seu nome na linha do tempo'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {!t.concluida && (
              <button type="button" onClick={() => responder(true)} disabled={pendente || resposta.trim() === ''} className={BOTAO}>
                Responder e concluir
              </button>
            )}
            <button type="button" onClick={() => responder(false)} disabled={pendente || resposta.trim() === ''} className={BOTAO}>
              Responder
            </button>
            <button
              type="button"
              onClick={() => {
                setResposta('')
                setRespondendo(false)
              }}
              className="px-1 text-[12px] font-medium text-muted hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
