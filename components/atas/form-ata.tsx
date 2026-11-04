'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { atualizarAta, criarAta, excluirAta } from '@/app/actions/atas'
import type { DadosAta, TipoAta } from '@/lib/atas-tipos'

// Cabeçalho da ata/contrato — mesmas colunas da planilha da empresa. Serve pra
// criar (sem ataId) e pra editar.

const CAMPO =
  'h-9 w-full rounded-control border border-border-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint disabled:opacity-60'
const ROTULO = 'text-[12px] font-medium text-ink-2'

export function FormAta({
  ataId,
  inicial,
  origem,
}: {
  ataId?: number
  inicial: DadosAta
  origem?: { fonte: string; itemId: number } | null
}) {
  const router = useRouter()
  const [d, setD] = useState<DadosAta>(inicial)
  const [salvando, iniciar] = useTransition()
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  function campo<K extends keyof DadosAta>(chave: K, valor: DadosAta[K]) {
    setD((atual) => ({ ...atual, [chave]: valor }))
    setMensagem(null)
  }

  function texto(chave: Exclude<keyof DadosAta, 'tipo' | 'validade'>) {
    return {
      value: d[chave] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => campo(chave, e.target.value),
    }
  }

  const valido = d.numero.trim() !== '' && d.orgao.trim() !== ''

  function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!valido) return
    iniciar(async () => {
      try {
        if (ataId === undefined) {
          const id = await criarAta(d, origem ?? null)
          router.push(`/atas/${id}`)
        } else {
          await atualizarAta(ataId, d)
          setMensagem({ erro: false, texto: 'Salvo.' })
        }
      } catch {
        setMensagem({ erro: true, texto: 'Não deu pra salvar. Confira a data e tente de novo.' })
      }
    })
  }

  function excluir() {
    if (ataId === undefined) return
    if (!confirmandoExclusao) {
      setConfirmandoExclusao(true)
      return
    }
    iniciar(async () => {
      await excluirAta(ataId)
      router.push('/atas')
    })
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="grid grid-cols-[130px_1fr_1fr_1fr] gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-tipo" className={ROTULO}>
            Tipo
          </label>
          <select id="ata-tipo" value={d.tipo} onChange={(e) => campo('tipo', e.target.value as TipoAta)} className={CAMPO}>
            <option value="ata">Ata (ARP)</option>
            <option value="contrato">Contrato</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-numero" className={ROTULO}>
            Número <span className="text-warn">*</span>
          </label>
          <input id="ata-numero" placeholder="ARP 719/2025" required {...texto('numero')} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-orgao" className={ROTULO}>
            Órgão <span className="text-warn">*</span>
          </label>
          <input id="ata-orgao" placeholder="AMGESP" required {...texto('orgao')} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-validade" className={ROTULO}>
            Validade
          </label>
          <input
            id="ata-validade"
            type="date"
            value={d.validade ?? ''}
            onChange={(e) => campo('validade', e.target.value || null)}
            className={CAMPO}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-processo" className={ROTULO}>
            Processo
          </label>
          <input id="ata-processo" {...texto('processo')} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-edital" className={ROTULO}>
            Edital
          </label>
          <input id="ata-edital" placeholder="90069/2025" {...texto('edital')} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-destino" className={ROTULO}>
            Destino
          </label>
          <input id="ata-destino" placeholder="Maceió" {...texto('destino')} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-prazo" className={ROTULO}>
            Prazo de entrega
          </label>
          <input id="ata-prazo" placeholder="20 dias" {...texto('prazoEntrega')} className={CAMPO} />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-prorrogacao" className={ROTULO}>
            Prorrogação
          </label>
          <input id="ata-prorrogacao" placeholder="Ex.: prorrogada até 14/07/2028" {...texto('prorrogacao')} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ata-observacao" className={ROTULO}>
            Observação
          </label>
          <input id="ata-observacao" {...texto('observacao')} className={CAMPO} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!valido || salvando}
          className="h-9 rounded-control border border-accent bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : ataId === undefined ? 'Criar e adicionar itens' : 'Salvar alterações'}
        </button>
        {mensagem && (
          <span className={`text-[12.5px] ${mensagem.erro ? 'text-warn' : 'text-accent-strong'}`}>{mensagem.texto}</span>
        )}
        <div className="grow" />
        {ataId !== undefined && (
          <button
            type="button"
            onClick={excluir}
            onBlur={() => setConfirmandoExclusao(false)}
            disabled={salvando}
            className={`h-9 rounded-control px-3 text-[12.5px] font-medium ${
              confirmandoExclusao ? 'bg-warn-soft text-warn-strong' : 'text-warn hover:bg-warn-soft'
            }`}
          >
            {confirmandoExclusao ? 'Clique de novo: apaga a ata, itens e pedidos' : 'Excluir ata'}
          </button>
        )}
      </div>
    </form>
  )
}
