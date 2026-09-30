import { sql } from '@/lib/db'
import { buscarArquivos, buscarItens, type LimitesPncp, type PncpArquivo, type PncpItem } from '@/lib/pncp'

// Cópia salva dos anexos e itens de um edital (colunas em `editais`, ver
// lib/schema.sql). O PNCP cai com frequência, e edital sem anexo na tela não
// serve pra nada — então o que já conseguimos buscar uma vez fica guardado e
// é mostrado mesmo com o PNCP fora do ar.

// Órgão pode excluir a compra do PNCP depois de publicada — aí os endpoints
// devolvem 404 "Compra não encontrada". Não é instabilidade: não adianta
// tentar de novo, e a tela tem que dizer isso em vez de "PNCP instável".
// Achado no backfill de 2026-09-24 (edital 613, Poço das Trincheiras).
export const ERRO_REMOVIDA = 'PNCP respondeu 404'

export function foiRemovidaDoPncp(erro: string | null): boolean {
  return erro?.startsWith(ERRO_REMOVIDA) === true
}

export interface DetalheSalvo {
  arquivos: PncpArquivo[] | null // null = nunca conseguimos buscar
  itens: PncpItem[] | null
  atualizadoEm: string | null
  tentadoEm: string | null
  erro: string | null
}

export interface ChaveCompra {
  id: number
  orgaoCnpj: string
  anoCompra: number
  sequencialCompra: number
}

export async function lerDetalheSalvo(editalId: number): Promise<DetalheSalvo> {
  const linhas = (await sql`
    SELECT arquivos_json, itens_json, detalhe_atualizado_em, detalhe_tentado_em, detalhe_erro
    FROM editais WHERE id = ${editalId}
  `) as Record<string, unknown>[]
  const l = linhas[0] ?? {}
  return {
    arquivos: (l.arquivos_json as PncpArquivo[] | null) ?? null,
    itens: (l.itens_json as PncpItem[] | null) ?? null,
    atualizadoEm: (l.detalhe_atualizado_em as string | null) ?? null,
    tentadoEm: (l.detalhe_tentado_em as string | null) ?? null,
    erro: (l.detalhe_erro as string | null) ?? null,
  }
}

// Busca anexos e itens no PNCP e grava a cópia. Só sobrescreve o que veio:
// se os itens responderem e os anexos não, os anexos antigos ficam — nunca
// troca uma cópia boa por nada. Devolve o que conseguiu buscar agora.
export async function atualizarDetalhe(
  compra: ChaveCompra,
  limites?: LimitesPncp
): Promise<{ arquivos: PncpArquivo[] | null; itens: PncpItem[] | null; erro: string | null }> {
  const [arquivos, itens] = await Promise.allSettled([
    buscarArquivos(compra.orgaoCnpj, compra.anoCompra, compra.sequencialCompra, limites),
    buscarItens(compra.orgaoCnpj, compra.anoCompra, compra.sequencialCompra, limites),
  ])

  const arquivosOk = arquivos.status === 'fulfilled' ? arquivos.value : null
  const itensOk = itens.status === 'fulfilled' ? itens.value : null
  const falhas = [arquivos, itens]
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
  const erro = falhas.length > 0 ? falhas.join(' | ').slice(0, 500) : null

  await sql`
    UPDATE editais SET
      arquivos_json = COALESCE(${arquivosOk === null ? null : JSON.stringify(arquivosOk)}::jsonb, arquivos_json),
      itens_json = COALESCE(${itensOk === null ? null : JSON.stringify(itensOk)}::jsonb, itens_json),
      detalhe_atualizado_em = CASE WHEN ${arquivosOk !== null} THEN NOW() ELSE detalhe_atualizado_em END,
      detalhe_tentado_em = NOW(),
      detalhe_erro = ${erro}
    WHERE id = ${compra.id}
  `

  return { arquivos: arquivosOk, itens: itensOk, erro }
}

// Cópia recente não precisa de ida ao PNCP: a tela abre na hora com ela.
const MINUTOS_COPIA_FRESCA = 120

// Quando a cópia está velha (ou não existe), a tela tenta o PNCP com limite
// curto — quem está olhando não espera os 25s que o cron aceita.
const LIMITES_DA_TELA: LimitesPncp = { timeoutMs: 6_000, orcamentoMs: 8_000 }

export interface DetalheParaTela {
  arquivos: PncpArquivo[] | null
  itens: PncpItem[] | null
  atualizadoEm: string | null
  pncpFalhouAgora: boolean // a lista mostrada é a salva porque o PNCP não respondeu agora
  removidaDoPncp: boolean
}

export async function carregarDetalheParaTela(compra: ChaveCompra): Promise<DetalheParaTela> {
  const salvo = await lerDetalheSalvo(compra.id)
  const copiaFresca =
    salvo.arquivos !== null &&
    salvo.atualizadoEm !== null &&
    Date.now() - new Date(salvo.atualizadoEm).getTime() < MINUTOS_COPIA_FRESCA * 60_000

  if (copiaFresca) {
    return { arquivos: salvo.arquivos, itens: salvo.itens, atualizadoEm: salvo.atualizadoEm, pncpFalhouAgora: false, removidaDoPncp: false }
  }
  // Já sabemos que a compra saiu do PNCP — não vale gastar os 8s da tela.
  if (foiRemovidaDoPncp(salvo.erro)) {
    return { arquivos: salvo.arquivos, itens: salvo.itens, atualizadoEm: salvo.atualizadoEm, pncpFalhouAgora: false, removidaDoPncp: true }
  }

  const agora = await atualizarDetalhe(compra, LIMITES_DA_TELA)
  return {
    arquivos: agora.arquivos ?? salvo.arquivos,
    itens: agora.itens ?? salvo.itens,
    atualizadoEm: agora.arquivos !== null ? new Date().toISOString() : salvo.atualizadoEm,
    pncpFalhouAgora: agora.arquivos === null && !foiRemovidaDoPncp(agora.erro),
    removidaDoPncp: agora.arquivos === null && foiRemovidaDoPncp(agora.erro),
  }
}
