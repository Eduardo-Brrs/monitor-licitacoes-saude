import { ehCnpjDaEmpresa, NOME_EMPRESA, type RetratoPncp } from '@/lib/acompanhamento-pncp'
import { formatarDataCompleta, formatarNumero, formatarValorCompleto } from '@/lib/formato'

// Tela 04 do DESIGN.md: resultado por item e contrato/ata, quando o PNCP já
// tem. A coluna "Sua proposta" do desenho fica de fora — o PNCP não informa a
// proposta de quem perdeu, e a regra é só exibir quando o dado existir.

const TH = 'border-b border-border-strong px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const TD = 'border-b border-[#e9e7e1] px-2 py-2 align-top'
const CARTAO = 'flex flex-col gap-3 rounded-card border border-border bg-surface p-5'
const TITULO = 'm-0 text-[11px] font-medium uppercase tracking-[0.05em] text-faint'

function dataSemHora(valor: string | null): string {
  return valor ? formatarDataCompleta(`${valor.slice(0, 10)}T12:00:00Z`) : '—'
}

export function ResultadoPorItem({ retrato }: { retrato: RetratoPncp }) {
  // Só itens que já saíram de "Em andamento" ou têm resultado.
  const itens = retrato.itens.filter((i) => i.situacaoId !== 1 || (i.resultados ?? []).length > 0)
  if (itens.length === 0) return null

  const ganhos = itens.filter((i) => (i.resultados ?? []).some((r) => ehCnpjDaEmpresa(r.cnpj) && !r.cancelado))
  const totalHomologado = itens
    .flatMap((i) => (i.resultados ?? []).filter((r) => !r.cancelado))
    .reduce((soma, r) => soma + (r.valorTotal ?? 0), 0)

  return (
    <section className={CARTAO}>
      <div className="flex items-baseline gap-2">
        <h2 className={TITULO}>Resultado por item</h2>
        <span className="text-[12px] text-faint">
          {itens.length} de {retrato.itens.length} itens com resultado
          {ganhos.length > 0 && ` · ${ganhos.length} ganhos pela ${NOME_EMPRESA}`}
          {totalHomologado > 0 && ` · ${formatarValorCompleto(totalHomologado)} homologados`}
          {retrato.resultadosPendentes > 0 && ` · ${retrato.resultadosPendentes} ainda carregando`}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-[12.5px]">
        <colgroup>
          <col className="w-[52px]" />
          <col />
          <col className="w-[210px]" />
          <col className="w-[70px]" />
          <col className="w-[120px]" />
          <col className="w-[130px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>Item</th>
            <th scope="col" className={TH}>Descrição</th>
            <th scope="col" className={TH}>Vencedor</th>
            <th scope="col" className={`${TH} text-right`}>Qtd</th>
            <th scope="col" className={`${TH} text-right`}>Homologado (un.)</th>
            <th scope="col" className={`${TH} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const resultados = (item.resultados ?? []).filter((r) => !r.cancelado)
            if (resultados.length === 0) {
              return (
                <tr key={item.numero}>
                  <td className={`${TD} font-mono`}>{String(item.numero).padStart(2, '0')}</td>
                  <td className={`${TD} text-ink-2`}>
                    <span className="line-clamp-2">{item.descricao}</span>
                  </td>
                  <td className={`${TD} text-faint`} colSpan={4}>
                    {item.resultados === null ? 'resultado ainda não carregado' : (item.situacao ?? '—')}
                  </td>
                </tr>
              )
            }
            return resultados.map((r, indice) => {
              const nosso = ehCnpjDaEmpresa(r.cnpj)
              return (
                <tr key={`${item.numero}-${indice}`} className={nosso ? 'bg-accent-soft/40' : ''}>
                  <td className={`${TD} font-mono`}>{indice === 0 ? String(item.numero).padStart(2, '0') : ''}</td>
                  <td className={`${TD} text-ink-2`}>
                    {indice === 0 && <span className="line-clamp-2" title={item.descricao}>{item.descricao}</span>}
                  </td>
                  <td className={TD}>
                    {nosso ? (
                      <span className="rounded-badge bg-accent-soft px-1.5 py-0.5 font-medium text-accent-strong">
                        {NOME_EMPRESA}
                      </span>
                    ) : (
                      <span className="line-clamp-2" title={r.fornecedor}>{r.fornecedor}</span>
                    )}
                  </td>
                  <td className={`${TD} text-right font-mono`}>{formatarNumero(r.quantidade)}</td>
                  <td className={`${TD} text-right font-mono`}>{formatarValorCompleto(r.valorUnitario)}</td>
                  <td className={`${TD} text-right font-mono`}>{formatarValorCompleto(r.valorTotal)}</td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </section>
  )
}

export function ContratosEAtas({ retrato }: { retrato: RetratoPncp }) {
  if (retrato.contratos.length === 0 && retrato.atas.length === 0) return null

  return (
    <section className={CARTAO}>
      <h2 className={TITULO}>{retrato.contratos.length > 0 ? 'Contrato' : 'Ata de registro de preços'}</h2>
      {retrato.contratos.map((c) => (
        <dl key={`c${c.sequencial}`} className="m-0 grid grid-cols-4 gap-4">
          {[
            ['Fornecedor', ehCnpjDaEmpresa(c.cnpj) ? NOME_EMPRESA : c.fornecedor],
            ['Valor global', formatarValorCompleto(c.valorGlobal)],
            ['Assinatura', dataSemHora(c.assinatura)],
            ['Vigência', c.vigenciaFim ? `até ${dataSemHora(c.vigenciaFim)}` : '—'],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col gap-1">
              <dt className="text-[11px] uppercase tracking-[0.05em] text-faint">{rotulo}</dt>
              <dd className="m-0 text-[13px] text-ink">{valor}</dd>
            </div>
          ))}
        </dl>
      ))}
      {retrato.atas.map((a) => (
        <dl key={`a${a.sequencial}`} className="m-0 grid grid-cols-4 gap-4">
          {[
            ['Ata', a.numero ? `nº ${a.numero}` : '—'],
            ['Situação', a.cancelada ? 'cancelada' : 'vigente'],
            ['Assinatura', dataSemHora(a.assinatura)],
            ['Vigência', a.vigenciaFim ? `até ${dataSemHora(a.vigenciaFim)}` : '—'],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col gap-1">
              <dt className="text-[11px] uppercase tracking-[0.05em] text-faint">{rotulo}</dt>
              <dd className="m-0 text-[13px] text-ink">{valor}</dd>
            </div>
          ))}
        </dl>
      ))}
      {retrato.contratos.length === 0 && (
        <p className="m-0 text-[12px] text-faint">
          Registro de preços: a ata não informa fornecedor — quem venceu cada item está no resultado acima.
        </p>
      )}
    </section>
  )
}
