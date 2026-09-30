'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { FONTES_DIARIO, type FonteDiario } from '@/lib/diarios'

// Mesmas regras de app/actions/edital.ts, na tabela diario_status: toda ação
// de triagem também marca como visto, e o descarte nunca apaga nada.

function validar(fonte: FonteDiario, avisoId: number) {
  // Server Action é endpoint público — não confiar que a fonte veio da tela.
  if (!FONTES_DIARIO.includes(fonte) || !Number.isInteger(avisoId)) {
    throw new Error(`aviso inválido: ${fonte}:${avisoId}`)
  }
}

function revalidarInterface() {
  revalidatePath('/', 'layout')
}

export async function alternarFavoritoAviso(fonte: FonteDiario, avisoId: number) {
  validar(fonte, avisoId)
  await sql`
    INSERT INTO diario_status (fonte, aviso_id, favorito, visto_em)
    VALUES (${fonte}, ${avisoId}, TRUE, NOW())
    ON CONFLICT (fonte, aviso_id) DO UPDATE
    SET favorito = NOT diario_status.favorito,
        visto_em = COALESCE(diario_status.visto_em, NOW()),
        atualizado_em = NOW()
  `
  revalidarInterface()
}

export async function marcarAvisoVisto(fonte: FonteDiario, avisoId: number) {
  validar(fonte, avisoId)
  await sql`
    INSERT INTO diario_status (fonte, aviso_id, visto_em)
    VALUES (${fonte}, ${avisoId}, NOW())
    ON CONFLICT (fonte, aviso_id) DO UPDATE
    SET visto_em = COALESCE(diario_status.visto_em, NOW()),
        atualizado_em = NOW()
  `
  revalidarInterface()
}

export async function descartarAviso(fonte: FonteDiario, avisoId: number) {
  validar(fonte, avisoId)
  await sql`
    INSERT INTO diario_status (fonte, aviso_id, descartado_em, visto_em)
    VALUES (${fonte}, ${avisoId}, NOW(), NOW())
    ON CONFLICT (fonte, aviso_id) DO UPDATE
    SET descartado_em = NOW(),
        visto_em = COALESCE(diario_status.visto_em, NOW()),
        atualizado_em = NOW()
  `
  revalidarInterface()
}

export async function desfazerDescarteAviso(fonte: FonteDiario, avisoId: number) {
  validar(fonte, avisoId)
  await sql`
    UPDATE diario_status
    SET descartado_em = NULL, atualizado_em = NOW()
    WHERE fonte = ${fonte} AND aviso_id = ${avisoId}
  `
  revalidarInterface()
}
