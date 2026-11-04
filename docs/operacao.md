# Operação: quando os agendamentos param

O sistema tem custo zero e depende de serviços grátis sem garantia. Este guia diz o que fazer se algum deles parar. A decisão está nos ADRs [0001](adr/0001-stack-e-operacao.md) e [0002](adr/0002-fontes-e-agendamento.md).

## Como o aviso funciona

O workflow **Vigia dos agendamentos** (`.github/workflows/vigia.yml`) roda 8 vezes por dia, de 8h17 a 21h17 em Maceió, e pergunta a `/api/vigia` se cada rotina começou no horário, com 1 hora de tolerância.

| O que aconteceu | O que o vigia faz | O que chega para você |
|---|---|---|
| Tudo em dia | Nada | Nada |
| Rotina não começou | Roda a rotina e termina com falha | E-mail do GitHub, caso 1 |
| Site ou banco não respondeu | Termina com falha | E-mail do GitHub, caso 2 |
| Item preso numa fila há 24h ou mais | Termina com falha | E-mail do GitHub, caso 3 |

Enquanto o problema durar, o vigia mantém as rotinas rodando nos horários dele, com menos frequência que a grade normal, e o e-mail se repete.

**O vigia não olha se a rotina teve sucesso.** PNCP ou diário fora do ar é rotina e aparece em `/saude`.

O e-mail vai para quem criou o workflow, ou para quem mudou o horário ou reativou o workflow por último. Confira em GitHub, Settings, Notifications, se os avisos de Actions estão ligados por e-mail.

## Caso 1: agendamento parado

A captura continua pelo vigia, então não é emergência.

1. Entre em [cron-job.org](https://console.cron-job.org) e veja se as tarefas estão ativas e sem erro.
2. Se foi uma rodada solta, não faça nada: a próxima resolve.
3. Se a conta ou as tarefas sumiram, recrie a grade abaixo. Se o serviço acabou, use outro agendador com a mesma grade.

### Grade (fuso America/Sao_Paulo, mesmo horário de Maceió, todos os dias)

Toda tarefa usa `GET` e o cabeçalho `Authorization: Bearer <CRON_SECRET>`, no endereço do deploy (`APP_URL`).

| Rota | Horários |
|---|---|
| `/api/sync` | 9h00, 14h00 e 20h00 |
| `/api/sync-doe` | 9h01, 14h01 e 20h01 |
| `/api/sync-diarios-municipais` | 9h02, 14h02 e 20h02 |
| `/api/verificar-itens` | :00 e :30, das 7h às 21h |
| `/api/atualizar-detalhes` | :01 e :31, das 7h às 21h |
| `/api/acompanhar` | :02 e :32, das 7h às 21h |

Se mudar a grade, altere também `ROTINAS_VIGIADAS` em `lib/vigia.ts`. Sem isso, o vigia dá alarme falso ou deixa de avisar.

## Caso 2: site ou banco fora do ar

1. Abra o site e `/saude`.
2. Veja o [status da Vercel](https://www.vercel-status.com) e o painel do projeto.
3. Veja o painel do Neon. Se a cota de 100 CU-horas do mês acabou, o banco para até o mês seguinte.
4. **Conta da Vercel pausada:** leia o aviso deles. Os dados continuam no Neon. Enquanto isso:
   - No PC, com o projeto e o `.env.local` em dia, rode `npm run build` e `npm start`. O sistema abre em `http://localhost:3000`, e a equipe pode usar na mesma máquina.
   - Dispare as rotas à mão, nesta ordem, com o `CRON_SECRET` do `.env.local`: `/api/sync`, `/api/sync-doe`, `/api/sync-diarios-municipais`, `/api/verificar-itens`.
   - Exemplo: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync`
   - As janelas de reconsulta (7 dias no PNCP, 14 no DOE-AL) recuperam o que passou nesse período.
   - Depois decida entre resolver com a Vercel, contratar o Pro ou mudar de hospedagem.

## Caso 3: item preso numa fila

A rotina continua andando, porque um item com problema vai para o fim da fila ([ADR 0012](adr/0012-filas-resilientes.md)). Só aquele item está sem captura.

1. Abra o workflow que falhou no GitHub. O log mostra a fila, o item e o erro.
2. Veja se é queda da fonte. Nesse caso, o item volta sozinho.
3. Se for só aquele item, corrija a causa. Em 03/11 foi um PDF de 16 MB, grande demais para o limite da época.
4. Item que sai da janela de reconsulta deixa de ser tentado. Se ele importar, confira à mão antes disso.

## Testar o aviso

No GitHub, em Actions, abra **Vigia dos agendamentos**, clique em **Run workflow** e marque "Testar". Ele chama `/api/verificar-itens` de verdade, o que não causa problema, termina com falha e deve mandar o e-mail.
