import { formatarDataHora, nomeDeArquivoLegivel } from '@/lib/formato'
import type { PncpArquivo } from '@/lib/pncp'

function IconeArquivo() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted"
      aria-hidden="true"
    >
      <path d="M14 3v5h5" />
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
    </svg>
  )
}

function IconeBaixar() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
      <path d="M5 19h14" />
    </svg>
  )
}

type Props = {
  // null = nunca conseguimos buscar a lista (PNCP fora do ar desde que o
  // edital entrou); [] = o edital de fato não tem anexo.
  arquivos: PncpArquivo[] | null
  atualizadoEm: string | null
  // A lista mostrada é a cópia salva porque o PNCP não respondeu agora.
  pncpFalhouAgora: boolean
  // O órgão excluiu a compra do PNCP (404) — não é instabilidade.
  removidaDoPncp: boolean
  linkPortal: string | null
  portal: string | null
  // Rota que monta o zip com todos os anexos (app/edital/[numero]/anexos).
  zipHref?: string
}

// Edital sem anexo na tela não serve pra nada (pedido do Eduardo, 2026-09-24):
// mostra tudo o que dá e, quando falta algo, diz por quê e aponta o portal da
// disputa, que costuma ter os mesmos documentos.
function AvisoInstabilidade({ children, linkPortal, portal }: { children: React.ReactNode; linkPortal: string | null; portal: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[#efd9cf] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn-strong">
      <p className="m-0">{children}</p>
      {linkPortal && (
        <a href={linkPortal} target="_blank" rel="noopener noreferrer" className="font-medium text-warn-strong underline">
          Ver os documentos no {portal ?? 'portal da disputa'} ↗
        </a>
      )}
    </div>
  )
}

export function Anexos({ arquivos, atualizadoEm, pncpFalhouAgora, removidaDoPncp, linkPortal, portal, zipHref }: Props) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
      <div className="flex items-center gap-3">
        <h2 className="m-0 grow text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-2">
          Anexos
          {arquivos !== null && arquivos.length > 0 && (
            <span className="font-normal normal-case tracking-normal text-faint"> — {arquivos.length}</span>
          )}
        </h2>
        {zipHref && arquivos !== null && arquivos.length > 1 && (
          <a
            href={zipHref}
            download
            title="Baixa todos os anexos do PNCP num arquivo .zip (pode levar alguns segundos)"
            className="flex h-9 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-ink no-underline hover:bg-bg"
          >
            <IconeBaixar />
            Baixar tudo (.zip)
          </a>
        )}
      </div>

      {arquivos !== null && pncpFalhouAgora && (
        <AvisoInstabilidade linkPortal={linkPortal} portal={portal}>
          O PNCP não respondeu agora. Esta é a lista salva em {formatarDataHora(atualizadoEm)} — os
          arquivos ficam hospedados no PNCP, então o download pode falhar até ele voltar.
        </AvisoInstabilidade>
      )}

      {arquivos === null && removidaDoPncp ? (
        <AvisoInstabilidade linkPortal={linkPortal} portal={portal}>
          Este edital foi removido do PNCP pelo órgão depois de publicado, então os anexos não estão mais
          lá. Se a disputa continua, os documentos devem estar no portal.
        </AvisoInstabilidade>
      ) : arquivos === null ? (
        <AvisoInstabilidade linkPortal={linkPortal} portal={portal}>
          Ainda não conseguimos buscar os anexos: o PNCP está instável desde que este edital entrou. O
          sistema tenta de novo sozinho a cada 30 minutos.
        </AvisoInstabilidade>
      ) : arquivos.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Este edital não tem anexo publicado no PNCP.</p>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {arquivos.map((arquivo) => {
            const nome = nomeDeArquivoLegivel(arquivo.titulo ?? arquivo.nomeArquivo ?? `Documento ${arquivo.sequencialDocumento}`)
            return (
              <div
                key={arquivo.sequencialDocumento}
                className="flex items-center gap-2.5 rounded-lg border border-[#e9e7e1] bg-surface-muted px-3 py-2.5"
              >
                <IconeArquivo />
                <span className="min-w-0 grow truncate text-[13px]" title={nome}>
                  {nome}
                </span>
                {arquivo.tipoDocumentoNome && (
                  <span className="shrink-0 text-[12px] text-faint">{arquivo.tipoDocumentoNome}</span>
                )}
                <a
                  href={arquivo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Baixar ${nome}`}
                  title={`Baixar ${nome}`}
                  className="flex h-9 w-10 shrink-0 items-center justify-center rounded-control border border-border-strong bg-surface text-ink hover:bg-bg"
                >
                  <IconeBaixar />
                </a>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
