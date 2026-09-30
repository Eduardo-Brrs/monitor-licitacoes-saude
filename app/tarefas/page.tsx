import Link from 'next/link'
import { LinhaTarefa } from '@/components/acompanhamento/linha-tarefa'
import { listarResponsaveis, listarTodasAsTarefas, type TarefaComItem } from '@/lib/acompanhamento'
import { diaEmMaceio } from '@/lib/formato'

// Todas as tarefas, de todos os editais e avisos, por prazo. Criar tarefa
// continua sendo na lateral do item — aqui é o painel do dia a dia.

function somarDias(dia: string, n: number): string {
  const data = new Date(`${dia}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + n)
  return data.toISOString().slice(0, 10)
}

function Grupo({ titulo, tarefas, alerta }: { titulo: string; tarefas: TarefaComItem[]; alerta?: boolean }) {
  if (tarefas.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      <h2
        className={`m-0 px-0.5 text-[11px] font-medium uppercase tracking-[0.05em] ${alerta ? 'text-warn' : 'text-faint'}`}
      >
        {titulo} · {tarefas.length}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {tarefas.map((t) => (
          <LinhaTarefa
            key={t.id}
            id={t.id}
            descricao={t.descricao}
            responsavel={t.responsavel?.nome ?? null}
            prazo={t.prazo}
            concluida={t.concluida}
            itemObjeto={t.itemObjeto}
            itemHref={t.itemHref}
          />
        ))}
      </ul>
    </section>
  )
}

export default async function Tarefas({ searchParams }: PageProps<'/tarefas'>) {
  const params = await searchParams
  const [todas, responsaveis] = await Promise.all([listarTodasAsTarefas(), listarResponsaveis()])

  const respId = Number(params.resp)
  const responsavelFiltro = responsaveis.find((r) => r.id === respId) ?? null
  const doFiltro = responsavelFiltro ? todas.filter((t) => t.responsavel?.id === responsavelFiltro.id) : todas

  const hoje = diaEmMaceio(new Date())
  const fimDaSemana = somarDias(hoje, 7)
  const pendentes = doFiltro.filter((t) => !t.concluida)
  const atrasadas = pendentes.filter((t) => t.prazo !== null && t.prazo < hoje)
  const semana = pendentes.filter((t) => t.prazo !== null && t.prazo >= hoje && t.prazo <= fimDaSemana)
  const depois = pendentes.filter((t) => t.prazo !== null && t.prazo > fimDaSemana)
  const semPrazo = pendentes.filter((t) => t.prazo === null)
  const concluidas = doFiltro.filter((t) => t.concluida)

  const pilula = (ativo: boolean) =>
    `flex h-[34px] items-center gap-1.5 rounded-full border px-[13px] text-[12.5px] no-underline ${
      ativo ? 'border-ink bg-ink font-medium text-white' : 'border-border-strong bg-surface text-ink hover:bg-bg'
    }`
  const pendentesDe = (id: number | null) =>
    todas.filter((t) => !t.concluida && (id === null || t.responsavel?.id === id)).length

  return (
    <>
      <header className="flex items-end gap-4 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
        <div className="flex grow flex-col gap-1">
          <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">Tarefas</h1>
          <p className="m-0 text-[13px] text-muted">
            {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
            {atrasadas.length > 0 && ` · ${atrasadas.length} ${atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}`}
            {' · '}crie tarefas na tela de cada edital
          </p>
        </div>
      </header>

      <div className="flex items-center gap-[7px] border-b border-border px-6 py-3.5">
        <Link href="/tarefas" className={pilula(responsavelFiltro === null)}>
          Todos <span className="font-mono opacity-75">{pendentesDe(null)}</span>
        </Link>
        {responsaveis.map((r) => (
          <Link key={r.id} href={`/tarefas?resp=${r.id}`} className={pilula(responsavelFiltro?.id === r.id)}>
            {r.nome} <span className="font-mono opacity-75">{pendentesDe(r.id)}</span>
          </Link>
        ))}
      </div>

      <div className="flex grow flex-col gap-5 bg-bg px-6 py-4">
        {doFiltro.length === 0 ? (
          <p className="m-0 py-12 text-center text-[13px] text-muted">
            Nenhuma tarefa{responsavelFiltro ? ` de ${responsavelFiltro.nome}` : ''}. Abra um edital e use “Criar tarefa”
            na lateral.
          </p>
        ) : (
          <>
            <Grupo titulo="Atrasadas" tarefas={atrasadas} alerta />
            <Grupo titulo="Próximos 7 dias" tarefas={semana} />
            <Grupo titulo="Depois" tarefas={depois} />
            <Grupo titulo="Sem prazo" tarefas={semPrazo} />
            {concluidas.length > 0 && (
              <details className="flex flex-col gap-1.5">
                <summary className="cursor-pointer px-0.5 text-[12.5px] text-accent">
                  {concluidas.length} {concluidas.length === 1 ? 'concluída' : 'concluídas'}
                </summary>
                <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
                  {concluidas.map((t) => (
                    <LinhaTarefa
                      key={t.id}
                      id={t.id}
                      descricao={t.descricao}
                      responsavel={t.responsavel?.nome ?? null}
                      prazo={t.prazo}
                      concluida={t.concluida}
                      itemObjeto={t.itemObjeto}
                      itemHref={t.itemHref}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </>
  )
}
