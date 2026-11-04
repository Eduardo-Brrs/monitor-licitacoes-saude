// Testes do motor de keyword (lib/keywords.ts). Cada caso é um problema real
// achado comparando boletins do ConLicitação — ver o log de validação (privado)
// pela data. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encontrarPalavrasChave, palavrasChaveDeDiario } from '../lib/keywords'

function bate(texto: string, ...esperadas: string[]) {
  const achadas = encontrarPalavrasChave(texto)
  for (const k of esperadas) assert.ok(achadas.includes(k), `"${texto}" devia bater "${k}", bateu ${JSON.stringify(achadas)}`)
}

function naoBate(texto: string) {
  assert.deepEqual(encontrarPalavrasChave(texto), [], `"${texto}" não devia bater nada`)
}

test('borda de palavra: keyword não casa dentro de outra palavra (2026-08-19)', () => {
  bate('Aquisição de macas para o hospital', 'maca')
  naoBate('Sistema de informação e automação')
  naoBate('Aquisição de macacão e formação de pessoal')
})

test('plural em cada palavra da frase, não só na última (2026-08-25)', () => {
  bate('Equipamentos médico hospitalares', 'médico hospitalar')
  bate('Materiais médico-hospitalares', 'médico hospitalar')
  bate('Oxigênios medicinais', 'oxigênio medicinal')
  bate('tubos a vácuo', 'tubo a vácuo')
  bate('bolsas de ostomia', 'bolsa de ostomia')
  bate('Monitores multiparâmetros', 'monitor multiparâmetro')
  bate('Kit de primeiros socorros', 'primeiro socorro')
})

test('plural -al → -ais (2026-09-01)', () => {
  bate('Gases medicinais', 'gás medicinal')
  bate('Suplementos nutricionais', 'suplemento nutricional')
  bate('dietas enterais', 'dieta enteral')
  bate('insumos laboratoriais', 'laboratorial')
})

test('plural irregular por dicionário (2026-09-02)', () => {
  bate('Colchões anti-escaras', 'colchão anti-escaras')
  bate('Aquisição de ultrassons portáteis', 'ultrassom')
  bate('Fórmulas infantis', 'fórmula infantil')
  bate('Álcoois em gel', 'álcool')
})

test('espaço no meio da palavra, com letra dobrada (2026-09-11)', () => {
  bate('Ultra som 1 e 3 MHz', 'ultrassom')
})

test('hífen e acento são ignorados', () => {
  bate('Raio X digital', 'raio-x')
  bate('raio-x', 'raio-x')
  bate('MATERIAL ODONTOLOGICO DIVERSOS', 'odontológico')
})

test('termos compostos: palavras em qualquer posição (2026-09-02 e 2026-09-03)', () => {
  bate('Equipamentos e Mobiliários destinados ao setor de urgência do Hospital Municipal', 'equipamento + hospital')
  // ficha técnica com "gás" longe de "medicinal" — DL/50/2026 Maceió
  bate('Gás comprimido, nome: oxigênio, característica adicional: medicinal', 'gás + medicinal')
  bate('AQUISIÇÃO DE MATERIAIS E INSUMOS DE LABORATÓRIO 03', 'insumo + laboratório')
  bate('Suplementos e fórmulas Alimentares', 'suplemento + alimentar')
})

test('suplemento + saúde aceita o nome do órgão só nos diários (2026-09-30)', () => {
  assert.deepEqual(
    palavrasChaveDeDiario('Aquisição de SUPLEMENTOS', 'Secretaria Municipal de Saúde - Aquisição de SUPLEMENTOS'),
    ['suplemento + saúde']
  )
  // nome do órgão sozinho não basta
  assert.deepEqual(palavrasChaveDeDiario('Aquisição de pneus', 'Secretaria Municipal de Saúde - Aquisição de pneus'), [])
  // e "suplemento" sozinho não pega suplementação orçamentária
  naoBate('Suplementação orçamentária')
})

test('casos reais de gap corrigidos', () => {
  bate('Material Odontológico Diversos', 'odontológico')
  bate('Dietas e Suplementos', 'dieta') // AMGESP PE/212
  bate('Aquisição de incubadora neonatal', 'incubadora')
  bate('Aparelho de CPAP e APAP', 'cpap', 'apap')
  bate('Reagentes para HPLC', 'reagente')
  bate('Cardioversor e desfibrilador', 'cardioversor', 'desfibrilador')
  bate('papel indicador de pH', 'papel indicador de ph')
  bate('filme radiográfico', 'filme radiográfico')
  bate('fórmula nutricional enteral e oral', 'enteral') // Piaçabuçu DL/2
  bate('Registro de preços para aquisição de material correlato', 'material correlato') // Estrela de Alagoas PE/16
})

test('controle negativo: objeto sem produto de saúde não bate nada', () => {
  for (const texto of [
    'Pavimentação de vias urbanas',
    'Locação de veículos',
    'Material de expediente',
    'Contratação de show artístico',
    'Aquisição de gêneros alimentícios',
    'Aquisição de cadeiras de escritório e mobiliário correlato',
    'Prestação de serviços de manutenção predial',
  ])
    naoBate(texto)
})

test('texto vazio não quebra', () => {
  assert.deepEqual(encontrarPalavrasChave(''), [])
})

test('material cirúrgico, mesa cirúrgica e material + limpeza (2026-11-04)', () => {
  assert.ok(encontrarPalavrasChave('Aquisição de Enxoval (Material Cirúrgico)').includes('material cirúrgico'))
  assert.ok(encontrarPalavrasChave('Aquisição de materiais cirúrgicos').includes('material cirúrgico'))
  assert.ok(encontrarPalavrasChave('Aquisição de Mesas cirúrgicas').includes('mesa cirúrgica'))
  assert.ok(encontrarPalavrasChave('Aquisição de Materiais de Plástico, Limpeza e Descartáveis').includes('material + limpeza'))
  assert.deepEqual(encontrarPalavrasChave('Aquisição de copos descartáveis'), [])
  assert.deepEqual(encontrarPalavrasChave('Aquisição de kits de enxoval'), [])
})
