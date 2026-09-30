import Link from 'next/link'
import type { DiaDoArquivo } from '@/lib/arquivo'
import { diaEmMaceio, formatarDiaDoBoletim } from '@/lib/formato'

const TH = 'border-b border-border-strong px-2 py-2 text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const TD = 'border-b border-[#e9e7e1] px-2 py-[11px]'

export function TabelaDoMes({ dias }: { dias: DiaDoArquivo[] }) {
  const hoje = diaEmMaceio(new Date())

  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <colgroup>
        <col className="w-[200px]" />
        <col className="w-[150px]" />
        <col className="w-[150px]" />
        <col className="w-[120px]" />
        <col className="w-[130px]" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={`${TH} pl-0 text-left`}>
            Boletim
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Publicados em AL
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Da área da saúde
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Não vistos
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Favoritados
          </th>
          <th scope="col" className={TH}>
            <span className="sr-only">Abrir</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {dias.map((d) => {
          const vazio = d.publicados === 0
          const href = `/boletim/${d.dia}`
          return (
            <tr key={d.dia} className="hover:bg-surface-muted">
              <td className={`${TD} pl-0`}>
                {vazio ? (
                  <span className="font-semibold text-faint">{formatarDiaDoBoletim(d.dia)}</span>
                ) : (
                  <Link href={href} className="font-semibold text-ink no-underline hover:text-accent">
                    {formatarDiaDoBoletim(d.dia)}
                  </Link>
                )}{' '}
                {d.dia === hoje && <span className="text-[11.5px] text-accent">hoje</span>}
              </td>
              <td className={`${TD} text-right font-mono`}>{d.publicados}</td>
              <td className={`${TD} text-right font-mono`}>{d.nosFiltros}</td>
              <td
                className={`${TD} text-right font-mono ${d.naoVistos > 0 ? 'font-medium text-warn' : 'text-faint'}`}
              >
                {d.naoVistos}
              </td>
              <td className={`${TD} text-right font-mono`}>{d.favoritados}</td>
              <td className={`${TD} text-right`}>
                {vazio ? (
                  <span className="text-[12.5px] text-faint">sem publicação</span>
                ) : (
                  <Link href={href} className="text-[12.5px] text-accent hover:text-accent-strong">
                    abrir
                  </Link>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
