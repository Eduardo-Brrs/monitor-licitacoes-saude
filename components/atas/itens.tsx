'use client'

import { useState, useTransition } from 'react'
import { excluirItem, excluirPedido, registrarPedido, salvarItem } from '@/app/actions/atas'
import { BOTAO_PRINCIPAL, CAMPO_JANELA, Janela } from '@/components/acompanhamento/janela'
import {
  contasDaAta,
  contasDoItem,
  formatarData,
  formatarDinheiro,
  formatarMargem,
  formatarPreco,
  formatarQtd,
  lerNumero,
  paraCampo,
  type DadosItem,
  type ItemAta,
} from '@/lib/atas-tipos'
import { diaEmMaceio } from '@/lib/formato'

// Itens ganhos de uma ata, com as contas da planilha da empresa (compra pela
// cotação original, margem pela revisada) e os pedidos do órgão em R$.

const TH = 'border-b border-border-strong px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const TD = 'border-b border-[#e9e7e1] px-2 py-[9px] align-top'

export function ItensDaAta({ ataId, itens }: { ataId: number; itens: ItemAta[] }) {
  const [editando, setEditando] = useState<ItemAta | 'novo' | null>(null)
  const [pedidosDe, setPedidosDe] = useState<number | null>(null)
  const total = contasDaAta(itens)
  const itemDosPedidos = itens.find((i) => i.id === pedidosDe) ?? null

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-end gap-3">
        <h2 className="m-0 grow text-[11px] font-medium uppercase tracking-[0.05em] text-faint">
          Itens ganhos · {itens.length}
        </h2>
        <button
          type="button"
          onClick={() => setEditando('novo')}
          className="h-9 rounded-control border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-ink hover:bg-bg"
        >
          + Adicionar item
        </button>
      </div>

      {itens.length === 0 ? (
        <p className="m-0 rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted">
          Nenhum item ainda. Adicione os produtos ganhos nesta ata.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th scope="col" className={TH}>Produto</th>
                <th scope="col" className={TH}>Marca · fornecedor</th>
                <th scope="col" className={`${TH} text-right`}>Cotação orig. → rev.</th>
                <th scope="col" className={`${TH} text-right`}>Venda</th>
                <th scope="col" className={`${TH} text-right`}>Margem</th>
                <th scope="col" className={`${TH} text-right`}>Qtde</th>
                <th scope="col" className={`${TH} text-right`}>Compra / venda total</th>
                <th scope="col" className={`${TH} text-right`}>Pedido</th>
                <th scope="col" className={`${TH} text-right`}>Saldo a pedir</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const c = contasDoItem(i)
                const margemCaiu =
                  c.margemOriginal !== null && c.margemAtual !== null && c.margemAtual < c.margemOriginal - 0.0005
                return (
                  <tr key={i.id} className="hover:bg-surface-muted">
                    <td className={TD}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-ink">{i.produto}</span>
                        {(i.catmat || i.pendencia) && (
                          <span className="text-[11.5px] text-faint">
                            {i.catmat && `CATMAT ${i.catmat}`}
                            {i.catmat && i.pendencia && ' · '}
                            {i.pendencia && <span className="text-warn">Pendência: {i.pendencia}</span>}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} text-ink-2`}>
                      {[i.marca, i.fornecedor].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className={`${TD} text-right font-mono`}>
                      <span>{formatarPreco(i.cotacaoOriginal)}</span>
                      {i.cotacaoRevisada !== null && i.cotacaoRevisada !== i.cotacaoOriginal && (
                        <span className="block text-warn">→ {formatarPreco(i.cotacaoRevisada)}</span>
                      )}
                      {i.atualizacaoPrecos && <span className="block text-[11px] text-faint">{i.atualizacaoPrecos}</span>}
                    </td>
                    <td className={`${TD} text-right font-mono`}>{formatarPreco(i.precoVenda)}</td>
                    <td className={`${TD} text-right font-mono`} title="Venda ÷ cotação revisada − 1">
                      {margemCaiu ? (
                        <>
                          <span className="block text-faint line-through">{formatarMargem(c.margemOriginal)}</span>
                          <span className="text-warn">{formatarMargem(c.margemAtual)}</span>
                        </>
                      ) : (
                        formatarMargem(c.margemAtual)
                      )}
                    </td>
                    <td className={`${TD} text-right font-mono`}>
                      {formatarQtd(i.quantidade)}
                      {i.quantidadeMinima !== null && (
                        <span className="block text-[11px] text-faint">mín. {formatarQtd(i.quantidadeMinima)}</span>
                      )}
                    </td>
                    <td className={`${TD} text-right font-mono`}>
                      <span className="block text-faint">{formatarDinheiro(c.valorCompra)}</span>
                      {formatarDinheiro(c.valorVenda)}
                    </td>
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        onClick={() => setPedidosDe(i.id)}
                        title="Ver e registrar pedidos"
                        className="font-mono text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent-strong"
                      >
                        {c.pedido > 0 ? formatarDinheiro(c.pedido) : 'registrar'}
                      </button>
                      {i.pedidos.length > 0 && (
                        <span className="block text-[11px] text-faint">
                          {i.pedidos.length} {i.pedidos.length === 1 ? 'pedido' : 'pedidos'}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-right font-mono font-medium ${c.saldo !== null && c.saldo < 0 ? 'text-warn' : ''}`}>
                      {formatarDinheiro(c.saldo)}
                    </td>
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        onClick={() => setEditando(i)}
                        className="rounded px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-bg"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="px-2 py-2.5" colSpan={4}>
                  Total
                </td>
                <td className="px-2 py-2.5 text-right font-mono" title="Margem da ata, ponderada pela quantidade">
                  {formatarMargem(total.margemAtual)}
                </td>
                <td />
                <td className="px-2 py-2.5 text-right font-mono">
                  <span className="block font-normal text-faint">{formatarDinheiro(total.valorCompra)}</span>
                  {formatarDinheiro(total.valorVenda)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono">{formatarDinheiro(total.pedido)}</td>
                <td className="px-2 py-2.5 text-right font-mono">{formatarDinheiro(total.saldo)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Janela
        aberta={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando === 'novo' ? 'Novo item' : 'Editar item'}
        larga
        subtitulo={editando && editando !== 'novo' ? editando.produto : undefined}
      >
        {editando !== null && (
          <FormItem ataId={ataId} item={editando === 'novo' ? null : editando} aoConcluir={() => setEditando(null)} />
        )}
      </Janela>

      <Janela
        aberta={itemDosPedidos !== null}
        aoFechar={() => setPedidosDe(null)}
        titulo="Pedidos do item"
        subtitulo={itemDosPedidos?.produto}
      >
        {itemDosPedidos && <PedidosDoItem item={itemDosPedidos} />}
      </Janela>
    </section>
  )
}

type CamposItem = Record<
  'produto' | 'catmat' | 'marca' | 'fornecedor' | 'cotacaoOriginal' | 'cotacaoRevisada' | 'atualizacaoPrecos' | 'precoVenda' | 'quantidade' | 'quantidadeMinima' | 'pendencia',
  string
>

const NUMERICOS = ['cotacaoOriginal', 'cotacaoRevisada', 'precoVenda', 'quantidade', 'quantidadeMinima'] as const

function camposDe(item: ItemAta | null): CamposItem {
  return {
    produto: item?.produto ?? '',
    catmat: item?.catmat ?? '',
    marca: item?.marca ?? '',
    fornecedor: item?.fornecedor ?? '',
    cotacaoOriginal: paraCampo(item?.cotacaoOriginal ?? null),
    cotacaoRevisada: paraCampo(item?.cotacaoRevisada ?? null),
    atualizacaoPrecos: item?.atualizacaoPrecos ?? '',
    precoVenda: paraCampo(item?.precoVenda ?? null),
    quantidade: paraCampo(item?.quantidade ?? null),
    quantidadeMinima: paraCampo(item?.quantidadeMinima ?? null),
    pendencia: item?.pendencia ?? '',
  }
}

function FormItem({ ataId, item, aoConcluir }: { ataId: number; item: ItemAta | null; aoConcluir: () => void }) {
  const [f, setF] = useState<CamposItem>(camposDe(item))
  const [salvando, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const invalidos = NUMERICOS.filter((k) => Number.isNaN(lerNumero(f[k])))
  const prontos = f.produto.trim() !== '' && invalidos.length === 0

  // Prévia das contas enquanto digita.
  const previa = contasDoItem({
    cotacaoOriginal: lerNumero(f.cotacaoOriginal),
    cotacaoRevisada: lerNumero(f.cotacaoRevisada),
    precoVenda: lerNumero(f.precoVenda),
    quantidade: lerNumero(f.quantidade),
    pedidos: item?.pedidos ?? [],
  })

  function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!prontos) return
    const dados: DadosItem = {
      produto: f.produto,
      catmat: f.catmat,
      marca: f.marca,
      fornecedor: f.fornecedor,
      cotacaoOriginal: lerNumero(f.cotacaoOriginal),
      cotacaoRevisada: lerNumero(f.cotacaoRevisada),
      atualizacaoPrecos: f.atualizacaoPrecos,
      precoVenda: lerNumero(f.precoVenda),
      quantidade: lerNumero(f.quantidade),
      quantidadeMinima: lerNumero(f.quantidadeMinima),
      pendencia: f.pendencia,
    }
    setErro(null)
    iniciar(async () => {
      try {
        await salvarItem(ataId, item?.id ?? null, dados)
        aoConcluir()
      } catch {
        setErro('Não deu pra salvar. Tente de novo.')
      }
    })
  }

  function excluir() {
    if (!item) return
    if (!confirmandoExclusao) {
      setConfirmandoExclusao(true)
      return
    }
    iniciar(async () => {
      await excluirItem(item.id)
      aoConcluir()
    })
  }

  function entrada(chave: keyof CamposItem, rotulo: string, extra?: { placeholder?: string; numerico?: boolean; autoFocus?: boolean }) {
    const ruim = extra?.numerico && Number.isNaN(lerNumero(f[chave]))
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={`item-${chave}`} className="text-[12px] font-medium text-ink-2">
          {rotulo}
        </label>
        <input
          id={`item-${chave}`}
          value={f[chave]}
          autoFocus={extra?.autoFocus}
          inputMode={extra?.numerico ? 'decimal' : undefined}
          placeholder={extra?.placeholder}
          aria-invalid={ruim}
          onChange={(e) => setF((atual) => ({ ...atual, [chave]: e.target.value }))}
          className={`${CAMPO_JANELA} ${extra?.numerico ? 'font-mono' : ''} ${ruim ? 'border-warn' : ''}`}
        />
      </div>
    )
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      {entrada('produto', 'Produto *', { autoFocus: true, placeholder: 'Ex.: Gel com PHMB 100ml' })}
      <div className="grid grid-cols-3 gap-2">
        {entrada('marca', 'Marca')}
        {entrada('fornecedor', 'Fornecedor')}
        {entrada('catmat', 'CATMAT')}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {entrada('cotacaoOriginal', 'Cotação original', { numerico: true, placeholder: '0,00' })}
        {entrada('cotacaoRevisada', 'Cotação revisada', { numerico: true, placeholder: 'igual à original' })}
        {entrada('atualizacaoPrecos', 'Atualização preços', { placeholder: 'Julho/2025' })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {entrada('precoVenda', 'Preço de venda (ganho)', { numerico: true, placeholder: '0,00' })}
        {entrada('quantidade', 'Quantidade', { numerico: true })}
        {entrada('quantidadeMinima', 'Qtde mínima', { numerico: true })}
      </div>
      {entrada('pendencia', 'Pendência')}

      <p className="m-0 rounded-control bg-surface-muted px-3 py-2 font-mono text-[12px] text-ink-2">
        Compra {formatarDinheiro(previa.valorCompra)} · Venda {formatarDinheiro(previa.valorVenda)} · Margem{' '}
        {formatarMargem(previa.margemAtual)}
      </p>

      {invalidos.length > 0 && <p className="m-0 text-[12px] text-warn">Número não entendido — use o formato 1.234,56.</p>}
      {erro && <p className="m-0 text-[12.5px] text-warn">{erro}</p>}

      <button type="submit" disabled={!prontos || salvando} className={BOTAO_PRINCIPAL}>
        {salvando ? 'Salvando…' : item ? 'Salvar item' : 'Adicionar item'}
      </button>
      {item && (
        <button
          type="button"
          onClick={excluir}
          onBlur={() => setConfirmandoExclusao(false)}
          disabled={salvando}
          className={`h-9 rounded-control text-[12.5px] font-medium ${
            confirmandoExclusao ? 'bg-warn-soft text-warn-strong' : 'text-warn hover:bg-warn-soft'
          }`}
        >
          {confirmandoExclusao ? 'Clique de novo: apaga o item e os pedidos dele' : 'Excluir item'}
        </button>
      )}
    </form>
  )
}

function PedidosDoItem({ item }: { item: ItemAta }) {
  const c = contasDoItem(item)
  const [dia, setDia] = useState(diaEmMaceio(new Date()))
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, iniciar] = useTransition()
  const [erro, setErro] = useState(false)
  const lido = lerNumero(valor)
  const pronto = lido !== null && !Number.isNaN(lido) && lido > 0

  function registrar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!pronto) return
    setErro(false)
    iniciar(async () => {
      try {
        await registrarPedido(item.id, dia || null, lido, obs)
        setValor('')
        setObs('')
      } catch {
        setErro(true)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Venda total', formatarDinheiro(c.valorVenda)],
          ['Já pedido', formatarDinheiro(c.pedido)],
          ['Saldo a pedir', formatarDinheiro(c.saldo)],
        ].map(([rotulo, v]) => (
          <div key={rotulo} className="flex flex-col gap-0.5 rounded-control bg-surface-muted px-2 py-2">
            <span className="text-[11px] uppercase tracking-[0.05em] text-faint">{rotulo}</span>
            <span className="font-mono text-[13px] font-medium">{v}</span>
          </div>
        ))}
      </div>

      {item.pedidos.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {item.pedidos.map((p) => (
            <LinhaPedido key={p.id} id={p.id} data={p.data} valor={p.valor} observacao={p.observacao} />
          ))}
        </ul>
      )}

      <form onSubmit={registrar} className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[13px] font-medium">Registrar pedido</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="pedido-data" className="text-[12px] text-ink-2">
              Data
            </label>
            <input id="pedido-data" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={CAMPO_JANELA} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pedido-valor" className="text-[12px] text-ink-2">
              Valor (R$)
            </label>
            <input
              id="pedido-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className={`${CAMPO_JANELA} font-mono`}
            />
          </div>
        </div>
        <label htmlFor="pedido-obs" className="sr-only">
          Observação do pedido
        </label>
        <input
          id="pedido-obs"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observação (nº do empenho, nota…)"
          className={CAMPO_JANELA}
        />
        {erro && <p className="m-0 text-[12.5px] text-warn">Não deu pra salvar. Tente de novo.</p>}
        <button type="submit" disabled={!pronto || salvando} className={BOTAO_PRINCIPAL}>
          {salvando ? 'Registrando…' : 'Registrar pedido'}
        </button>
      </form>
    </div>
  )
}

function LinhaPedido({ id, data, valor, observacao }: { id: number; data: string | null; valor: number; observacao: string | null }) {
  const [apagando, iniciar] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  return (
    <li className="group flex items-center gap-3 rounded-control px-2 py-1.5 text-[12.5px] hover:bg-bg">
      <span className="w-[84px] shrink-0 font-mono text-faint">{data ? formatarData(data) : 'sem data'}</span>
      <span className="w-[110px] shrink-0 text-right font-mono">{formatarDinheiro(valor)}</span>
      <span className="grow truncate text-ink-2" title={observacao ?? undefined}>
        {observacao}
      </span>
      <button
        type="button"
        disabled={apagando}
        onBlur={() => setConfirmando(false)}
        onClick={() => {
          if (!confirmando) return setConfirmando(true)
          iniciar(() => excluirPedido(id))
        }}
        className={`shrink-0 rounded px-1.5 text-[11.5px] font-medium ${
          confirmando ? 'bg-warn-soft text-warn-strong' : 'text-faint opacity-0 hover:text-warn focus:opacity-100 group-hover:opacity-100'
        }`}
      >
        {confirmando ? 'apagar?' : 'apagar'}
      </button>
    </li>
  )
}
