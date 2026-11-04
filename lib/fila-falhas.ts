import { sql } from '@/lib/db'
import type { FalhaGuardada, RegistroDeFalhas } from '@/lib/fila'

export const FILA_DOE_EDICOES = 'doe_edicoes'
export const FILA_DIARIOS_MATERIAS = 'diarios_materias'
export const FILA_VERIFICAR_ITENS = 'verificar_itens'
export const FILA_ACOMPANHAR = 'acompanhar'
export const FILA_LIGAR_AVISOS = 'ligar_avisos'
export const FILA_SYNC_COMPRAS = 'sync_compras'

export async function falhasDaFila(fila: string): Promise<Map<string, Date>> {
  const linhas = await sql`SELECT chave, falhou_em FROM fila_falhas WHERE fila = ${fila}`
  return new Map(linhas.map((l) => [l.chave as string, new Date(l.falhou_em as string)]))
}

// conhecidas: quando a rotina já leu as falhas, evita um DELETE por item que
// nunca falhou.
export function registroDaFila(fila: string, conhecidas?: Map<string, Date>): RegistroDeFalhas {
  return {
    async falhou(chave, erro) {
      await sql`
        INSERT INTO fila_falhas (fila, chave, erro) VALUES (${fila}, ${chave}, ${erro.slice(0, 500)})
        ON CONFLICT (fila, chave) DO UPDATE
        SET tentativas = fila_falhas.tentativas + 1, falhou_em = NOW(), erro = EXCLUDED.erro
      `
    },
    async deuCerto(chave) {
      if (conhecidas && !conhecidas.has(chave)) return
      await sql`DELETE FROM fila_falhas WHERE fila = ${fila} AND chave = ${chave}`
    },
  }
}

export async function todasAsFalhas(): Promise<FalhaGuardada[]> {
  const linhas = await sql`SELECT fila, chave, tentativas, primeira_falha_em, falhou_em, erro FROM fila_falhas`
  return linhas.map((l) => ({
    fila: l.fila as string,
    chave: l.chave as string,
    tentativas: l.tentativas as number,
    primeiraFalhaEm: new Date(l.primeira_falha_em as string),
    falhouEm: new Date(l.falhou_em as string),
    erro: (l.erro as string | null) ?? null,
  }))
}
