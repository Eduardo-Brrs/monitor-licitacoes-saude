'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { ehFonteItem, ehStatusInterno, type FonteItem, type StatusInterno } from '@/lib/acompanhamento-tipos'
import { verificarEdital } from '@/lib/acompanhamento-pncp'

// Server Action é endpoint público — valida tudo que chega da tela.
function validarItem(fonte: FonteItem, itemId: number) {
  if (!ehFonteItem(fonte) || !Number.isInteger(itemId)) {
    throw new Error(`item inválido: ${fonte}:${itemId}`)
  }
}

// Layout inteiro: a barra lateral conta tarefas vencidas e não vistos.
function revalidarInterface() {
  revalidatePath('/', 'layout')
}

// Definir status também marca como visto (mesma regra da triagem: se mexeu,
// olhou). null tira o status.
export async function definirStatusInterno(fonte: FonteItem, itemId: number, status: StatusInterno | null) {
  validarItem(fonte, itemId)
  if (status !== null && !ehStatusInterno(status)) throw new Error(`status inválido: ${status}`)

  if (fonte === 'pncp') {
    await sql`
      INSERT INTO edital_status (edital_id, status_interno, visto_em)
      VALUES (${itemId}, ${status}, NOW())
      ON CONFLICT (edital_id) DO UPDATE
      SET status_interno = ${status},
          visto_em = COALESCE(edital_status.visto_em, NOW()),
          atualizado_em = NOW()
    `
  } else {
    await sql`
      INSERT INTO diario_status (fonte, aviso_id, status_interno, visto_em)
      VALUES (${fonte}, ${itemId}, ${status}, NOW())
      ON CONFLICT (fonte, aviso_id) DO UPDATE
      SET status_interno = ${status},
          visto_em = COALESCE(diario_status.visto_em, NOW()),
          atualizado_em = NOW()
    `
  }
  revalidarInterface()
}

// Uma anotação por item, reescrita a cada "Salvar". Texto vazio apaga.
export async function salvarAnotacao(fonte: FonteItem, itemId: number, texto: string) {
  validarItem(fonte, itemId)
  const limpo = texto.trim()
  if (limpo === '') {
    await sql`DELETE FROM anotacoes WHERE fonte = ${fonte} AND item_id = ${itemId}`
  } else {
    await sql`
      INSERT INTO anotacoes (fonte, item_id, texto)
      VALUES (${fonte}, ${itemId}, ${limpo})
      ON CONFLICT (fonte, item_id) DO UPDATE SET texto = ${limpo}, atualizado_em = NOW()
    `
  }
  revalidarInterface()
}

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/

export async function criarTarefa(
  fonte: FonteItem,
  itemId: number,
  descricao: string,
  responsavelId: number | null,
  prazo: string | null
) {
  validarItem(fonte, itemId)
  const texto = descricao.trim()
  if (texto === '') throw new Error('tarefa sem descrição')
  if (responsavelId !== null && !Number.isInteger(responsavelId)) throw new Error('responsável inválido')
  if (prazo !== null && !FORMATO_DIA.test(prazo)) throw new Error('prazo inválido')

  await sql`
    INSERT INTO tarefas (fonte, item_id, descricao, responsavel_id, prazo)
    VALUES (${fonte}, ${itemId}, ${texto}, ${responsavelId}, ${prazo})
  `
  revalidarInterface()
}

// "Verificar agora" na tela do edital — mesma verificação do job, pra um
// edital só, com o tempo que a tela aguenta esperar.
export async function verificarAgora(editalId: number): Promise<{ erro: string | null }> {
  if (!Number.isInteger(editalId)) throw new Error('edital inválido')
  const [edital] = (await sql`
    SELECT id, orgao_cnpj, ano_compra, sequencial_compra FROM editais WHERE id = ${editalId}
  `) as { id: number; orgao_cnpj: string; ano_compra: number; sequencial_compra: number }[]
  if (!edital) throw new Error('edital não encontrado')

  const r = await verificarEdital(
    { id: edital.id, orgaoCnpj: edital.orgao_cnpj, anoCompra: edital.ano_compra, sequencialCompra: edital.sequencial_compra },
    30_000,
    { timeoutMs: 15_000, orcamentoMs: 20_000 }
  )
  revalidarInterface()
  return { erro: r.erro }
}

// Vitória detectada por CNPJ é sugestão com confirmação de um clique (regra 6).
export async function confirmarVitoria(editalId: number) {
  if (!Number.isInteger(editalId)) throw new Error('edital inválido')
  await definirStatusInterno('pncp', editalId, 'ganha')
}

export async function descartarSugestaoVitoria(editalId: number) {
  if (!Number.isInteger(editalId)) throw new Error('edital inválido')
  await sql`
    INSERT INTO edital_status (edital_id, vitoria_descartada_em, visto_em)
    VALUES (${editalId}, NOW(), NOW())
    ON CONFLICT (edital_id) DO UPDATE SET vitoria_descartada_em = NOW(), atualizado_em = NOW()
  `
  revalidarInterface()
}

export async function alternarTarefaConcluida(tarefaId: number) {
  if (!Number.isInteger(tarefaId)) throw new Error('tarefa inválida')
  await sql`
    UPDATE tarefas
    SET concluida_em = CASE WHEN concluida_em IS NULL THEN NOW() ELSE NULL END
    WHERE id = ${tarefaId}
  `
  revalidarInterface()
}

export async function excluirTarefa(tarefaId: number) {
  if (!Number.isInteger(tarefaId)) throw new Error('tarefa inválida')
  await sql`DELETE FROM tarefas WHERE id = ${tarefaId}`
  revalidarInterface()
}
