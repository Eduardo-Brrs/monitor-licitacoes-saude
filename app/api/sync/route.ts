import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  buscarTodasContratacoes,
  MODALIDADE_PREGAO_ELETRONICO,
  MODALIDADE_DISPENSA,
  UF_MONITORADA,
} from '@/lib/pncp'
import { encontrarPalavrasChave } from '@/lib/keywords'
import { salvarEdital } from '@/lib/editais'

export const maxDuration = 60

// Reconsulta os últimos dias a cada run pra não perder edital se um cron
// falhar. Era 3 até 2026-09-23 — aumentado porque outage do PNCP de mais de um
// dia virou rotina (21/09 e 22-23/09 com todos os runs falhando) e edital que
// sai da janela antes da API voltar é perda definitiva. Com 3 dias as runs
// traziam 30-120 contratações em 1-9s, então 7 dias fica em ~10-20s, bem
// dentro do maxDuration de 60s.
const DIAS_JANELA = 7

function formatarDataPncp(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}${mes}${dia}`
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
    }
  }

  const startedAt = new Date()
  const hoje = new Date()
  const inicioJanela = new Date(hoje)
  inicioJanela.setDate(inicioJanela.getDate() - DIAS_JANELA)

  let totalApi = 0
  let totalMatched = 0
  let totalNovos = 0
  let erro: string | null = null

  try {
    const contratacoes = (
      await Promise.all(
        [MODALIDADE_PREGAO_ELETRONICO, MODALIDADE_DISPENSA].map((codigoModalidadeContratacao) =>
          buscarTodasContratacoes({
            dataInicial: formatarDataPncp(inicioJanela),
            dataFinal: formatarDataPncp(hoje),
            codigoModalidadeContratacao,
            uf: UF_MONITORADA,
          })
        )
      )
    ).flat()
    totalApi = contratacoes.length

    for (const contratacao of contratacoes) {
      const palavrasChave = encontrarPalavrasChave(contratacao.objetoCompra)

      if (palavrasChave.length === 0) {
        // Objeto geral não bateu — pode ter um item relevante escondido
        // dentro da compra (ex: ultrassom num pregão de equipamento
        // agropecuário). Enfileira pra checagem item a item em segundo
        // plano (/api/verificar-itens), em vez de descartar direto.
        await sql`
          INSERT INTO itens_pendentes (
            numero_controle_pncp, orgao_cnpj, ano_compra, sequencial_compra,
            data_abertura_proposta, data_encerramento_proposta, contratacao_json
          ) VALUES (
            ${contratacao.numeroControlePNCP}, ${contratacao.orgaoEntidade.cnpj},
            ${contratacao.anoCompra}, ${contratacao.sequencialCompra},
            ${contratacao.dataAberturaProposta ?? null}, ${contratacao.dataEncerramentoProposta ?? null},
            ${contratacao}
          )
          ON CONFLICT (numero_controle_pncp) DO NOTHING
        `
        continue
      }

      totalMatched++
      if (await salvarEdital(contratacao, palavrasChave)) totalNovos++
    }
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err)
  }

  const finishedAt = new Date()

  await sql`
    INSERT INTO sync_runs (data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES (${hoje.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${totalApi}, ${totalMatched}, ${totalNovos}, ${erro})
  `

  if (erro) {
    return NextResponse.json({ erro, totalApi, totalMatched, totalNovos }, { status: 500 })
  }

  return NextResponse.json({ totalApi, totalMatched, totalNovos })
}
