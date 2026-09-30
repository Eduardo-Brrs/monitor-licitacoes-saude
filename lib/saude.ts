import { sql } from '@/lib/db'

// Status das fontes (2026-09-28): quando uma captura para de funcionar,
// ninguém percebe — os diários municipais ficaram 2 dias com "fetch failed"
// (26-28/09) e só foi achado comparando boletim. Esta consulta lê sync_runs e
// diz, por fonte, quando rodou certo pela última vez.
//
// Limites folgados de propósito: o GitHub Actions (plano grátis) atrasa e
// pula agendamento — medido em 28/09, o cron "a cada 30 min" rodou ~7 vezes
// por dia, e o de 3x por dia chega com 3-5h de atraso. Limite apertado
// deixaria o aviso aceso o tempo todo.

export interface FonteMonitorada {
  tipo: string
  nome: string
  descricao: string
  frequencia: string
  limiteHoras: number // sem execução bem-sucedida há mais que isso = problema
}

export const FONTES_MONITORADAS: FonteMonitorada[] = [
  {
    tipo: 'sync',
    nome: 'PNCP',
    descricao: 'Pregões e dispensas de Alagoas',
    frequencia: '3 vezes por dia',
    limiteHoras: 18,
  },
  {
    tipo: 'sync_doe',
    nome: 'Diário Oficial do Estado',
    descricao: 'Aquisições judiciais (AMGESP)',
    frequencia: '3 vezes por dia',
    limiteHoras: 18,
  },
  {
    tipo: 'sync_doe_licitacoes',
    nome: 'Diário Oficial do Estado',
    descricao: 'Pregões estaduais (reserva do PNCP)',
    frequencia: '3 vezes por dia',
    limiteHoras: 18,
  },
  {
    tipo: 'sync_doe_cotacoes',
    nome: 'Diário Oficial do Estado',
    descricao: 'Cotações estaduais (SESAU, AMGESP e outros órgãos)',
    frequencia: '3 vezes por dia',
    limiteHoras: 18,
  },
  {
    tipo: 'sync_diarios_municipais',
    nome: 'Diários das prefeituras',
    descricao: 'AMA e Diário de Maceió',
    frequencia: '3 vezes por dia',
    limiteHoras: 18,
  },
  {
    tipo: 'verificar_itens',
    nome: 'Checagem de itens',
    descricao: 'Procura produto de saúde item por item nas compras sem palavra-chave no objeto',
    frequencia: 'a cada 30 min (na prática, a cada poucas horas)',
    limiteHoras: 10,
  },
  {
    tipo: 'atualizar_detalhes',
    nome: 'Anexos e itens',
    descricao: 'Cópia salva dos anexos e itens de cada edital',
    frequencia: 'a cada 30 min (na prática, a cada poucas horas)',
    limiteHoras: 10,
  },
  {
    tipo: 'acompanhar',
    nome: 'Acompanhamento',
    descricao: 'Resultado, ata e contrato dos favoritados',
    frequencia: 'a cada 30 min (na prática, a cada poucas horas)',
    limiteHoras: 10,
  },
]

export type EstadoFonte = 'ok' | 'instavel' | 'problema'

export interface SaudeDaFonte extends FonteMonitorada {
  ultimaExecucao: string | null
  ultimoSucesso: string | null
  falhasSeguidas: number
  ultimoErro: string | null
  estado: EstadoFonte
  motivo: string | null
}

// Erro cru de sync_runs em texto de gente. O cru continua na tela (menor),
// pra quem for investigar.
export function explicarErro(erro: string): string {
  const e = erro.toLowerCase()
  if (e.includes('timeout') || e.includes('não respondeu')) return 'o site da fonte não respondeu (fora do ar ou lento)'
  if (/\b50[234]\b/.test(e)) return 'o site da fonte está com erro do lado deles'
  if (e.includes('429')) return 'a fonte limitou o número de consultas'
  if (e.includes('fetch failed') || e.includes('econnreset')) return 'a conexão com o site da fonte caiu'
  return 'erro inesperado'
}

export async function saudeDasFontes(): Promise<SaudeDaFonte[]> {
  const tipos = FONTES_MONITORADAS.map((f) => f.tipo)
  // Últimas 20 execuções de cada tipo — basta pra contar falhas seguidas.
  const linhas = (await sql`
    SELECT tipo, started_at, erro
    FROM (
      SELECT tipo, started_at, erro,
             ROW_NUMBER() OVER (PARTITION BY tipo ORDER BY started_at DESC) AS n
      FROM sync_runs
      WHERE tipo = ANY(${tipos})
    ) r
    WHERE n <= 20
    ORDER BY tipo, started_at DESC
  `) as { tipo: string; started_at: string; erro: string | null }[]

  const [{ ok_por_tipo }] = (await sql`
    SELECT json_object_agg(tipo, ultimo) AS ok_por_tipo
    FROM (SELECT tipo, MAX(started_at) AS ultimo FROM sync_runs WHERE erro IS NULL AND tipo = ANY(${tipos}) GROUP BY tipo) x
  `) as { ok_por_tipo: Record<string, string> | null }[]

  const agora = Date.now()
  return FONTES_MONITORADAS.map((fonte) => {
    const execucoes = linhas.filter((l) => l.tipo === fonte.tipo)
    const primeiroSucesso = execucoes.findIndex((l) => l.erro === null)
    const falhasSeguidas = primeiroSucesso === -1 ? execucoes.length : primeiroSucesso
    const ultimoSucesso = ok_por_tipo?.[fonte.tipo] ? new Date(ok_por_tipo[fonte.tipo]).toISOString() : null
    const ultimaExecucao = execucoes[0] ? new Date(execucoes[0].started_at).toISOString() : null
    const ultimoErro = falhasSeguidas > 0 ? execucoes[0].erro : null

    const horasSemSucesso = ultimoSucesso ? (agora - Date.parse(ultimoSucesso)) / 3_600_000 : Infinity
    let estado: EstadoFonte = 'ok'
    let motivo: string | null = null
    if (horasSemSucesso > fonte.limiteHoras) {
      estado = 'problema'
      motivo = ultimoSucesso
        ? `sem captura bem-sucedida há ${Math.floor(horasSemSucesso)}h`
        : 'nunca rodou com sucesso'
    } else if (falhasSeguidas >= 3) {
      estado = 'problema'
      motivo = `${falhasSeguidas} falhas seguidas`
    } else if (falhasSeguidas > 0) {
      estado = 'instavel'
      motivo = falhasSeguidas === 1 ? 'a última execução falhou' : `${falhasSeguidas} falhas seguidas`
    }

    return { ...fonte, ultimaExecucao, ultimoSucesso, falhasSeguidas, ultimoErro, estado, motivo }
  })
}

// Pra barra lateral: só o que está com problema (instável não acende nada —
// PNCP oscila o tempo todo e se recupera sozinho).
export async function fontesComProblema(): Promise<SaudeDaFonte[]> {
  return (await saudeDasFontes()).filter((f) => f.estado === 'problema')
}
