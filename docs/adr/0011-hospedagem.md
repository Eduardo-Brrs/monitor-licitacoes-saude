# ADR 0011: Hospedagem

- **Status:** Proposta, em avaliação
- **Data:** 2026-11-04

## Contexto

O sistema está na Vercel, no plano grátis ([ADR 0001](0001-stack-e-operacao.md)). Está em avaliação migrar de hospedagem, mantendo custo zero ou baixo.

## Opções em avaliação

| Opção | Custo | Situação |
|---|---|---|
| **Cloudflare Workers, plano grátis** | Zero | **Favorita**, pela expectativa de migração leve e fácil |
| Outra plataforma grátis | Zero | A pesquisar |
| VPS barata | R$ 35 a 40 por mês | Sem limites de tempo; exige manutenção, atualização e backup |

## O que já foi conferido do Cloudflare (2026-11-04)

**A favor**

- Os termos do plano grátis atendem a este sistema. Eles proíbem, por exemplo, coletar dados de cartão de crédito em sites grátis, o que não se aplica aqui. Os limites de plano da documentação também valem.
- O adaptador OpenNext diz suportar Next.js 16.

**A testar antes de decidir.** Estes pontos podem tornar a migração menos leve que o esperado:

1. **CPU:** 10 ms por requisição no plano grátis, sem contar espera de rede. Ler um PDF de 484 páginas levou cerca de 8s aqui. A leitura de PDF do DOE-AL provavelmente não cabe e teria de rodar em outro lugar, como o GitHub Actions.
2. **PDF:** `pdf-parse` depende do pacote nativo `@napi-rs/canvas`. Não confirmamos que ele rode em Workers.
3. **Tamanho do Worker:** a documentação do OpenNext cita 3 MiB comprimidos no plano grátis, e a da Cloudflare cita 64 MiB sem limite comprimido. Conferir o valor vigente com um build real.
4. **Login:** o OpenNext diz que Middleware em Node ainda não é suportado, e o `proxy.ts` do Next 16 roda em Node. Isso afeta o desenho do [ADR 0007](0007-login-e-senha.md). As outras camadas do login não dependem do proxy.
5. **Agendamentos:** 5 por conta no plano grátis. O cron-job.org pode continuar, então não é bloqueio.
6. **Limite de 60 a 120s por rota** e downloads em streaming do zip de anexos precisam ser testados.

## Como decidir

1. Fazer uma prova em ramo separado, publicando numa conta grátis sem mexer na produção.
2. Testar boletim, ação de tela, uma rota de captura e leitura de PDF.
3. Se algum ponto acima falhar, medir o tamanho da mudança. A VPS é a saída se o Cloudflare exigir refazer muita coisa.

## Consequências

- Até a decisão, segue a Vercel, com o guia `docs/operacao.md`.
- O banco continua no Neon em qualquer opção, então os dados não migram.
- Decidir antes do login evita refazer a primeira camada dele, se a escolha afetar o `proxy.ts`.

## Avaliação hoje

Proposta aberta. A preferência é o Cloudflare; o maior risco técnico conhecido é a leitura de PDF.
