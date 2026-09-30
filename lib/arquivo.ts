import { sql } from '@/lib/db'
import { DIAS_COM_BOLETIM } from '@/lib/boletim'
import { buscarAvisosDoPeriodo, type AvisoDeDiario } from '@/lib/diarios'
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
        e.data_publicacao_pncp::date AS dia,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.descartado_em IS NULL)::int AS nos_filtros,
        COUNT(*) FILTER (WHERE s.visto_em IS NULL AND s.descartado_em IS NULL)::int AS nao_vistos,
        COUNT(*) FILTER (WHERE COALESCE(s.favorito, FALSE))::int AS favoritados
      FROM editais e
      LEFT JOIN edital_status s ON s.edital_id = e.id
      WHERE e.data_publicacao_pncp::date BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY 1
    `,
    sql`
      SELECT (contratacao_json->>'dataPublicacaoPncp')::date AS dia, COUNT(*)::int AS total
      FROM itens_pendentes
      WHERE (contratacao_json->>'dataPublicacaoPncp')::date BETWEEN ${inicio}::date AND ${fim}::date
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
    const linha = linhaDe(aviso.dia)
    linha.publicados++
    if (aviso.favorito) linha.favoritados++
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

// ---------------------------------------------------------------------------
// Busca em todos os meses

export interface ResultadoDaBusca {
  chave: string
  dia: string
  tipo: string
  origem: string
  texto: string
  entidade: string | null
  href: string
  externo: boolean
  favorito: boolean
  visto: boolean
  descartado: boolean
}

export const MAX_RESULTADOS = 100

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Sem a extensão unaccent no Neon: translate() tira os acentos do português
// dos dois lados, mesmo efeito pra busca.
const COM_ACENTO = 'áàâãäéèêëíìîïóòôõöúùûüç'
const SEM_ACENTO = 'aaaaaeeeeiiiiooooouuuuc'

export async function buscarNoArquivo(termo: string): Promise<{ resultados: ResultadoDaBusca[]; total: number }> {
  const alvo = normalizar(termo.trim())
  const padrao = `%${alvo}%`

  const [editaisBruto, avisos] = await Promise.all([
    sql`
      SELECT e.numero_controle_pncp, e.objeto_compra, e.orgao_razao_social, e.municipio_nome,
             e.modalidade_nome, e.raw_json->>'numeroCompra' AS numero_compra, e.ano_compra,
             e.data_publicacao_pncp, s.visto_em, s.descartado_em, COALESCE(s.favorito, FALSE) AS favorito
      FROM editais e
      LEFT JOIN edital_status s ON s.edital_id = e.id
      WHERE translate(lower(concat_ws(' ', e.objeto_compra, e.orgao_razao_social, e.municipio_nome,
                                      e.numero_controle_pncp, e.raw_json->>'numeroCompra',
                                      array_to_string(e.keywords_matched, ' '))),
                      ${COM_ACENTO}, ${SEM_ACENTO}) LIKE ${padrao}
      ORDER BY e.data_publicacao_pncp DESC
    `,
    // Avisos: o histórico inteiro cabe folgado em memória (poucos milhares de
    // linhas) e assim a busca olha exatamente o texto que a tela mostra.
    buscarAvisosDoPeriodo('2000-01-01', diaEmMaceio(new Date())),
  ])

  const deEditais: ResultadoDaBusca[] = (editaisBruto as Record<string, unknown>[]).map((e) => {
    const numero = e.numero_compra ? `nº ${e.numero_compra}/${e.ano_compra}` : null
    return {
      chave: `pncp:${e.numero_controle_pncp}`,
      dia: new Date(e.data_publicacao_pncp as string).toISOString().slice(0, 10),
      tipo: (e.modalidade_nome as string | null) ?? 'Edital',
      origem: ['PNCP', numero].filter(Boolean).join(' · '),
      texto: e.objeto_compra as string,
      entidade: [e.orgao_razao_social, e.municipio_nome].filter(Boolean).join(' · ') || null,
      href: `/edital/${encodeURIComponent(e.numero_controle_pncp as string)}`,
      externo: false,
      favorito: e.favorito as boolean,
      visto: e.visto_em !== null,
      descartado: e.descartado_em !== null,
    }
  })

  const textoDoAviso = (a: AvisoDeDiario) =>
    normalizar([a.tipo, a.origem, a.entidade, a.texto, a.processo, a.keywords.join(' ')].filter(Boolean).join(' '))

  const deAvisos: ResultadoDaBusca[] = avisos
    .filter((a) => textoDoAviso(a).includes(alvo))
    .map((a) => ({
      chave: a.chave,
      dia: a.dia,
      tipo: a.tipo,
      origem: a.origem,
      texto: a.texto,
      entidade: a.entidade,
      href: a.url,
      externo: true,
      favorito: a.favorito,
      visto: a.visto,
      descartado: a.descartado,
    }))

  const todos = [...deEditais, ...deAvisos].sort((a, b) => b.dia.localeCompare(a.dia))
  return { resultados: todos.slice(0, MAX_RESULTADOS), total: todos.length }
}
