import { sql } from '@/lib/db'
import {
  etapaDe,
  etapaFinal,
  resultadoGanhou,
  ROTULO_RESULTADO,
  type Etapa,
  type FonteItem,
  type Resultado,
} from '@/lib/acompanhamento-tipos'
import { formatarValorCompleto } from '@/lib/formato'

// Grava a etapa (favorito + status juntos, nunca os dois ligados — ver Etapa
// em lib/acompanhamento-tipos.ts) e, se mudou, registra em etapa_eventos pra
// linha do tempo do Andamento (2026-10-07). Também marca como visto (mesma
// regra da triagem: se mexeu, olhou). Voltar pra uma etapa aberta (ou tirar
// da lista) apaga o resultado da finalização — a linha do tempo guarda o antigo.
export async function gravarEtapa(fonte: FonteItem, itemId: number, etapa: Etapa | null): Promise<void> {
  const favorito = etapa === 'favoritada'
  const status = etapa === 'favoritada' ? null : etapa
  const manterResultado = etapaFinal(etapa)
  const anterior = await etapaAtual(fonte, itemId)

  if (fonte === 'pncp') {
    await sql`
      INSERT INTO edital_status (edital_id, favorito, status_interno, visto_em)
      VALUES (${itemId}, ${favorito}, ${status}, NOW())
      ON CONFLICT (edital_id) DO UPDATE
      SET favorito = ${favorito},
          status_interno = ${status},
          resultado = CASE WHEN ${manterResultado} THEN edital_status.resultado END,
          valor_ganho = CASE WHEN ${manterResultado} THEN edital_status.valor_ganho END,
          observacao_final = CASE WHEN ${manterResultado} THEN edital_status.observacao_final END,
          finalizada_em = CASE WHEN ${manterResultado} THEN edital_status.finalizada_em END,
          visto_em = COALESCE(edital_status.visto_em, NOW()),
          atualizado_em = NOW()
    `
  } else {
    await sql`
      INSERT INTO diario_status (fonte, aviso_id, favorito, status_interno, visto_em)
      VALUES (${fonte}, ${itemId}, ${favorito}, ${status}, NOW())
      ON CONFLICT (fonte, aviso_id) DO UPDATE
      SET favorito = ${favorito},
          status_interno = ${status},
          resultado = CASE WHEN ${manterResultado} THEN diario_status.resultado END,
          valor_ganho = CASE WHEN ${manterResultado} THEN diario_status.valor_ganho END,
          observacao_final = CASE WHEN ${manterResultado} THEN diario_status.observacao_final END,
          finalizada_em = CASE WHEN ${manterResultado} THEN diario_status.finalizada_em END,
          visto_em = COALESCE(diario_status.visto_em, NOW()),
          atualizado_em = NOW()
    `
  }

  if (anterior !== etapa) {
    await sql`INSERT INTO etapa_eventos (fonte, item_id, etapa) VALUES (${fonte}, ${itemId}, ${etapa})`
  }
}

// Janela "Finalizar" (2026-10-27): resultado, valor ganho (só quando ganhou)
// e observação. Ganhou algo → "ganha"; o resto → "finalizada". Finalizar de
// novo (corrigir o resultado) sobrescreve e entra outra vez na linha do tempo.
export async function gravarFinalizacao(
  fonte: FonteItem,
  itemId: number,
  resultado: Resultado,
  valorGanho: number | null,
  observacao: string | null
): Promise<void> {
  const ganhou = resultadoGanhou(resultado)
  const status: Etapa = ganhou ? 'ganha' : 'finalizada'
  const valor = ganhou ? valorGanho : null

  if (fonte === 'pncp') {
    await sql`
      INSERT INTO edital_status (edital_id, favorito, status_interno, resultado, valor_ganho, observacao_final, finalizada_em, visto_em)
      VALUES (${itemId}, FALSE, ${status}, ${resultado}, ${valor}, ${observacao}, NOW(), NOW())
      ON CONFLICT (edital_id) DO UPDATE
      SET favorito = FALSE, status_interno = ${status}, resultado = ${resultado}, valor_ganho = ${valor},
          observacao_final = ${observacao}, finalizada_em = NOW(),
          visto_em = COALESCE(edital_status.visto_em, NOW()), atualizado_em = NOW()
    `
  } else {
    await sql`
      INSERT INTO diario_status (fonte, aviso_id, favorito, status_interno, resultado, valor_ganho, observacao_final, finalizada_em, visto_em)
      VALUES (${fonte}, ${itemId}, FALSE, ${status}, ${resultado}, ${valor}, ${observacao}, NOW(), NOW())
      ON CONFLICT (fonte, aviso_id) DO UPDATE
      SET favorito = FALSE, status_interno = ${status}, resultado = ${resultado}, valor_ganho = ${valor},
          observacao_final = ${observacao}, finalizada_em = NOW(),
          visto_em = COALESCE(diario_status.visto_em, NOW()), atualizado_em = NOW()
    `
  }

  const partes = [`Finalizada: ${ROTULO_RESULTADO[resultado].toLowerCase()}`]
  if (valor !== null) partes.push(`valor ganho ${formatarValorCompleto(valor)}`)
  const detalhe = partes.join(', ') + (observacao ? `. Obs.: ${observacao}` : '')
  await sql`INSERT INTO etapa_eventos (fonte, item_id, etapa, detalhe) VALUES (${fonte}, ${itemId}, ${status}, ${detalhe})`
}

export async function etapaAtual(fonte: FonteItem, itemId: number): Promise<Etapa | null> {
  const linhas = (
    fonte === 'pncp'
      ? await sql`SELECT favorito, status_interno FROM edital_status WHERE edital_id = ${itemId}`
      : await sql`SELECT favorito, status_interno FROM diario_status WHERE fonte = ${fonte} AND aviso_id = ${itemId}`
  ) as { favorito: boolean; status_interno: string | null }[]
  const linha = linhas[0]
  return linha ? etapaDe({ favorito: linha.favorito, statusInterno: linha.status_interno }) : null
}
