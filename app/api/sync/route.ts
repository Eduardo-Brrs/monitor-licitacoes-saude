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
import { comFusoDeBrasilia } from '@/lib/formato'
import { limparDadosAntigos, type ResultadoLimpeza } from '@/lib/limpeza'
import { ordenarPorFalha, rodarFila } from '@/lib/fila'
import { FILA_SYNC_COMPRAS, falhasDaFila, registroDaFila } from '@/lib/fila-falhas'

export const maxDuration = 60

// Busca leva ~10-20s; o que não couber aqui fica pra próxima rodada.
const ORCAMENTO_GRAVACAO_MS = 30_000

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

    const chave = (c: (typeof contratacoes)[number]) => c.numeroControlePNCP
    const falhas = await falhasDaFila(FILA_SYNC_COMPRAS)
    const fila = await rodarFila({
      itens: ordenarPorFalha(contratacoes, chave, falhas),
      chave,
      orcamentoMs: ORCAMENTO_GRAVACAO_MS,
      registro: registroDaFila(FILA_SYNC_COMPRAS, falhas),
      processar: async (contratacao) => {
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
              ${comFusoDeBrasilia(contratacao.dataAberturaProposta)}, ${comFusoDeBrasilia(contratacao.dataEncerramentoProposta)},
              ${contratacao}
            )
            ON CONFLICT (numero_controle_pncp) DO NOTHING
          `
          return
        }

        totalMatched++
        if (await salvarEdital(contratacao, palavrasChave)) totalNovos++
      },
    })
    // Falha parcial não pinta a rodada de vermelho: item preso avisa pelo vigia.
    if (fila.tentados > 0 && fila.concluidos === 0) erro = fila.ultimoErro
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err)
  }

  const finishedAt = new Date()

  await sql`
    INSERT INTO sync_runs (data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES (${hoje.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${totalApi}, ${totalMatched}, ${totalNovos}, ${erro})
  `

  // Limpeza (lib/limpeza.ts) roda mesmo com o PNCP fora — não depende dele — e
  // tem linha própria em sync_runs: falha dela não vira falha do sync.
  // total_api = itens_pendentes resumidos, total_novos = sync_runs apagados.
  const inicioLimpeza = new Date()
  let limpeza: ResultadoLimpeza | null = null
  let erroLimpeza: string | null = null
  try {
    limpeza = await limparDadosAntigos()
  } catch (err) {
    erroLimpeza = err instanceof Error ? err.message : String(err)
  }
  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('limpeza', ${inicioLimpeza.toISOString().slice(0, 10)}, ${inicioLimpeza.toISOString()}, ${new Date().toISOString()},
            ${limpeza?.pendentesResumidos ?? 0}, 0, ${limpeza?.syncRunsApagados ?? 0}, ${erroLimpeza})
  `

  if (erro) {
    return NextResponse.json({ erro, totalApi, totalMatched, totalNovos, limpeza }, { status: 500 })
  }

  return NextResponse.json({ totalApi, totalMatched, totalNovos, limpeza })
}
