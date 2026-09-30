import { Nav } from '@/components/shell/nav'
import { contarNaoVistosAcumulado, ultimoSyncEm } from '@/lib/boletim'
import { contarAvisosNaoVistosRecentes } from '@/lib/diarios'
import { contarTarefasUrgentes } from '@/lib/acompanhamento'
import { fontesComProblema } from '@/lib/saude'
import Link from 'next/link'

// "Hoje 10h40" / "27/09 20h27" — só a hora enganava quando o último sync era de ontem.
function formatarHora(data: Date): string {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', hour: '2-digit', minute: '2-digit' })
    .format(data)
    .replace(':', 'h')
  if (dia(data) === dia(new Date())) return `hoje ${hora}`
  const ddmm = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', day: '2-digit', month: '2-digit' }).format(data)
  return `${ddmm} ${hora}`
}

export async function Sidebar() {
  // Badge = editais não vistos (acumulado) + avisos relevantes não vistos dos
  // últimos 7 dias — ver contarAvisosNaoVistosRecentes pro porquê da janela.
  const [editaisNaoVistos, avisosNaoVistos, sincronizadoEm, tarefasUrgentes, comProblema] = await Promise.all([
    contarNaoVistosAcumulado(),
    contarAvisosNaoVistosRecentes(),
    ultimoSyncEm(),
    contarTarefasUrgentes(),
    fontesComProblema(),
  ])
  const naoVistos = editaisNaoVistos + avisosNaoVistos

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-7 bg-sidebar px-4 py-6 text-[#edebe5]">
      <div className="flex flex-col gap-0.5 pl-2">
        <span className="font-display text-[22px] font-semibold -tracking-[0.01em]">Boletim</span>
        <span className="text-[11.5px] uppercase tracking-[0.04em] text-[#9a9a93]">
          {process.env.NOME_EMPRESA ?? "Licitações"}
        </span>
      </div>

      <Nav naoVistos={naoVistos} tarefasUrgentes={tarefasUrgentes} />

      <div className="grow" />

      {/* Rodapé leva ao status das fontes (2026-09-28): é onde se vê se a
          captura está em dia. Acende em --warn quando alguma está com problema. */}
      <Link
        href="/saude"
        title="Status das fontes de dados"
        className="flex items-center gap-2.5 rounded-control border-t border-[#2c3038] p-2.5 no-underline hover:bg-sidebar-active/60"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white ${
            comProblema.length > 0 ? 'bg-warn' : 'bg-accent'
          }`}
        >
          AM
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[12.5px] text-[#edebe5]">Status das fontes</span>
          <span className={`truncate text-[11px] ${comProblema.length > 0 ? 'text-[#e3b7a4]' : 'text-[#9a9a93]'}`}>
            {comProblema.length > 0
              ? `${comProblema.length} com problema`
              : sincronizadoEm
                ? `PNCP ${formatarHora(sincronizadoEm)}`
                : 'Sem sync ainda'}
          </span>
        </div>
      </Link>
    </nav>
  )
}
