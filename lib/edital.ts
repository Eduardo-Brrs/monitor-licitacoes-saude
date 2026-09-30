import { sql } from '@/lib/db'

export interface EditalDetalhe {
  id: number
  numeroControlePncp: string
  objeto: string
  orgao: string | null
  orgaoCnpj: string
  municipio: string | null
  uf: string | null
  modalidade: string | null
  situacao: string | null
  numeroCompra: string | null
  anoCompra: number
  sequencialCompra: number
  processo: string | null
  valorEstimado: number | null
  dataPublicacao: string | null
  aberturaProposta: string | null
  encerramentoProposta: string | null
  modoDisputa: string | null
  amparoLegal: string | null
  linkSistemaOrigem: string | null
  keywordsMatched: string[]
  favorito: boolean
  visto: boolean
}

// Portais onde a disputa acontece de verdade — o sistema é pra ler o edital
// aqui e só sair pra participar. O host cru ("cnetmobile.estaleiro.serpro.gov.br")
// não diz nada pra quem usa, então mapeia pros nomes conhecidos e cai no
// próprio host quando aparecer um portal novo.
const PORTAIS: Record<string, string> = {
  'cnetmobile.estaleiro.serpro.gov.br': 'Comprasnet',
  'bnccompras.com': 'BNC Compras',
  'bllcompras.com': 'BLL Compras',
  'licitanet.com.br': 'Licitanet',
  'licitacoes-e2.bb.com.br': 'Licitações-e (BB)',
  'www.portaldecompraspublicas.com.br': 'Portal de Compras Públicas',
  'www.compraagil.sistemasgrupoexito.com.br': 'Compra Ágil',
}

export function nomeDoPortal(link: string | null): string | null {
  if (!link) return null
  try {
    const host = new URL(link).hostname
    return PORTAIS[host] ?? host.replace(/^www\./, '')
  } catch {
    return null
  }
}

export async function buscarEditalPorNumero(
  numeroControlePncp: string
): Promise<EditalDetalhe | null> {
  const linhas = (await sql`
    SELECT
      e.id, e.numero_controle_pncp, e.objeto_compra, e.orgao_razao_social, e.orgao_cnpj,
      e.municipio_nome, e.uf, e.modalidade_nome, e.situacao_nome, e.ano_compra,
      e.sequencial_compra, e.valor_total_estimado, e.data_publicacao_pncp,
      e.data_abertura_proposta, e.data_encerramento_proposta, e.keywords_matched,
      e.link_sistema_origem,
      e.raw_json->>'numeroCompra' AS numero_compra,
      e.raw_json->>'processo' AS processo,
      e.raw_json->>'modoDisputaNome' AS modo_disputa,
      e.raw_json->'amparoLegal'->>'nome' AS amparo_legal,
      COALESCE(s.favorito, FALSE) AS favorito,
      s.visto_em
    FROM editais e
    LEFT JOIN edital_status s ON s.edital_id = e.id
    WHERE e.numero_controle_pncp = ${numeroControlePncp}
  `) as Record<string, unknown>[]

  if (linhas.length === 0) return null
  const l = linhas[0]

  return {
    id: l.id as number,
    numeroControlePncp: l.numero_controle_pncp as string,
    objeto: l.objeto_compra as string,
    orgao: l.orgao_razao_social as string | null,
    orgaoCnpj: l.orgao_cnpj as string,
    municipio: l.municipio_nome as string | null,
    uf: l.uf as string | null,
    modalidade: l.modalidade_nome as string | null,
    situacao: l.situacao_nome as string | null,
    numeroCompra: l.numero_compra as string | null,
    anoCompra: l.ano_compra as number,
    sequencialCompra: l.sequencial_compra as number,
    processo: l.processo as string | null,
    valorEstimado: l.valor_total_estimado === null ? null : Number(l.valor_total_estimado),
    dataPublicacao: (l.data_publicacao_pncp as string | null) ?? null,
    aberturaProposta: (l.data_abertura_proposta as string | null) ?? null,
    encerramentoProposta: (l.data_encerramento_proposta as string | null) ?? null,
    modoDisputa: l.modo_disputa as string | null,
    amparoLegal: l.amparo_legal as string | null,
    linkSistemaOrigem: l.link_sistema_origem as string | null,
    keywordsMatched: (l.keywords_matched as string[] | null) ?? [],
    favorito: l.favorito as boolean,
    visto: l.visto_em !== null,
  }
}
