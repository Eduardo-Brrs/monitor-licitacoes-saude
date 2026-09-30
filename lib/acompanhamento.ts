import {
  ehStatusInterno,
  type DadosDaLateral,
  type FiltroAcompanhamento,
  type FonteItem,
  type Ordenacao,
  type Responsavel,
  type StatusInterno,
  type Tarefa,
} from '@/lib/acompanhamento-tipos'
import { sql } from '@/lib/db'
import { buscarAvisosPorIds, idsPorFonteVazio, type FonteDiario } from '@/lib/diarios'
import { diaEmMaceio } from '@/lib/formato'

// Acompanhamento (docs/design/DESIGN.md, tela 03 e lateral da tela 02).
// Vale pra edital do PNCP e pra aviso de diário: a chave é (fonte, item_id),
// com fonte 'pncp' pros editais — mesmo modelo de diario_status. Tipos e
// constantes em lib/acompanhamento-tipos.ts (vão também pro navegador).

export async function listarResponsaveis(): Promise<Responsavel[]> {
  return (await sql`SELECT id, nome FROM responsaveis WHERE ativo ORDER BY id`) as Responsavel[]
}

function mapearTarefa(l: Record<string, unknown>): Tarefa {
  return {
    id: l.id as number,
    fonte: l.fonte as FonteItem,
    itemId: l.item_id as number,
    descricao: l.descricao as string,
    responsavel: l.responsavel_id ? { id: l.responsavel_id as number, nome: l.responsavel_nome as string } : null,
    prazo: l.prazo ? new Date(l.prazo as string).toISOString().slice(0, 10) : null,
    concluida: l.concluida_em !== null,
  }
}

// Pendentes primeiro, por prazo (sem prazo no fim); concluídas depois.
const ORDEM_TAREFAS = sql`t.concluida_em IS NOT NULL, t.prazo ASC NULLS LAST, t.id`

export async function dadosDaLateral(fonte: FonteItem, itemId: number): Promise<DadosDaLateral> {
  const statusQuery =
    fonte === 'pncp'
      ? sql`SELECT status_interno FROM edital_status WHERE edital_id = ${itemId}`
      : sql`SELECT status_interno FROM diario_status WHERE fonte = ${fonte} AND aviso_id = ${itemId}`

  const [status, anotacao, tarefas, responsaveis] = await Promise.all([
    statusQuery,
    sql`SELECT texto, atualizado_em FROM anotacoes WHERE fonte = ${fonte} AND item_id = ${itemId}`,
    sql`
      SELECT t.*, r.nome AS responsavel_nome
      FROM tarefas t LEFT JOIN responsaveis r ON r.id = t.responsavel_id
      WHERE t.fonte = ${fonte} AND t.item_id = ${itemId}
      ORDER BY ${ORDEM_TAREFAS}
    `,
    listarResponsaveis(),
  ])

  const valorStatus = (status as { status_interno: string | null }[])[0]?.status_interno
  const nota = (anotacao as { texto: string; atualizado_em: string }[])[0]

  return {
    statusInterno: ehStatusInterno(valorStatus) ? valorStatus : null,
    anotacao: nota ? { texto: nota.texto, atualizadoEm: new Date(nota.atualizado_em).toISOString() } : null,
    tarefas: (tarefas as Record<string, unknown>[]).map(mapearTarefa),
    responsaveis,
  }
}

// ---------------------------------------------------------------------------
// Lista do acompanhamento

export interface ItemAcompanhado {
  chave: string // `${fonte}:${id}`
  fonte: FonteItem
  id: number
  objeto: string
  detalhe: string // órgão · município · nº, ou quem publicou · diário
  href: string // tela do item dentro do sistema
  tipo: string | null // selo do aviso (null pra edital)
  favorito: boolean
  statusInterno: StatusInterno | null
  abertura: string | null
  valorEstimado: number | null
  linkPortal: string | null
  proximaTarefa: Tarefa | null
}

export function passaNoFiltro(item: ItemAcompanhado, filtro: FiltroAcompanhamento): boolean {
  if (filtro === 'todas') return true
  if (filtro === 'favoritadas') return item.favorito
  return item.statusInterno === filtro
}

// Entra no acompanhamento quem está favoritado ou tem status interno. Tirar
// dos favoritos um item com status não o tira daqui — o status é a decisão
// mais forte.
export async function listarAcompanhamento(): Promise<ItemAcompanhado[]> {
  const [editaisBruto, statusAvisos, tarefasBruto] = await Promise.all([
    sql`
      SELECT e.id, e.numero_controle_pncp, e.objeto_compra, e.orgao_razao_social, e.municipio_nome,
             e.raw_json->>'numeroCompra' AS numero_compra, e.ano_compra, e.valor_total_estimado,
             e.data_abertura_proposta, e.link_sistema_origem, s.favorito, s.status_interno
      FROM editais e
      JOIN edital_status s ON s.edital_id = e.id
      WHERE s.favorito OR s.status_interno IS NOT NULL
    `,
    sql`
      SELECT fonte, aviso_id FROM diario_status
      WHERE favorito OR status_interno IS NOT NULL
    `,
    sql`
      SELECT t.*, r.nome AS responsavel_nome
      FROM tarefas t LEFT JOIN responsaveis r ON r.id = t.responsavel_id
      WHERE t.concluida_em IS NULL
      ORDER BY ${ORDEM_TAREFAS}
    `,
  ])

  // Primeira pendente de cada item, já vem ordenada por prazo.
  const proxima = new Map<string, Tarefa>()
  for (const t of (tarefasBruto as Record<string, unknown>[]).map(mapearTarefa)) {
    const chave = `${t.fonte}:${t.itemId}`
    if (!proxima.has(chave)) proxima.set(chave, t)
  }

  const itens: ItemAcompanhado[] = (editaisBruto as Record<string, unknown>[]).map((e) => {
    const numero = e.numero_compra ? `nº ${e.numero_compra}/${e.ano_compra}` : null
    const chave = `pncp:${e.id}`
    return {
      chave,
      fonte: 'pncp' as const,
      id: e.id as number,
      objeto: e.objeto_compra as string,
      detalhe: [e.orgao_razao_social, e.municipio_nome, numero].filter(Boolean).join(' · '),
      href: `/edital/${encodeURIComponent(e.numero_controle_pncp as string)}`,
      tipo: null,
      favorito: Boolean(e.favorito),
      statusInterno: ehStatusInterno(e.status_interno) ? e.status_interno : null,
      abertura: (e.data_abertura_proposta as string | null) ?? null,
      valorEstimado: e.valor_total_estimado === null ? null : Number(e.valor_total_estimado),
      linkPortal: (e.link_sistema_origem as string | null) ?? null,
      proximaTarefa: proxima.get(chave) ?? null,
    }
  })

  const ids = idsPorFonteVazio()
  for (const s of statusAvisos as { fonte: FonteDiario; aviso_id: number }[]) {
    if (s.fonte in ids) ids[s.fonte].push(s.aviso_id)
  }

  for (const a of await buscarAvisosPorIds(ids)) {
    const chave = `${a.fonte}:${a.id}`
    itens.push({
      chave,
      fonte: a.fonte,
      id: a.id,
      objeto: a.texto,
      detalhe: [a.entidade, a.origem].filter(Boolean).join(' · '),
      href: `/aviso/${a.fonte}/${a.id}`,
      tipo: a.tipo,
      favorito: a.favorito,
      statusInterno: ehStatusInterno(a.statusInterno) ? a.statusInterno : null,
      abertura: a.dataSessao ?? prazoEstimadoDoAviso(a.fonte, a.tipo, a.dia),
      valorEstimado: null,
      linkPortal: a.url,
      proximaTarefa: proxima.get(chave) ?? null,
    })
  }

  return itens
}

// Mesma regra do boletim: cotação e aquisição judicial sem data contam como
// publicação + 5 dias (prazo típico de proposta).
function prazoEstimadoDoAviso(fonte: FonteDiario, tipo: string, dia: string): string | null {
  if (fonte !== 'judicial' && tipo !== 'Cotação') return null
  const data = new Date(`${dia}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + 5)
  return data.toISOString()
}

// Abertura mais próxima primeiro, mas o que já passou vai pro fim (mais
// recente antes): num acompanhamento, prazo vencido é histórico, não urgência.
export function ordenarAcompanhamento(itens: ItemAcompanhado[], ordem: Ordenacao): ItemAcompanhado[] {
  if (ordem === 'valor') {
    return [...itens].sort((a, b) => (b.valorEstimado ?? -1) - (a.valorEstimado ?? -1))
  }
  const hoje = diaEmMaceio(new Date())
  const chave = (i: ItemAcompanhado) => {
    if (!i.abertura) return [2, 0]
    const dia = diaEmMaceio(new Date(i.abertura))
    const t = Date.parse(i.abertura)
    return dia >= hoje ? [0, t] : [1, -t]
  }
  return [...itens].sort((a, b) => {
    const [ga, ta] = chave(a)
    const [gb, tb] = chave(b)
    return ga - gb || ta - tb
  })
}

// ---------------------------------------------------------------------------
// Tela de tarefas e badge da barra lateral

export interface TarefaComItem extends Tarefa {
  itemObjeto: string
  itemHref: string
}

export async function listarTodasAsTarefas(): Promise<TarefaComItem[]> {
  const linhas = (await sql`
    SELECT t.*, r.nome AS responsavel_nome,
           e.objeto_compra AS edital_objeto, e.numero_controle_pncp
    FROM tarefas t
    LEFT JOIN responsaveis r ON r.id = t.responsavel_id
    LEFT JOIN editais e ON t.fonte = 'pncp' AND e.id = t.item_id
    ORDER BY ${ORDEM_TAREFAS}
  `) as Record<string, unknown>[]

  const ids = idsPorFonteVazio()
  for (const l of linhas) {
    const fonte = l.fonte as FonteItem
    if (fonte !== 'pncp') ids[fonte].push(l.item_id as number)
  }
  const avisos = new Map((await buscarAvisosPorIds(ids)).map((a) => [`${a.fonte}:${a.id}`, a]))

  return linhas.map((l) => {
    const tarefa = mapearTarefa(l)
    if (tarefa.fonte === 'pncp') {
      return {
        ...tarefa,
        itemObjeto: (l.edital_objeto as string | null) ?? 'Edital removido',
        itemHref: `/edital/${encodeURIComponent((l.numero_controle_pncp as string | null) ?? '')}`,
      }
    }
    const aviso = avisos.get(`${tarefa.fonte}:${tarefa.itemId}`)
    return {
      ...tarefa,
      itemObjeto: aviso ? `${aviso.tipo} · ${aviso.texto}` : 'Aviso de diário',
      itemHref: `/aviso/${tarefa.fonte}/${tarefa.itemId}`,
    }
  })
}

// Badge de "Tarefas" na barra lateral: pendentes vencidas ou que vencem hoje.
export async function contarTarefasUrgentes(): Promise<number> {
  const hoje = diaEmMaceio(new Date())
  const linhas = (await sql`
    SELECT COUNT(*)::int AS n FROM tarefas
    WHERE concluida_em IS NULL AND prazo <= ${hoje}::date
  `) as { n: number }[]
  return linhas[0].n
}
