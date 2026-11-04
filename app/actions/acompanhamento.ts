'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { ehEtapa, ehFonteItem, ehResultado, type Etapa, type FonteItem, type Resultado } from '@/lib/acompanhamento-tipos'
import { verificarEdital } from '@/lib/acompanhamento-pncp'
import { gravarEtapa, gravarFinalizacao } from '@/lib/etapa'
import { FONTES_LIGAVEIS, procurarEditalDoAviso, type FonteLigavel } from '@/lib/ligar-avisos'

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

// Etapa = favorito e status juntos, numa escada só (lib/etapa.ts grava as
// duas colunas e registra a mudança na linha do tempo). null tira do
// acompanhamento.
export async function definirEtapa(fonte: FonteItem, itemId: number, etapa: Etapa | null) {
  validarItem(fonte, itemId)
  if (etapa !== null && !ehEtapa(etapa)) throw new Error(`etapa inválida: ${etapa}`)
  await gravarEtapa(fonte, itemId, etapa)
  revalidarInterface()
}

// Janela "Finalizar" (2026-10-27, pedido do usuário): resultado, valor total ganho e
// observação. lib/etapa.ts decide se vira "ganha" ou "finalizada".
export async function finalizar(
  fonte: FonteItem,
  itemId: number,
  resultado: Resultado,
  valorGanho: number | null,
  observacao: string
) {
  validarItem(fonte, itemId)
  if (!ehResultado(resultado)) throw new Error(`resultado inválido: ${resultado}`)
  if (valorGanho !== null && !(Number.isFinite(valorGanho) && valorGanho >= 0 && valorGanho < 1e12)) {
    throw new Error('valor ganho inválido')
  }
  const obs = observacao.trim()
  await gravarFinalizacao(fonte, itemId, resultado, valorGanho, obs === '' ? null : obs)
  revalidarInterface()
}

// Notas da linha do tempo (2026-10-23): cada "Salvar nota" é uma entrada
// nova, com data e autor — nada é reescrito. tarefaId = resposta a uma
// tarefa; concluir = "Responder e concluir".
export async function criarNota(
  fonte: FonteItem,
  itemId: number,
  texto: string,
  autorId: number | null,
  tarefaId: number | null = null,
  concluir = false
) {
  validarItem(fonte, itemId)
  const limpo = texto.trim()
  if (limpo === '') throw new Error('nota vazia')
  if (autorId !== null && !Number.isInteger(autorId)) throw new Error('autor inválido')
  if (tarefaId !== null && !Number.isInteger(tarefaId)) throw new Error('tarefa inválida')

  // Autor que não existe mais (navegador lembrando um id antigo) vira "sem autor".
  await sql`
    INSERT INTO notas (fonte, item_id, texto, autor_id, tarefa_id)
    VALUES (${fonte}, ${itemId}, ${limpo},
            (SELECT id FROM responsaveis WHERE id = ${autorId}),
            (SELECT id FROM tarefas WHERE id = ${tarefaId} AND fonte = ${fonte} AND item_id = ${itemId}))
  `
  if (tarefaId !== null && concluir) {
    await sql`UPDATE tarefas SET concluida_em = NOW() WHERE id = ${tarefaId} AND concluida_em IS NULL`
  }
  revalidarInterface()
}

// Edição guarda o texto anterior em notas_versoes.
export async function editarNota(notaId: number, texto: string) {
  if (!Number.isInteger(notaId)) throw new Error('nota inválida')
  const limpo = texto.trim()
  if (limpo === '') throw new Error('nota vazia')
  await sql`
    WITH anterior AS (
      INSERT INTO notas_versoes (nota_id, texto)
      SELECT id, texto FROM notas WHERE id = ${notaId} AND texto <> ${limpo} AND apagada_em IS NULL
      RETURNING nota_id
    )
    UPDATE notas SET texto = ${limpo}, editada_em = NOW()
    WHERE id IN (SELECT nota_id FROM anterior)
  `
  revalidarInterface()
}

// Apagar só esconde (apagada_em) — o texto continua no banco.
export async function apagarNota(notaId: number) {
  if (!Number.isInteger(notaId)) throw new Error('nota inválida')
  await sql`UPDATE notas SET apagada_em = NOW() WHERE id = ${notaId} AND apagada_em IS NULL`
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

// "Procurar no PNCP agora" na tela do aviso — mesma busca do job.
export async function procurarEditalAgora(
  fonte: FonteLigavel,
  avisoId: number
): Promise<{ numero: string | null; erro: string | null }> {
  if (!FONTES_LIGAVEIS.includes(fonte) || !Number.isInteger(avisoId)) throw new Error('aviso inválido')
  const r = await procurarEditalDoAviso(fonte, avisoId, { timeoutMs: 12_000, orcamentoMs: 15_000 }, Date.now() + 40_000)
  revalidarInterface()
  if (r.editalId === null) return { numero: null, erro: r.erro }
  const [e] = (await sql`SELECT numero_controle_pncp FROM editais WHERE id = ${r.editalId}`) as { numero_controle_pncp: string }[]
  return { numero: e?.numero_controle_pncp ?? null, erro: null }
}
