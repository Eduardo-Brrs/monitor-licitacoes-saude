import { ehStatusInterno, type StatusInterno } from '@/lib/acompanhamento-tipos'
import { sql } from '@/lib/db'
import { diaEmMaceio } from '@/lib/formato'
import { rotuloDoOrgao } from '@/lib/orgaos'
import { prazoEstimadoDispensa } from '@/lib/prazo'

// Cada item entra no boletim do dia em que foi CAPTURADO (coluna boletim_dia,
// 2026-10-06), não no dia de publicação — ver dia_do_boletim em
// migrations/001_estado_inicial.sql. A data de publicação continua na linha quando é outra.

// Dias que têm boletim: com edital do PNCP dentro dos filtros ou com aviso
// de diário (seção "Só nos diários", 2026-09-24) — um dia de PNCP fora do ar
// ainda tem o que mostrar pelos diários.
export const DIAS_COM_BOLETIM = sql`
  SELECT boletim_dia AS dia FROM editais
  UNION SELECT boletim_dia FROM doe_al_matches
  UNION SELECT boletim_dia FROM doe_al_licitacoes
  UNION SELECT boletim_dia FROM doe_al_cotacoes
  UNION SELECT boletim_dia FROM diario_municipal_materias
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
    WHERE e.boletim_dia = ${dia}::date
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
  // YYYY-MM-DD. A linha mostra "publicado dd/mm" quando é anterior ao dia do
  // boletim — o edital chegou atrasado (checagem de itens, PNCP fora do ar).
  publicadoEm: string
  boletimDia: string
  // Dispensa sem data no PNCP: publicação + 3 dias úteis (lib/prazo.ts).
  prazoEstimado: string | null
  visto: boolean
  favorito: boolean
  statusInterno: StatusInterno | null
  // Quantos anexos a cópia salva tem (lib/detalhe-pncp.ts); null = ainda não
  // conseguimos buscar no PNCP.
  anexos: number | null
}

function mapearEdital(linha: Record<string, unknown>): EditalDoBoletim {
  // Encerramento = limite da proposta, o dia da sessão (pedido do usuário, 2026-10-14);
  // no PNCP "abertura" é só o início do recebimento.
  const aberturaProposta =
    (linha.data_encerramento_proposta as string | null) ?? (linha.data_abertura_proposta as string | null) ?? null
  return {
    id: linha.id as number,
    numeroControlePncp: linha.numero_controle_pncp as string,
    objeto: linha.objeto_compra as string,
    orgao: rotuloDoOrgao(linha.orgao_cnpj as string | null, linha.orgao_razao_social as string | null),
    municipio: linha.municipio_nome as string | null,
    uf: linha.uf as string | null,
    modalidade: linha.modalidade_nome as string | null,
    numeroCompra: linha.numero_compra as string | null,
    anoCompra: linha.ano_compra as number,
    // NUMERIC volta como string no driver — converter aqui evita "R$ NaN".
    valorEstimado: linha.valor_total_estimado === null ? null : Number(linha.valor_total_estimado),
    aberturaProposta,
    prazoEstimado: prazoEstimadoDispensa({
      modalidade: linha.modalidade_nome as string | null,
      aberturaProposta,
      publicacao: linha.data_publicacao_pncp as string | null,
    }),
    publicadoEm: diaEmMaceio(new Date(linha.data_publicacao_pncp as string)),
    boletimDia: new Date(linha.boletim_dia as string).toISOString().slice(0, 10),
    visto: linha.visto_em !== null,
    favorito: linha.favorito as boolean,
    statusInterno: ehStatusInterno(linha.status_interno) ? linha.status_interno : null,
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
      e.orgao_cnpj,
      e.municipio_nome,
      e.uf,
      e.modalidade_nome,
      e.raw_json->>'numeroCompra' AS numero_compra,
      e.ano_compra,
      e.valor_total_estimado,
      e.data_abertura_proposta,
      e.data_encerramento_proposta,
      e.data_publicacao_pncp,
      e.boletim_dia,
      s.visto_em,
      COALESCE(s.favorito, FALSE) AS favorito,
      s.status_interno,
      jsonb_array_length(e.arquivos_json) AS anexos
    FROM editais e
    LEFT JOIN edital_status s ON s.edital_id = e.id
    WHERE e.boletim_dia = ${dia}::date
      AND s.descartado_em IS NULL
    ORDER BY
      (s.visto_em IS NOT NULL),
      COALESCE(e.data_encerramento_proposta, e.data_abertura_proposta) ASC NULLS LAST,
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
      e.orgao_cnpj,
      e.municipio_nome,
      e.uf,
      e.modalidade_nome,
      e.raw_json->>'numeroCompra' AS numero_compra,
      e.ano_compra,
      e.valor_total_estimado,
      e.data_abertura_proposta,
      e.data_encerramento_proposta,
      e.data_publicacao_pncp,
      e.boletim_dia,
      s.visto_em,
      COALESCE(s.favorito, FALSE) AS favorito,
      s.status_interno,
      jsonb_array_length(e.arquivos_json) AS anexos
    FROM editais e
    JOIN edital_status s ON s.edital_id = e.id
    WHERE e.boletim_dia = ${dia}::date
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
      WHERE e.boletim_dia = ${dia}::date
        AND s.descartado_em IS NULL
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM itens_pendentes
      WHERE boletim_dia = ${dia}::date
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
