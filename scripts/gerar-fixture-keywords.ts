// Gera tests/fixtures/objetos-pncp.json: todo objeto de compra do PNCP que já
// passou pelo sistema (editais capturados + fila de checagem de itens) com as
// keywords que o motor bate HOJE. O teste tests/keywords-regressao.test.ts
// compara contra esse retrato e lista o que mudou.
//
// Quando mudar keyword de propósito: rodar `npm test`, conferir os ganhos e
// perdas listados e, se estiverem certos, `npm run test:retrato` pra gravar o
// retrato novo (e commitar junto da mudança de keyword).
import { neon } from '@neondatabase/serverless'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { encontrarPalavrasChave } from '../lib/keywords'

async function gerar() {
  const sql = neon(process.env.DATABASE_URL!)
  const linhas = (await sql`
    SELECT objeto_compra AS texto FROM editais WHERE objeto_compra IS NOT NULL
    UNION
    SELECT contratacao_json->>'objetoCompra' FROM itens_pendentes WHERE contratacao_json->>'objetoCompra' IS NOT NULL
  `) as { texto: string }[]

  const casos = linhas
    .map(({ texto }) => ({ texto, keywords: encontrarPalavrasChave(texto).sort() }))
    .sort((a, b) => a.texto.localeCompare(b.texto))

  const pasta = join(process.cwd(), 'tests', 'fixtures')
  mkdirSync(pasta, { recursive: true })
  writeFileSync(join(pasta, 'objetos-pncp.json'), JSON.stringify(casos, null, 1) + '\n')
  console.log(`${casos.length} objetos gravados (${casos.filter((c) => c.keywords.length).length} com keyword).`)
}

gerar().catch((err) => {
  console.error(err)
  process.exit(1)
})
