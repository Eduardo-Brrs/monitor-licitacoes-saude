# ADR 0010: Revisão das decisões e lições

- **Status:** Aceita
- **Data:** 2026-11-04

## Contexto

O sistema foi construído sem levantamento formal de requisitos. Em 2026-11-04 as decisões foram revistas para responder: foram boas, e quanto pesou não ter feito esse levantamento?

## Conclusão

**A base técnica é boa e não precisa ser refeita.** A falta de levantamento pesou de verdade em quatro pontos. Grande parte do resto só seria descoberta na prática.

## O que um levantamento teria evitado

| Pergunta que faltou | O que custou |
|---|---|
| Que dado privado vai entrar aqui? | Login planejado só depois de dados comerciais já estarem no sistema ([ADR 0007](0007-login-e-senha.md)) |
| Como vamos provar que valeu a pena? | Baseline nunca levantado, então o ganho não pode ser medido |
| Como o código chega à produção com segurança? | Produção parada de 17/08 a 02/09/2026, com editais perdidos de vez ([ADR 0001](0001-stack-e-operacao.md)) |
| Quantas fontes vão existir? | Tabelas por fonte juntadas em código ([ADR 0004](0004-modelo-do-banco.md)) |

## O que só a prática mostraria

- A aquisição judicial estar no DOE-AL, e não no PNCP.
- Os itens "CP" de Maceió serem cotações publicadas no diário municipal.
- O campo CATMAT vir vazio nos itens testados.
- A busca do DOE-AL travar respondendo "sucesso".
- O GitHub Actions atrasar agendamentos.

Nesses casos, comparar boletim por boletim foi o método certo.

## Placar das decisões

| Decisão | Avaliação |
|---|---|
| Stack | Boa |
| Keyword por texto | Boa, testada com dado real |
| PDF de reserva e cron-job.org | Boas, vieram de falhas reais |
| Não burlar captcha; não operar sessão pelo servidor | Boas, protegem a empresa |
| Estado de uso separado da captura | Boa |
| Uma tabela por fonte | Boa no início, revista tarde |
| Testes só em 2026-10-08 | Tarde; bugs ficaram semanas escondidos |
| Sem login no início | Deveria ter sido revista quando entraram dados privados |
| Deploy manual sem aviso | Causou perda real; aviso decidido, a implementar |
| Prioridade sem medir uso | Em aberto |

## Prioridade contra uso real

O aviso diário por e-mail é o item 1 do MVP e não existe, enquanto funções maiores foram construídas. A Fase 2 não começou formalmente.

Medido em 2026-11-04, desde que as marcações foram zeradas em 2026-09-28: 45 itens marcados como vistos, 19 acompanhados, 35 mudanças de etapa (a última em 30/10), 2 notas, 1 tarefa e 27 atas importadas. Esses números não contam quem usa a tela só para ler, e por isso a conversa com a equipe é necessária.

## Decisões

1. **Ordem:** otimizar a Pesquisa, prova do Cloudflare, login, medição de uso e baseline, depois Compras.gov.br.
2. **Medição com os usuários:** o que usam toda semana, o que não usam, o que perdiam antes, quanto tempo economizam, se ainda precisam do ConLicitação e quais licitações o sistema ajudou a ganhar.
3. **Regra nova:** ao incluir dado privado, usuário novo ou integração com credencial, revisar segurança antes do deploy.
4. **Regra nova:** quem implementa também aponta quando um pedido muda o risco do sistema, mesmo sem ter sido perguntado.

## Lições para o próximo projeto

Responder antes de começar:

1. Quem usa, e qual decisão ou tarefa isso melhora?
2. Como saberemos que deu certo? Medir o baseline antes.
3. Que dados sensíveis existirão? Aqui, com pagamento e dados de clientes, login e LGPD entram desde o primeiro dia.
4. Qual plano e quais termos valem para uso comercial?
5. Como o código vai para produção, e quem percebe se parar?
6. Testes e CI desde o primeiro commit.
7. ADR desde a primeira decisão estrutural.
8. Viabilidade antes de construir: mercado, custo e margem.

## Consequências

Este ADR funciona como levantamento formal, ainda que tardio. Deve ser atualizado com o resultado da medição.
