import { nomeDoPortal, type EditalDetalhe } from '@/lib/edital'
import { formatarDataHora, formatarValorCompleto } from '@/lib/formato'

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[11px] uppercase tracking-[0.05em] text-faint">{rotulo}</span>
      <span className="text-[13.5px] font-medium">{children}</span>
    </div>
  )
}

// situacaoAcompanhada: situação derivada do acompanhamento (lib/acompanhamento-pncp).
// O campo situacao_nome do PNCP fica em "Divulgada no PNCP" mesmo depois de
// homologado, então só aparece quando não há nada melhor.
export function GradeDados({ edital, situacaoAcompanhada }: { edital: EditalDetalhe; situacaoAcompanhada?: string | null }) {
  const portal = nomeDoPortal(edital.linkSistemaOrigem)

  return (
    <section className="grid grid-cols-4 gap-4 rounded-card border border-border bg-surface p-[18px]">
      <Campo rotulo="Órgão">{edital.orgao ?? '—'}</Campo>
      <Campo rotulo="Município">
        {edital.municipio ? `${edital.municipio}/${edital.uf}` : '—'}
      </Campo>
      <Campo rotulo="Valor estimado">
        <span className="font-mono font-normal">{formatarValorCompleto(edital.valorEstimado)}</span>
      </Campo>
      <Campo rotulo="Modo de disputa">{edital.modoDisputa ?? '—'}</Campo>
      <Campo rotulo="Propostas até">
        {formatarDataHora(edital.encerramentoProposta ?? edital.aberturaProposta)}
      </Campo>
      <Campo rotulo="Amparo legal">{edital.amparoLegal ?? '—'}</Campo>
      <Campo rotulo="Situação no PNCP">{situacaoAcompanhada ?? edital.situacao ?? '—'}</Campo>
      <Campo rotulo="Portal de disputa">
        {edital.linkSistemaOrigem && portal ? (
          <a
            href={edital.linkSistemaOrigem}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-strong"
          >
            {portal}
          </a>
        ) : (
          '—'
        )}
      </Campo>
    </section>
  )
}
