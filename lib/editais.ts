import { sql } from '@/lib/db'
import { comFusoDeBrasilia } from '@/lib/formato'
import type { PncpContratacao } from '@/lib/pncp'

// true se inseriu de fato (edital novo); false se já existia (ON CONFLICT DO NOTHING).
export async function salvarEdital(contratacao: PncpContratacao, palavrasChave: string[]): Promise<boolean> {
  const inseridos = await sql`
    INSERT INTO editais (
      numero_controle_pncp, orgao_cnpj, orgao_razao_social, ano_compra,
      sequencial_compra, municipio_nome, uf, objeto_compra,
      modalidade_id, modalidade_nome, situacao_id, situacao_nome, srp,
      valor_total_estimado, data_publicacao_pncp, data_abertura_proposta,
      data_encerramento_proposta, link_sistema_origem, keywords_matched, raw_json
    ) VALUES (
      ${contratacao.numeroControlePNCP}, ${contratacao.orgaoEntidade.cnpj}, ${contratacao.orgaoEntidade.razaoSocial},
      ${contratacao.anoCompra}, ${contratacao.sequencialCompra}, ${contratacao.unidadeOrgao.municipioNome},
      ${contratacao.unidadeOrgao.ufSigla}, ${contratacao.objetoCompra}, ${contratacao.modalidadeId},
      ${contratacao.modalidadeNome}, ${String(contratacao.situacaoCompraId)}, ${contratacao.situacaoCompraNome},
      ${contratacao.srp}, ${contratacao.valorTotalEstimado ?? null}, ${comFusoDeBrasilia(contratacao.dataPublicacaoPncp)},
      ${comFusoDeBrasilia(contratacao.dataAberturaProposta)}, ${comFusoDeBrasilia(contratacao.dataEncerramentoProposta)},
      ${contratacao.linkSistemaOrigem ?? null}, ${palavrasChave}, ${contratacao}
    )
    ON CONFLICT (numero_controle_pncp) DO NOTHING
    RETURNING id
  `
  return inseridos.length > 0
}

// Edital trazido de fora da captura (estrela na Pesquisa, aviso de diário
// ligado ao PNCP): grava se ainda não existe e devolve o id. Fica no boletim
// do dia da PUBLICAÇÃO, não no de hoje — não é novidade pra triar.
export async function guardarEditalTrazido(contratacao: PncpContratacao, palavrasChave: string[]): Promise<number> {
  const novo = await salvarEdital(contratacao, palavrasChave)
  if (novo) {
    await sql`
      UPDATE editais SET boletim_dia = (data_publicacao_pncp AT TIME ZONE 'America/Maceio')::date
      WHERE numero_controle_pncp = ${contratacao.numeroControlePNCP}
    `
  }
  const [{ id }] = (await sql`
    SELECT id FROM editais WHERE numero_controle_pncp = ${contratacao.numeroControlePNCP}
  `) as { id: number }[]
  return id
}
