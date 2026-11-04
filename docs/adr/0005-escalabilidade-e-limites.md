# ADR 0005: Escalabilidade e limites

- **Status:** Aceita
- **Data:** 2026-10-07 e 2026-10-22; números atualizados em 2026-11-04

## Contexto

Com o sistema restrito a uso interno, sem virar produto para outras empresas, escalar aqui significa continuar funcionando por anos para uma empresa, sem custo novo de banco e sem manutenção frequente. Não significa suportar muitos clientes.

## Decisão

Dimensionar para uso interno, acompanhar os limites abaixo e só agir quando um gatilho for atingido.

| Limite | Situação | Gatilho para agir |
|---|---|---|
| Armazenamento do Neon grátis: 1 GB por projeto (página de preços, 2026-11-04) | 23 MB no banco (`pg_database_size`, 2026-11-04). O painel mostrou um número maior em outubro (42,77 MB contra 18 MB), diferença não investigada | Passar de 500 MB |
| Computação do Neon grátis: 100 CU-horas por mês; ao estourar, o banco para até o mês seguinte | Medido cerca de 77 por mês na grade antiga; estimado 25 a 30 na grade nova (não medido depois da mudança) | Passar de 70 no painel |
| Duração das funções | As 6 rotas declaram `maxDuration = 60`. A doc atual cita 300s no Hobby, ainda não testado | Rota terminando por tempo com frequência |
| Espera do cron-job.org: 30s | Rota lenta pode aparecer como falha lá e terminar normalmente. Conferir por `sync_runs` | Não se aplica |

**Medidas já tomadas**

- Rotinas juntas nos mesmos minutos e pausa de madrugada, para o banco suspender.
- Autoscaling do Neon travado em 0,25 CU.
- Orçamento de tempo nas rotas: o trabalho que não cabe fica para a rodada seguinte.
- **Limpeza nível 1** (`lib/limpeza.ts`): resume pendentes vencidos há 30 dias ou mais e apaga `sync_runs` com 90 dias ou mais.

**Medidas guardadas, só com gatilho**

- **Limpeza nível 2:** tirar `itens_json` e corpo antigo sem marcação de uso. Nunca apagar edital nem nada marcado.
- **Cópia dos PDFs:** o PNCP continua hospedando os anexos. Guardar cópia exige outro armazenamento (estudo em `o log de validação (privado)`, 2026-09-24); o Neon não serve para isso.

**Complexidade (medido em 2026-11-04):** o sistema é basicamente O(n), e o tempo vem da espera de rede, não do algoritmo. O motor de keyword leu 1.327 objetos em 0,7s. A exceção é a Pesquisa, que traz todo o banco a cada busca e filtra no código: 3,5 MB de editais hoje, com o banco crescendo cerca de 200 editais por mês. Filtrar no banco é o próximo trabalho.

## Alternativas

- **Plano pago do Neon desde o início:** desnecessário. O plano de uso (Launch) cobra por consumo e é a saída se os limites apertarem.

## Consequências

- O sistema aguenta anos neste volume, com a limpeza segurando o crescimento (medido em cerca de 4 a 5 MB por mês em 2026-10-22).
- Atraso de horas continua aceitável; não há tempo real.
- Depender do plano grátis significa que o banco pode parar ao estourar a cota, por isso o painel precisa ser olhado de vez em quando.

## Avaliação hoje

**Manter.** A folga é grande. O número a confirmar é o consumo real de computação com a grade nova, no painel do Neon.
