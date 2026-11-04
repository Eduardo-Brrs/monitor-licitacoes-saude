'use server'

import { revalidatePath } from 'next/cache'
import { etapaAoFavoritar } from '@/lib/acompanhamento-tipos'
import { sql } from '@/lib/db'
import { etapaAtual, gravarEtapa } from '@/lib/etapa'

// Toda ação de triagem também marca o edital como visto: se você favoritou ou
// descartou, você olhou. O visto_em usa COALESCE pra preservar o instante da
// primeira vez em vez de ser reescrito a cada clique.
//
// revalidatePath no layout (e não só na rota) porque o contador da barra
// lateral depende do mesmo dado — sem isso a lista atualiza e o badge fica
// mentindo até a próxima navegação.

function revalidarInterface() {
  revalidatePath('/', 'layout')
}

// Estrela é a etapa "Favoritada": acender apaga o status (etapa única,
// lib/etapa.ts), apagar tira do acompanhamento.
export async function alternarFavorito(editalId: number) {
  if (!Number.isInteger(editalId)) throw new Error('edital inválido')
  await gravarEtapa('pncp', editalId, etapaAoFavoritar(await etapaAtual('pncp', editalId)))
  revalidarInterface()
}

// Abriu o edital = viu a movimentação nova do PNCP (o "novo" do Andamento).
export async function marcarMovimentacaoVista(editalId: number) {
  if (!Number.isInteger(editalId)) throw new Error('edital inválido')
  await sql`
    UPDATE edital_status SET movimentacao_vista_em = NOW() WHERE edital_id = ${editalId}
  `
  revalidarInterface()
}

export async function marcarVisto(editalId: number) {
  await sql`
    INSERT INTO edital_status (edital_id, visto_em)
    VALUES (${editalId}, NOW())
    ON CONFLICT (edital_id) DO UPDATE
    SET visto_em = COALESCE(edital_status.visto_em, NOW()),
        atualizado_em = NOW()
  `
  revalidarInterface()
}

export async function descartar(editalId: number) {
  await sql`
    INSERT INTO edital_status (edital_id, descartado_em, visto_em)
    VALUES (${editalId}, NOW(), NOW())
    ON CONFLICT (edital_id) DO UPDATE
    SET descartado_em = NOW(),
        visto_em = COALESCE(edital_status.visto_em, NOW()),
        atualizado_em = NOW()
  `
  revalidarInterface()
}

// O descarte nunca apaga nada — some da lista e volta inteiro pelo desfazer.
export async function desfazerDescarte(editalId: number) {
  await sql`
    UPDATE edital_status
    SET descartado_em = NULL, atualizado_em = NOW()
    WHERE edital_id = ${editalId}
  `
  revalidarInterface()
}
