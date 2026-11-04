import { sql } from '@/lib/db'
import { DIAS_COM_BOLETIM } from '@/lib/boletim'
import { buscarAvisosDoPeriodo } from '@/lib/diarios'
import { diaEmMaceio } from '@/lib/formato'

// Tela "Boletins anteriores" (docs/design/DESIGN.md, tela 06). Os números de
// cada dia são os mesmos do cabeçalho e do rodapé do boletim daquele dia:
// "nos filtros" soma editais do PNCP e avisos de diário relevantes, "não
// vistos" é o que está nos filtros e ainda não foi visto, descartado não
// conta em nenhum dos dois.

export interface DiaDoArquivo {
  dia: string
  publicados: number
  nosFiltros: number
  naoVistos: number
  favoritados: number
}

export interface MesDoArquivo {
  mes: string // YYYY-MM
  dias: DiaDoArquivo[] // mais recente primeiro
  anterior: string | null
  proximo: string | null
  totais: { nosFiltros: number; naoVistos: number; favoritados: number }
}

const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/

export function mesValido(mes: string | undefined): mes is string {
  return mes !== undefined && FORMATO_MES.test(mes)
}

function ultimoDiaDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  // Dia 0 do mês seguinte = último dia deste (em UTC, sem fuso no meio).
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10)
}

function somarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

function ehDiaUtil(dia: string): boolean {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay()
  return semana !== 0 && semana !== 6
}

// Mês do boletim mais recente — é onde a tela abre sem ?mes=.
export async function mesMaisRecente(): Promise<string> {
  const linhas = (await sql`SELECT MAX(dia) AS dia FROM (${DIAS_COM_BOLETIM}) d`) as { dia: string | null }[]
  const dia = linhas[0]?.dia
  return dia ? new Date(dia).toISOString().slice(0, 7) : diaEmMaceio(new Date()).slice(0, 7)
}

export async function resumoDoMes(mes: string): Promise<MesDoArquivo> {
  const inicio = `${mes}-01`
  const fim = ultimoDiaDoMes(mes)
  const hoje = diaEmMaceio(new Date())

  const [editaisBruto, pendentesBruto, avisos, limitesBruto] = await Promise.all([
    sql`
      SELECT
        e.boletim_dia AS dia,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.descartado_em IS NULL)::int AS nos_filtros,
        COUNT(*) FILTER (WHERE s.visto_em IS NULL AND s.descartado_em IS NULL)::int AS nao_vistos,
        -- Favoritada ou com status: depois de "Gerenciar" a estrela apaga
        -- (etapa única, 2026-10-07) e o item sumiria da contagem.
        COUNT(*) FILTER (WHERE COALESCE(s.favorito, FALSE) OR s.status_interno IS NOT NULL)::int AS favoritados
      FROM editais e
      LEFT JOIN edital_status s ON s.edital_id = e.id
      WHERE e.boletim_dia BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY 1
    `,
    sql`
      SELECT boletim_dia AS dia, COUNT(*)::int AS total
      FROM itens_pendentes
      WHERE boletim_dia BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY 1
    `,
    buscarAvisosDoPeriodo(inicio, fim),
    sql`SELECT MIN(dia) AS primeiro FROM (${DIAS_COM_BOLETIM}) d`,
  ])

  const porDia = new Map<string, DiaDoArquivo>()
  const linhaDe = (dia: string) => {
    let linha = porDia.get(dia)
    if (!linha) {
      linha = { dia, publicados: 0, nosFiltros: 0, naoVistos: 0, favoritados: 0 }
      porDia.set(dia, linha)
    }
    return linha
  }

  // Dia útil sem nada aparece com zero, não some (regra 8 do DESIGN.md) — é
  // assim que um dia de PNCP fora do ar fica visível. Só entre o primeiro
  // boletim que existe e hoje: antes disso o sistema nem coletava.
  const primeiroDia = (limitesBruto as { primeiro: string | null }[])[0]?.primeiro
  const desde = primeiroDia ? new Date(primeiroDia).toISOString().slice(0, 10) : hoje
  for (let dia = desde > inicio ? desde : inicio; dia <= fim && dia <= hoje; dia = proximoDia(dia)) {
    if (ehDiaUtil(dia)) linhaDe(dia)
  }

  for (const e of editaisBruto as Record<string, unknown>[]) {
    const linha = linhaDe(new Date(e.dia as string).toISOString().slice(0, 10))
    linha.publicados += e.total as number
    linha.nosFiltros += e.nos_filtros as number
    linha.naoVistos += e.nao_vistos as number
    linha.favoritados += e.favoritados as number
  }

  for (const p of pendentesBruto as Record<string, unknown>[]) {
    linhaDe(new Date(p.dia as string).toISOString().slice(0, 10)).publicados += p.total as number
  }

  for (const aviso of avisos) {
    const linha = linhaDe(aviso.diaDoBoletim)
    linha.publicados++
    if (aviso.favorito || aviso.statusInterno) linha.favoritados++
    if (aviso.relevante && !aviso.descartado) {
      linha.nosFiltros++
      if (!aviso.visto) linha.naoVistos++
    }
  }

  const dias = [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia))
  const primeiroMes = desde.slice(0, 7)

  return {
    mes,
    dias,
    anterior: mes > primeiroMes ? somarMes(mes, -1) : null,
    proximo: mes < hoje.slice(0, 7) ? somarMes(mes, 1) : null,
    totais: {
      nosFiltros: dias.reduce((soma, d) => soma + d.nosFiltros, 0),
      naoVistos: dias.reduce((soma, d) => soma + d.naoVistos, 0),
      favoritados: dias.reduce((soma, d) => soma + d.favoritados, 0),
    },
  }
}

function proximoDia(dia: string): string {
  const data = new Date(`${dia}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + 1)
  return data.toISOString().slice(0, 10)
}

