import { notFound } from 'next/navigation'
import { Anexos } from '@/components/edital/anexos'
import { BannerVitoria } from '@/components/edital/banner-vitoria'
import { CabecalhoEdital } from '@/components/edital/cabecalho'
import { GradeDados } from '@/components/edital/grade-dados'
import { ItensInteresse } from '@/components/edital/itens-interesse'
import { LateralEdital } from '@/components/edital/lateral'
import { ContratosEAtas, ResultadoPorItem } from '@/components/edital/resultado'
import { SituacaoPncp, type EventoParaTela } from '@/components/edital/situacao-pncp'
import { dadosDaLateral } from '@/lib/acompanhamento'
import { carregarAcompanhamento, HORAS_ENTRE_VERIFICACOES, NOME_EMPRESA } from '@/lib/acompanhamento-pncp'
// Itens e anexos vêm da cópia salva no banco, atualizada pelo PNCP quando ele
// responde — ver lib/detalhe-pncp.ts. PNCP fora do ar não deixa a tela vazia.
import { carregarDetalheParaTela } from '@/lib/detalhe-pncp'
import { buscarEditalPorNumero, nomeDoPortal } from '@/lib/edital'
import { formatarDataCompleta, formatarValorCompleto } from '@/lib/formato'
import { encontrarPalavrasChave } from '@/lib/keywords'

// O driver devolve TIMESTAMPTZ como Date, apesar do tipo string em EditalDetalhe.
function paraIso(valor: string | Date | null): string | null {
  return valor ? new Date(valor).toISOString() : null
}

// "Verificar agora" consulta o PNCP dentro da própria requisição.
export const maxDuration = 60

export default async function PaginaEdital({ params }: PageProps<'/edital/[numero]'>) {
  const { numero } = await params
  const edital = await buscarEditalPorNumero(decodeURIComponent(numero))
  if (!edital) notFound()

  const [{ arquivos, itens, atualizadoEm, pncpFalhouAgora, removidaDoPncp }, lateral, acompanhamento] =
    await Promise.all([
      carregarDetalheParaTela({
        id: edital.id,
        orgaoCnpj: edital.orgaoCnpj,
        anoCompra: edital.anoCompra,
        sequencialCompra: edital.sequencialCompra,
      }),
      dadosDaLateral('pncp', edital.id),
      carregarAcompanhamento(edital.id),
    ])

  // "Itens de interesse" é o mesmo motor de match do sync, agora rodando na
  // descrição de cada item em vez de no objeto geral da compra.
  const deInteresse = (itens ?? []).filter((item) => encontrarPalavrasChave(item.descricao).length > 0)
  const portal = nomeDoPortal(edital.linkSistemaOrigem)

  const acompanhado = edital.favorito || lateral.statusInterno !== null
  const { retrato, vitoria } = acompanhamento

  // Linha do tempo: fatos capturados do PNCP + publicação e abertura, que já
  // vêm do próprio edital.
  const eventos: EventoParaTela[] = [
    ...acompanhamento.eventos,
    ...(edital.aberturaProposta
      ? [{ tipo: 'abertura', descricao: 'Abertura das propostas', dataFato: paraIso(edital.aberturaProposta), capturadoEm: null }]
      : []),
    ...(edital.dataPublicacao
      ? [{ tipo: 'publicacao', descricao: 'Edital publicado no PNCP', dataFato: paraIso(edital.dataPublicacao), capturadoEm: null }]
      : []),
  ].sort((a, b) => (b.dataFato ?? '').localeCompare(a.dataFato ?? ''))

  const proximaEm = acompanhamento.verificadoEm
    ? new Date(Date.parse(acompanhamento.verificadoEm) + HORAS_ENTRE_VERIFICACOES * 3_600_000).toISOString()
    : null

  const mostrarBanner = vitoria && !acompanhamento.vitoriaDescartada && lateral.statusInterno !== 'ganha'
  const detalheVitoria = vitoria
    ? [
        vitoria.itens > 0 && `${vitoria.itens} ${vitoria.itens === 1 ? 'item vencido' : 'itens vencidos'}`,
        vitoria.valorHomologado > 0 && `${formatarValorCompleto(vitoria.valorHomologado)} homologados`,
        vitoria.contrato &&
          `contrato assinado${vitoria.contrato.assinatura ? ` em ${formatarDataCompleta(`${vitoria.contrato.assinatura.slice(0, 10)}T12:00:00Z`)}` : ''}${
            vitoria.contrato.valorGlobal ? ` · ${formatarValorCompleto(vitoria.contrato.valorGlobal)}` : ''
          }`,
        acompanhamento.verificadoEm && 'conferido no PNCP pelo acompanhamento automático',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <>
      <CabecalhoEdital edital={edital} />

      {mostrarBanner && (
        <BannerVitoria
          editalId={edital.id}
          titulo={
            vitoria.contrato
              ? `Contrato encontrado no PNCP com o CNPJ da ${NOME_EMPRESA}`
              : `Resultado no PNCP com o CNPJ da ${NOME_EMPRESA}`
          }
          detalhe={detalheVitoria}
        />
      )}

      <div className="flex min-h-0 grow gap-5 bg-bg px-6 py-5">
        <div className="flex min-w-0 grow flex-col gap-4">
          {retrato && <ResultadoPorItem retrato={retrato} />}
          {retrato && <ContratosEAtas retrato={retrato} />}
          <GradeDados edital={edital} situacaoAcompanhada={acompanhamento.situacao} />
          <ItensInteresse itens={itens} deInteresse={deInteresse} removidaDoPncp={removidaDoPncp} />
          <Anexos
            arquivos={arquivos}
            atualizadoEm={atualizadoEm}
            pncpFalhouAgora={pncpFalhouAgora}
            removidaDoPncp={removidaDoPncp}
            linkPortal={edital.linkSistemaOrigem}
            portal={portal}
            zipHref={`/edital/${encodeURIComponent(edital.numeroControlePncp)}/anexos`}
          />
        </div>

        <LateralEdital
          editalId={edital.id}
          favorito={edital.favorito}
          linkSistemaOrigem={edital.linkSistemaOrigem}
          portal={portal}
          dados={lateral}
          situacaoPncp={
            <SituacaoPncp
              editalId={edital.id}
              acompanhado={acompanhado}
              situacao={acompanhamento.situacao}
              eventos={eventos}
              verificadoEm={acompanhamento.verificadoEm}
              proximaEm={proximaEm}
              erro={acompanhamento.erro}
            />
          }
        />
      </div>
    </>
  )
}
