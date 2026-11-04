// Testes do vigia dos agendamentos (lib/vigia.ts). Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROTINAS_VIGIADAS, rotinasParadas, ultimoHorarioEsperado } from '../lib/vigia'

const emMaceio = (quando: string) => new Date(`${quando}-03:00`)
const grade = (tipo: string) => ROTINAS_VIGIADAS.find((r) => r.tipo === tipo)!.horarios

// Todas as rotinas com a rodada mais recente da grade antes de `agora`.
function tudoEmDia(agora: Date): Map<string, Date> {
  return new Map(ROTINAS_VIGIADAS.map((r) => [r.tipo, ultimoHorarioEsperado(r.horarios, agora)]))
}

const nomes = (ultimas: Map<string, Date>, agora: Date) => rotinasParadas(ultimas, agora).map((p) => p.tipo)

test('tudo rodando na grade: nada parado', () => {
  const agora = emMaceio('2026-11-04T10:17:00')
  assert.deepEqual(nomes(tudoEmDia(agora), agora), [])
})

test('cron-job.org parado: todas as rotinas aparecem', () => {
  const agora = emMaceio('2026-11-04T16:17:00')
  const ontem = emMaceio('2026-11-03T21:32:00')
  const ultimas = new Map(ROTINAS_VIGIADAS.map((r) => [r.tipo, ontem]))
  assert.equal(nomes(ultimas, agora).length, ROTINAS_VIGIADAS.length)
})

test('só uma rotina parada aparece sozinha', () => {
  const agora = emMaceio('2026-11-04T12:17:00')
  const ultimas = tudoEmDia(agora)
  ultimas.set('acompanhar', emMaceio('2026-11-04T08:02:00'))
  assert.deepEqual(nomes(ultimas, agora), ['acompanhar'])
})

test('pausa da noite não dispara', () => {
  const noite = emMaceio('2026-11-03T21:32:00')
  const ultimas = new Map(ROTINAS_VIGIADAS.map((r) => [r.tipo, noite]))
  ultimas.set('sync', emMaceio('2026-11-03T20:00:10'))
  ultimas.set('sync_doe', emMaceio('2026-11-03T20:01:00'))
  ultimas.set('sync_diarios_municipais', emMaceio('2026-11-03T20:02:00'))
  assert.deepEqual(nomes(ultimas, emMaceio('2026-11-04T06:00:00')), [])
  assert.deepEqual(nomes(ultimas, emMaceio('2026-11-04T07:50:00')), [])
})

test('dentro da tolerância de 1h ainda não dispara', () => {
  const horarios = grade('sync')
  const agora = emMaceio('2026-11-04T09:50:00')
  assert.deepEqual(ultimoHorarioEsperado(horarios, agora), emMaceio('2026-11-03T20:00:00'))
})

test('rotina de 3x por dia perdida aparece depois da tolerância', () => {
  const agora = emMaceio('2026-11-04T10:17:00')
  const ultimas = tudoEmDia(agora)
  ultimas.set('sync', emMaceio('2026-11-03T20:00:10'))
  assert.deepEqual(nomes(ultimas, agora), ['sync'])
})

test('fim de semana segue a mesma grade', () => {
  const agora = emMaceio('2026-11-01T15:17:00') // domingo
  assert.deepEqual(ultimoHorarioEsperado(grade('sync'), agora), emMaceio('2026-11-01T14:00:00'))
})

test('rodada que começou com erro de fonte não é agendamento parado', () => {
  // A regra só recebe started_at: rodada com erro continua sendo rodada.
  const agora = emMaceio('2026-11-04T14:17:00')
  assert.deepEqual(nomes(tudoEmDia(agora), agora), [])
})

test('disparo um pouco antes do minuto cheio conta', () => {
  const agora = emMaceio('2026-11-04T10:17:00')
  const ultimas = tudoEmDia(agora)
  ultimas.set('sync', emMaceio('2026-11-04T08:59:58'))
  assert.deepEqual(nomes(ultimas, agora), [])
})

test('rotina sem nenhuma rodada no banco aparece parada', () => {
  const agora = emMaceio('2026-11-04T10:17:00')
  const ultimas = tudoEmDia(agora)
  ultimas.delete('sync_doe')
  const [parada] = rotinasParadas(ultimas, agora)
  assert.equal(parada.rota, '/api/sync-doe')
  assert.equal(parada.ultimaEm, null)
})
