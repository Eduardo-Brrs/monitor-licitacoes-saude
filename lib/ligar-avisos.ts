import { sql } from '@/lib/db'
import { citaNumeroDaCompra, normalizar } from '@/lib/diarios'
import { guardarEditalTrazido } from '@/lib/editais'
import { rodarFila } from '@/lib/fila'
import { FILA_LIGAR_AVISOS, registroDaFila } from '@/lib/fila-falhas'
import { formatarDiaMes } from '@/lib/formato'
import { encontrarPalavrasChave } from '@/lib/keywords'
import { listarMunicipios } from '@/lib/municipios'
import {
  buscarContratacoes,
  MODALIDADE_DISPENSA,
  MODALIDADE_PREGAO_ELETRONICO,
  type LimitesPncp,
  type PncpContratacao,
} from '@/lib/pncp'

// Aviso de diário → edital do PNCP (2026-10-23, o usuário reclamou de não ter
// anexo num aviso favoritado). O diário publica só o texto; o edital com
// itens e anexos costuma chegar no PNCP de 0 a 7 dias depois (medido: 12 de
// 15 avisos da BNC e 5 de 5 da Licitanet apareceram). Quando aparece, o aviso
// é ligado ao edital: etapa, notas, tarefas e histórico de etapa passam pra
// ele, que entra no Andamento no lugar do aviso.
//
// Como acha: primeiro nos editais que já estão no banco (mesma regra que
// esconde aviso duplicado do boletim — município + "N/ano", ou o processo);
// aviso municipal sem par no banco é procurado no PNCP pela cidade.
// Aquisição judicial não tem edital; Maceió Saúde não publica no PNCP.

export type FonteLigavel = 'municipal' | 'doe_licitacao' | 'doe_cotacao'
export const FONTES_LIGAVEIS: FonteLigavel[] = ['municipal', 'doe_licitacao', 'doe_cotacao']

export const HORAS_ENTRE_BUSCAS = 12
// Aviso mais velho que isso não é mais procurado no PNCP (só no banco).
const DIAS_PROCURANDO_NO_PNCP = 90
// PNCP às vezes publica antes do diário (visto até 36 dias antes).
const DIAS_ANTES_DO_DIARIO = 45
const PAGINAS_POR_MODALIDADE = 3

interface AvisoParaLigar {
  fonte: FonteLigavel
  id: number
  texto: string // normalizado: título + começo do corpo
  municipio: string | null // só municipal
  diario: string | null
  processo: string | null
  titulo: string
  dia: string // YYYY-MM-DD da publicação no diário
}

function soDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '').replace(/^0+/, '')
}

// Processo só vale como chave se for comprido — "12/2026" colide fácil.
function mesmoProcesso(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = soDigitos(a)
  return x.length >= 6 && x === soDigitos(b)
}

export async function carregarAviso(fonte: FonteLigavel, id: number): Promise<AvisoParaLigar | null> {
  if (fonte === 'municipal') {
    const [l] = (await sql`
      SELECT id, diario, titulo, entidade, processo, LEFT(corpo, 1200) AS corpo, data_circulacao
      FROM diario_municipal_materias WHERE id = ${id}
    `) as Record<string, unknown>[]
    if (!l) return null
    return {
      fonte,
      id,
      texto: normalizar(`${l.titulo} ${String(l.corpo).slice(0, 600)}`),
      municipio: String(l.entidade).replace(/^Prefeitura Municipal de /i, ''),
      diario: l.diario as string,
      processo: (l.processo as string | null) ?? null,
      titulo: l.titulo as string,
      dia: new Date(l.data_circulacao as string).toISOString().slice(0, 10),
    }
  }
  const [l] = (
    fonte === 'doe_licitacao'
      ? await sql`SELECT id, processo, objeto AS titulo, publication_date AS dia FROM doe_al_licitacoes WHERE id = ${id}`
      : await sql`SELECT id, processo, objeto AS titulo, publication_date AS dia FROM doe_al_cotacoes WHERE id = ${id}`
  ) as Record<string, unknown>[]
  if (!l) return null
  return {
    fonte,
    id,
    texto: '',
    municipio: null,
    diario: null,
    processo: ((l.processo as string | null) ?? null)?.replace(/^E:\s*/, '') ?? null,
    titulo: (l.titulo as string | null) ?? '',
    dia: new Date(l.dia as string).toISOString().slice(0, 10),
  }
}

function bateComCompra(
  aviso: AvisoParaLigar,
  compra: { municipio: string | null; numero: string | null; ano: number; processo: string | null }
): boolean {
  if (mesmoProcesso(aviso.processo, compra.processo)) return true
  if (aviso.fonte !== 'municipal' || !aviso.municipio || !compra.municipio) return false
  if (normalizar(aviso.municipio) !== normalizar(compra.municipio)) return false
  const numero = compra.numero?.match(/\d+/)?.[0]
  return Boolean(numero) && citaNumeroDaCompra(aviso.texto, numero!, compra.ano)
}

async function procurarNoBanco(aviso: AvisoParaLigar): Promise<number | null> {
  const candidatos = (await sql`
    SELECT id, municipio_nome, raw_json->>'numeroCompra' AS numero, ano_compra,
           regexp_replace(raw_json->>'processo', '^E:\\s*', '') AS processo
    FROM editais
    WHERE uf = 'AL' AND data_publicacao_pncp >= ${aviso.dia}::date - ${DIAS_ANTES_DO_DIARIO}::int
    ORDER BY data_publicacao_pncp
  `) as { id: number; municipio_nome: string | null; numero: string | null; ano_compra: number; processo: string | null }[]
  const achado = candidatos.find((c) =>
    bateComCompra(aviso, { municipio: c.municipio_nome, numero: c.numero, ano: c.ano_compra, processo: c.processo })
  )
  return achado?.id ?? null
}

function modalidadesDoAviso(titulo: string): number[] {
  const t = normalizar(titulo)
  if (/preg[a]o/.test(t)) return [MODALIDADE_PREGAO_ELETRONICO]
  if (/dispensa|cotacao|contratacao direta/.test(t)) return [MODALIDADE_DISPENSA]
  return [MODALIDADE_PREGAO_ELETRONICO, MODALIDADE_DISPENSA]
}

function yyyymmdd(data: Date): string {
  return data.toISOString().slice(0, 10).replace(/-/g, '')
}

// Consulta oficial do PNCP (a mesma do sync), filtrada pela cidade — mais
// confiável que a busca do portal, que cai com filtro de status.
export async function procurarNoPncp(aviso: AvisoParaLigar, limites: LimitesPncp, prazoFinal: number): Promise<PncpContratacao | null> {
  if (!aviso.municipio) return null
  const municipios = await listarMunicipios(['AL'])
  const ibge = municipios.find((m) => normalizar(m.nome) === normalizar(aviso.municipio!))?.ibge
  if (!ibge) return null

  const inicio = new Date(`${aviso.dia}T12:00:00Z`)
  inicio.setUTCDate(inicio.getUTCDate() - DIAS_ANTES_DO_DIARIO)
  for (const modalidade of modalidadesDoAviso(aviso.titulo)) {
    for (let pagina = 1; pagina <= PAGINAS_POR_MODALIDADE; pagina++) {
      if (Date.now() > prazoFinal) return null
      const r = await buscarContratacoes(
        {
          dataInicial: yyyymmdd(inicio),
          dataFinal: yyyymmdd(new Date()),
          codigoModalidadeContratacao: modalidade,
          codigoMunicipioIbge: ibge,
        },
        pagina,
        limites
      )
      const achada = (r.data ?? []).find((c) =>
        bateComCompra(aviso, {
          municipio: c.unidadeOrgao.municipioNome,
          numero: c.numeroCompra,
          ano: c.anoCompra,
          processo: c.processo ?? null,
        })
      )
      if (achada) return achada
      if (pagina >= r.totalPaginas) break
    }
  }
  return null
}

// Move o que a gente fez no aviso pro edital, de uma vez (transação). Etapa:
// fica a do edital se ele já estava acompanhado; senão vai a do aviso.
export async function ligarAvisoAoEdital(fonte: FonteLigavel, avisoId: number, editalId: number, diaDoAviso: string) {
  const [status] = (await sql`
    SELECT favorito, status_interno, resultado, valor_ganho, observacao_final, finalizada_em
    FROM diario_status WHERE fonte = ${fonte} AND aviso_id = ${avisoId}
  `) as {
    favorito: boolean
    status_interno: string | null
    resultado: string | null
    valor_ganho: string | null
    observacao_final: string | null
    finalizada_em: string | null
  }[]
  const favorito = Boolean(status?.favorito)
  const statusInterno = status?.status_interno ?? null
  // Finalização (2026-10-27) vai junto com a etapa.
  const resultado = status?.resultado ?? null
  const valorGanho = status?.valor_ganho ?? null
  const observacao = status?.observacao_final ?? null
  const finalizadaEm = status?.finalizada_em ?? null

  await sql.transaction([
    sql`UPDATE notas SET fonte = 'pncp', item_id = ${editalId} WHERE fonte = ${fonte} AND item_id = ${avisoId}`,
    sql`UPDATE tarefas SET fonte = 'pncp', item_id = ${editalId} WHERE fonte = ${fonte} AND item_id = ${avisoId}`,
    sql`UPDATE etapa_eventos SET fonte = 'pncp', item_id = ${editalId} WHERE fonte = ${fonte} AND item_id = ${avisoId}`,
    sql`
      INSERT INTO edital_status (edital_id, favorito, status_interno, resultado, valor_ganho, observacao_final, finalizada_em, visto_em)
      VALUES (${editalId}, ${favorito}, ${statusInterno}, ${resultado}, ${valorGanho}, ${observacao}, ${finalizadaEm}, NOW())
      ON CONFLICT (edital_id) DO UPDATE
      SET favorito = ${favorito}, status_interno = ${statusInterno}, resultado = ${resultado}, valor_ganho = ${valorGanho},
          observacao_final = ${observacao}, finalizada_em = ${finalizadaEm},
          visto_em = COALESCE(edital_status.visto_em, NOW()), atualizado_em = NOW()
      WHERE NOT edital_status.favorito AND edital_status.status_interno IS NULL
    `,
    sql`
      INSERT INTO diario_status (fonte, aviso_id, favorito, status_interno, visto_em, edital_id, edital_ligado_em, edital_buscado_em)
      VALUES (${fonte}, ${avisoId}, FALSE, NULL, NOW(), ${editalId}, NOW(), NOW())
      ON CONFLICT (fonte, aviso_id) DO UPDATE
      SET favorito = FALSE, status_interno = NULL, resultado = NULL, valor_ganho = NULL, observacao_final = NULL,
          finalizada_em = NULL, edital_id = ${editalId}, edital_ligado_em = NOW(),
          edital_buscado_em = NOW(), edital_busca_erro = NULL, atualizado_em = NOW()
    `,
    sql`
      INSERT INTO edital_eventos (edital_id, chave, tipo, descricao, data_fato)
      VALUES (${editalId}, ${`aviso:${fonte}:${avisoId}`}, 'ligacao',
              ${`Aviso do diário de ${formatarDiaMes(`${diaDoAviso}T12:00:00Z`)} ligado a este edital do PNCP — anotações, tarefas e etapa vieram junto`},
              NOW())
      ON CONFLICT (edital_id, chave) DO NOTHING
    `,
  ])
}

export interface ResultadoDaBusca {
  editalId: number | null
  erro: string | null
}

// Só procura, sem gravar nada: edital já no banco (editalId) ou compra achada
// no PNCP que ainda não está (compra).
export async function encontrarEditalDoAviso(
  fonte: FonteLigavel,
  avisoId: number,
  limites: LimitesPncp,
  prazoFinal: number
): Promise<{ aviso: AvisoParaLigar | null; editalId: number | null; compra: PncpContratacao | null; erro: string | null }> {
  const aviso = await carregarAviso(fonte, avisoId)
  if (!aviso) return { aviso: null, editalId: null, compra: null, erro: null }
  try {
    const editalId = await procurarNoBanco(aviso)
    if (editalId !== null) return { aviso, editalId, compra: null, erro: null }
    const recente = Date.now() - Date.parse(`${aviso.dia}T12:00:00Z`) < DIAS_PROCURANDO_NO_PNCP * 86_400_000
    if (fonte === 'municipal' && aviso.diario !== 'maceiosaude' && recente) {
      return { aviso, editalId: null, compra: await procurarNoPncp(aviso, limites, prazoFinal), erro: null }
    }
    return { aviso, editalId: null, compra: null, erro: null }
  } catch (err) {
    return { aviso, editalId: null, compra: null, erro: err instanceof Error ? err.message : String(err) }
  }
}

// Procura o edital de um aviso e liga se achar. Grava a tentativa (a tela
// mostra "última busca") e o erro, se o PNCP falhou.
export async function procurarEditalDoAviso(
  fonte: FonteLigavel,
  avisoId: number,
  limites: LimitesPncp,
  prazoFinal: number
): Promise<ResultadoDaBusca> {
  const achado = await encontrarEditalDoAviso(fonte, avisoId, limites, prazoFinal)
  const { aviso, erro } = achado
  if (!aviso) return { editalId: null, erro: 'aviso não encontrado' }

  let editalId = achado.editalId
  if (editalId === null && achado.compra) {
    editalId = await guardarEditalTrazido(achado.compra, encontrarPalavrasChave(achado.compra.objetoCompra))
  }

  if (editalId !== null) {
    await ligarAvisoAoEdital(fonte, avisoId, editalId, aviso.dia)
  } else {
    await sql`
      INSERT INTO diario_status (fonte, aviso_id, edital_buscado_em, edital_busca_erro)
      VALUES (${fonte}, ${avisoId}, NOW(), ${erro})
      ON CONFLICT (fonte, aviso_id) DO UPDATE SET edital_buscado_em = NOW(), edital_busca_erro = ${erro}
    `
  }
  return { editalId, erro }
}

// Rodada do job (/api/acompanhar): avisos favoritados ou com status, ainda
// sem edital, a cada 12h. Lote pequeno — quase sempre acha no banco, sem
// chamar o PNCP.
export async function ligarAvisosAcompanhados(orcamentoMs: number) {
  const inicio = Date.now()
  const fila = (await sql`
    SELECT d.fonte, d.aviso_id FROM diario_status d
    LEFT JOIN fila_falhas f ON f.fila = ${FILA_LIGAR_AVISOS} AND f.chave = d.fonte || ':' || d.aviso_id
    WHERE (d.favorito OR d.status_interno IS NOT NULL)
      AND d.fonte = ANY(${FONTES_LIGAVEIS})
      AND d.edital_id IS NULL
      AND (d.edital_buscado_em IS NULL OR d.edital_buscado_em < NOW() - make_interval(hours => ${HORAS_ENTRE_BUSCAS}))
    ORDER BY f.falhou_em ASC NULLS FIRST, d.edital_buscado_em ASC NULLS FIRST
    LIMIT 4
  `) as { fonte: FonteLigavel; aviso_id: number }[]

  let ligados = 0
  const resultado = await rodarFila({
    itens: fila,
    chave: ({ fonte, aviso_id }) => `${fonte}:${aviso_id}`,
    orcamentoMs: orcamentoMs - (Date.now() - inicio),
    minimoMs: 5_000,
    registro: registroDaFila(FILA_LIGAR_AVISOS),
    processar: async ({ fonte, aviso_id }, restante) => {
      const r = await procurarEditalDoAviso(
        fonte,
        aviso_id,
        { timeoutMs: Math.min(10_000, restante - 2_000), orcamentoMs: restante - 2_000 },
        inicio + orcamentoMs
      )
      if (r.editalId !== null) ligados++
      if (r.erro) throw new Error(r.erro)
    },
  })
  return { consultados: resultado.tentados, ligados, falhas: resultado.falhas.length, ultimoErro: resultado.ultimoErro }
}

export interface LigacaoDoAviso {
  edital: { numeroControlePncp: string; anexos: number; ligadoEm: string } | null
  buscadoEm: string | null
  erro: string | null
}

export async function ligacaoDoAviso(fonte: string, avisoId: number): Promise<LigacaoDoAviso> {
  const [l] = (await sql`
    SELECT d.edital_ligado_em, d.edital_buscado_em, d.edital_busca_erro,
           e.numero_controle_pncp, COALESCE(jsonb_array_length(e.arquivos_json), 0) AS anexos
    FROM diario_status d LEFT JOIN editais e ON e.id = d.edital_id
    WHERE d.fonte = ${fonte} AND d.aviso_id = ${avisoId}
  `) as Record<string, unknown>[]
  if (!l) return { edital: null, buscadoEm: null, erro: null }
  return {
    edital: l.numero_controle_pncp
      ? {
          numeroControlePncp: l.numero_controle_pncp as string,
          anexos: Number(l.anexos),
          ligadoEm: new Date(l.edital_ligado_em as string).toISOString(),
        }
      : null,
    buscadoEm: l.edital_buscado_em ? new Date(l.edital_buscado_em as string).toISOString() : null,
    erro: (l.edital_busca_erro as string | null) ?? null,
  }
}
