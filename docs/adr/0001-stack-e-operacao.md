# ADR 0001: Stack e operação

- **Status:** Aceita
- **Data:** 2026-08 (stack); 2026-11-03 (regra do CI); 2026-11-04 (aviso de deploy)

## Contexto

Ferramenta interna para 2 usuários, feita por uma pessoa, para substituir ou complementar uma assinatura paga de alertas de licitação. Precisava custar quase nada, ficar no ar sem manutenção de servidor e tolerar atraso de horas.

## Decisão

- **Next.js (App Router), React e TypeScript:** tela e servidor no mesmo projeto, com mutações por Server Actions.
- **Neon (Postgres serverless):** SQL de verdade, sem pausa forçada no plano grátis.
- **Vercel:** hospedagem sem servidor para administrar.
- **Poucas dependências:** 5 em produção. Zip, CSV e testes usam código próprio ou o Node.
- **Deploy manual e autorizado:** só com autorização do Eduardo e CI verde (tipos e testes) no commit.
- **Aviso de produção atrasada (a implementar):** a tela de status avisa quando há commit no `master` que não foi para o ar.

## Alternativas

- **VPS própria:** mais barata em escala, mas exige manutenção, atualização e backup.
- **Supabase:** traz login pronto, mas o sistema não precisava disso no início. Hoje o login próprio resolve ([ADR 0007](0007-login-e-senha.md)).
- **Deploy automático a cada push:** a ligação Vercel e GitHub falhou em 2026-08-17. Em 2026-11-04 o Eduardo preferiu manter o controle manual e fechar o esquecimento com um aviso.

## Consequências

- Custo atual de hospedagem e banco: zero.
- Sem deploy automático, a produção ficou parada de 17/08 a 02/09/2026. O cron rodava com o código do primeiro dia, e editais só capturáveis pelas correções daquele período foram perdidos de vez, em quantidade não medida.
- O código depende de convenções novas do Next 16. Antes de mexer, consultar `node_modules/next/dist/docs/`.

## Avaliação hoje

**Manter a stack.** Uma pendência:

1. **Aviso de produção atrasada.** Ainda não implementado.

O plano de hospedagem está em avaliação no [ADR 0011](0011-hospedagem.md). O cron-job.org está em [ADR 0002](0002-fontes-e-agendamento.md).
