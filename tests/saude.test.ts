// Testes do alerta de fonte sem nenhum item (lib/saude-zero.ts). Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarZero, type ExecucaoFonte } from '../lib/saude-zero'

// Hora de Maceió (-03:00). 02/11/2026 é segunda; 31/10 e 01/11, fim de semana.
function rodada(quando: string, itens: number, erro: string | null = null): ExecucaoFonte {
  return { started_at: `${quando}-03:00`, erro, total_api: itens }
}

test('na_rodada: última rodada ok com zero item é alerta', () => {
  assert.ok(avaliarZero('na_rodada', [rodada('2026-11-03T09:00:00', 0), rodada('2026-11-02T20:00:00', 150)]))
})

test('na_rodada: zero com erro fica pra regra de erro', () => {
  assert.equal(avaliarZero('na_rodada', [rodada('2026-11-03T09:00:00', 0, 'timeout'), rodada('2026-11-02T20:00:00', 150)]), null)
})

test('na_rodada: zero seguido de rodada com item apaga o alerta', () => {
  assert.equal(avaliarZero('na_rodada', [rodada('2026-11-03T14:00:00', 120), rodada('2026-11-03T09:00:00', 0)]), null)
})

test('diasUteis: feriado isolado (1 dia útil zerado) não é alerta', () => {
  assert.equal(avaliarZero({ diasUteis: 2 }, [
    rodada('2026-11-02T20:00:00', 0), rodada('2026-11-02T09:00:00', 0), // Finados
    rodada('2026-10-30T09:00:00', 3),
  ]), null)
})

test('diasUteis: 2 dias úteis zerados é alerta, fim de semana não conta', () => {
  const motivo = avaliarZero({ diasUteis: 2 }, [
    rodada('2026-11-03T09:00:00', 0),
    rodada('2026-11-02T09:00:00', 0),
    rodada('2026-11-01T09:00:00', 0), rodada('2026-10-31T09:00:00', 0),
    rodada('2026-10-30T09:00:00', 3),
  ])
  assert.equal(motivo, 'nenhum item lido em 2 dias úteis')
})

test('diasUteis: só fim de semana zerado não é alerta', () => {
  assert.equal(avaliarZero({ diasUteis: 2 }, [
    rodada('2026-11-01T09:00:00', 0), rodada('2026-10-31T09:00:00', 0),
    rodada('2026-10-30T09:00:00', 3),
  ]), null)
})

test('diasUteis: dia só com erro não conta como dia zerado', () => {
  assert.equal(avaliarZero({ diasUteis: 2 }, [
    rodada('2026-11-03T09:00:00', 0, '500'),
    rodada('2026-11-02T09:00:00', 0),
    rodada('2026-10-30T09:00:00', 3),
  ]), null)
})

test('diasUteis: rodada das 21h de Maceió (0h UTC) conta no dia de Maceió', () => {
  // 30/10 21h em Maceió = 31/10 00h UTC; tem item, então 30/10 conta como dia com item.
  assert.equal(avaliarZero({ diasUteis: 2 }, [
    rodada('2026-11-02T09:00:00', 0),
    rodada('2026-10-30T21:00:00', 3),
    rodada('2026-10-30T09:00:00', 0),
  ]), null)
})

test('rotina sem regra (ex. 30 min) nunca alerta por zero', () => {
  assert.equal(avaliarZero(undefined, [rodada('2026-11-03T09:00:00', 0)]), null)
})
