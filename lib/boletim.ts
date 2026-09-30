import { sql } from '@/lib/db'

// As datas de publicação chegam do PNCP como meia-noite de Brasília (gravadas
// como 03:00Z), então o ::date do Postgres em UTC já devolve o dia certo do
// ponto de vista de quem usa o sistema em Maceió — não precisa de conversão
// de fuso nas consultas abaixo.

// Dias que têm boletim: com edital do PNCP dentro dos filtros ou com aviso
// de diário (seção "Só nos diários", 2026-09-24) — um dia de PNCP fora do ar
// ainda tem o que mostrar pelos diários.
export const DIAS_COM_BOLETIM = sql`
  SELECT data_publicacao_pncp::date AS dia FROM editais
  UNION SELECT publication_date FROM doe_al_matches
  UNION SELECT publication_date FROM doe_al_licitacoes
  UNION SELECT publication_date FROM doe_al_cotacoes
  UNION SELECT data_circulacao FROM diario_municipal_materias
`

// O boletim mais recente é o último dia que teve conteúdo — não
// necessariamente hoje, já que fim de semana e feriado não publicam.
export async function diaDoBoletimMaisRecente(): Promise<string | null> {
  const linhas = (await sql`SELECT MAX(dia) AS dia FROM (${DIAS_COM_BOLETIM}) d`) as { dia: string | null }[]

  if (!linhas[0]?.dia) return null
  return new Date(linhas[0].dia).toISOString().slice(0, 10)
}

// Edital sem linha em edital_status é não visto — é o estado inicial de todo
// mundo, por isso o LEFT JOIN em vez de exigir a linha existir.
export async function contarNaoVistos(dia: string): Promise<number> {
  const linhas = (await sql`
    SELECT COUNT(*)::int AS n
    FROM editais e
    LEFT JOIN edital_status s ON s.edital_id = e.id
    WHERE e.data_publicacao_pncp::date = ${dia}::date
      AND s.visto_em IS NULL
      AND s.descartado_em IS NULL
  `) as { n: number }[]

  return linhas[0].n
}

// O badge da caixa de entrada conta o acúmulo inteiro, não só o dia mais
// recente: é "o que ainda falta triar", que é a pergunta que ele responde na
// prática — um dia sem publicação não zera a fila do que ficou para trás.
export async function contarNaoVistosAcumulado(): Promise<number> {
  const linhas = (await sql`
    SELECT COUNT(*)::int AS n
    FROM editais e
    LEFT JOIN edital_status s ON s.edital_id = e.id
    WHERE s.visto_em IS NULL
      AND s.descartado_em IS NULL
  `) as { n: number }[]

  return linhas[0].n
}

export interface EditalDoBoletim {
  id: number
  numeroControlePncp: string
  objeto: string
  orgao: string | null
  municipio: string | null
  uf: string | null
  modalidade: string | null
  numeroCompra: string | null
  anoCompra: number
  valorEstimado: number | null
  aberturaProposta: string | null
  visto: boolean
  favorito: boolean
  // Quantos anexos a cópia salva tem (lib/detalhe-pncp.ts); null = ainda não
  // conseguimos buscar no PNCP.
  anexos: number | null
}

function mapearEdital(linha: Record<string, unknown>): EditalDoBoletim {
  return {
    id: linha.id as number,
    numeroControlePncp: linha.numero_controle_pncp as string,
    objeto: linha.objeto_compra as string,
    orgao: linha.orgao_razao_social as string | null,
    municipio: linha.municipio_nome as string | null,
    uf: linha.uf as string | null,
    modalidade: linha.modalidade_nome as string | null,
    numeroCompra: linha.numero_compra as string | null,
    anoCompra: linha.ano_compra as number,
    // NUMERIC volta como string no driver — converter aqui evita "R$ NaN".
    valorEstimado: linha.valor_total_estimado === null ? null : Number(linha.valor_total_estimado),
    aberturaProposta: (linha.data_abertura_proposta as string | null) ?? null,
    visto: linha.visto_em !== null,
    favorito: linha.favorito as boolean,
    anexos: linha.anexos === null ? null : Number(linha.anexos),
  }
}

// Ordena por abertura mais próxima primeiro, não por hora de publicação: o que
// decide a urgência da triagem é o prazo, mesmo critério já usado na fila de
// itens_pendentes. Não vistos vêm antes dos vistos, que a tela separa sob o
// divisor "Já vistos". Descartados saem da lista (mas continuam no banco, o
// descarte é reversível).
export async function buscarEditaisDoDia(dia: string): Promise<EditalDoBoletim[]> {
  const linhas = (await sql`
    SELECT
      e.id,
      e.numero_controle_pncp,
      e.objeto_compra,
      e.orgao_razao_social,
      e.municipio_nome,
      e.uf,
      e.modalidade_nome,
      e.raw_json->>'numeroCompra' AS numero_compra,
      e.ano_compra,
      e.valor_total_estimado,
      e.data_abertura_proposta,
      s.visto_em,
      COALESCE(s.favorito, FALSE) AS favorito,
      jsonb_array_length(e.arquivos_json) AS anexos
    FROM editais e
    LEFT JOIN edital_status s ON s.edital_id = e.id
    WHERE e.data_publicacao_pncp::date = ${dia}::date
      AND s.descartado_em IS NULL
    ORDER BY
      (s.visto_em IS NOT NULL),
      e.data_abertura_proposta ASC NULLS LAST,
      e.id
  `) as Record<string, unknown>[]

  return linhas.map(mapearEdital)
}

// Descartar esconde o edital da lista, não o apaga — sem esta consulta ele
// ficaria inacessível pela interface assim que a janela do desfazer fechasse,
// e D é vizinho de F no teclado: errar o dedo não pode custar um edital.
export async function buscarDescartadosDoDia(dia: string): Promise<EditalDoBoletim[]> {
  const linhas = (await sql`
    SELECT
      e.id,
      e.numero_controle_pncp,
      e.objeto_compra,
      e.orgao_razao_social,
      e.municipio_nome,
      e.uf,
      e.modalidade_nome,
      e.raw_json->>'numeroCompra' AS numero_compra,
      e.ano_compra,
      e.valor_total_estimado,
      e.data_abertura_proposta,
      s.visto_em,
      COALESCE(s.favorito, FALSE) AS favorito,
      jsonb_array_length(e.arquivos_json) AS anexos
    FROM editais e
    JOIN edital_status s ON s.edital_id = e.id
    WHERE e.data_publicacao_pncp::date = ${dia}::date
      AND s.descartado_em IS NOT NULL
    ORDER BY s.descartado_em DESC
  `) as Record<string, unknown>[]

  return linhas.map(mapearEdital)
}

export interface ResumoDoDia {
  publicados: number
  naoVistos: number
  nosFiltros: number
  foraDosFiltros: number
}

// "Publicados" é tudo que o sync viu naquele dia nas modalidades monitoradas:
// o que bateu keyword virou edital, o que não bateu ficou em itens_pendentes.
// A soma dos dois é o universo do dia, e itens_pendentes sozinho é o "fora dos
// filtros" que o rodapé da tela informa.
export async function resumoDoDia(dia: string): Promise<ResumoDoDia> {
  const [dentroBruto, foraBruto] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.visto_em IS NULL)::int AS nao_vistos
      FROM editais e
      LEFT JOIN edital_status s ON s.edital_id = e.id
      WHERE e.data_publicacao_pncp::date = ${dia}::date
        AND s.descartado_em IS NULL
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM itens_pendentes
      WHERE (contratacao_json->>'dataPublicacaoPncp')::date = ${dia}::date
    `,
  ])

  const dentro = dentroBruto as { total: number; nao_vistos: number }[]
  const fora = foraBruto as { total: number }[]

  const nosFiltros = dentro[0].total
  const foraDosFiltros = fora[0].total

  return {
    publicados: nosFiltros + foraDosFiltros,
    naoVistos: dentro[0].nao_vistos,
    nosFiltros,
    foraDosFiltros,
  }
}

// Dias vizinhos que têm boletim, pras setas do cabeçalho. Pula buraco (fim de
// semana, feriado, dia sem nada dentro dos filtros) em vez de levar a uma
// tela vazia.
export async function vizinhosDoDia(
  dia: string
): Promise<{ anterior: string | null; proximo: string | null }> {
  const linhas = (await sql`
    SELECT
      MAX(dia) FILTER (WHERE dia < ${dia}::date) AS anterior,
      MIN(dia) FILTER (WHERE dia > ${dia}::date) AS proximo
    FROM (${DIAS_COM_BOLETIM}) d
  `) as { anterior: string | null; proximo: string | null }[]

  const paraIso = (valor: string | null) =>
    valor ? new Date(valor).toISOString().slice(0, 10) : null

  return {
    anterior: paraIso(linhas[0].anterior),
    proximo: paraIso(linhas[0].proximo),
  }
}

export async function ultimoSyncEm(): Promise<Date | null> {
  const linhas = (await sql`
    SELECT finished_at
    FROM sync_runs
    WHERE tipo = 'sync' AND erro IS NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `) as { finished_at: string | null }[]

  const valor = linhas[0]?.finished_at
  return valor ? new Date(valor) : null
}
