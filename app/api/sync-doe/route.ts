import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  buscarPorFraseExata,
  buscarFraseNasPaginas,
  extrairAvisosCotacao,
  extrairAvisosLicitacao,
  extrairPaginasPdf,
  listarEdicoesPublicadas,
  PREFIXO_URL_PDF,
  urlPdfEdicao,
  type DoeEdicaoPublicada,
  type DoePaginaTexto,
} from '@/lib/doe'
import { extrairDataSessao } from '@/lib/diario-municipal'
import { encontrarPalavrasChave, palavrasChaveDeDiario, termosDeSegmentos, SEGMENTO_CAPTURA_AMPLA } from '@/lib/keywords'

export const maxDuration = 60

// Janela bem maior que o /api/sync do PNCP (3 dias) de propósito: o boletim do
// ConLicitação mostrou hoje (10/09) itens de "aquisição judicial" cuja
// publicação original no DOE-AL era de até 13 dias atrás (achado testando ao
// vivo) — o "Atualizada em" do ConLicitação parece refletir quando o sistema
// deles rescaneia/reexibe o processo, não a data de publicação original. Volume
// é baixo (poucos itens por edição) e a dedup por pagina_id torna reconsultar
// uma janela maior praticamente de graça.
const DIAS_JANELA = 14

// Fecha só a lacuna dos itens "aquisição judicial" (OPME/medicamento) achada em
// 2026-09-10 — não busca Pregão/Dispensa "normal" aqui (esse é outro problema,
// com outro tipo de ruído; ver o log de validação (privado)).
const FRASE_ANCORA = 'aquisição judicial'

// Fallback pro caso o próprio aviso não use a frase-âncora principal — achado
// em 2026-09-14 (ver lib/doe.ts pro caso real: "Aquisição de OPME DE
// CARDIOLOGIA", sem a palavra "judicial" em lugar nenhum). Rodado também pelo
// caminho via busca (não só pelo fallback de PDF) pra manter os dois
// caminhos com a mesma cobertura, caso o índice deles volte a funcionar.
const FRASE_SECUNDARIA = 'cotacaojudicial'

// Sem filtro de keyword adicional em cima da frase-âncora: testado contra o
// boletim de 04/09 e 100% dos itens "aquisição judicial" eram relevantes (OPME/
// medicamento/insumo), mas boa parte descreve só o PROCEDIMENTO cirúrgico
// ("artroplastia", "videolaparoscopia") sem citar o produto no trecho
// destacado — o motor de keyword descartava esses por engano (12 de 12 itens
// de 04/09 sumiram por causa disso). A própria frase "aquisição judicial" já
// é o filtro de precisão; `keywords_matched` fica só informativo (pode vir
// vazio) pra não perder esses casos. Achado em 2026-09-10.

const TERMOS_DOE = termosDeSegmentos([SEGMENTO_CAPTURA_AMPLA])

function extrairProcesso(texto: string): string | null {
  const match = texto.match(/E:\s?\d{4,6}\.\d{6,12}\/\d{4}/)
  return match ? match[0].replace(/\s/g, '') : null
}

// Fallback pro caso do índice de busca (searchES) estar indisponível ou
// desatualizado — achado em 2026-09-14, ver o log de validação (privado) e
// lib/doe.ts. Sempre roda, além da busca normal: como o volume é baixo
// (~1 edição nova por dia útil) e cada edição já verificada fica marcada em
// `doe_al_edicoes_verificadas`, o custo extra de rodar os dois caminhos juntos
// é desprezível — não precisa detectar "a busca está quebrada" pra decidir
// quando usar.
//
// Offset gigante no pagina_id sintético (bem acima da faixa real observada,
// ~1.3-1.4 milhão) pra nunca colidir com um pagina_id de verdade vindo da API
// de busca deles.
const OFFSET_PAGINA_ID_FALLBACK = 10_000_000_000

// Bug achado em 2026-09-21 comparando o boletim de 17/09: a mesma edição
// (nº 2885) apareceu em `editions/published` com dois `edition_id` diferentes
// (51847 numa chamada, 51849 noutra) — o `id` interno da API do Diário não é
// estável entre chamadas pra uma mesma edição, só o `number` (o "nº 2885" que
// aparece no próprio diário) é. Como as checagens de dedup abaixo usavam
// `edition_id`, a segunda vez que o cron via o outro `edition_id` achava que
// era uma edição nova, baixava o PDF de novo e duplicava as linhas (10 linhas
// pra 5 páginas reais). Corrigido usando `edition_number` como identidade em
// vez de `edition_id` — `edition_id` continua sendo guardado nas tabelas (é
// metadado útil, ex: pra montar a URL do PDF), só não é mais usado pra decidir
// "já vi essa edição/página antes".
//
// Complemento de 2026-09-23: edition_number sozinho também não basta — o
// suplemento do dia tem o MESMO número da edição normal. Identidade de edição
// passa a ser (edition_number, suplemento). Ver lib/schema.sql.

// Página de suplemento ganha um deslocamento a mais no pagina_id sintético,
// pra não colidir com a mesma página da edição normal de mesmo número.
const OFFSET_PAGINA_ID_SUPLEMENTO = 1_000_000_000

// Orçamento de tempo pro fallback especificamente (dentro do maxDuration de
// 60s da rota inteira) — mesmo padrão do /api/verificar-itens: numa primeira
// rodada (backfill de várias edições da janela de 14 dias) processar tudo de
// uma vez pode estourar o tempo; o resto fica pra próxima chamada do cron.
const ORCAMENTO_FALLBACK_MS = 35_000

interface ResultadoFallback {
  totalApi: number
  totalMatched: number
  totalNovos: number
  // Avisos de licitação (Pregão Eletrônico estadual) — ver
  // extrairAvisosLicitacao em lib/doe.ts. Contados à parte e registrados numa
  // linha própria de sync_runs, pra não misturar com a aquisição judicial.
  licitacoes: ContagemExtrator
  // Avisos de cotação estaduais não judiciais — ver extrairAvisosCotacao.
  cotacoes: ContagemExtrator
  // Linhas com link de PDF atualizado por republicação da edição — ver
  // corrigirIdsRepublicados.
  linksCorrigidos: number
}

interface ContagemExtrator {
  edicoesLidas: number
  avisosExtraidos: number
  avisosNovos: number
}

const CONTAGEM_VAZIA: ContagemExtrator = { edicoesLidas: 0, avisosExtraidos: 0, avisosNovos: 0 }

async function salvarAvisosLicitacao(
  edicao: DoeEdicaoPublicada,
  paginas: DoePaginaTexto[]
): Promise<{ extraidos: number; novos: number }> {
  const avisos = extrairAvisosLicitacao(paginas)
  let novos = 0

  for (const aviso of avisos) {
    const inseridos = await sql`
      INSERT INTO doe_al_licitacoes (
        processo, tipo, numero_pregao, orgao_sigla, numero_contratacao, objeto,
        data_realizacao, keywords_matched, edition_id, edition_number, page_number,
        publication_date, pdf_url, trecho
      ) VALUES (
        ${aviso.processo}, ${aviso.tipo}, ${aviso.numeroPregao}, ${aviso.orgaoSigla},
        ${aviso.numeroContratacao}, ${aviso.objeto}, ${aviso.dataRealizacao},
        ${encontrarPalavrasChave(aviso.objeto)}, ${edicao.id}, ${edicao.number}, ${aviso.pageNumber},
        ${edicao.publication_date}, ${urlPdfEdicao(edicao.id)}, ${aviso.trecho}
      )
      ON CONFLICT (processo, tipo, edition_number) DO NOTHING
      RETURNING id
    `
    if (inseridos.length > 0) novos++
  }

  return { extraidos: avisos.length, novos }
}

// "Secretaria de Estado da Saúde" no objeto faria a keyword ampla `saúde`
// bater em qualquer compra da SESAU — mesmo cuidado de textoParaKeyword em
// lib/diario-municipal.ts. Só o texto que vai pro motor; o guardado fica
// inteiro.
function objetoParaKeyword(objeto: string): string {
  return objeto.replace(/\bsecretaria\s+(?:de\s+estado\s+)?(?:da\s+)?sa[úu]de\b/gi, ' ')
}

async function salvarAvisosCotacao(
  edicao: DoeEdicaoPublicada,
  paginas: DoePaginaTexto[]
): Promise<{ extraidos: number; novos: number }> {
  const avisos = extrairAvisosCotacao(paginas)
  let novos = 0

  for (const aviso of avisos) {
    const chave = aviso.protocolo ?? `p${aviso.pageNumber}:${(aviso.objeto ?? aviso.corpo).slice(0, 80)}`
    const inseridos = await sql`
      INSERT INTO doe_al_cotacoes (
        chave, orgao, numero_cotacao, processo, objeto, corpo, keywords_matched, prazo,
        edition_id, edition_number, suplemento, page_number, publication_date, pdf_url
      ) VALUES (
        ${chave}, ${aviso.orgao}, ${aviso.numeroCotacao}, ${aviso.processo}, ${aviso.objeto}, ${aviso.corpo},
        ${aviso.objeto ? palavrasChaveDeDiario(objetoParaKeyword(aviso.objeto), aviso.corpo) : []},
        ${extrairDataSessao(aviso.corpo, edicao.publication_date)},
        ${edicao.id}, ${edicao.number}, ${edicao.suplement}, ${aviso.pageNumber},
        ${edicao.publication_date}, ${urlPdfEdicao(edicao.id)}
      )
      ON CONFLICT (edition_number, suplemento, chave) DO NOTHING
      RETURNING id
    `
    if (inseridos.length > 0) novos++
  }

  return { extraidos: avisos.length, novos }
}

// Achado em 2026-09-30 (link do PDF dando 404): a Imprensa Oficial republica a
// edição normal do dia horas depois de publicar, com um id novo, e apaga o
// antigo, que passa a dar 404. Acontece em toda edição normal desde a 2884
// (15/09). O conteúdo é o mesmo (conferido em 3 edições), só o link quebra.
// Como a gente lê a edição antes da troca, o id salvo fica velho. Aqui, a cada
// rodada, o id de cada edição listada é comparado com o salvo e, se mudou,
// atualiza edition_id e pdf_url. Ver o log de validação (privado), "2026-09-30
// (parte 3)".
//
// Uma linha está velha quando o edition_id dela não é o id atual de nenhuma
// edição com aquele número. doe_al_matches e doe_al_licitacoes não guardam se
// a edição é suplemento: isso sai de doe_al_edicoes_verificadas pelo id
// antigo e, se não achar, conta como edição normal (só a normal foi vista
// sendo republicada). doe_al_cotacoes tem a coluna. A tabela de verificadas é
// atualizada por último, porque as outras consultam o id antigo nela.
async function corrigirIdsRepublicados(edicoes: DoeEdicaoPublicada[]): Promise<number> {
  if (edicoes.length === 0) return 0

  const numeros = edicoes.map((e) => e.number)
  const suplementos = edicoes.map((e) => e.suplement)
  const ids = edicoes.map((e) => e.id)

  let corrigidas = 0

  for (const tabela of ['doe_al_matches', 'doe_al_licitacoes'] as const) {
    const linhas = await sql.query(
      `
      UPDATE ${tabela} t
      SET edition_id = a.id, pdf_url = $4 || a.id
      FROM unnest($1::int[], $2::bool[], $3::bigint[]) AS a(numero, suplemento, id)
      WHERE t.edition_number = a.numero
        AND NOT (t.edition_id = ANY($3::bigint[]))
        AND a.suplemento = COALESCE(
          (SELECT v.suplemento FROM doe_al_edicoes_verificadas v WHERE v.edition_id = t.edition_id),
          FALSE
        )
      RETURNING t.id
      `,
      [numeros, suplementos, ids, PREFIXO_URL_PDF]
    )
    corrigidas += linhas.length
  }

  const cotacoes = await sql`
    UPDATE doe_al_cotacoes t
    SET edition_id = a.id, pdf_url = ${PREFIXO_URL_PDF} || a.id
    FROM unnest(${numeros}::int[], ${suplementos}::bool[], ${ids}::bigint[]) AS a(numero, suplemento, id)
    WHERE t.edition_number = a.numero
      AND t.suplemento = a.suplemento
      AND NOT (t.edition_id = ANY(${ids}::bigint[]))
    RETURNING t.id
  `
  corrigidas += cotacoes.length

  // edition_id é a chave primária: se por algum motivo já existir linha com o
  // id novo, deixa a velha como está em vez de quebrar a rodada.
  await sql`
    UPDATE doe_al_edicoes_verificadas v
    SET edition_id = a.id
    FROM unnest(${numeros}::int[], ${suplementos}::bool[], ${ids}::bigint[]) AS a(numero, suplemento, id)
    WHERE v.edition_number = a.numero
      AND v.suplemento = a.suplemento
      AND NOT (v.edition_id = ANY(${ids}::bigint[]))
      AND NOT EXISTS (SELECT 1 FROM doe_al_edicoes_verificadas w WHERE w.edition_id = a.id)
  `

  return corrigidas
}

async function rodarFallbackPdf(dataCorte: Date): Promise<ResultadoFallback> {
  const inicio = Date.now()
  const resultado: ResultadoFallback = {
    totalApi: 0,
    totalMatched: 0,
    totalNovos: 0,
    licitacoes: { ...CONTAGEM_VAZIA },
    cotacoes: { ...CONTAGEM_VAZIA },
    linksCorrigidos: 0,
  }

  const edicoes = await listarEdicoesPublicadas()

  // Toda a listagem (mês atual e anterior), não só a janela: conserta também
  // links antigos. Falha aqui não impede a leitura das edições novas.
  try {
    resultado.linksCorrigidos = await corrigirIdsRepublicados(edicoes)
  } catch (err) {
    console.error('sync-doe: falha ao corrigir ids republicados', err)
  }

  const edicoesNaJanela = edicoes.filter((e) => new Date(e.publication_date) >= dataCorte)

  for (const edicao of edicoesNaJanela) {
    if (Date.now() - inicio > ORCAMENTO_FALLBACK_MS) break

    const verificacao = await sql`
      SELECT licitacoes_verificadas_em, cotacoes_verificadas_em FROM doe_al_edicoes_verificadas
      WHERE edition_number = ${edicao.number} AND suplemento = ${edicao.suplement}
    `
    const faltaJudicial = verificacao.length === 0
    const faltaLicitacoes = faltaJudicial || verificacao.some((v) => v.licitacoes_verificadas_em === null)
    const faltaCotacoes = faltaJudicial || verificacao.some((v) => v.cotacoes_verificadas_em === null)
    if (!faltaJudicial && !faltaLicitacoes && !faltaCotacoes) continue

    // Baixa e extrai o PDF uma vez só, pros três extratores.
    const paginasPdf = await extrairPaginasPdf(edicao.id)

    if (faltaLicitacoes) {
      const { extraidos, novos } = await salvarAvisosLicitacao(edicao, paginasPdf)
      resultado.licitacoes.edicoesLidas++
      resultado.licitacoes.avisosExtraidos += extraidos
      resultado.licitacoes.avisosNovos += novos
    }

    if (faltaCotacoes) {
      const { extraidos, novos } = await salvarAvisosCotacao(edicao, paginasPdf)
      resultado.cotacoes.edicoesLidas++
      resultado.cotacoes.avisosExtraidos += extraidos
      resultado.cotacoes.avisosNovos += novos
    }

    if (!faltaJudicial) {
      // Edição verificada antes de existir o extrator de licitações ou o de
      // cotações (ou com edition_id diferente, ver comentário do bug de
      // 2026-09-21 acima) — só completa a parte que faltava.
      await sql`
        UPDATE doe_al_edicoes_verificadas
        SET licitacoes_verificadas_em = COALESCE(licitacoes_verificadas_em, NOW()),
            cotacoes_verificadas_em = COALESCE(cotacoes_verificadas_em, NOW())
        WHERE edition_number = ${edicao.number} AND suplemento = ${edicao.suplement}
      `
      continue
    }

    resultado.totalApi++
    const paginas = buscarFraseNasPaginas(paginasPdf, FRASE_ANCORA)

    for (const pagina of paginas) {
      // Se a busca normal já capturou essa mesma página dessa edição (pagina
      // real, não sintética), não duplica — só complementa o que ela não
      // achou.
      // doe_al_matches não distingue suplemento, então a checagem por página
      // só vale pra edição normal — suplemento fica só com o ON CONFLICT do
      // pagina_id sintético.
      if (!edicao.suplement) {
        const jaExiste = await sql`
          SELECT 1 FROM doe_al_matches WHERE edition_number = ${edicao.number} AND page_number = ${pagina.pageNumber}
        `
        if (jaExiste.length > 0) continue
      }

      resultado.totalMatched++
      const snippet = pagina.trechos.join(' \n ')
      const palavrasChave = encontrarPalavrasChave(snippet, TERMOS_DOE)
      const paginaIdSintetico =
        OFFSET_PAGINA_ID_FALLBACK +
        (edicao.suplement ? OFFSET_PAGINA_ID_SUPLEMENTO : 0) +
        edicao.number * 1000 +
        pagina.pageNumber

      const inseridos = await sql`
        INSERT INTO doe_al_matches (
          pagina_id, edition_id, edition_number, page_number,
          publication_date, processo_numero, keywords_matched, snippet, pdf_url, fonte
        ) VALUES (
          ${paginaIdSintetico}, ${edicao.id}, ${edicao.number}, ${pagina.pageNumber},
          ${edicao.publication_date}, ${extrairProcesso(snippet)}, ${palavrasChave}, ${snippet},
          ${urlPdfEdicao(edicao.id)}, 'pdf_fallback'
        )
        ON CONFLICT (pagina_id) DO NOTHING
        RETURNING id
      `
      if (inseridos.length > 0) resultado.totalNovos++
    }

    await sql`
      INSERT INTO doe_al_edicoes_verificadas (edition_id, edition_number, suplemento, publication_date, ocorrencias, licitacoes_verificadas_em, cotacoes_verificadas_em)
      VALUES (${edicao.id}, ${edicao.number}, ${edicao.suplement}, ${edicao.publication_date}, ${paginas.length}, NOW(), NOW())
      ON CONFLICT (edition_id) DO NOTHING
    `
  }

  return resultado
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
    }
  }

  const startedAt = new Date()
  const dataCorte = new Date()
  dataCorte.setDate(dataCorte.getDate() - DIAS_JANELA)

  let totalApi = 0
  let totalMatched = 0
  let totalNovos = 0
  let erro: string | null = null

  try {
    const [paginasFrasePrincipal, paginasFraseSecundaria] = await Promise.all([
      buscarPorFraseExata(FRASE_ANCORA, dataCorte),
      buscarPorFraseExata(FRASE_SECUNDARIA, dataCorte),
    ])

    // Dedup por pagina_id (mesma página pode bater as duas buscas) antes de
    // processar, pra não contar/gravar a mesma página duas vezes.
    const paginasPorId = new Map<number, (typeof paginasFrasePrincipal)[number]>()
    for (const pagina of [...paginasFrasePrincipal, ...paginasFraseSecundaria]) {
      paginasPorId.set(pagina.id, pagina)
    }
    const paginas = [...paginasPorId.values()]
    totalApi = paginas.length

    for (const pagina of paginas) {
      // A API devolve a tag de fechamento com barra invertida literal
      // ("<\/em>" em vez de "</em>") — achado testando ao vivo em 2026-09-10.
      // Remove qualquer barra invertida solta antes de limpar as tags.
      const snippet = pagina.highlight.join(' \n ').replace(/\\/g, '').replace(/<\/?em>/g, '')
      const palavrasChave = encontrarPalavrasChave(snippet, TERMOS_DOE)
      totalMatched++

      // Bug achado em 2026-09-28: a busca voltou em 25/09 depois de travada
      // desde 11/09 e regravou as páginas da janela que o fallback de PDF já
      // tinha salvo — pagina_id sintético ≠ pagina_id real, então o ON
      // CONFLICT não pegou e o boletim mostrou cada aviso judicial duas vezes.
      // Mesma checagem por (edição, página) que o fallback já faz.
      const jaExiste = await sql`
        SELECT 1 FROM doe_al_matches WHERE edition_number = ${pagina.edition_number} AND page_number = ${pagina.page_number}
      `
      if (jaExiste.length > 0) continue

      const inseridos = await sql`
        INSERT INTO doe_al_matches (
          pagina_id, edition_id, edition_number, page_number,
          publication_date, processo_numero, keywords_matched, snippet, pdf_url, fonte
        ) VALUES (
          ${pagina.id}, ${pagina.edition_id}, ${pagina.edition_number}, ${pagina.page_number},
          ${pagina.publication_date}, ${extrairProcesso(snippet)}, ${palavrasChave}, ${snippet},
          ${urlPdfEdicao(pagina.edition_id)}, 'busca'
        )
        ON CONFLICT (pagina_id) DO NOTHING
        RETURNING id
      `
      if (inseridos.length > 0) totalNovos++
    }
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err)
  }

  // Roda sempre, além da busca acima — ver comentário em rodarFallbackPdf.
  // Erro aqui não apaga o resultado da busca normal, só some no total.
  let licitacoes: ContagemExtrator = { ...CONTAGEM_VAZIA }
  let cotacoes: ContagemExtrator = { ...CONTAGEM_VAZIA }
  let linksCorrigidos = 0
  let erroFallback: string | null = null
  try {
    const fallback = await rodarFallbackPdf(dataCorte)
    totalApi += fallback.totalApi
    totalMatched += fallback.totalMatched
    totalNovos += fallback.totalNovos
    licitacoes = fallback.licitacoes
    cotacoes = fallback.cotacoes
    linksCorrigidos = fallback.linksCorrigidos
  } catch (err) {
    erroFallback = err instanceof Error ? err.message : String(err)
    erro = erro ? `${erro} | fallback pdf: ${erroFallback}` : `fallback pdf: ${erroFallback}`
  }

  const finishedAt = new Date()
  const dataConsultada = startedAt.toISOString().slice(0, 10)

  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('sync_doe', ${dataConsultada}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${totalApi}, ${totalMatched}, ${totalNovos}, ${erro})
  `

  // Linha própria pros avisos de licitação: total_api = edições lidas,
  // total_matched = avisos extraídos, total_novos = avisos inseridos. Erro só
  // do caminho de PDF (é o único que alimenta essa parte).
  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('sync_doe_licitacoes', ${dataConsultada}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${licitacoes.edicoesLidas}, ${licitacoes.avisosExtraidos}, ${licitacoes.avisosNovos}, ${erroFallback})
  `

  // Mesmo esquema pras cotações estaduais não judiciais.
  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('sync_doe_cotacoes', ${dataConsultada}, ${startedAt.toISOString()}, ${finishedAt.toISOString()}, ${cotacoes.edicoesLidas}, ${cotacoes.avisosExtraidos}, ${cotacoes.avisosNovos}, ${erroFallback})
  `

  if (erro) {
    return NextResponse.json({ erro, totalApi, totalMatched, totalNovos, licitacoes, cotacoes, linksCorrigidos }, { status: 500 })
  }

  return NextResponse.json({ totalApi, totalMatched, totalNovos, licitacoes, cotacoes, linksCorrigidos })
}
