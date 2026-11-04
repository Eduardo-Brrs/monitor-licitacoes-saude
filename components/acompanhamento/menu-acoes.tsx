'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { criarNota, criarTarefa, definirEtapa } from '@/app/actions/acompanhamento'
import { BOTAO_PRINCIPAL, CAMPO_JANELA, Janela } from '@/components/acompanhamento/janela'
import { JanelaFinalizar } from '@/components/acompanhamento/janela-finalizar'
import { useAutor } from '@/components/linha-do-tempo/autor'
import type { Finalizacao, FonteItem, Responsavel } from '@/lib/acompanhamento-tipos'

// Ações de cada linha do Gerenciar licitações (pedido do usuário, 2026-10-27): tarefa,
// anotação, finalizar e remover sem abrir o edital. Tarefa e anotação são as
// mesmas da lateral e da linha do tempo do item.

type Janelas = 'tarefa' | 'nota' | 'finalizar' | null

export function MenuAcoes({
  fonte,
  itemId,
  rotulo,
  finalizada,
  finalizacao,
  responsaveis,
}: {
  fonte: FonteItem
  itemId: number
  rotulo: string
  finalizada: boolean
  finalizacao: Finalizacao | null
  responsaveis: Responsavel[]
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  const [janela, setJanela] = useState<Janelas>(null)
  const [removendo, iniciarRemocao] = useTransition()
  const caixa = useRef<HTMLDivElement>(null)

  // Fecha com clique fora ou Esc.
  useEffect(() => {
    if (!menuAberto) return
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) fechar()
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [menuAberto])

  function fechar() {
    setMenuAberto(false)
    setConfirmandoRemocao(false)
  }

  function abrir(qual: Janelas) {
    fechar()
    setJanela(qual)
  }

  // Remover pede um segundo clique: tira da lista na hora, sem desfazer aqui
  // (volta pela Pesquisa). Fica "Removida de Gerenciar licitações" na linha do tempo.
  function remover() {
    if (!confirmandoRemocao) {
      setConfirmandoRemocao(true)
      return
    }
    iniciarRemocao(async () => {
      await definirEtapa(fonte, itemId, null)
      fechar()
    })
  }

  const ITEM = 'flex w-full items-center rounded-[5px] px-2.5 py-[7px] text-left text-[13px] hover:bg-bg'

  return (
    <div ref={caixa} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => (menuAberto ? fechar() : setMenuAberto(true))}
        aria-haspopup="menu"
        aria-expanded={menuAberto}
        aria-label={`Ações: ${rotulo}`}
        title="Ações"
        className={`flex size-8 items-center justify-center rounded-control text-muted hover:bg-bg hover:text-ink ${
          menuAberto ? 'bg-bg text-ink' : ''
        }`}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {menuAberto && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 flex w-[220px] flex-col gap-px rounded-card border border-border-strong bg-surface p-1 shadow-lg"
        >
          <button type="button" role="menuitem" onClick={() => abrir('tarefa')} className={ITEM}>
            Adicionar tarefa
          </button>
          <button type="button" role="menuitem" onClick={() => abrir('nota')} className={ITEM}>
            Adicionar anotação
          </button>
          <button type="button" role="menuitem" onClick={() => abrir('finalizar')} className={`${ITEM} font-medium text-accent`}>
            {finalizada ? 'Mudar resultado…' : 'Finalizar…'}
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={remover}
            disabled={removendo}
            className={`${ITEM} ${confirmandoRemocao ? 'bg-warn-soft font-medium text-warn-strong hover:bg-warn-soft' : 'text-warn'}`}
          >
            {removendo ? 'Removendo…' : confirmandoRemocao ? 'Clique de novo para remover' : 'Remover do gerenciamento'}
          </button>
        </div>
      )}

      <JanelaFinalizar
        fonte={fonte}
        itemId={itemId}
        rotulo={rotulo}
        aberta={janela === 'finalizar'}
        aoFechar={() => setJanela(null)}
        atual={finalizacao}
      />
      <JanelaTarefa
        fonte={fonte}
        itemId={itemId}
        rotulo={rotulo}
        responsaveis={responsaveis}
        aberta={janela === 'tarefa'}
        aoFechar={() => setJanela(null)}
      />
      <JanelaNota
        fonte={fonte}
        itemId={itemId}
        rotulo={rotulo}
        responsaveis={responsaveis}
        aberta={janela === 'nota'}
        aoFechar={() => setJanela(null)}
      />
    </div>
  )
}

type PropsJanela = {
  fonte: FonteItem
  itemId: number
  rotulo: string
  responsaveis: Responsavel[]
  aberta: boolean
  aoFechar: () => void
}

function JanelaTarefa({ aberta, aoFechar, rotulo, ...resto }: PropsJanela) {
  return (
    <Janela aberta={aberta} aoFechar={aoFechar} titulo="Nova tarefa" subtitulo={rotulo}>
      {aberta && <FormTarefa {...resto} aoConcluir={aoFechar} />}
    </Janela>
  )
}

function FormTarefa({
  fonte,
  itemId,
  responsaveis,
  aoConcluir,
}: Omit<PropsJanela, 'aberta' | 'aoFechar' | 'rotulo'> & { aoConcluir: () => void }) {
  const [descricao, setDescricao] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [prazo, setPrazo] = useState('')
  const [erro, setErro] = useState(false)
  const [salvando, iniciar] = useTransition()

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (descricao.trim() === '') return
    setErro(false)
    iniciar(async () => {
      try {
        await criarTarefa(fonte, itemId, descricao, responsavelId ? Number(responsavelId) : null, prazo || null)
        aoConcluir()
      } catch {
        setErro(true)
      }
    })
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="janela-tarefa-descricao" className="text-[13px] font-medium">
          O que fazer
        </label>
        <input
          id="janela-tarefa-descricao"
          autoFocus
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: separar certidões"
          className={CAMPO_JANELA}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex grow flex-col gap-1">
          <label htmlFor="janela-tarefa-responsavel" className="text-[13px] font-medium">
            Responsável
          </label>
          <select
            id="janela-tarefa-responsavel"
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
            className={CAMPO_JANELA}
          >
            <option value="">Ninguém</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex grow flex-col gap-1">
          <label htmlFor="janela-tarefa-prazo" className="text-[13px] font-medium">
            Prazo
          </label>
          <input
            id="janela-tarefa-prazo"
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            className={CAMPO_JANELA}
          />
        </div>
      </div>
      {erro && <p className="m-0 text-[12.5px] text-warn">Não deu pra salvar. Tente de novo.</p>}
      <button type="submit" disabled={descricao.trim() === '' || salvando} className={BOTAO_PRINCIPAL}>
        {salvando ? 'Criando…' : 'Criar tarefa'}
      </button>
    </form>
  )
}

function JanelaNota({ aberta, aoFechar, rotulo, ...resto }: PropsJanela) {
  return (
    <Janela aberta={aberta} aoFechar={aoFechar} titulo="Nova anotação" subtitulo={rotulo}>
      {aberta && <FormNota {...resto} aoConcluir={aoFechar} />}
    </Janela>
  )
}

function FormNota({
  fonte,
  itemId,
  responsaveis,
  aoConcluir,
}: Omit<PropsJanela, 'aberta' | 'aoFechar' | 'rotulo'> & { aoConcluir: () => void }) {
  const [texto, setTexto] = useState('')
  const [autor, setAutor] = useAutor()
  const autorValido = responsaveis.some((r) => String(r.id) === autor) ? autor : ''
  const [erro, setErro] = useState(false)
  const [salvando, iniciar] = useTransition()

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (texto.trim() === '') return
    setErro(false)
    iniciar(async () => {
      try {
        await criarNota(fonte, itemId, texto, autorValido ? Number(autorValido) : null)
        aoConcluir()
      } catch {
        setErro(true)
      }
    })
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="janela-nota-texto" className="text-[13px] font-medium">
          Anotação
        </label>
        <textarea
          id="janela-nota-texto"
          autoFocus
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Entra na linha do tempo do edital, com data e autor."
          className="w-full resize-y rounded-control border border-border-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="janela-nota-autor" className="shrink-0 text-[12.5px] text-muted">
          Escrevendo como
        </label>
        <select
          id="janela-nota-autor"
          value={autorValido}
          onChange={(e) => setAutor(e.target.value)}
          className={CAMPO_JANELA}
        >
          <option value="">Sem autor</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </div>
      {erro && <p className="m-0 text-[12.5px] text-warn">Não deu pra salvar. Tente de novo.</p>}
      <button type="submit" disabled={texto.trim() === '' || salvando} className={BOTAO_PRINCIPAL}>
        {salvando ? 'Salvando…' : 'Salvar anotação'}
      </button>
    </form>
  )
}
