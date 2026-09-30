import Link from 'next/link'
import { fontesComProblema, type SaudeDaFonte } from '@/lib/saude'

// Faixa no topo de toda tela quando alguma captura está com problema — quem
// usa precisa saber que o boletim pode estar incompleto, não descobrir por
// acaso dias depois.
export function AvisoFontes({ fontes }: { fontes: SaudeDaFonte[] }) {
  if (fontes.length === 0) return null
  const nomes = [...new Set(fontes.map((f) => f.nome))].join(', ')

  return (
    <div className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-6 py-2 text-[12.5px] text-warn-strong">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn" />
      <span className="grow">
        Captura com problema: <strong className="font-semibold">{nomes}</strong>. O que foi publicado nesse meio-tempo
        pode ainda não estar no boletim.
      </span>
      <Link href="/saude" className="shrink-0 font-medium text-warn-strong underline">
        ver status
      </Link>
    </div>
  )
}

// Versão que busca sozinha, pro layout (que não é async).
export async function AvisoFontesDoLayout() {
  return <AvisoFontes fontes={await fontesComProblema()} />
}
