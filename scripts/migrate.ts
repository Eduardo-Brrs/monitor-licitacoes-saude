import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join } from 'path'

async function migrate() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não definida')

  const sql = neon(url)
  const schema = readFileSync(join(process.cwd(), 'lib', 'schema.sql'), 'utf-8')

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  console.log('Rodando migration...')
  for (const statement of statements) {
    await sql.query(statement)
  }
  console.log('Schema criado com sucesso.')
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
