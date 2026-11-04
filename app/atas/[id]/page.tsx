import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormAta } from '@/components/atas/form-ata'
import { ItensDaAta } from '@/components/atas/itens'
import { buscarAta } from '@/lib/atas'
import { diasAte, situacaoDaValidade } from '@/lib/atas-tipos'
import { diaEmMaceio } from '@/lib/formato'

export default async function AtaDetalhe({ params }: PageProps<'/atas/[id]'>) {
  const { id } = await params
  const numero = Number(id)
  if (!Number.isInteger(numero)) notFound()
  const ata = await buscarAta(numero)
  if (!ata) notFound()

  const hoje = diaEmMaceio(new Date())
  const situacao = situacaoDaValidade(ata.validade, hoje)

  return (
    <>
      <header className="flex flex-col gap-1 border-b border-border bg-surface-muted px-6 pb-4 pt-[18px]">
        <Link href="/atas" className="w-fit text-[12.5px] text-muted no-underline hover:text-accent">
          ← Atas e contratos
        </Link>
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 font-display text-[24px] font-semibold -tracking-[0.01em]">
            {ata.orgao} · {ata.numero}
          </h1>
          {situacao === 'vencida' && (
            <span className="rounded-badge bg-[#edebe5] px-2 py-0.5 text-[11.5px] text-ink-2">Vencida</span>
          )}
          {situacao === 'vencendo' && ata.validade && (
            <span className="rounded-badge bg-warn-soft px-2 py-0.5 text-[11.5px] text-warn-strong">
              Vence em {diasAte(ata.validade, hoje)} dias
            </span>
          )}
        </div>
        {ata.origem && (
          <Link href={ata.origem.href} className="w-fit text-[12.5px] text-accent no-underline hover:text-accent-strong">
            Ver a licitação no sistema
          </Link>
        )}
      </header>

      <div className="flex grow flex-col gap-5 bg-bg px-6 py-5">
        <FormAta
          ataId={ata.id}
          inicial={{
            tipo: ata.tipo,
            numero: ata.numero,
            processo: ata.processo,
            edital: ata.edital,
            orgao: ata.orgao,
            destino: ata.destino,
            prazoEntrega: ata.prazoEntrega,
            validade: ata.validade,
            prorrogacao: ata.prorrogacao,
            observacao: ata.observacao,
          }}
        />
        <ItensDaAta ataId={ata.id} itens={ata.itens} />
      </div>
    </>
  )
}
