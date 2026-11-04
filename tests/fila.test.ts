// Testes da regra "erro em um item não para a fila" (lib/fila.ts). Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { itensPresos, ordenarPorFalha, rodarFila, type FalhaGuardada, type RegistroDeFalhas } from '../lib/fila'

const chave = (s: string) => s

function registroDeTeste() {
  const falhas: string[] = []
  const certos: string[] = []
  const registro: RegistroDeFalhas = {
    falhou: async (c) => void falhas.push(c),
    deuCerto: async (c) => void certos.push(c),
  }
  return { registro, falhas, certos }
}

test('item que falha não impede os seguintes (caso da edição 2917)', async () => {
  const lidos: string[] = []
  const { registro, falhas, certos } = registroDeTeste()
  const r = await rodarFila({
    itens: ['2917', '2917-suplemento', '2918'],
    chave,
    orcamentoMs: 10_000,
    registro,
    processar: async (item) => {
      if (item === '2917') throw new Error('PDF não baixou')
      lidos.push(item)
    },
  })
  assert.deepEqual(lidos, ['2917-suplemento', '2918'])
  assert.equal(r.tentados, 3)
  assert.equal(r.concluidos, 2)
  assert.deepEqual(r.falhas, [{ chave: '2917', erro: 'PDF não baixou' }])
  assert.equal(r.ultimoErro, 'PDF não baixou')
  assert.deepEqual(falhas, ['2917'])
  assert.deepEqual(certos, ['2917-suplemento', '2918'])
})

test('todos falhando: a fila vai até o fim e devolve as falhas', async () => {
  const r = await rodarFila({
    itens: ['a', 'b', 'c'],
    chave,
    orcamentoMs: 10_000,
    processar: async () => {
      throw new Error('fonte fora do ar')
    },
  })
  assert.equal(r.tentados, 3)
  assert.equal(r.concluidos, 0)
  assert.equal(r.falhas.length, 3)
})

test('sem tempo, para de começar item novo e conta o que ficou', async () => {
  const r = await rodarFila({
    itens: ['a', 'b', 'c'],
    chave,
    orcamentoMs: 40,
    minimoMs: 10,
    processar: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    },
  })
  assert.equal(r.tentados, 1)
  assert.equal(r.naoTentados, 2)
})

test('processar recebe o tempo restante', async () => {
  let recebido = 0
  await rodarFila({
    itens: ['a'],
    chave,
    orcamentoMs: 5_000,
    processar: async (_item, restante) => {
      recebido = restante
    },
  })
  assert.ok(recebido > 4_000 && recebido <= 5_000)
})

test('erro ao gravar a falha não derruba a fila', async () => {
  const lidos: string[] = []
  const r = await rodarFila({
    itens: ['a', 'b'],
    chave,
    orcamentoMs: 10_000,
    registro: {
      falhou: async () => {
        throw new Error('banco fora')
      },
      deuCerto: async () => {
        throw new Error('banco fora')
      },
    },
    processar: async (item) => {
      if (item === 'a') throw new Error('falhou')
      lidos.push(item)
    },
  })
  assert.deepEqual(lidos, ['b'])
  assert.equal(r.concluidos, 1)
})

test('quem falhou vai pro fim, em rodízio pelo mais antigo', () => {
  const falhas = new Map([
    ['b', new Date('2026-11-04T12:00:00Z')],
    ['a', new Date('2026-11-04T09:00:00Z')],
  ])
  assert.deepEqual(ordenarPorFalha(['a', 'b', 'c', 'd'], chave, falhas), ['c', 'd', 'a', 'b'])
})

function falha(parcial: Partial<FalhaGuardada>): FalhaGuardada {
  return {
    fila: 'doe_edicoes',
    chave: '2917',
    tentativas: 4,
    primeiraFalhaEm: new Date('2026-11-03T12:00:00Z'),
    falhouEm: new Date('2026-11-04T12:00:00Z'),
    erro: 'timeout',
    ...parcial,
  }
}

const agora = new Date('2026-11-04T14:00:00Z')

test('preso: falhando há mais de 24h e ainda sendo tentado', () => {
  assert.equal(itensPresos([falha({})], agora).length, 1)
})

test('queda curta de fonte não vira aviso', () => {
  assert.equal(itensPresos([falha({ primeiraFalhaEm: new Date('2026-11-04T09:00:00Z') })], agora).length, 0)
})

test('poucas tentativas não viram aviso', () => {
  assert.equal(itensPresos([falha({ tentativas: 2 })], agora).length, 0)
})

test('item que saiu da janela deixa de ser alarme', () => {
  assert.equal(itensPresos([falha({ falhouEm: new Date('2026-11-01T12:00:00Z') })], agora).length, 0)
})

// Rotina nova que percorre itens tem que passar por rodarFila.
for (const arquivo of [
  'app/api/sync/route.ts',
  'app/api/sync-doe/route.ts',
  'app/api/sync-diarios-municipais/route.ts',
  'app/api/verificar-itens/route.ts',
  'app/api/atualizar-detalhes/route.ts',
  'app/api/acompanhar/route.ts',
  'lib/ligar-avisos.ts',
]) {
  test(`${arquivo} usa rodarFila`, () => {
    assert.match(readFileSync(arquivo, 'utf8'), /rodarFila\(/)
  })
}
