'use server'

import { revalidatePath } from 'next/cache'
import { guardarEditalTrazido } from '@/lib/editais'
import { etapaAtual, gravarEtapa } from '@/lib/etapa'
import { encontrarPalavrasChave } from '@/lib/keywords'
import { buscarCompra } from '@/lib/pncp'

// Estrela num edital "fora do sistema" da Pesquisa (decidido em 2026-10-06):
// grava o edital como se a captura tivesse pego e já favorita. A partir daí
// os jobs de sempre buscam anexos/itens (/api/atualizar-detalhes) e o
// acompanhamento (/api/acompanhar), inclusive de fora de Alagoas.
// Fica no boletim do dia da publicação (lib/editais.ts#guardarEditalTrazido).
export async function trazerDoPncp(numeroControlePncp: string): Promise<{ erro: string | null; numero?: string }> {
  // "12248522000196-1-000061/2026" → CNPJ, sequencial, ano
  const partes = numeroControlePncp.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/)
  if (!partes) return { erro: 'Número do PNCP inválido.' }
  const [, cnpj, sequencial, ano] = partes

  try {
    const compra = await buscarCompra(cnpj, Number(ano), Number(sequencial), { timeoutMs: 10_000, orcamentoMs: 14_000 })
    const keywords = encontrarPalavrasChave(compra.objetoCompra)
    const id = await guardarEditalTrazido(compra, keywords)
    // Já acompanhado (corrida com outra aba) fica como está.
    if ((await etapaAtual('pncp', id)) === null) await gravarEtapa('pncp', id, 'favoritada')
    revalidatePath('/', 'layout')
    return { erro: null, numero: compra.numeroControlePNCP }
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    return { erro: `O PNCP não respondeu agora — tente de novo em instantes. (${mensagem.slice(0, 120)})` }
  }
}
