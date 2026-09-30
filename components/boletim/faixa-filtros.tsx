import { TODOS_TERMOS } from '@/lib/keywords'
import { MODALIDADES_MONITORADAS, UF_MONITORADA } from '@/lib/pncp'

const TERMOS_VISIVEIS = 4

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border-strong bg-surface px-[11px] py-1.5 text-[12.5px]">
      {children}
    </span>
  )
}

// Lê a configuração real do sync em vez de texto fixo: se a UF, as modalidades
// ou o catálogo de termos mudarem, a faixa acompanha sozinha e não passa a
// anunciar um filtro que o sync não aplica.
export function FaixaFiltros() {
  const amostraDeTermos = TODOS_TERMOS.slice(0, TERMOS_VISIVEIS).join(', ')
  const restantes = TODOS_TERMOS.length - TERMOS_VISIVEIS

  return (
    <div className="flex items-center gap-2 border-b border-border px-6 py-3.5">
      <span className="mr-0.5 text-xs text-muted">Monitorando</span>
      <Chip>{UF_MONITORADA}</Chip>
      <Chip>
        {amostraDeTermos}
        {restantes > 0 ? ` +${restantes}` : ''}
      </Chip>
      <Chip>{MODALIDADES_MONITORADAS.map((m) => m.nome).join(' · ')}</Chip>
      {/* Fontes além do PNCP (seção "Só nos diários"). Fixo porque a lista de
          diários mora em código, não em configuração. */}
      <Chip>Diários: DOE/AL · AMA · Maceió</Chip>
      <div className="grow" />
      <span className="font-mono text-[11.5px] text-muted">
        J / K navegar · F favoritar · D descartar
      </span>
    </div>
  )
}
