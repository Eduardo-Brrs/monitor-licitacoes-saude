import {
  ehEtapa,
  ROTULO_ETAPA,
  type EventoLinha,
  type FonteItem,
  type TipoEventoLinha,
} from '@/lib/acompanhamento-tipos'
import type { EventoDaLinhaDoTempo } from '@/lib/acompanhamento-pncp'
import { sql } from '@/lib/db'
import { formatarDiaMes } from '@/lib/formato'

// Linha do tempo do item (pedido do usuário, 2026-10-23, inspirada na do
// ConLicitação): numa lista só, por data, o que a gente anotou (notas e
// respostas às tarefas), o que fez (etapa, tarefas) e o que o PNCP mostrou
// (lib/acompanhamento-pncp.ts, só edital). É o "raciocínio" do edital.

const TIPOS_PNCP: TipoEventoLinha[] = ['ligacao', 'publicacao', 'abertura', 'retificacao', 'vitoria']

function iso(valor: unknown): string | null {
  return valor ? new Date(valor as string).toISOString() : null
}

function descricaoDaEtapa(etapa: string | null, detalhe: string | null): string {
  if (detalhe) return detalhe
  if (etapa === null) return 'Removida de Gerenciar licitações'
  return ehEtapa(etapa) ? `Marcada como ${ROTULO_ETAPA[etapa]}` : `Marcada como ${etapa}`
}

// Fatos do PNCP (e datas do próprio edital) vêm prontos da página.
export function eventosDoPncp(eventos: EventoDaLinhaDoTempo[]): EventoLinha[] {
  return eventos.map((e, i) => ({
    chave: `pncp:${i}`,
    tipo: (TIPOS_PNCP as string[]).includes(e.tipo) ? (e.tipo as TipoEventoLinha) : 'pncp',
    descricao: e.descricao,
    quando: e.dataFato ?? e.capturadoEm,
    capturadoEm: e.capturadoEm,
    nota: null,
  }))
}

export async function carregarLinhaDoTempo(
  fonte: FonteItem,
  itemId: number,
  doPncp: EventoLinha[] = []
): Promise<EventoLinha[]> {
  const [notas, etapas, tarefas] = (await Promise.all([
    sql`
      SELECT n.id, n.texto, n.criada_em, n.editada_em, n.tarefa_id, r.nome AS autor, t.descricao AS tarefa_descricao
      FROM notas n
      LEFT JOIN responsaveis r ON r.id = n.autor_id
      LEFT JOIN tarefas t ON t.id = n.tarefa_id
      WHERE n.fonte = ${fonte} AND n.item_id = ${itemId} AND n.apagada_em IS NULL
    `,
    sql`SELECT id, etapa, detalhe, em FROM etapa_eventos WHERE fonte = ${fonte} AND item_id = ${itemId}`,
    sql`
      SELECT t.id, t.descricao, t.prazo, t.criada_em, t.concluida_em, r.nome AS responsavel
      FROM tarefas t LEFT JOIN responsaveis r ON r.id = t.responsavel_id
      WHERE t.fonte = ${fonte} AND t.item_id = ${itemId}
    `,
  ])) as Record<string, unknown>[][]

  const eventos: EventoLinha[] = [
    ...doPncp,
    ...notas.map((n): EventoLinha => {
      // Tarefa respondida e depois excluída: tarefa_id virou NULL, mas a nota
      // continua sendo resposta — não dá pra saber, então vira nota comum.
      const resposta = n.tarefa_id !== null
      return {
        chave: `nota:${n.id}`,
        tipo: resposta ? 'resposta' : 'nota',
        descricao: n.texto as string,
        quando: iso(n.criada_em),
        capturadoEm: null,
        nota: {
          id: n.id as number,
          texto: n.texto as string,
          autor: (n.autor as string | null) ?? null,
          editadaEm: iso(n.editada_em),
          tarefa: resposta ? { descricao: (n.tarefa_descricao as string | null) ?? null } : null,
        },
      }
    }),
    ...etapas.map((e): EventoLinha => ({
      chave: `etapa:${e.id}`,
      tipo: 'etapa',
      descricao: descricaoDaEtapa(e.etapa as string | null, (e.detalhe as string | null) ?? null),
      quando: iso(e.em),
      capturadoEm: null,
      nota: null,
    })),
    ...tarefas.flatMap((t): EventoLinha[] => {
      const quem = t.responsavel ? ` para ${t.responsavel}` : ''
      const prazo = t.prazo ? `, prazo ${formatarDiaMes(`${iso(t.prazo)!.slice(0, 10)}T12:00:00Z`)}` : ''
      const criada: EventoLinha = {
        chave: `tarefa:${t.id}`,
        tipo: 'tarefa_criada',
        descricao: `Tarefa criada${quem}: "${t.descricao}"${prazo}`,
        quando: iso(t.criada_em),
        capturadoEm: null,
        nota: null,
      }
      if (!t.concluida_em) return [criada]
      return [
        criada,
        {
          chave: `tarefa-concluida:${t.id}`,
          tipo: 'tarefa_concluida',
          descricao: `Tarefa concluída: "${t.descricao}"`,
          quando: iso(t.concluida_em),
          capturadoEm: null,
          nota: null,
        },
      ]
    }),
  ]

  // Mais recente em cima. Data futura (limite da proposta) fica no topo, que
  // é o que interessa de um edital aberto.
  return eventos.sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))
}
