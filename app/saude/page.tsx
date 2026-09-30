import { explicarErro, saudeDasFontes, type EstadoFonte } from '@/lib/saude'
import { formatarDataHora } from '@/lib/formato'

// Status das fontes — ver lib/saude.ts.

const ESTILO: Record<EstadoFonte, { rotulo: string; classe: string }> = {
  ok: { rotulo: 'Funcionando', classe: 'bg-accent-soft text-accent-strong' },
  instavel: { rotulo: 'Instável', classe: 'bg-[#edebe5] text-ink-2' },
  problema: { rotulo: 'Com problema', classe: 'bg-warn-soft text-warn-strong' },
}

function haQuanto(iso: string | null): string {
  if (!iso) return 'nunca'
  const minutos = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `há ${horas}h`
  return `há ${Math.floor(horas / 24)} dias`
}

export default async function Saude() {
  const fontes = await saudeDasFontes()
  const comProblema = fontes.filter((f) => f.estado === 'problema').length

  return (
    <>
      <header className="flex flex-col gap-1 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
        <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">Status das fontes</h1>
        <p className="m-0 text-[13px] text-muted">
          {comProblema === 0
            ? 'Todas as capturas rodaram dentro do esperado.'
            : `${comProblema} ${comProblema === 1 ? 'captura está' : 'capturas estão'} com problema — o boletim pode estar incompleto.`}
        </p>
      </header>

      <div className="flex grow flex-col gap-2 bg-bg px-6 py-4">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {fontes.map((f) => (
            <li key={f.tipo} className="flex items-start gap-4 rounded-card border border-border bg-surface px-[18px] py-3.5">
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-ink">
                  {f.nome} <span className="font-normal text-muted">· {f.descricao}</span>
                </span>
                <span className="text-[12px] text-faint">Roda {f.frequencia}</span>
                {f.ultimoErro && (
                  <span className="mt-1 text-[12px] text-ink-2">
                    Última falha: {explicarErro(f.ultimoErro)}.{' '}
                    <span className="font-mono text-[11px] text-faint" title={f.ultimoErro}>
                      {f.ultimoErro.slice(0, 90)}
                      {f.ultimoErro.length > 90 ? '…' : ''}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex w-[230px] shrink-0 flex-col items-end gap-1 text-right">
                <span className={`rounded-badge px-2 py-0.5 text-[11.5px] font-medium ${ESTILO[f.estado].classe}`}>
                  {ESTILO[f.estado].rotulo}
                </span>
                <span className="text-[12px] text-ink-2">
                  Último sucesso {haQuanto(f.ultimoSucesso)}
                  {f.ultimoSucesso && <span className="text-faint"> · {formatarDataHora(f.ultimoSucesso)}</span>}
                </span>
                {f.motivo && <span className={`text-[11.5px] ${f.estado === 'problema' ? 'text-warn' : 'text-faint'}`}>{f.motivo}</span>}
              </div>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-2 px-0.5 text-[12.5px] leading-relaxed text-muted">
          O PNCP e os diários saem do ar com frequência; falha isolada se resolve sozinha na execução seguinte, e
          nada se perde porque cada captura reconsulta os últimos dias. Só vira “Com problema” quando fica tempo
          demais sem nenhuma captura bem-sucedida.
        </p>
      </div>
    </>
  )
}
