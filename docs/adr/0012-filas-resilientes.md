# ADR 0012: Erro em um item não para a fila

- **Status:** Aceita
- **Data:** 2026-11-04

## Contexto

O mesmo erro aconteceu duas vezes:

- **03-04/10/2026:** um edital travado no PNCP ficou em primeiro na fila de anexos e gastou 16 rodadas seguidas.
- **03-04/11/2026:** a edição 2917 do DOE-AL veio com 16 MB, estourou o limite de 20s e derrubou a leitura de PDF. As edições seguintes ficaram presas atrás dela, e a captura de pregões e cotações estaduais parou por mais de 38 horas.

Em outubro foi corrigido só o caso daquela rotina. Isso deixou o problema vivo nas outras. O Eduardo definiu que é erro básico de sistema, que não pode passar.

## Decisão

**Regra básica: erro em um item nunca para a fila.** Toda rotina que percorre itens passa por `rodarFila` (`lib/fila.ts`), que garante:

1. **Isolamento:** a falha de um item não impede os seguintes.
2. **Rodízio:** quem falhou vai para o fim da fila na rodada seguinte (`fila_falhas`, `ordenarPorFalha`).
3. **Orçamento de tempo:** sem tempo, a rotina para de começar item novo e o resto fica para a próxima rodada.
4. **Aviso:** item falhando há 24 horas ou mais, com 3 ou mais tentativas, faz o vigia mandar e-mail.
5. **Teste:** `npm test` falha se uma rotina conhecida deixar de usar `rodarFila`.

Falha parcial não pinta a rodada de vermelho, para queda pontual não gerar alarme. Se nenhum item deu certo, a rodada registra erro normalmente.

### Rotinas auditadas em 2026-11-04

| Rotina | Antes | Agora |
|---|---|---|
| `/api/sync-doe` | Uma edição derrubava tudo | Isolada, com rodízio |
| `/api/sync` | Uma compra com dado ruim derrubava a rodada | Isolada, com rodízio |
| `/api/verificar-itens` | Isolada, mas voltava para a frente e o erro sumia | Rodízio e erro registrado |
| `/api/acompanhar` | Item preso voltava para a frente | Rodízio |
| Ligar avisos | Exceção derrubava o lote | Isolada, com rodízio |
| Diários municipais | Isolada | Com rodízio |
| `/api/atualizar-detalhes` | Já tinha rodízio próprio | Mantém o rodízio, usa `rodarFila` |

## Três camadas de reserva

1. **Item:** isolamento e rodízio mantêm a fila andando.
2. **Rotina:** o vigia roda a rotina que não começou ([ADR 0002](0002-fontes-e-agendamento.md)).
3. **Fonte:** janelas de reconsulta e caminhos alternativos, como busca e PDF no DOE-AL, recuperam o que passou.

## Alternativas

- **Corrigir caso a caso:** já falhou uma vez.
- **Fila externa (Redis, serviço de filas):** custo e complexidade sem necessidade neste volume.

## Consequências

- Uma tabela nova, `fila_falhas`, pequena e limpa depois de 30 dias sem falha nova.
- Item com problema permanente sai da frente, mas continua sendo tentado até sair da janela.
- `/api/sync-doe` passou a 120s de tempo máximo. Em produção, em 2026-11-04, as três edições presas foram lidas em 50s, incluindo a de 16 MB.

## Avaliação hoje

Decisão nova. Conferir se os avisos de item preso têm volume razoável, porque quedas longas do PNCP podem gerar alguns.
