import { listarAtas } from '@/lib/atas'
import { contasDoItem, formatarData, situacaoDaValidade } from '@/lib/atas-tipos'
import { montarCsv, numeroCsv, respostaCsv } from '@/lib/csv'
import { diaEmMaceio } from '@/lib/formato'

// Mesmas colunas da planilha "Atas e Contratos válidos" da empresa, pra
// abrir no Excel lado a lado (ou substituir). Pedido = soma dos pedidos.
export async function GET(request: Request) {
  const aba = new URL(request.url).searchParams.get('aba')
  const hoje = diaEmMaceio(new Date())

  const atas = (await listarAtas()).filter((a) => {
    const s = situacaoDaValidade(a.validade, hoje)
    if (aba === 'vencidas') return s === 'vencida'
    if (aba === 'vencendo') return s === 'vencendo'
    if (aba === 'vigentes') return s !== 'vencida'
    return true
  })

  const linhas = atas.flatMap((a) =>
    a.itens.map((i) => {
      const c = contasDoItem(i)
      const ultimoPedido = i.pedidos.filter((p) => p.data).at(-1)?.data ?? null
      return [
        a.processo ?? '',
        a.numero,
        formatarData(a.validade),
        a.edital ?? '',
        a.orgao,
        a.destino ?? '',
        a.prazoEntrega ?? '',
        i.produto,
        i.catmat ?? '',
        i.marca ?? '',
        i.fornecedor ?? '',
        numeroCsv(i.cotacaoOriginal),
        numeroCsv(i.cotacaoRevisada),
        i.atualizacaoPrecos ?? '',
        numeroCsv(i.precoVenda),
        c.margemAtual === null ? '' : `${(c.margemAtual * 100).toFixed(1).replace('.', ',')}%`,
        i.quantidade === null ? '' : String(i.quantidade).replace('.', ','),
        numeroCsv(c.valorCompra),
        numeroCsv(c.valorVenda),
        numeroCsv(c.pedido),
        numeroCsv(c.saldo),
        a.observacao ?? '',
        a.prorrogacao ?? '',
        ultimoPedido ? formatarData(ultimoPedido) : '',
        i.pendencia ? 'Sim' : '',
        i.pendencia ?? '',
        i.quantidadeMinima === null ? '' : String(i.quantidadeMinima).replace('.', ','),
      ]
    })
  )

  const csv = montarCsv(
    [
      'Processo',
      'Ata ou Contrato assinada',
      'Validade',
      'Edital',
      'Orgão realizador',
      'Destino',
      'Prazo de entrega',
      'Produto',
      'CATMAT',
      'MARCA',
      'FORNECEDOR',
      'Cotação Original',
      'Cotação Revisada',
      'Atualização dos preços',
      'Preço de venda (ganho)',
      'Margem',
      'Qtde',
      'Valor de Compra',
      'Valor Venda',
      'Pedido',
      'saldo a pedir',
      'Observação',
      'Prorrogação',
      'Data',
      'Alguma pendência',
      'PENDÊNCIAS',
      'QUANTIDADE MINIMA',
    ],
    linhas
  )
  return respostaCsv(csv, `atas-e-contratos-${hoje}.csv`)
}
