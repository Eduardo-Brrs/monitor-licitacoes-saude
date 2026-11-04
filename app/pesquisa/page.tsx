import Link from 'next/link'
import { FormularioPesquisa } from '@/components/pesquisa/formulario'
import { LinhaResultado } from '@/components/pesquisa/linha-resultado'
import { listarMunicipios } from '@/lib/municipios'
import { lerFiltros, paraQueryString, pesquisar, UFS_NORDESTE, TODAS_UFS, type FiltrosPesquisa } from '@/lib/pesquisa'

// Tela 07 — Pesquisa de licitações (docs/design/telas/07-pesquisa.html).
// Busca no que o sistema já capturou e, ao vivo, no portal do PNCP.

// O PNCP ao vivo pode levar uns segundos (3 páginas em paralelo, 14s de teto).
export const maxDuration = 60

function descreverUfs(ufs: string[]): string {
  if (ufs.length === TODAS_UFS.length) return 'todos os estados'
  if (ufs.length === UFS_NORDESTE.length && UFS_NORDESTE.every((u) => ufs.includes(u))) return 'Nordeste'
  if (ufs.length === 1 && ufs[0] === 'AL') return 'Alagoas'
  return ufs.join(', ')
}

function resumo(f: FiltrosPesquisa, noSistema: number, soNoPncp: number, pncpOk: boolean): string {
  return [
    descreverUfs(f.ufs),
    f.cidade || null,
    f.abertas ? 'abertas' : 'abertas e encerradas',
    pncpOk ? `${noSistema} no sistema, ${soNoPncp} só no PNCP` : `${noSistema} no sistema`,
    'ordenados por prazo',
  ]
    .filter(Boolean)
    .join(' · ')
}

export default async function Pesquisa({ searchParams }: PageProps<'/pesquisa'>) {
  const filtros = lerFiltros(await searchParams)
  // Sugestão de cidade só com poucos estados — com todos seriam 5.570 nomes.
  const [municipios, resultado] = await Promise.all([
    filtros.ufs.length <= UFS_NORDESTE.length ? listarMunicipios(filtros.ufs) : Promise.resolve([]),
    filtros.enviado ? pesquisar(filtros) : Promise.resolve(null),
  ])

  return (
    <>
      <header className="flex items-end gap-4 border-b border-border bg-surface-muted px-6 pb-4 pt-[22px]">
        <div className="flex grow flex-col gap-1">
          <h1 className="m-0 font-display text-[26px] font-semibold -tracking-[0.01em]">Encontrar licitação</h1>
          <p className="m-0 text-[13px] text-muted">
            Procura no que o sistema já capturou e direto no PNCP, em qualquer estado. O boletim diário continua só de
            Alagoas.
          </p>
        </div>
        <Link href="/pesquisa" className="text-[13px] text-accent underline hover:text-accent-strong">
          Limpar tudo
        </Link>
      </header>

      <div className="flex grow flex-col gap-4 bg-bg px-6 py-4">
        <FormularioPesquisa filtros={filtros} municipios={municipios} />

        {!resultado && (
          <p className="m-0 px-0.5 text-[13px] text-muted">
            Preencha o que souber e clique em Buscar. Sem texto, a busca traz tudo que bate com os filtros — em Alagoas e
            só abertas, por padrão.
          </p>
        )}

        {resultado && (
          <>
            {resultado.pncp.estado === 'falhou' && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-[#ebd3c7] bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn-strong">
                <strong className="font-semibold">O PNCP não respondeu agora.</strong>
                <span>Mostrando só o que já está no sistema.</span>
                <Link href={`/pesquisa?${paraQueryString(filtros)}`} className="text-warn-strong underline">
                  Tentar o PNCP de novo
                </Link>
              </div>
            )}
            {resultado.cidadeNaoEncontrada && (
              <p className="m-0 px-0.5 text-[12.5px] text-warn">
                Não achei “{filtros.cidade}” na lista de cidades dos estados marcados — confira o nome (a sugestão do
                campo ajuda).
              </p>
            )}

            <div className="flex items-baseline gap-3 px-0.5">
              <h2 className="m-0 font-display text-[19px] font-semibold">
                {resultado.itens.length === 0
                  ? 'Nada encontrado'
                  : `${resultado.itens.length} ${resultado.itens.length === 1 ? 'encontrado' : 'encontrados'}`}
              </h2>
              <span className="text-[12.5px] text-muted">
                {resumo(filtros, resultado.noSistema, resultado.soNoPncp, resultado.pncp.estado === 'ok')}
              </span>
              <div className="grow" />
              {resultado.itens.length > 0 && (
                <a
                  href={`/pesquisa/csv?${paraQueryString(filtros)}`}
                  className="flex h-[34px] items-center rounded-control border border-border-strong bg-surface px-[13px] text-[12.5px] font-medium text-ink no-underline hover:bg-bg"
                >
                  Exportar CSV
                </a>
              )}
            </div>

            {resultado.itens.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {resultado.itens.map((item) => (
                  <LinhaResultado key={item.chave} item={item} />
                ))}
              </ul>
            )}

            {resultado.pncp.estado === 'ok' && resultado.pncp.temMais && (
              <div className="flex items-center justify-center gap-3.5 py-1.5">
                <Link
                  href={`/pesquisa?${paraQueryString(filtros, { mais: String(filtros.paginasPncp + 1) })}`}
                  scroll={false}
                  className="flex h-9 items-center rounded-control border border-border-strong bg-surface px-4 text-[13px] font-medium text-ink no-underline hover:bg-bg"
                >
                  Carregar mais
                </Link>
                <span className="text-[12.5px] text-faint">
                  o PNCP tem {resultado.pncp.total} resultados pra essa busca; lidos {filtros.paginasPncp * 100}
                </span>
              </div>
            )}
            {resultado.pncp.estado === 'ok' && !resultado.pncp.temMais && resultado.pncp.total > filtros.paginasPncp * 100 && (
              <p className="m-0 text-center text-[12.5px] text-faint">
                O PNCP tem {resultado.pncp.total} resultados e a tela lê até 300 — refine a busca (texto, cidade, datas)
                pra ver o resto.
              </p>
            )}

            <p className="m-0 px-0.5 text-[12.5px] text-muted">
              Favoritar um edital “fora do sistema” traz ele por inteiro: anexos, acompanhamento, resultado, contrato e
              tarefas — inclusive de fora de Alagoas.
            </p>
          </>
        )}
      </div>
    </>
  )
}
