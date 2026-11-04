'use client'

import { useState, useTransition } from 'react'
import { finalizar } from '@/app/actions/acompanhamento'
import { BOTAO_PRINCIPAL, CAMPO_JANELA, Janela } from '@/components/acompanhamento/janela'
import {
  lerValorEmReais,
  resultadoGanhou,
  ROTULO_RESULTADO,
  type Finalizacao,
  type FonteItem,
  type Resultado,
} from '@/lib/acompanhamento-tipos'

// Finalizar uma licitação gerenciada (pedido do usuário, 2026-10-27): o que aconteceu,
// quanto ganhou (total, só se ganhou algo) e uma observação. O valor ganho
// alimenta a soma da aba "Ganhas".

const GRUPOS: { titulo: string; opcoes: Resultado[] }[] = [
  { titulo: 'Participamos', opcoes: ['ganhou_todos', 'ganhou_parte', 'nao_ganhou'] },
  { titulo: 'A licitação não seguiu', opcoes: ['anulada', 'fracassada', 'revogada'] },
  { titulo: 'Ficamos de fora', opcoes: ['desistimos'] },
]

const VALOR_INICIAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function JanelaFinalizar({
  fonte,
  itemId,
  rotulo,
  aberta,
  aoFechar,
  atual,
  sugerido,
  valorSugerido,
  aoFinalizar,
}: {
  fonte: FonteItem
  itemId: number
  rotulo: string
  aberta: boolean
  aoFechar: () => void
  atual?: Finalizacao | null // corrigir um resultado já gravado
  sugerido?: Resultado // banner de vitória pelo CNPJ
  valorSugerido?: number // homologado no CNPJ da empresa, pelo PNCP
  aoFinalizar?: (resultado: Resultado) => void
}) {
  return (
    <Janela aberta={aberta} aoFechar={aoFechar} titulo="Finalizar licitação" subtitulo={rotulo}>
      {/* Remonta a cada abertura: começa do resultado gravado, não do que ficou digitado. */}
      {aberta && (
        <Formulario
          fonte={fonte}
          itemId={itemId}
          atual={atual ?? null}
          sugerido={sugerido}
          valorSugerido={valorSugerido}
          aoConcluir={(r) => {
            aoFinalizar?.(r)
            aoFechar()
          }}
        />
      )}
    </Janela>
  )
}

function Formulario({
  fonte,
  itemId,
  atual,
  sugerido,
  valorSugerido,
  aoConcluir,
}: {
  fonte: FonteItem
  itemId: number
  atual: Finalizacao | null
  sugerido?: Resultado
  valorSugerido?: number
  aoConcluir: (resultado: Resultado) => void
}) {
  const [resultado, setResultado] = useState<Resultado | null>(atual?.resultado ?? sugerido ?? null)
  const valorInicial = atual ? atual.valorGanho : (valorSugerido ?? null)
  const [valor, setValor] = useState(valorInicial ? VALOR_INICIAL.format(valorInicial) : '')
  const [observacao, setObservacao] = useState(atual?.observacao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const ganhou = resultado !== null && resultadoGanhou(resultado)
  const valorLido = lerValorEmReais(valor)
  const valorInvalido = ganhou && Number.isNaN(valorLido)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (resultado === null || valorInvalido) return
    setErro(null)
    iniciar(async () => {
      try {
        await finalizar(fonte, itemId, resultado, ganhou ? valorLido : null, observacao)
        aoConcluir(resultado)
      } catch {
        setErro('Não deu pra salvar. Tente de novo.')
      }
    })
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-[13px] font-medium">Qual foi o resultado?</legend>
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-faint">{g.titulo}</span>
            {g.opcoes.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-[13px] ${
                  resultado === r ? 'border-accent bg-accent-soft' : 'border-border hover:bg-bg'
                }`}
              >
                <input
                  type="radio"
                  name="resultado"
                  value={r}
                  checked={resultado === r}
                  onChange={() => setResultado(r)}
                  className="size-4 accent-[var(--accent)]"
                />
                {ROTULO_RESULTADO[r]}
              </label>
            ))}
          </div>
        ))}
      </fieldset>

      {ganhou && (
        <div className="flex flex-col gap-1">
          <label htmlFor="valor-ganho" className="text-[13px] font-medium">
            Valor total ganho
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">R$</span>
            <input
              id="valor-ganho"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              aria-invalid={valorInvalido}
              className={`${CAMPO_JANELA} pl-8 font-mono`}
            />
          </div>
          <span className={`text-[11.5px] ${valorInvalido ? 'text-warn' : 'text-faint'}`}>
            {valorInvalido ? 'Valor não entendido — use o formato 12.345,67.' : 'Opcional. Soma na aba "Ganhas".'}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="observacao-final" className="text-[13px] font-medium">
          Observação <span className="font-normal text-faint">(opcional)</span>
        </label>
        <textarea
          id="observacao-final"
          rows={3}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Ex.: ganhamos os lotes 2 e 5; recurso no lote 3…"
          className="w-full resize-y rounded-control border border-border-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
        />
      </div>

      {erro && <p className="m-0 text-[12.5px] text-warn">{erro}</p>}

      <button type="submit" disabled={resultado === null || valorInvalido || salvando} className={BOTAO_PRINCIPAL}>
        {salvando ? 'Finalizando…' : 'Finalizar'}
      </button>
    </form>
  )
}
