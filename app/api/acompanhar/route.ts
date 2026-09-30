import { NextResponse } from 'next/server'
import { HORAS_ENTRE_VERIFICACOES, verificarEdital } from '@/lib/acompanhamento-pncp'
import { sql } from '@/lib/db'

export const maxDuration = 60

// Acompanhamento automático (item 9 do MVP): reconsulta no PNCP só os editais
// favoritados ou com status interno — favoritar é o gatilho (decidido com o
// Eduardo em 2026-09-21). Cada um a cada 12h. Roda no cron de 30 em 30min
// (verificar-itens-cron.yml), em lote pequeno.
//
// Ordem: nunca verificados primeiro, depois o mais antigo. Retrato
// incompleto (edital grande que não coube numa rodada) volta pra fila logo
// porque acompanhamento_em não avança; acompanhamento_tentado_em segura 25min
// pra um edital problemático não ocupar toda rodada.
const TAMANHO_LOTE = 4
const ORCAMENTO_MS = 35_000

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
    }
  }

  const startedAt = new Date()
  const fila = (await sql`
    SELECT e.id, e.orgao_cnpj, e.ano_compra, e.sequencial_compra
    FROM editais e
    JOIN edital_status s ON s.edital_id = e.id
    WHERE (s.favorito OR s.status_interno IS NOT NULL)
      AND (e.acompanhamento_em IS NULL
           OR e.acompanhamento_em < NOW() - make_interval(hours => ${HORAS_ENTRE_VERIFICACOES}))
      AND (e.acompanhamento_tentado_em IS NULL OR e.acompanhamento_tentado_em < NOW() - INTERVAL '25 minutes')
    ORDER BY e.acompanhamento_em ASC NULLS FIRST, e.id
    LIMIT ${TAMANHO_LOTE}
  `) as { id: number; orgao_cnpj: string; ano_compra: number; sequencial_compra: number }[]

  let completos = 0
  let eventosNovos = 0
  let comFalha = 0
  let ultimoErro: string | null = null

  for (const edital of fila) {
    const restante = ORCAMENTO_MS - (Date.now() - startedAt.getTime())
    if (restante < 8_000) break

    const r = await verificarEdital(
      { id: edital.id, orgaoCnpj: edital.orgao_cnpj, anoCompra: edital.ano_compra, sequencialCompra: edital.sequencial_compra },
      restante - 5_000
    )
    if (r.completo) completos++
    eventosNovos += r.eventosNovos
    if (r.erro) {
      comFalha++
      ultimoErro = r.erro
    }
  }

  // total_api = editais consultados, total_matched = verificados por
  // completo, total_novos = eventos novos na linha do tempo. Erro só quando
  // nenhum deu certo (PNCP fora do ar).
  const erro = comFalha > 0 && completos === 0 ? ultimoErro : null
  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('acompanhar', ${startedAt.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${new Date().toISOString()},
            ${fila.length}, ${completos}, ${eventosNovos}, ${erro})
  `

  return NextResponse.json({ consultados: fila.length, completos, eventosNovos, comFalha, erro })
}
