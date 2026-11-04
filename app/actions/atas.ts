'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { ehFonteItem } from '@/lib/acompanhamento-tipos'
import type { DadosAta, DadosItem } from '@/lib/atas-tipos'

// Atas e contratos (2026-10-27). Server Action é endpoint público — valida
// tudo que chega da tela.

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/

function texto(valor: unknown, obrigatorio = false): string | null {
  if (valor !== null && valor !== undefined && typeof valor !== 'string') throw new Error('texto inválido')
  const limpo = (valor ?? '').trim()
  if (obrigatorio && limpo === '') throw new Error('campo obrigatório vazio')
  return limpo === '' ? null : limpo.slice(0, 2000)
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'number' || !Number.isFinite(valor) || Math.abs(valor) >= 1e12) throw new Error('número inválido')
  return valor
}

function data(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor !== 'string' || !FORMATO_DIA.test(valor)) throw new Error('data inválida')
  return valor
}

function inteiro(valor: unknown): number {
  if (!Number.isInteger(valor)) throw new Error('id inválido')
  return valor as number
}

function limparAta(d: DadosAta) {
  if (d.tipo !== 'ata' && d.tipo !== 'contrato') throw new Error('tipo inválido')
  return {
    tipo: d.tipo,
    numero: texto(d.numero, true)!,
    processo: texto(d.processo),
    edital: texto(d.edital),
    orgao: texto(d.orgao, true)!,
    destino: texto(d.destino),
    prazoEntrega: texto(d.prazoEntrega),
    validade: data(d.validade),
    prorrogacao: texto(d.prorrogacao),
    observacao: texto(d.observacao),
  }
}

function revalidar() {
  revalidatePath('/', 'layout')
}

export async function criarAta(dados: DadosAta, origem: { fonte: string; itemId: number } | null): Promise<number> {
  const d = limparAta(dados)
  let fonte: string | null = null
  let itemId: number | null = null
  if (origem) {
    if (!ehFonteItem(origem.fonte)) throw new Error('origem inválida')
    fonte = origem.fonte
    itemId = inteiro(origem.itemId)
  }
  const [l] = (await sql`
    INSERT INTO atas (tipo, numero, processo, edital, orgao, destino, prazo_entrega, validade, prorrogacao, observacao, fonte, item_id)
    VALUES (${d.tipo}, ${d.numero}, ${d.processo}, ${d.edital}, ${d.orgao}, ${d.destino}, ${d.prazoEntrega},
            ${d.validade}, ${d.prorrogacao}, ${d.observacao}, ${fonte}, ${itemId})
    RETURNING id
  `) as { id: number }[]
  revalidar()
  return l.id
}

export async function atualizarAta(id: number, dados: DadosAta) {
  inteiro(id)
  const d = limparAta(dados)
  await sql`
    UPDATE atas SET tipo = ${d.tipo}, numero = ${d.numero}, processo = ${d.processo}, edital = ${d.edital},
      orgao = ${d.orgao}, destino = ${d.destino}, prazo_entrega = ${d.prazoEntrega}, validade = ${d.validade},
      prorrogacao = ${d.prorrogacao}, observacao = ${d.observacao}, atualizada_em = NOW()
    WHERE id = ${id}
  `
  revalidar()
}

// Leva itens e pedidos junto (ON DELETE CASCADE). A tela pede confirmação.
export async function excluirAta(id: number) {
  inteiro(id)
  await sql`DELETE FROM atas WHERE id = ${id}`
  revalidar()
}

function limparItem(d: DadosItem) {
  return {
    produto: texto(d.produto, true)!,
    catmat: texto(d.catmat),
    marca: texto(d.marca),
    fornecedor: texto(d.fornecedor),
    cotacaoOriginal: numero(d.cotacaoOriginal),
    cotacaoRevisada: numero(d.cotacaoRevisada),
    atualizacaoPrecos: texto(d.atualizacaoPrecos),
    precoVenda: numero(d.precoVenda),
    quantidade: numero(d.quantidade),
    quantidadeMinima: numero(d.quantidadeMinima),
    pendencia: texto(d.pendencia),
  }
}

// itemId null = item novo.
export async function salvarItem(ataId: number, itemId: number | null, dados: DadosItem) {
  inteiro(ataId)
  const d = limparItem(dados)
  if (itemId === null) {
    await sql`
      INSERT INTO ata_itens (ata_id, produto, catmat, marca, fornecedor, cotacao_original, cotacao_revisada,
        atualizacao_precos, preco_venda, quantidade, quantidade_minima, pendencia)
      VALUES (${ataId}, ${d.produto}, ${d.catmat}, ${d.marca}, ${d.fornecedor}, ${d.cotacaoOriginal}, ${d.cotacaoRevisada},
        ${d.atualizacaoPrecos}, ${d.precoVenda}, ${d.quantidade}, ${d.quantidadeMinima}, ${d.pendencia})
    `
  } else {
    inteiro(itemId)
    await sql`
      UPDATE ata_itens SET produto = ${d.produto}, catmat = ${d.catmat}, marca = ${d.marca}, fornecedor = ${d.fornecedor},
        cotacao_original = ${d.cotacaoOriginal}, cotacao_revisada = ${d.cotacaoRevisada},
        atualizacao_precos = ${d.atualizacaoPrecos}, preco_venda = ${d.precoVenda}, quantidade = ${d.quantidade},
        quantidade_minima = ${d.quantidadeMinima}, pendencia = ${d.pendencia}
      WHERE id = ${itemId} AND ata_id = ${ataId}
    `
  }
  await sql`UPDATE atas SET atualizada_em = NOW() WHERE id = ${ataId}`
  revalidar()
}

export async function excluirItem(itemId: number) {
  inteiro(itemId)
  await sql`DELETE FROM ata_itens WHERE id = ${itemId}`
  revalidar()
}

export async function registrarPedido(itemId: number, dia: string | null, valor: number, observacao: string) {
  inteiro(itemId)
  const v = numero(valor)
  if (v === null || v <= 0) throw new Error('valor do pedido inválido')
  await sql`
    INSERT INTO ata_pedidos (ata_item_id, data, valor, observacao)
    VALUES (${itemId}, ${data(dia)}, ${v}, ${texto(observacao)})
  `
  revalidar()
}

export async function excluirPedido(pedidoId: number) {
  inteiro(pedidoId)
  await sql`DELETE FROM ata_pedidos WHERE id = ${pedidoId}`
  revalidar()
}
