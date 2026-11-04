# Decisões de arquitetura (ADRs)

ADR quer dizer *Architecture Decision Record*: um registro curto de uma decisão importante, do motivo dela e do que ela custa. Cada um traz a data real da decisão e uma seção "Avaliação hoje", que diz se ela continua boa. O balanço geral está no [ADR 0010](0010-revisao-e-licoes.md).

> Alguns ADRs citam dados internos da empresa e ficaram no repositório privado. A numeração é a mesma do repositório privado, por isso faltam números na lista.

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-stack-e-operacao.md) | Next.js, Neon e Vercel, com deploy manual | Aceita |
| [0002](0002-fontes-e-agendamento.md) | Fontes públicas, PDF de reserva e cron-job.org | Aceita |
| [0003](0003-filtro-por-keyword.md) | Filtro por palavra-chave no texto | Aceita |
| [0004](0004-modelo-do-banco.md) | Uma tabela por fonte e estado de uso separado | Aceita |
| [0005](0005-escalabilidade-e-limites.md) | Limites para uso interno | Aceita |
| [0007](0007-login-e-senha.md) | Login próprio com e-mail e senha | Aceita, a implementar |
| [0009](0009-compras-gov-br.md) | Limites da integração com o Compras.gov.br | Proposta |
| [0010](0010-revisao-e-licoes.md) | Revisão das decisões e lições | Aceita |
| [0011](0011-hospedagem.md) | Hospedagem: migrar da Vercel | Proposta |
| [0012](0012-filas-resilientes.md) | Erro em um item não para a fila | Aceita |
