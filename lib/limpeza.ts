import { sql } from '@/lib/db'

// Limpeza de dados que não fazem mais falta (nível 1, 2026-10-22), pra o
// banco caber no plano grátis do Neon (512 MB) por muitos anos. Roda no fim de
// todo /api/sync; é idempotente e barata, então rodar 3x/dia não custa nada.
//
// Só mexe no que nenhuma tela mostra:
//
// 1. itens_pendentes que já foram checados (match ou sem_match) e cujo prazo
//    passou há mais de DIAS_PENDENTE: o JSON completo do PNCP (~85% da linha)
//    vira um resumo com o que ainda serve — objeto (retrato dos testes de
//    keyword, scripts/gerar-fixture-keywords.ts), número, processo, órgão,
//    cidade e data. A linha continua existindo porque (a) conta no "fora dos
//    filtros" dos boletins antigos e (b) segura o ON CONFLICT do /api/sync. Com
//    o prazo vencido a compra não volta pra checagem nem vira edital, então o
//    JSON completo não é lido de novo. Compra que virou edital tem o JSON
//    inteiro guardado em editais.raw_json.
// 2. sync_runs com mais de DIAS_SYNC_RUNS: a tela de status das fontes só olha
//    as 20 últimas execuções de cada rotina (lib/saude.ts).
//
// Nunca apaga edital, aviso de diário nem nada com marcação de uso.
const DIAS_PENDENTE = 30
const DIAS_SYNC_RUNS = 90
const DIAS_FILA_FALHAS = 30

export interface ResultadoLimpeza {
  pendentesResumidos: number
  syncRunsApagados: number
}

export async function limparDadosAntigos(): Promise<ResultadoLimpeza> {
  const [pendentes] = (await sql`
    WITH resumidos AS (
      UPDATE itens_pendentes
      SET contratacao_json = jsonb_strip_nulls(jsonb_build_object(
        'resumido', TRUE,
        'objetoCompra', contratacao_json->'objetoCompra',
        'numeroCompra', contratacao_json->'numeroCompra',
        'processo', contratacao_json->'processo',
        'modalidadeNome', contratacao_json->'modalidadeNome',
        'dataPublicacaoPncp', contratacao_json->'dataPublicacaoPncp',
        'orgaoEntidade', jsonb_build_object('razaoSocial', contratacao_json->'orgaoEntidade'->'razaoSocial'),
        'unidadeOrgao', jsonb_build_object('municipioNome', contratacao_json->'unidadeOrgao'->'municipioNome')
      ))
      WHERE status IN ('match', 'sem_match')
        AND contratacao_json->>'resumido' IS NULL
        AND COALESCE(data_encerramento_proposta, data_abertura_proposta, criado_em)
            < NOW() - make_interval(days => ${DIAS_PENDENTE})
      RETURNING 1
    )
    SELECT COUNT(*)::int AS n FROM resumidos
  `) as { n: number }[]

  const [runs] = (await sql`
    WITH apagados AS (
      DELETE FROM sync_runs
      WHERE started_at < NOW() - make_interval(days => ${DIAS_SYNC_RUNS})
      RETURNING 1
    )
    SELECT COUNT(*)::int AS n FROM apagados
  `) as { n: number }[]

  // Falha que parou de repetir é de item que saiu da janela: não serve mais.
  await sql`DELETE FROM fila_falhas WHERE falhou_em < NOW() - make_interval(days => ${DIAS_FILA_FALHAS})`

  return { pendentesResumidos: pendentes.n, syncRunsApagados: runs.n }
}
