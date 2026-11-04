import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { buscarItens, type PncpContratacao } from '@/lib/pncp'
import { encontrarPalavrasChave } from '@/lib/keywords'
import { salvarEdital } from '@/lib/editais'
import { rodarFila } from '@/lib/fila'
import { FILA_VERIFICAR_ITENS, registroDaFila } from '@/lib/fila-falhas'

export const maxDuration = 60

// Lote pequeno + pausa entre chamadas: a fila é checada com frequência
// (a cada 30min via GitHub Actions), então não precisa processar tudo de
// uma vez — isso evita estourar o rate limit do PNCP e o tempo máximo da
// função da Vercel. Ver o log de validação (privado), seção "2026-09-03 (parte 10)".
const TAMANHO_LOTE = 5
const PAUSA_ENTRE_CHAMADAS_MS = 800

// Orçamento de tempo dentro do próprio maxDuration: se o PNCP estiver lento
// (já vimos timeout de até 20s por chamada), processar o lote inteiro pode
// estourar os 60s antes de chegar no INSERT final de sync_runs — mesmo
// problema já visto no /api/sync antes do fix de timeout. Corta a folha de
// itens novos bem antes do limite (30s), deixando margem pra uma chamada em
// andamento ainda poder demorar até os 25s do orçamento de retry do PNCP
// (lib/pncp.ts) sem estourar os 60s — o resto fica pendente pro próximo lote
// (30min depois). Era 35s até 2026-10-22, quando o retry passou a usar o
// orçamento inteiro em vez de desistir aos 20s.
const ORCAMENTO_MS = 30_000

interface ItemPendente {
  numero_controle_pncp: string
  orgao_cnpj: string
  ano_compra: number
  sequencial_compra: number
  contratacao_json: PncpContratacao
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
  let totalVerificados = 0
  let totalMatched = 0
  let erro: string | null = null

  try {
    const pendentes = (await sql`
      SELECT p.numero_controle_pncp, p.orgao_cnpj, p.ano_compra, p.sequencial_compra, p.contratacao_json
      FROM itens_pendentes p
      LEFT JOIN fila_falhas f ON f.fila = ${FILA_VERIFICAR_ITENS} AND f.chave = p.numero_controle_pncp
      WHERE p.status = 'pendente'
      ORDER BY f.falhou_em ASC NULLS FIRST, p.data_encerramento_proposta ASC NULLS LAST, p.data_abertura_proposta ASC NULLS LAST
      LIMIT ${TAMANHO_LOTE}
    `) as ItemPendente[]

    // Compra que falha continua 'pendente' e vai pro fim da fila na próxima
    // rodada. Antes ela voltava pra frente e podia consumir o lote inteiro.
    const fila = await rodarFila({
      itens: pendentes,
      chave: (pendente) => pendente.numero_controle_pncp,
      orcamentoMs: ORCAMENTO_MS,
      pausaMs: PAUSA_ENTRE_CHAMADAS_MS,
      registro: registroDaFila(FILA_VERIFICAR_ITENS),
      processar: async (pendente) => {
        const itens = await buscarItens(pendente.orgao_cnpj, pendente.ano_compra, pendente.sequencial_compra)
        const descricoes = itens.map((item) => item.descricao).join(' \n ')
        const palavrasChave = encontrarPalavrasChave(descricoes)

        if (palavrasChave.length > 0) {
          totalMatched++
          await salvarEdital(pendente.contratacao_json, palavrasChave)
          await sql`
            UPDATE itens_pendentes SET status = 'match', verificado_em = NOW()
            WHERE numero_controle_pncp = ${pendente.numero_controle_pncp}
          `
        } else {
          await sql`
            UPDATE itens_pendentes SET status = 'sem_match', verificado_em = NOW()
            WHERE numero_controle_pncp = ${pendente.numero_controle_pncp}
          `
        }
      },
    })
    totalVerificados = fila.tentados
    if (fila.tentados > 0 && fila.concluidos === 0) erro = fila.ultimoErro
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err)
  }

  const finishedAt = new Date()

  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('verificar_itens', ${startedAt.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${totalVerificados}, ${totalMatched}, ${totalMatched}, ${erro})
  `

  if (erro) {
    return NextResponse.json({ erro, totalVerificados, totalMatched }, { status: 500 })
  }

  return NextResponse.json({ totalVerificados, totalMatched })
}
