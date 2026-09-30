import { sql } from '@/lib/db'
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
      ${contratacao.srp}, ${contratacao.valorTotalEstimado ?? null}, ${contratacao.dataPublicacaoPncp},
      ${contratacao.dataAberturaProposta ?? null}, ${contratacao.dataEncerramentoProposta ?? null},
      ${contratacao.linkSistemaOrigem ?? null}, ${palavrasChave}, ${contratacao}
    )
    ON CONFLICT (numero_controle_pncp) DO NOTHING
    RETURNING id
  `
  return inseridos.length > 0
}
