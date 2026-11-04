import { NextResponse } from 'next/server'
import { HORAS_ENTRE_VERIFICACOES, verificarEdital } from '@/lib/acompanhamento-pncp'
import { sql } from '@/lib/db'
import { rodarFila } from '@/lib/fila'
import { FILA_ACOMPANHAR, registroDaFila } from '@/lib/fila-falhas'
import { ligarAvisosAcompanhados } from '@/lib/ligar-avisos'

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
// Antes dos editais: aviso de diário acompanhado procura seu edital no PNCP
// (lib/ligar-avisos.ts, 2026-10-23). Quase sempre acha no banco, sem chamar
// o PNCP; o que sobrar do orçamento fica pros editais.
const ORCAMENTO_AVISOS_MS = 15_000

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
    }
  }

  const startedAt = new Date()

  // Linha própria em sync_runs (tipo 'ligar_avisos'): total_api = avisos
  // procurados, total_matched = ligados. Erro só quando todos falharam.
  try {
    const avisos = await ligarAvisosAcompanhados(ORCAMENTO_AVISOS_MS)
    const erroAvisos = avisos.falhas > 0 && avisos.falhas === avisos.consultados ? avisos.ultimoErro : null
    await sql`
      INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
      VALUES ('ligar_avisos', ${startedAt.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${new Date().toISOString()},
              ${avisos.consultados}, ${avisos.ligados}, ${avisos.ligados}, ${erroAvisos})
    `
  } catch (err) {
    await sql`
      INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
      VALUES ('ligar_avisos', ${startedAt.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${new Date().toISOString()},
              0, 0, 0, ${err instanceof Error ? err.message : String(err)})
    `
  }

  const fila = (await sql`
    SELECT e.id, e.orgao_cnpj, e.ano_compra, e.sequencial_compra
    FROM editais e
    JOIN edital_status s ON s.edital_id = e.id
    LEFT JOIN fila_falhas f ON f.fila = ${FILA_ACOMPANHAR} AND f.chave = e.id::text
    WHERE (s.favorito OR s.status_interno IS NOT NULL)
      AND (e.acompanhamento_em IS NULL
           OR e.acompanhamento_em < NOW() - make_interval(hours => ${HORAS_ENTRE_VERIFICACOES}))
      AND (e.acompanhamento_tentado_em IS NULL OR e.acompanhamento_tentado_em < NOW() - INTERVAL '25 minutes')
    ORDER BY f.falhou_em ASC NULLS FIRST, e.acompanhamento_em ASC NULLS FIRST, e.id
    LIMIT ${TAMANHO_LOTE}
  `) as { id: number; orgao_cnpj: string; ano_compra: number; sequencial_compra: number }[]

  let completos = 0
  let eventosNovos = 0

  const orcamentoRestante = ORCAMENTO_MS - (Date.now() - startedAt.getTime())
  const resultado = await rodarFila({
    itens: fila,
    chave: (edital) => String(edital.id),
    orcamentoMs: orcamentoRestante,
    minimoMs: 8_000,
    registro: registroDaFila(FILA_ACOMPANHAR),
    processar: async (edital, restante) => {
      const r = await verificarEdital(
        { id: edital.id, orgaoCnpj: edital.orgao_cnpj, anoCompra: edital.ano_compra, sequencialCompra: edital.sequencial_compra },
        restante - 5_000
      )
      if (r.completo) completos++
      eventosNovos += r.eventosNovos
      if (r.erro) throw new Error(r.erro)
    },
  })
  const comFalha = resultado.falhas.length

  // total_api = editais consultados, total_matched = verificados por
  // completo, total_novos = eventos novos na linha do tempo. Erro só quando
  // nenhum deu certo (PNCP fora do ar).
  const erro = comFalha > 0 && completos === 0 ? resultado.ultimoErro : null
  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('acompanhar', ${startedAt.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${new Date().toISOString()},
            ${fila.length}, ${completos}, ${eventosNovos}, ${erro})
  `

  return NextResponse.json({ consultados: fila.length, completos, eventosNovos, comFalha, erro })
}
