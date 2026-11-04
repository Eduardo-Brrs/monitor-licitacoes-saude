# ADR 0002: Fontes de dados e agendamento

- **Status:** Aceita
- **Data:** 2026-08 a 2026-10, decisões incrementais

## Contexto

O valor do sistema é não perder edital relevante. Nenhuma fonte cobre tudo, e as fontes públicas caem com frequência. O detalhe de cada achado está em `o log de validação (privado)`.

## Decisão

**Fontes**

- **PNCP (Pregão e Dispensa):** fonte principal, API pública e obrigatória por lei.
- **DOE-AL:** aquisição judicial, pregão estadual e cotação. A busca do site travou em setembro de 2026 respondendo "sucesso" com dado velho, então a leitura do PDF de cada edição roda sempre, como caminho que não depende dela.
- **Diários municipais SIGPub (AMA, Maceió, Maceió Saúde):** avisos de prefeitura e cotações que chegam antes do PNCP ou nunca chegam.
- **Só Alagoas** na captura automática. A tela de pesquisa pode consultar outros estados.
- **Reconsulta com janela:** 7 dias no PNCP e 14 no DOE-AL. A deduplicação por chave natural torna isso barato e recupera o que uma queda deixou passar.

**Limites**

- **Nunca burlar captcha,** nem com serviço pago de resolver captcha.
- Só usar a API que o próprio site usa, sem login da empresa no servidor.

**Agendamento**

- **cron-job.org** chama as rotas de captura com `CRON_SECRET`.
- A grade concentra as rotinas nos mesmos minutos, só das 7h às 21h, para o banco acordar menos.
- **Vigia (2026-11-04):** o workflow `vigia.yml` confere 8 vezes por dia se cada rotina começou no horário. Se não começou, roda a rotina e manda e-mail pelo GitHub. Custo zero. Detalhes em `docs/operacao.md`.

## Alternativas

- **Vercel Cron:** o plano grátis só permite 1 execução por dia por job.
- **GitHub Actions:** usado até outubro de 2026, mas atrasava e pulava agendamentos (o job de 30 minutos rodava cerca de 7 vezes por dia).
- **Pagar por dados ou raspar portais com login:** contraria o custo perto de zero e aumenta o risco.

## Consequências

- Cada fonte nova exige cliente, tabela e tratamento próprios ([ADR 0004](0004-modelo-do-banco.md)).
- Ficam de fora o que não tem canal público sem captcha, como o SENAC-AL no Licitações-e.
- Queda de fonte é rotina, por isso a tela `/saude` acompanha último sucesso, falhas seguidas e fonte zerada.

## Avaliação hoje

**Manter.** Foi a área em que o método de testar com dado real mais funcionou: as comparações com o ConLicitação acharam fontes que nenhum levantamento teria previsto.

**cron-job.org mantido, com reserva (2026-11-04).** De 08/10 a 04/11 as contagens de rodadas bateram com a grade, sem rodada faltando. O serviço não garante disponibilidade e pode encerrar uma conta sem aviso; o uso aqui só dispara rotas, sem dado sensível. Era ponto único de falha, e só percebia quem abrisse `/saude`.

O vigia resolve isso sem custo. O GitHub Actions, que era ruim como agendador principal, serve como reserva, porque atraso de horas não atrapalha um aviso. Simulado contra o histórico real de 09/10 a 03/11: 208 conferências, nenhum alarme falso. Numa queda simulada às 11h, o primeiro alarme saiu às 12h17.

**Alternativa rejeitada:** cron da Vercel, que exige o Pro para rodar mais de uma vez por dia ([ADR 0001](0001-stack-e-operacao.md)).
