// Migrações versionadas (2026-10-08). Cada arquivo de migrations/ roda uma
// vez só, em ordem de nome, inteiro e dentro de uma transação — falhou no
// meio, nada daquele arquivo fica gravado. O que já rodou fica em
// schema_migrations, com um hash do conteúdo pra avisar se alguém editar um
// arquivo que já foi aplicado (não editar: criar um novo).
//
// Arquivo inteiro numa chamada só (protocolo simples, via Pool/WebSocket):
// ponto e vírgula dentro de função ou texto não quebra mais nada, ao
// contrário do script antigo, que cortava o arquivo em cada ";".
//
// Uso: npm run migrate            → roda as pendentes
//      npm run migrate -- --status → só lista, não roda nada
import { Pool } from '@neondatabase/serverless'
import { createHash } from 'crypto'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const PASTA = join(process.cwd(), 'migrations')
// Banco de produção já tinha tudo de 001 quando as migrações viraram
// versionadas — num banco assim, 001 é só registrada, não roda de novo.
const LINHA_DE_BASE = '001_estado_inicial.sql'

async function migrate() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não definida')
  const soStatus = process.argv.includes('--status')

  const pool = new Pool({ connectionString: url })
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nome         TEXT PRIMARY KEY,
        hash         TEXT NOT NULL,
        aplicada_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`)

    const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort()
    const conteudo = new Map(arquivos.map((f) => [f, readFileSync(join(PASTA, f), 'utf-8')]))
    const hashDe = (f: string) => createHash('sha256').update(conteudo.get(f)!).digest('hex').slice(0, 16)

    const { rows } = await client.query<{ nome: string; hash: string }>('SELECT nome, hash FROM schema_migrations')
    const aplicadas = new Map(rows.map((r) => [r.nome, r.hash]))

    if (aplicadas.size === 0 && !soStatus) {
      const { rows: existe } = await client.query(`SELECT to_regclass('public.editais') IS NOT NULL AS existe`)
      if (existe[0].existe) {
        await client.query('INSERT INTO schema_migrations (nome, hash) VALUES ($1, $2)', [
          LINHA_DE_BASE,
          hashDe(LINHA_DE_BASE),
        ])
        aplicadas.set(LINHA_DE_BASE, hashDe(LINHA_DE_BASE))
        console.log(`Banco já existente: ${LINHA_DE_BASE} registrada como aplicada, sem rodar.`)
      }
    }

    for (const nome of aplicadas.keys()) {
      if (!conteudo.has(nome)) console.warn(`Aviso: ${nome} consta como aplicada mas o arquivo não existe mais.`)
      else if (aplicadas.get(nome) !== hashDe(nome))
        console.warn(`Aviso: ${nome} foi editada depois de aplicada. Mudança nova vai num arquivo novo.`)
    }

    const pendentes = arquivos.filter((f) => !aplicadas.has(f))
    if (soStatus) {
      for (const f of arquivos) console.log(`${aplicadas.has(f) ? 'aplicada ' : 'PENDENTE '} ${f}`)
      return
    }
    if (pendentes.length === 0) {
      console.log('Nenhuma migração pendente.')
      return
    }

    for (const nome of pendentes) {
      console.log(`Rodando ${nome}...`)
      try {
        await client.query('BEGIN')
        await client.query(conteudo.get(nome)!)
        await client.query('INSERT INTO schema_migrations (nome, hash) VALUES ($1, $2)', [nome, hashDe(nome)])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`${nome} falhou, nada dela foi gravado: ${(err as Error).message}`)
      }
    }
    console.log(`${pendentes.length} migração(ões) aplicada(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
