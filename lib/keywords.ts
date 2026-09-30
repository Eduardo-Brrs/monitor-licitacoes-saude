export interface Segmento {
  nome: string
  termos: string[]
}

export const SEGMENTOS: Segmento[] = [
  {
    nome: 'Materiais médico-hospitalares',
    termos: [
      'curativo',
      'sonda',
      'cateter',
      'seringa',
      'agulha',
      'luva',
      'atadura',
      'compressa',
      'esparadrapo',
      'dreno',
      'coletor urinário',
      'lanceta',
      'fio cirúrgico',
      'soro',
      'médico hospitalar',
      'correlatos',
      'fio',
      'material de laboratório',
      'equipamento de saúde',
      'laboratorial',
      'opme',
      'produtos para saúde',
      'tubo a vácuo',
      'bolsa de ostomia',
      'papel de filtro',
      'papel indicador de ph',
      // Confirmado com o Eduardo em 2026-09-11 que material odontológico
      // também é produto da empresa (mesmo tipo de expansão de
      // segmento já feita antes com laboratório clínico e medicamentos).
      // Achado investigando a pendência do PE/100/2026 (Maceió, "Aquisição
      // de Material Odontológico (Diversos)") — ficava 100% invisível pro
      // sistema porque nem as keywords amplas (saúde/hospitalar/médico/
      // clínico) batiam nesse texto.
      'odontológico',
      'odontologia',
      // Confirmado com o Eduardo em 2026-09-17 — mesmo tipo de expansão de
      // segmento. Achado investigando pendência de Jacaré dos Homens
      // ("materiais para fisioterapia"). Checado ruído antes de adicionar:
      // amostra de 311 itens já no banco (editais + itens_pendentes) tinha só
      // 2 ocorrências de "fisioter", as duas produto real (equipamento/material,
      // não serviço de fisioterapeuta) — nenhum falso positivo de contratação
      // de mão de obra/clínica encontrado na amostra.
      'fisioterapia',
      // Kit de primeiros socorros (Capela DL/27, "kit para primeiro socorros",
      // boletim de 23/09). A tolerância de plural por palavra cobre "primeiro
      // socorros" e "primeiros socorros". Adicionada em 2026-09-30.
      'primeiro socorro',
      // Consumível de laboratório clínico ("Aquisição de Reagentes (Testes)",
      // SESAU no DOE-AL, 18/09). Adicionada em 2026-09-30.
      'reagente',
    ],
  },
  {
    // Segmento novo — confirmado com o Eduardo em 2026-09-03 que medicamentos/
    // farmacêutico também é produto da empresa (não estava nos 6
    // segmentos originais). Termos amplos por decisão dele,
    // ciente do volume/ruído maior (medicamento é provavelmente a categoria
    // de saúde mais comum no PNCP em AL).
    nome: 'Medicamentos',
    termos: ['medicamento', 'farmacêutico'],
  },
  {
    nome: 'Equipamentos hospitalares',
    termos: [
      'cadeira de rodas',
      'cama hospitalar',
      'maca',
      'nebulizador',
      'oxímetro',
      'concentrador de oxigênio',
      'aspirador',
      'colchão anti-escaras',
      'andador',
      'ultrassom',
      'ultrassonografia',
      'cpap',
      'apap',
      'equipamento hospitalar',
      'autoclave',
      // Setor de hospital que compra peça, acessório e instrumento de
      // equipamento médico — pedido mensal do Hospital da Cidade (Maceió
      // Saúde), achado em 2026-09-30 (Aviso de Cotação 116/2026).
      'engenharia clínica',
      // Acessórios de monitor e de bateria de cardioversor comprados pela
      // SESAU por cotação no DOE-AL (ed. 2884 e 2893), que não batiam nada.
      // Adicionadas em 2026-09-30.
      'cardioversor',
      'desfibrilador',
      'monitor multiparâmetro',
      // Incubadora de laboratório (FUNDEPES/UFAL, DL/102356, boletim de 28/09,
      // sem a palavra "laboratório") e neonatal. Zero ruído no banco em
      // 2026-09-30.
      'incubadora',
    ],
  },
  {
    nome: 'Gases',
    termos: ['oxigênio medicinal', 'gás medicinal', 'ar comprimido medicinal', 'nitrogênio'],
  },
  {
    nome: 'Filmes radiológicos',
    termos: ['filme radiológico', 'filme radiográfico', 'raio-x', 'radiologia', 'contraste radiológico'],
  },
  {
    nome: 'Dieta enteral/parenteral',
    termos: [
      'dieta enteral',
      'nutrição enteral',
      'dieta parenteral',
      'fórmula infantil',
      'suplemento nutricional',
      'suplemento alimentar',
    ],
  },
  {
    nome: 'Higiene e limpeza',
    // `material de limpeza` adicionada em 2026-09-30 (cotação emergencial da
    // SESAU no DOE-AL, ed. 2893, "materiais de limpeza e insumos").
    termos: ['fralda', 'absorvente', 'álcool', 'hipoclorito', 'sabonete', 'luva de procedimento', 'material de limpeza'],
  },
  {
    // Termos deliberadamente amplos — decisão do Eduardo em 2026-09-02 de "soltar a rede"
    // em vez de continuar caçando keyword por keyword: cada um sozinho pega uma fração
    // grande de compras da área de saúde que não teriam palavra específica batendo,
    // mas também trazem bem mais ruído (ex: "saúde" pega até seguro de saúde de
    // servidor). Ruído aceito por decisão explícita — checagem manual por inventário
    // depois, mesmo critério já usado em `correlatos`/`fio`/`laboratorial`/`opme`.
    //
    // Só faz sentido contra o campo compacto objetoCompra do PNCP. Em texto livre
    // (ex: trecho de página do Diário Oficial) esses termos batem sem parar em
    // contexto administrativo qualquer (nome de secretaria, plano de saúde de
    // servidor etc) — excluído desse tipo de busca via `termosDeSegmentos`.
    nome: 'Captura ampla (ruído alto, triagem manual)',
    termos: ['saúde', 'hospitalar', 'médico', 'clínico'],
  },
]

export const SEGMENTO_CAPTURA_AMPLA = 'Captura ampla (ruído alto, triagem manual)'

export const TODOS_TERMOS: string[] = SEGMENTOS.flatMap((segmento) => segmento.termos)

// Lista de termos de um subconjunto de segmentos — usado quando o texto de entrada
// não é o objetoCompra compacto do PNCP e teria ruído demais com os termos amplos
// (ex: busca em texto livre do Diário Oficial do Estado).
export function termosDeSegmentos(excluirSegmentos: string[] = []): string[] {
  return SEGMENTOS.filter((segmento) => !excluirSegmentos.includes(segmento.nome)).flatMap(
    (segmento) => segmento.termos
  )
}

// Termos compostos: exigem todas as palavras presentes em qualquer ordem/posição no
// texto, não em frase adjacente como os termos normais. Cobre casos onde o edital
// menciona "equipamento" e "hospital" longe um do outro (ex: "Equipamentos e
// Mobiliários destinados ao setor de urgência e emergência do Hospital Municipal
// Ênio Ricardo Gomes"), que a keyword de frase "equipamento hospitalar" não pega.
// Aceita mais ruído em troca de cobertura — mesmo trade-off já aceito em outras
// keywords (correlatos, fio, laboratorial).
interface TermoComposto {
  rotulo: string
  palavras: string[]
  // Nos diários, o nome do órgão ("Secretaria Municipal de Saúde") é tirado
  // do texto antes do motor, pra `saúde` sozinha não bater em tudo. Termo com
  // esta marca também é procurado no texto original, com o nome do órgão —
  // ver compostosComNomeDoOrgao.
  aceitaNomeDoOrgao?: boolean
}

export const TERMOS_COMPOSTOS: TermoComposto[] = [
  { rotulo: 'equipamento + hospital', palavras: ['equipamento', 'hospital'] },
  // Editais de gás medicinal às vezes descrevem o produto como ficha técnica
  // ("Gás comprimido, nome: oxigênio... característica adicional: medicinal"),
  // com "gás" e "medicinal" longe um do outro — a keyword de frase "gás
  // medicinal"/"oxigênio medicinal" não pega. Achado em 2026-09-03 comparando
  // o boletim de 19/08 (DL/50/2026, Maceió).
  { rotulo: 'gás + medicinal', palavras: ['gás', 'medicinal'] },
  // Mesmo padrão de texto separado: "Suplementos e fórmulas Alimentares" não
  // bate a keyword de frase "suplemento alimentar" porque "alimentar" qualifica
  // "fórmulas", não fica colado em "suplemento". Achado em 2026-09-03 comparando
  // o boletim de 18/08 (Igaci, CP/SN) — moot nesse caso (canal CP morto), mas
  // baixo custo pra cobrir a mesma variação de texto em Pregão/Dispensa.
  { rotulo: 'suplemento + alimentar', palavras: ['suplemento', 'alimentar'] },
  // "Aquisição de SUPLEMENTOS" da Secretaria de Saúde (Santana do Mundaú CP/1,
  // AMA, boletim de 25/09) não batia nada. `suplemento` sozinho pegaria
  // "suplementação orçamentária"; junto de "saúde" fica na área. Nesse caso
  // o "saúde" é justamente o nome do órgão que compra, por isso a marca.
  // Adicionado em 2026-09-30.
  { rotulo: 'suplemento + saúde', palavras: ['suplemento', 'saúde'], aceitaNomeDoOrgao: true },
]

// Remove acentos e normaliza hífen/espaço para casar variações comuns de digitação em editais (ex: "raio x" vs "raio-x").
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/-/g, ' ')
}

// Casa por palavra/frase inteira (borda de palavra), não substring solta —
// evita falso positivo tipo "maca" batendo dentro de "informação" ou "automação".
// Plural é aceito em CADA palavra da frase, não só na última — editais quase
// sempre pluralizam a primeira palavra ("equipamentos hospitalares",
// "materiais médico hospitalares"), então só sufixar a última palavra deixava
// passar a maioria dos casos reais.
//
// Plurais irregulares que não seguem regra geral nenhuma de forma segura —
// tratados por dicionário de exceção em vez de tentar generalizar uma regra
// (ex: "-il" pluraliza diferente dependendo da sílaba tônica: "infantil"→
// "infantis" mas "fácil"→"fáceis", então uma regra geral arriscaria adivinhar
// errado pra palavra futura). Achado auditando todas as keywords em 2026-09-02.
const PLURAL_IRREGULAR: Record<string, string> = {
  colchao: 'colchoes', // colchão anti-escaras
  ultrassom: 'ultrassons',
  infantil: 'infantis', // fórmula infantil
  alcool: 'alcoois',
}

// Escapa e intercala espaço opcional entre cada letra — cobre o caso de uma
// palavra que "deveria" ser colada mas o PNCP publica com espaço no meio
// (ex: "Ultra som" em vez de "ultrassom"). Achado em 2026-09-11 comparando o
// boletim de 10/09 (Jacaré dos Homens, aparelho de ultrassom terapêutico não
// capturado por causa disso). Aplicado a TODA keyword, não só ultrassom — é
// o mesmo tipo de inconsistência de digitação de quem publica o edital, não
// específico de uma palavra, e o \b nas pontas garante que só casa começando
// e terminando exatamente na borda de palavra do texto (não cola fragmentos
// de palavras vizinhas: precisa da sequência exata de letras, na ordem, cada
// uma seguida no máximo por um espaço, começando num início de palavra real).
//
// Letra duplicada em sequência (ex: os dois "s" de "ultrassom") recebe
// tratamento especial: o primeiro "s" vira opcional. Motivo — quando a
// palavra fundida se separa em duas palavras reais ("ultra" + "som"), o
// português deixa de precisar dobrar o "s" (dobra é regra de "s" entre
// vogais só dentro da MESMA palavra), então a forma separada tem só 1 "s",
// não 2. Sem isso, "ultra som" nunca bateria "ultrassom" mesmo com espaço
// opcional entre letras — achado testando o caso real de Murici em
// 2026-09-11 (regra vale pra qualquer keyword futura com letra dobrada).
function comEspacoOpcional(palavra: string): string {
  const letras = palavra.split('')
  const partes: string[] = []
  let i = 0
  while (i < letras.length) {
    const c = letras[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (i + 1 < letras.length && letras[i + 1] === letras[i]) {
      partes.push(`${c}?\\s?${c}`)
      i += 2
    } else {
      partes.push(c)
      i += 1
    }
  }
  return partes.join('\\s?')
}

// Palavras terminadas em "-al" pluralizam de forma irregular (-ais, não -als):
// "medicinal"→"medicinais", "enteral"→"enterais". O sufixo regular (s|es) não
// cobre isso — achado testando "suplemento nutricional" contra texto real
// ("suplementos nutricionais") em 2026-09-01.
function sufixoPlural(palavra: string): string {
  if (palavra in PLURAL_IRREGULAR) {
    return `(${comEspacoOpcional(palavra)}|${comEspacoOpcional(PLURAL_IRREGULAR[palavra])})`
  }
  if (palavra.length > 2 && palavra.endsWith('al')) {
    return `${comEspacoOpcional(palavra.slice(0, -2))}(al|ais)`
  }
  return `${comEspacoOpcional(palavra)}(s|es)?`
}

function construirRegex(termo: string): RegExp {
  const palavras = normalizar(termo).split(' ').map(sufixoPlural)
  return new RegExp(`\\b${palavras.join('\\s+')}\\b`)
}

// Normaliza a palavra antes de montar a regex — sem isso, uma palavra com
// acento em TERMOS_COMPOSTOS (ex: "gás") nunca bateria contra o texto de
// entrada, que já passa por normalizar() antes de chegar aqui. Só não tinha
// aparecido antes porque nenhum termo composto anterior tinha acento.
// Achado em 2026-09-03 adicionando o termo "gás + medicinal".
function construirRegexPalavraSolta(palavra: string): RegExp {
  return new RegExp(`\\b${sufixoPlural(normalizar(palavra))}\\b`)
}

export function encontrarPalavrasChave(objetoCompra: string, termos: string[] = TODOS_TERMOS): string[] {
  if (!objetoCompra) return []
  const textoNormalizado = normalizar(objetoCompra)

  const simples = termos.filter((termo) => construirRegex(termo).test(textoNormalizado))

  const compostos = TERMOS_COMPOSTOS.filter(({ palavras }) =>
    palavras.every((palavra) => construirRegexPalavraSolta(palavra).test(textoNormalizado))
  ).map(({ rotulo }) => rotulo)

  return [...simples, ...compostos]
}

// Termos compostos marcados com `aceitaNomeDoOrgao`, procurados no texto
// original (com o nome do órgão). Usado pelos diários junto do resultado de
// encontrarPalavrasChave sobre o texto limpo.
export function compostosComNomeDoOrgao(textoOriginal: string): string[] {
  if (!textoOriginal) return []
  const textoNormalizado = normalizar(textoOriginal)
  return TERMOS_COMPOSTOS.filter(
    ({ palavras, aceitaNomeDoOrgao }) =>
      aceitaNomeDoOrgao && palavras.every((palavra) => construirRegexPalavraSolta(palavra).test(textoNormalizado))
  ).map(({ rotulo }) => rotulo)
}

// Keyword de texto de diário: termos normais no texto sem o nome do órgão,
// mais os compostos que aceitam o nome do órgão no texto original.
export function palavrasChaveDeDiario(textoLimpo: string, textoOriginal: string): string[] {
  return [...new Set([...encontrarPalavrasChave(textoLimpo), ...compostosComNomeDoOrgao(textoOriginal)])]
}
