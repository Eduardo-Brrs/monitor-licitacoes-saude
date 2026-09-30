import type { PncpItem } from '@/lib/pncp'
import { formatarNumero, formatarValorCompleto } from '@/lib/formato'

type Props = {
  // null quando o PNCP não respondeu — estado diferente de "a compra não tem
  // item", e a tela precisa dizer qual dos dois é.
  itens: PncpItem[] | null
  deInteresse: PncpItem[]
  // O órgão excluiu a compra do PNCP (404) — não é instabilidade.
  removidaDoPncp?: boolean
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
      {children}
    </section>
  )
}

function Titulo({ complemento }: { complemento?: string }) {
  return (
    <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-2">
      Itens de interesse
      {complemento && (
        <span className="font-normal normal-case tracking-normal text-faint"> — {complemento}</span>
      )}
    </h2>
  )
}

export function ItensInteresse({ itens, deInteresse, removidaDoPncp = false }: Props) {
  if (itens === null) {
    return (
      <Moldura>
        <Titulo />
        <p className="m-0 text-[13px] text-muted">
          {removidaDoPncp
            ? 'Este edital foi removido do PNCP pelo órgão depois de publicado, então a lista de itens não está mais lá.'
            : 'Ainda não conseguimos buscar os itens no PNCP — o portal deles está instável. O sistema tenta de novo sozinho a cada 30 minutos.'}
        </p>
      </Moldura>
    )
  }

  if (deInteresse.length === 0) {
    return (
      <Moldura>
        <Titulo complemento={`nenhum dos ${itens.length} itens bate com seu catálogo`} />
        <p className="m-0 text-[13px] text-muted">
          O edital entrou na lista pelo texto do objeto, não por um item específico.
        </p>
      </Moldura>
    )
  }

  return (
    <Moldura>
      <Titulo
        complemento={`${deInteresse.length} de ${itens.length} ${
          itens.length === 1 ? 'item bate' : 'itens batem'
        } com seu catálogo`}
      />
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.05em] text-faint">
            <th scope="col" className="border-b border-border py-[7px] text-left font-medium">
              Item
            </th>
            <th scope="col" className="border-b border-border px-2 py-[7px] text-left font-medium">
              Descrição
            </th>
            <th scope="col" className="border-b border-border px-2 py-[7px] text-right font-medium">
              Qtd
            </th>
            <th scope="col" className="border-b border-border py-[7px] text-right font-medium">
              Valor unit. ref.
            </th>
          </tr>
        </thead>
        <tbody>
          {deInteresse.map((item) => (
            <tr key={item.numeroItem}>
              <td className="border-b border-[#f0eee9] py-[9px] font-mono">{item.numeroItem}</td>
              <td className="border-b border-[#f0eee9] px-2 py-[9px]">{item.descricao}</td>
              <td className="border-b border-[#f0eee9] px-2 py-[9px] text-right font-mono">
                {formatarNumero(item.quantidade)}
                {item.unidadeMedida ? ` ${item.unidadeMedida}` : ''}
              </td>
              <td className="border-b border-[#f0eee9] py-[9px] text-right font-mono">
                {item.orcamentoSigiloso ? 'sigiloso' : formatarValorCompleto(item.valorUnitarioEstimado)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Moldura>
  )
}
