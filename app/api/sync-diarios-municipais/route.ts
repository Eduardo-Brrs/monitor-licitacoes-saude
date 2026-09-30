import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  DIARIOS_MUNICIPAIS,
  baixarMateria,
  buscarMaterias,
  extrairDataSessao,
  textoParaKeyword,
  tituloEhAvisoAberto,
  urlMateria,
  type CartaoMateria,
  type DiarioMunicipal,
} from '@/lib/diario-municipal'
import { palavrasChaveDeDiario } from '@/lib/keywords'

export const maxDuration = 60

// Reconsulta os últimos dias a cada run, mesma lógica de rede de segurança do
// /api/sync. Listar a janela é barato (~1s por página de 25 matérias) e a
// dedup por (diario, codigo) faz só matéria nova ser baixada.
const DIAS_JANELA = 5

// Termos da busca full-text. "cotação" pega a pesquisa de preço antes da
// dispensa e, em Maceió, as cotações da SMS ("AVISO DE COTAÇÃO / PROCESSO
// Nº 5800...") — que são os itens "CP/5800" do boletim do ConLicitação.
const TERMOS_BUSCA = ['pregão eletrônico', 'dispensa', 'cotação']

// Mesmo padrão do /api/verificar-itens e do fallback do /api/sync-doe: para
// de baixar matéria nova com folga antes do maxDuration, o resto fica pra
// próxima run (só acontece em backfill — num dia normal são ~30 matérias).
const ORCAMENTO_MS = 40_000

// Data no horário de Maceió, não em UTC: a rodada das 20h roda depois da
// meia-noite UTC, e com data final "amanhã" a busca do site devolve zero
// resultados sem dar erro (toda rodada noturna voltava vazia até 29/09/2026).
const FORMATO_DATA_MACEIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Maceio',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatarData(data: Date): string {
  return FORMATO_DATA_MACEIO.format(data) // en-CA = YYYY-MM-DD
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
  const inicioJanela = new Date(startedAt)
  inicioJanela.setDate(inicioJanela.getDate() - DIAS_JANELA)

  let totalApi = 0 // cartões listados (avisos abertos, sem duplicata)
  let totalMatched = 0 // avisos com keyword entre os inseridos
  let totalNovos = 0 // matérias inseridas
  const erros: string[] = []

  // Lista diário por diário, termo por termo — uma busca de cada vez. Desde
  // 26/09/2026 o site derruba parte das conexões simultâneas (ECONNRESET,
  // "fetch failed"): com as 6 buscas em paralelo, 2-3 caíam em toda rodada;
  // em sequência, 24 de 24 passaram (~0,5s cada). Cada busca falha isolada.
  const pendentes = new Map<string, { diario: DiarioMunicipal; cartao: CartaoMateria }>()
  for (const diario of DIARIOS_MUNICIPAIS) {
    for (const termo of TERMOS_BUSCA) {
      try {
        const cartoes = await buscarMaterias(diario, termo, formatarData(inicioJanela), formatarData(startedAt))
        for (const cartao of cartoes) {
          if (!tituloEhAvisoAberto(cartao.titulo)) continue
          pendentes.set(`${diario.slug}:${cartao.codigo}`, { diario, cartao })
        }
      } catch (err) {
        erros.push(`${diario.slug}/${termo}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  totalApi = pendentes.size

  // Tira o que já está no banco antes de baixar qualquer matéria.
  const jaSalvos = new Set(
    (
      await sql`
        SELECT diario || ':' || codigo AS chave FROM diario_municipal_materias
        WHERE data_circulacao >= ${formatarData(inicioJanela)}
      `
    ).map((r) => r.chave as string)
  )

  // Mais recente primeiro: em backfill, o que é de hoje entra antes.
  const novos = [...pendentes.entries()]
    .filter(([chave]) => !jaSalvos.has(chave))
    .sort(([, a], [, b]) => b.cartao.dataCirculacao.localeCompare(a.cartao.dataCirculacao))

  let tentados = 0
  for (const [, { diario, cartao }] of novos) {
    if (Date.now() - startedAt.getTime() > ORCAMENTO_MS) break
    tentados++

    try {
      const materia = await baixarMateria(diario, cartao.codigo)
      const palavrasChave = palavrasChaveDeDiario(textoParaKeyword(materia), materia.objeto ?? materia.corpo)

      const inseridos = await sql`
        INSERT INTO diario_municipal_materias (
          diario, codigo, titulo, entidade, orgao, data_circulacao, edicao,
          processo, objeto, corpo, keywords_matched, url, data_sessao
        ) VALUES (
          ${diario.slug}, ${cartao.codigo}, ${cartao.titulo}, ${cartao.entidade}, ${cartao.orgao},
          ${cartao.dataCirculacao}, ${cartao.edicao}, ${materia.processo}, ${materia.objeto},
          ${materia.corpo.slice(0, 20_000)}, ${palavrasChave}, ${urlMateria(diario, cartao.codigo)},
          ${extrairDataSessao(materia.corpo, cartao.dataCirculacao)}
        )
        ON CONFLICT (diario, codigo) DO NOTHING
        RETURNING id
      `
      if (inseridos.length > 0) {
        totalNovos++
        if (palavrasChave.length > 0) totalMatched++
      }
    } catch (err) {
      // Uma matéria com problema não derruba as outras — fica pra próxima run.
      erros.push(`${diario.slug}/${cartao.codigo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const erro = erros.length > 0 ? erros.slice(0, 5).join(' | ') : null
  const finishedAt = new Date()

  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('sync_diarios_municipais', ${formatarData(startedAt)}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${totalApi}, ${totalMatched}, ${totalNovos}, ${erro})
  `

  // Matérias novas que ficaram pro próximo run por causa do orçamento de tempo.
  const corpo = { totalApi, totalMatched, totalNovos, pendentesRestantes: novos.length - tentados }

  if (erro) {
    return NextResponse.json({ erro, ...corpo }, { status: 500 })
  }
  return NextResponse.json(corpo)
}
