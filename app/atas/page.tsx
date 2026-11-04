import Link from 'next/link'
import { listarAtas, type AtaComItens } from '@/lib/atas'
import {
  contasDaAta,
  diasAte,
  formatarData,
  formatarDinheiro,
  formatarMargem,
  situacaoDaValidade,
  type SituacaoValidade,
} from '@/lib/atas-tipos'
import { diaEmMaceio } from '@/lib/formato'

// Atas e contratos ganhos (pedido do usuário, 2026-10-27): o que vem depois de
// "Finalizar → ganhamos" no Gerenciar. Substitui a planilha de atas válidas.

type Aba = 'vigentes' | 'vencendo' | 'vencidas' | 'todas'

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'vigentes', rotulo: 'Em vigor' },
  { valor: 'vencendo', rotulo: 'Vencendo em 60 dias' },
  { valor: 'vencidas', rotulo: 'Vencidas' },
  { valor: 'todas', rotulo: 'Todas' },
]

function passa(situacao: SituacaoValidade, aba: Aba): boolean {
  if (aba === 'todas') return true
  if (aba === 'vencidas') return situacao === 'vencida'
  if (aba === 'vencendo') return situacao === 'vencendo'
  return situacao !== 'vencida'
}

const TH = 'border-b border-border-strong px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-faint'
const TD = 'border-b border-[#e9e7e1] px-2 py-[10px] align-middle'

const CURTO = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export default async function Atas({ searchParams }: PageProps<'/atas'>) {
  const params = await searchParams
  const aba: Aba = ABAS.some((a) => a.valor === params.aba) ? (params.aba as Aba) : 'vigentes'
  const hoje = diaEmMaceio(new Date())

  const todas = (await listarAtas()).map((a) => ({
    ata: a,
    contas: contasDaAta(a.itens),
    situacao: situacaoDaValidade(a.validade, hoje),
  }))
  const lista = todas.filter((a) => passa(a.situacao, aba))
  const emVigor = todas.filter((a) => a.situacao !== 'vencida')
  const saldoEmVigor = emVigor.reduce((s, a) => s + a.contas.saldo, 0)
  const vendaEmVigor = emVigor.reduce((s, a) => s + a.contas.valorVenda, 0)

  return (
    <>
      <header className="flex items-end gap-4 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
        <div className="flex grow flex-col gap-1">
          <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">Atas e contratos</h1>
          <p className="m-0 text-[13px] text-muted">
            {emVigor.length} em vigor
            {vendaEmVigor > 0 && ` · R$ ${CURTO.format(vendaEmVigor)} vendidos`}
            {saldoEmVigor > 0 && (
              <span className="text-accent-strong">{` · R$ ${CURTO.format(saldoEmVigor)} a pedir`}</span>
            )}
          </p>
        </div>
        <a
          href={`/atas/csv${aba !== 'todas' ? `?aba=${aba}` : ''}`}
          download
          className="flex h-10 items-center gap-2 rounded-control border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-bg"
        >
          Exportar planilha
        </a>
        <Link
          href="/atas/nova"
          className="flex h-10 items-center rounded-control border border-accent bg-accent px-3.5 text-[13px] font-medium text-white no-underline hover:bg-accent-strong"
        >
          + Nova ata ou contrato
        </Link>
      </header>

      <div className="flex items-center gap-[7px] border-b border-border px-6 py-3.5">
        {ABAS.map(({ valor, rotulo }) => {
          const ativo = valor === aba
          const n = todas.filter((a) => passa(a.situacao, valor)).length
          return (
            <Link
              key={valor}
              href={valor === 'vigentes' ? '/atas' : `/atas?aba=${valor}`}
              aria-current={ativo ? 'page' : undefined}
              className={`flex h-[34px] items-center gap-1.5 rounded-full border px-[13px] text-[12.5px] no-underline ${
                ativo ? 'border-ink bg-ink font-medium text-white' : 'border-border-strong bg-surface text-ink hover:bg-bg'
              }`}
            >
              {rotulo}
              <span className={`font-mono ${ativo ? 'opacity-75' : 'text-faint'}`}>{n}</span>
            </Link>
          )
        })}
      </div>

      <div className="flex grow flex-col bg-bg px-6 py-3">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center text-[13px] text-muted">
            <p className="m-0">{todas.length === 0 ? 'Nenhuma ata ou contrato registrado ainda.' : 'Nenhuma ata nesta aba.'}</p>
            {todas.length === 0 && (
              <p className="m-0 text-faint">
                Registre por &ldquo;+ Nova ata ou contrato&rdquo;, ou pelo botão &ldquo;Registrar itens ganhos&rdquo; de uma
                licitação finalizada como ganha.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col />
              <col className="w-[120px]" />
              <col className="w-[60px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH}>Ata / contrato</th>
                <th scope="col" className={TH}>Validade</th>
                <th scope="col" className={`${TH} text-right`}>Itens</th>
                <th scope="col" className={`${TH} text-right`}>Vendido</th>
                <th scope="col" className={`${TH} text-right`}>Pedido</th>
                <th scope="col" className={`${TH} text-right`}>Saldo a pedir</th>
                <th scope="col" className={`${TH} text-right`}>Margem</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(({ ata, contas, situacao }) => (
                <LinhaAta key={ata.id} ata={ata} contas={contas} situacao={situacao} hoje={hoje} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function LinhaAta({
  ata,
  contas,
  situacao,
  hoje,
}: {
  ata: AtaComItens
  contas: ReturnType<typeof contasDaAta>
  situacao: SituacaoValidade
  hoje: string
}) {
  const href = `/atas/${ata.id}`
  return (
    <tr className={`hover:bg-surface-muted ${situacao === 'vencida' ? 'text-muted' : ''}`}>
      <td className={TD}>
        <Link href={href} className="flex min-w-0 flex-col gap-0.5 no-underline">
          <span className="truncate font-medium text-ink hover:text-accent">
            {ata.orgao} · {ata.numero}
          </span>
          <span className="truncate text-[12px] text-muted">
            {[ata.tipo === 'contrato' ? 'Contrato' : 'Ata', ata.edital && `edital ${ata.edital}`, ata.destino]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </Link>
      </td>
      <td className={TD}>
        <span
          className={`font-mono ${situacao === 'vencendo' ? 'text-warn' : situacao === 'vencida' ? 'text-faint line-through' : ''}`}
        >
          {formatarData(ata.validade)}
        </span>
        {situacao === 'vencendo' && ata.validade && (
          <span className="block text-[11.5px] text-warn">em {diasAte(ata.validade, hoje)} dias</span>
        )}
        {ata.prorrogacao && <span className="block truncate text-[11.5px] text-faint" title={ata.prorrogacao}>{ata.prorrogacao}</span>}
      </td>
      <td className={`${TD} text-right font-mono`}>{contas.itens}</td>
      <td className={`${TD} text-right font-mono`}>{formatarDinheiro(contas.valorVenda)}</td>
      <td className={`${TD} text-right font-mono`}>{formatarDinheiro(contas.pedido)}</td>
      <td className={`${TD} text-right font-mono font-medium`}>{formatarDinheiro(contas.saldo)}</td>
      <td className={`${TD} text-right font-mono`}>{formatarMargem(contas.margemAtual)}</td>
    </tr>
  )
}
