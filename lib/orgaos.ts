// Sigla dos órgãos, pra linha mostrar "FUNDEPES · FUNDACAO UNIVERSITARIA..."
// como o ConLicitação (pedido do usuário, 2026-10-06). O PNCP só devolve a
// razão social, às vezes cortada ("...DE DESENV DE EXTENSAO E PES"), e quem
// procura "fundepes" não achava nada.
//
// Por CNPJ, preenchida à mão com os órgãos que mais aparecem no banco.
// Prefeitura não precisa: o município já está na linha. Órgão novo sem sigla
// aparece só com a razão social — acrescentar aqui quando surgir.
const SIGLAS: Record<string, string> = {
  '07424905000138': 'AMGESP',
  '12449880000167': 'FUNDEPES',
  // CNPJ da EBSERH usado por vários hospitais (HUPAA em Maceió, HU de Petrolina...).
  '15126437000305': 'EBSERH',
  '12200259000165': 'SESAU',
  '12517793000108': 'UNCISAL',
  '12473062000108': 'TJAL',
  '12472734000152': 'MPAL',
  '04649138000177': 'DPE/AL',
  '12442570000110': 'PMAL',
  '04302189000128': 'DETRAN/AL',
  '10825373000155': 'IFAL',
  '35562321000164': 'FAPEAL',
  '20279762000186': 'SERIS',
  '00509968000148': 'TST',
  '00348003000110': 'EMBRAPA',
}

// Sigla que o próprio PNCP já põe no fim da razão social, depois de hífen
// ("AGENCIA MUNICIPAL DE REGULACAO DE SERVICOS DELEGADOS- ARSER"). Mínimo de
// 3 letras pra não tomar a UF ("... - AL") por sigla.
const SIGLA_NO_NOME = /\s*-\s*([A-Z][A-Z0-9/]{2,11})\s*$/

export function siglaDoOrgao(cnpj: string | null, razaoSocial: string | null): string | null {
  if (cnpj && SIGLAS[cnpj]) return SIGLAS[cnpj]
  return razaoSocial?.match(SIGLA_NO_NOME)?.[1] ?? null
}

// "SIGLA · Razão social" — sem repetir a sigla quando ela já está no nome.
export function rotuloDoOrgao(cnpj: string | null, razaoSocial: string | null): string | null {
  const sigla = siglaDoOrgao(cnpj, razaoSocial)
  if (!sigla) return razaoSocial
  const nome = razaoSocial?.replace(SIGLA_NO_NOME, '').trim()
  return nome ? `${sigla} · ${nome}` : sigla
}

