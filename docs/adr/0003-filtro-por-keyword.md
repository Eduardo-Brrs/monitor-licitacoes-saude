# ADR 0003: Filtro por keyword no texto

- **Status:** Aceita
- **Data:** 2026-08; revisões até 2026-10

## Contexto

O PNCP traz todas as compras de Alagoas, e só uma parte interessa à empresa. O filtro precisa errar mais para o lado de mostrar demais: perder edital custa mais do que descartar ruído.

## Decisão

- **Lista de termos por segmento** em `lib/keywords.ts`, comparada com o objeto da compra por borda de palavra, ignorando acento e tratando plural e espaço no meio.
- **Termos compostos** (`TERMOS_COMPOSTOS`): palavras presentes em qualquer posição do texto.
- **Rede ampla aceita:** termos genéricos como `saúde` e `hospitalar`, com triagem manual.
- **Checagem de itens em segundo plano:** compra sem match no objeto vai para a fila `itens_pendentes`, e a descrição dos itens passa pelo mesmo motor.
- **Aquisição judicial sem keyword:** a própria frase-âncora já é o filtro.
- **Regressão obrigatória:** `npm test` compara os objetos reais com um retrato gravado. Fixture nunca é editada para o teste passar; mudança de propósito é conferida e gravada com `npm run test:retrato`.

## Alternativas

- **Filtro por CATMAT/CATSER:** testado em 2026-09-03. O campo veio vazio em todos os 18 itens de 2 editais de Alagoas.
- **IA para classificar:** custo e imprevisibilidade sem necessidade, e foge do princípio de ser enxuto.

## Consequências

- Keyword é reativa: cada gap achado vira termo novo, e o que passou da janela de reconsulta pode ser perdido.
- Motor por texto exige cuidado com português. Plural, acento e palavras separadas já causaram bugs reais.
- Há ruído conhecido, como `fio`, aceito de propósito.

## Avaliação hoje

**Manter.** As comparações de outubro acharam poucos gaps. O erro não foi a escolha, e sim os testes automáticos só existirem desde 2026-10-08: até lá, bugs como o do plural `-al/-ais` ficaram semanas sem ser vistos.
