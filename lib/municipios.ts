// Cidades por UF com o código do IBGE — a busca do PNCP filtra cidade por esse
// código (testado em 2026-10-06: Arapiraca = 2700300). Lista oficial do IBGE,
// guardada em cache por 30 dias (município novo é raríssimo).
export interface Municipio {
  ibge: string
  nome: string
  uf: string
}

const TRINTA_DIAS = 60 * 60 * 24 * 30

async function municipiosDaUf(uf: string): Promise<Municipio[]> {
  try {
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, {
      next: { revalidate: TRINTA_DIAS },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    const lista = (await res.json()) as { id: number; nome: string }[]
    return lista.map((m) => ({ ibge: String(m.id), nome: m.nome, uf }))
  } catch {
    // Sem a lista a busca por cidade só não sugere nomes nem filtra no PNCP —
    // não derruba a tela.
    return []
  }
}

export async function listarMunicipios(ufs: string[]): Promise<Municipio[]> {
  return (await Promise.all(ufs.map(municipiosDaUf))).flat().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
