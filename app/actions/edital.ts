'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'

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

export async function alternarFavorito(editalId: number) {
  await sql`
    INSERT INTO edital_status (edital_id, favorito, visto_em)
    VALUES (${editalId}, TRUE, NOW())
    ON CONFLICT (edital_id) DO UPDATE
    SET favorito = NOT edital_status.favorito,
        visto_em = COALESCE(edital_status.visto_em, NOW()),
        atualizado_em = NOW()
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
