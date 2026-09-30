import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PainelAcompanhamento } from '@/components/acompanhamento/painel'
import { BotaoFavoritarAviso } from '@/components/aviso/botao-favoritar'
import { dadosDaLateral } from '@/lib/acompanhamento'
import { buscarAvisosPorIds, FONTES_DIARIO, idsPorFonteVazio, textoCompletoDoAviso, type FonteDiario } from '@/lib/diarios'
import { formatarDataCompleta, formatarDataHora } from '@/lib/formato'

// Tela de um aviso de diário (2026-09-28). É o que abre ao clicar num aviso no
// boletim (a seta da linha abre a publicação original) e no acompanhamento:
// texto publicado, contatos citados no texto, e a mesma lateral do edital
// (favoritar, status, anotação, tarefas).
//
// Aviso de diário não tem itens nem anexos pra baixar — o diário só publica o
// texto. A tela explica isso por tipo (pedido do Eduardo: deixar por escrito
// por que algo não tem edital baixável).

// O que dizer em "Onde está o edital?" pra cada tipo de aviso.
function ondeEstaOEdital(fonte: FonteDiario, tipo: string): string[] {
  if (fonte === 'judicial') {
    return [
      'Aquisição judicial é compra da AMGESP para cumprir uma decisão da Justiça (um paciente específico). Não existe edital público nem anexo: o Termo de Referência é pedido por e-mail ao setor de cotação judicial, como diz o texto.',
      'O prazo para mandar proposta costuma ser curto — poucos dias depois da publicação.',
    ]
  }
  if (fonte === 'doe_licitacao') {
    return [
      'Este é o aviso do pregão publicado no Diário Oficial do Estado. O edital completo fica no portal de compras do Estado e, normalmente, também no PNCP.',
      'Quando a compra aparece no PNCP, ela entra no sistema como edital normal, com itens e anexos — e este aviso deixa de aparecer no boletim.',
    ]
  }
  if (fonte === 'doe_cotacao') {
    return [
      'Cotação (pesquisa de preço) de um órgão do Estado, publicada no Diário Oficial do Estado. Acontece antes da compra: o órgão pede orçamento pra montar o processo, e não existe edital público ainda. O Termo de Referência com os itens é pedido pelo e-mail ou telefone citados no texto.',
      'O prazo pra mandar proposta costuma ser de 3 a 5 dias úteis a partir da publicação. Se a compra virar pregão ou dispensa no PNCP, ela entra no sistema como edital normal, com itens e anexos.',
    ]
  }
  if (tipo === 'Cotação') {
    return [
      'Cotação (pesquisa de preço) acontece antes da compra: o órgão (prefeitura ou, no caso do Maceió Saúde, o Hospital da Cidade) pede orçamento pra montar o processo. Não tem edital ainda — a planilha ou o termo de referência é pedido pelo e-mail ou retirado no setor indicado no texto.',
      'Se a compra virar dispensa ou pregão e for publicada no PNCP, ela entra no sistema como edital normal, com itens e anexos.',
    ]
  }
  return [
    'Este é o aviso publicado no diário da prefeitura. O edital completo fica no portal da disputa ou no site da prefeitura citados no texto.',
    'Quando a compra é publicada no PNCP, ela entra no sistema como edital normal, com itens e anexos.',
  ]
}

// E-mails e links citados no texto — é por onde se pede o edital.
function contatosDoTexto(texto: string): { emails: string[]; links: string[] } {
  const emails = [...new Set((texto.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).map((e) => e.replace(/\.$/, '').toLowerCase()))]
  const links = [...new Set((texto.match(/https?:\/\/[^\s)\]]+/g) ?? []).map((l) => l.replace(/[.,;]+$/, '')))]
  return { emails: emails.slice(0, 5), links: links.slice(0, 5) }
}

export default async function PaginaAviso({ params }: PageProps<'/aviso/[fonte]/[id]'>) {
  const { fonte: fonteParam, id: idParam } = await params
  const id = Number(idParam)
  if (!(FONTES_DIARIO as string[]).includes(fonteParam) || !Number.isInteger(id)) notFound()
  const fonte = fonteParam as FonteDiario

  const ids = idsPorFonteVazio()
  ids[fonte] = [id]
  const [[aviso], textoCompleto, lateral] = await Promise.all([
    buscarAvisosPorIds(ids),
    textoCompletoDoAviso(fonte, id),
    dadosDaLateral(fonte, id),
  ])
  if (!aviso) notFound()

  const judicial = fonte === 'judicial'
  const trechos = (textoCompleto ?? aviso.texto).split(/\s\n\s/).map((t) => t.trim()).filter(Boolean)
  const { emails, links } = contatosDoTexto(textoCompleto ?? aviso.texto)
  const explicacao = ondeEstaOEdital(fonte, aviso.tipo)

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-border bg-surface-muted px-6 pb-4 pt-[18px]">
        <Link href={`/boletim/${aviso.dia}`} className="text-[12.5px] text-accent hover:text-accent-strong">
          ← Boletim de {formatarDataCompleta(`${aviso.dia}T12:00:00Z`).slice(0, 5)}
        </Link>
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-1.5 shrink-0 rounded-badge px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] ${
              judicial ? 'bg-warn-soft text-warn-strong' : 'border border-border-strong bg-surface text-muted'
            }`}
          >
            {aviso.tipo}
          </span>
          <h1 className="m-0 line-clamp-3 font-display text-[22px] font-semibold leading-snug -tracking-[0.01em]">
            {aviso.texto}
          </h1>
        </div>
        <p className="m-0 flex flex-wrap gap-x-2 text-[13px] text-muted">
          {[aviso.entidade, aviso.origem].filter(Boolean).join(' · ')}
          {aviso.processo && <span className="font-mono text-[12.5px] text-ink-2">proc. {aviso.processo}</span>}
        </p>
      </header>

      <div className="flex min-h-0 grow gap-5 bg-bg px-6 py-5">
        <div className="flex min-w-0 grow flex-col gap-4">
          <dl className="m-0 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-border bg-border">
            {[
              ['Publicado em', formatarDataCompleta(`${aviso.dia}T12:00:00Z`)],
              ['Sessão / prazo', aviso.dataSessao ? formatarDataHora(aviso.dataSessao) : 'não informado no diário'],
              ['Palavras-chave', aviso.keywords.length ? aviso.keywords.join(', ') : '—'],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="flex flex-col gap-1 bg-surface px-4 py-3">
                <dt className="text-[11px] uppercase tracking-[0.05em] text-faint">{rotulo}</dt>
                <dd className="m-0 text-[13px] text-ink">{valor}</dd>
              </div>
            ))}
          </dl>

          {/* Por que não tem itens nem anexos aqui (pedido do Eduardo, 2026-09-28). */}
          <section className="flex flex-col gap-2 rounded-card border border-[#efd9cf] bg-warn-soft p-5">
            <h2 className="m-0 text-[11px] font-medium uppercase tracking-[0.05em] text-warn-strong">
              Onde está o edital?
            </h2>
            <p className="m-0 text-[13px] leading-relaxed text-ink">
              Isto é um aviso de diário oficial, não um edital do PNCP: o diário publica só o texto abaixo, sem lista de
              itens nem anexos para baixar.
            </p>
            {explicacao.map((paragrafo) => (
              <p key={paragrafo} className="m-0 text-[13px] leading-relaxed text-ink-2">
                {paragrafo}
              </p>
            ))}
            {(emails.length > 0 || links.length > 0) && (
              <div className="flex flex-col gap-1 pt-1 text-[13px]">
                <span className="text-[11px] uppercase tracking-[0.05em] text-faint">Contatos citados no aviso</span>
                {emails.map((email) => (
                  <a key={email} href={`mailto:${email}`} className="w-fit font-medium text-accent hover:text-accent-strong">
                    {email}
                  </a>
                ))}
                {links.map((link) => (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit break-all font-medium text-accent hover:text-accent-strong"
                  >
                    {link} ↗
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
            <h2 className="m-0 text-[11px] font-medium uppercase tracking-[0.05em] text-faint">Texto publicado</h2>
            {trechos.map((trecho, i) => (
              <p key={i} className="m-0 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">
                {trecho}
              </p>
            ))}
            {judicial && (
              <p className="m-0 text-[12px] text-faint">
                Trechos da página que citam aquisição judicial. A publicação completa, com todos os processos da
                página, está no diário.
              </p>
            )}
          </section>
        </div>

        <aside className="flex w-[306px] shrink-0 flex-col gap-3.5">
          <BotaoFavoritarAviso fonte={fonte} avisoId={id} favorito={aviso.favorito} />
          <a
            href={aviso.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-control border border-accent bg-accent text-[13px] font-medium text-white hover:bg-accent-strong"
          >
            Abrir publicação no diário
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
          <PainelAcompanhamento fonte={fonte} itemId={id} dados={lateral} />
        </aside>
      </div>
    </>
  )
}
