// Regressão do motor de keyword contra todo objeto de compra real que já
// passou pelo sistema. Falha se qualquer objeto passar a bater keyword
// diferente do retrato gravado — perda é bug provável, ganho precisa ser
// conferido (ruído?). Mudança intencional: conferir a lista e rodar
// `npm run test:retrato`. Ver scripts/gerar-fixture-keywords.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import { encontrarPalavrasChave } from '../lib/keywords'

const casos: { texto: string; keywords: string[] }[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'objetos-pncp.json'), 'utf-8')
)

test(`objetos reais do PNCP batem as mesmas keywords do retrato (${casos.length} objetos)`, () => {
  const mudancas: string[] = []
  for (const { texto, keywords } of casos) {
    const agora = encontrarPalavrasChave(texto)
    const perdeu = keywords.filter((k) => !agora.includes(k))
    const ganhou = agora.filter((k) => !keywords.includes(k))
    if (perdeu.length || ganhou.length) {
      const partes = [perdeu.length && `PERDEU ${perdeu.join(', ')}`, ganhou.length && `ganhou ${ganhou.join(', ')}`]
      mudancas.push(`- ${partes.filter(Boolean).join(' / ')}: ${texto.slice(0, 140)}`)
    }
  }
  assert.equal(
    mudancas.length,
    0,
    `${mudancas.length} objeto(s) mudaram:\n${mudancas.join('\n')}\n\nSe a mudança for intencional: npm run test:retrato`
  )
})
