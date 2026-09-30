import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { ERRO_REMOVIDA, atualizarDetalhe } from '@/lib/detalhe-pncp'

// Compra excluída do PNCP pelo órgão (404) sai da fila — não adianta insistir.
const PADRAO_REMOVIDA = `${ERRO_REMOVIDA}%`

export const maxDuration = 60

// Preenche e mantém a cópia de anexos/itens dos editais (ver lib/detalhe-pncp.ts).
// Roda no mesmo cron de 30 em 30min do /api/verificar-itens. Ordem de
// prioridade: primeiro o que nunca conseguimos buscar, e dentro disso o que
// abre mais cedo — é o edital que alguém vai precisar abrir primeiro.
//
// Edital ainda aberto é reconsultado a cada 12h (órgão costuma publicar
// errata/anexo novo até a abertura). Depois da abertura a cópia fica como está.
const TAMANHO_LOTE = 15
const PAUSA_ENTRE_EDITAIS_MS = 400
const ORCAMENTO_MS = 35_000
const HORAS_PARA_RECONSULTAR = 12

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
    }
  }

  const startedAt = new Date()
  const fila = (await sql`
    SELECT id, orgao_cnpj, ano_compra, sequencial_compra
    FROM editais
    WHERE (arquivos_json IS NULL AND COALESCE(detalhe_erro, '') NOT LIKE ${PADRAO_REMOVIDA})
       OR (
         data_abertura_proposta >= NOW()
         AND detalhe_atualizado_em < NOW() - make_interval(hours => ${HORAS_PARA_RECONSULTAR})
       )
    ORDER BY (arquivos_json IS NOT NULL), data_abertura_proposta ASC NULLS LAST, id DESC
    LIMIT ${TAMANHO_LOTE}
  `) as { id: number; orgao_cnpj: string; ano_compra: number; sequencial_compra: number }[]

  let atualizados = 0
  let comFalha = 0
  let ultimoErro: string | null = null

  for (const edital of fila) {
    if (Date.now() - startedAt.getTime() > ORCAMENTO_MS) break

    const resultado = await atualizarDetalhe({
      id: edital.id,
      orgaoCnpj: edital.orgao_cnpj,
      anoCompra: edital.ano_compra,
      sequencialCompra: edital.sequencial_compra,
    })
    if (resultado.arquivos !== null) atualizados++
    if (resultado.erro) {
      comFalha++
      ultimoErro = resultado.erro
    }
    await esperar(PAUSA_ENTRE_EDITAIS_MS)
  }

  const [{ faltando }] = (await sql`
    SELECT COUNT(*)::int AS faltando FROM editais
    WHERE arquivos_json IS NULL AND COALESCE(detalhe_erro, '') NOT LIKE ${PADRAO_REMOVIDA}
  `) as { faltando: number }[]

  // total_api = editais consultados, total_matched = com falha, total_novos =
  // com anexos atualizados. Erro só quando nenhum deu certo (PNCP fora do ar),
  // pra falha parcial pontual não pintar o run de vermelho.
  const erro = comFalha > 0 && atualizados === 0 ? ultimoErro : null
  await sql`
    INSERT INTO sync_runs (tipo, data_consultada, started_at, finished_at, total_api, total_matched, total_novos, erro)
    VALUES ('atualizar_detalhes', ${startedAt.toISOString().slice(0, 10)}, ${startedAt.toISOString()}, ${new Date().toISOString()},
            ${fila.length}, ${comFalha}, ${atualizados}, ${erro})
  `

  const corpo = { consultados: fila.length, atualizados, comFalha, faltando }
  return erro ? NextResponse.json({ erro, ...corpo }, { status: 500 }) : NextResponse.json(corpo)
}
