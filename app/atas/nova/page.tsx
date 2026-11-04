import Link from 'next/link'
import { FormAta } from '@/components/atas/form-ata'
import { ehFonteItem } from '@/lib/acompanhamento-tipos'
import type { DadosAta } from '@/lib/atas-tipos'
import { sql } from '@/lib/db'
import { buscarAvisosPorIds, idsPorFonteVazio } from '@/lib/diarios'
import { rotuloDoOrgao } from '@/lib/orgaos'

// Nova ata/contrato. Vinda de "Registrar itens ganhos" (?fonte=&item=), já
// chega com órgão, edital, processo e destino da licitação; sem isso, em branco
// (ata que não passou pelo sistema).

const VAZIA: DadosAta = {
  tipo: 'ata',
  numero: '',
  processo: null,
  edital: null,
  orgao: '',
  destino: null,
  prazoEntrega: null,
  validade: null,
  prorrogacao: null,
  observacao: null,
}

async function dadosDaOrigem(fonte: string, itemId: number): Promise<{ inicial: DadosAta; titulo: string } | null> {
  if (fonte === 'pncp') {
    const [e] = (await sql`
      SELECT objeto_compra, orgao_cnpj, orgao_razao_social, municipio_nome, ano_compra,
             raw_json->>'numeroCompra' AS numero_compra, raw_json->>'processo' AS processo
      FROM editais WHERE id = ${itemId}
    `) as Record<string, string | number | null>[]
    if (!e) return null
    return {
      titulo: e.objeto_compra as string,
      inicial: {
        ...VAZIA,
        orgao: rotuloDoOrgao(e.orgao_cnpj as string | null, e.orgao_razao_social as string | null) ?? '',
        edital: e.numero_compra ? `${e.numero_compra}/${e.ano_compra}` : null,
        processo: (e.processo as string | null) ?? null,
        destino: (e.municipio_nome as string | null) ?? null,
      },
    }
  }
  if (!ehFonteItem(fonte) || fonte === 'pncp') return null
  const ids = idsPorFonteVazio()
  ids[fonte].push(itemId)
  const [a] = await buscarAvisosPorIds(ids)
  if (!a) return null
  return {
    titulo: a.texto,
    inicial: { ...VAZIA, orgao: a.entidade ?? '', processo: a.processo },
  }
}

export default async function NovaAta({ searchParams }: PageProps<'/atas/nova'>) {
  const params = await searchParams
  const fonte = typeof params.fonte === 'string' ? params.fonte : null
  const itemId = Number(params.item)
  const daOrigem = fonte && Number.isInteger(itemId) ? await dadosDaOrigem(fonte, itemId) : null

  return (
    <>
      <header className="flex flex-col gap-1 border-b border-border bg-surface-muted px-6 pb-4 pt-[18px]">
        <Link href="/atas" className="w-fit text-[12.5px] text-muted no-underline hover:text-accent">
          ← Atas e contratos
        </Link>
        <h1 className="m-0 font-display text-[24px] font-semibold -tracking-[0.01em]">Nova ata ou contrato</h1>
        {daOrigem && <p className="m-0 line-clamp-2 text-[13px] text-muted">Ganha em: {daOrigem.titulo}</p>}
      </header>
      <div className="flex grow flex-col gap-3 bg-bg px-6 py-5">
        <FormAta
          inicial={daOrigem?.inicial ?? VAZIA}
          origem={daOrigem && fonte ? { fonte, itemId } : null}
        />
        <p className="m-0 text-[12.5px] text-faint">Depois de criar, você adiciona os itens ganhos e os pedidos.</p>
      </div>
    </>
  )
}
