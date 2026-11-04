# ADR 0007: Login e senha

- **Status:** Aceita, a implementar
- **Data:** 2026-11-04

## Contexto

O sistema começou mostrando só editais públicos. Com favoritos, tarefas, notas e atas, passou a guardar dados privados da empresa e precisa de controle de acesso por usuário. São poucos usuários internos, sem cadastro público e sem necessidade de login social. Entra antes da integração com o Compras.gov.br.

## Decisão

**Login próprio, com e-mail e senha, guardado no nosso banco.**

### Usuários e senha

- Uma migração nova acrescenta e-mail, hash da senha e papel em `responsaveis`, mantendo as ligações de `tarefas` e `notas`.
- Não há cadastro na tela. `scripts/criar-usuario.ts` cria o usuário e define senha.
- A senha é guardada com `scrypt`, do `node:crypto`, com sal por usuário e comparação em tempo constante. Nenhuma dependência nova.
- Não há recuperação por e-mail. O administrador redefine a senha pelo script.

### Sessão

- Tabela `sessoes` com o hash do token, validade e último uso. O token puro nunca fica no banco.
- Cookie `httpOnly`, `secure` e `sameSite=lax`, com validade de 30 dias renovada no uso.
- Sair apaga a sessão. Dá para derrubar a sessão de um computador perdido.
- Depois de 5 senhas erradas seguidas para o mesmo e-mail e IP, novas tentativas ficam bloqueadas por 15 minutos.

### Três camadas de proteção

Segue o guia de autenticação do Next 16, que manda tratar Server Actions como API pública e não usar o Proxy como única defesa.

1. **`proxy.ts`:** olha só o cookie e manda para `/login`. Fica rápido porque não consulta o banco. Depende da hospedagem ([ADR 0011](0011-hospedagem.md)).
2. **`lib/dal.ts`:** `verificarSessao()`, com `cache` do React, valida no banco e é chamada em toda página.
3. **Ações e downloads:** a mesma checagem nas 28 Server Actions e nas 5 rotas de download (4 CSVs e anexos).

Um teste em `npm test` falha se uma Server Action nova não chamar `verificarSessao()`. Isso impede que a proteção seja esquecida em código futuro.

### Outros ajustes

- **Rotas de captura:** as 6 e `/api/vigia` ficam fora do login e continuam com `CRON_SECRET`. As 6 passam a recusar quando a variável faltar, com uma checagem única, como `/api/vigia` já faz. Hoje, sem a variável, as 6 ficam abertas.
- **Autor:** vem da sessão. `criarNota` deixa de receber `autorId`, e `useAutor` e o seletor "Escrevendo como" saem.
- **Buscadores:** `noindex` no site inteiro.

### Ordem de entrada em produção

1. Implementar e testar localmente.
2. Com autorização do responsável pelo sistema, rodar a migração e criar os usuários **antes** do deploy, para ninguém ficar trancado.
3. Deploy com CI verde.
4. Conferir: login e saída, `/atas/csv` sem sessão, uma Server Action sem sessão e uma rodada de cada rota de captura.

## Em aberto

- **Quem vê custo e margem em `/atas`:** todos os usuários ou só o dono. A decisão é da empresa; o papel do usuário já comporta.
- **Conta do desenvolvedor:** precisa entrar sem necessariamente aparecer na lista de responsáveis por tarefa. Definir na implementação.

## Alternativas

- **Biblioteca (Better Auth, Auth.js):** menos código de segurança nosso, mas com dependência nova e tabelas no formato dela. Compensaria com login social, recuperação por e-mail ou várias empresas, nada disso necessário aqui.
- **Serviço pronto (Clerk, Neon Auth):** traz telas e recuperação prontas, mas os usuários ficam fora do nosso banco e pode haver custo ao crescer.
- **Senha única compartilhada:** rápida, mas não identifica quem fez cada coisa e não permite tirar o acesso de uma pessoa.
- **Sessão só em cookie assinado (sem banco):** evita uma consulta, mas não dá para derrubar uma sessão antes de expirar.
- **Proteção de deploy da Vercel:** a senha de deploy é paga e não identifica usuário.

## Consequências

- Código de segurança próprio é responsabilidade nossa. Por isso usamos só primitivas do Node e mantemos o desenho pequeno.
- Cada tela passa a depender de uma consulta de sessão, com impacto pequeno neste volume.
- Os usuários precisam entrar uma vez por computador.

## Avaliação hoje

Decisão nova. **Reavaliar** se houver mais de cerca de 10 usuários ou se recuperação por e-mail ou segundo fator se tornarem necessários. Sem várias empresas (o sistema é de uso interno), o login próprio é a solução definitiva.
