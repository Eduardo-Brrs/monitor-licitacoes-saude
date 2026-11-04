import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { itensPresos } from '@/lib/fila'
import { todasAsFalhas } from '@/lib/fila-falhas'
import { ROTINAS_VIGIADAS, rotinasParadas } from '@/lib/vigia'

// Chamada pelo .github/workflows/vigia.yml. Diz quais rotinas não começaram no
// horário e quais itens estão presos numa fila; quem reage é o workflow. Ver
// docs/operacao.md.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Sem a variável, recusa: esta rota nunca fica aberta por falta de configuração.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const tipos = ROTINAS_VIGIADAS.map((r) => r.tipo)
  const linhas = await sql`
    SELECT tipo, MAX(started_at) AS ultima
    FROM sync_runs
    WHERE tipo = ANY(${tipos})
    GROUP BY tipo
  `
  const ultimas = new Map(linhas.map((l) => [l.tipo as string, new Date(l.ultima as string)]))
  const agora = new Date()

  return NextResponse.json({
    paradas: rotinasParadas(ultimas, agora),
    presos: itensPresos(await todasAsFalhas(), agora),
  })
}
