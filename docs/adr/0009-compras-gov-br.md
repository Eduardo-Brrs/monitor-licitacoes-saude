# ADR 0009: Limites da integração com o Compras.gov.br

- **Status:** Proposta
- **Data:** 2026-10-29 e 2026-10-30; ordem revista em 2026-11-04

## Contexto

O dono da empresa pediu integração com o Compras.gov.br: lances, sessão, chat e proposta. O portal é usado em cerca de 40% dos editais do banco (medido em 2026-10-29). Os testes de 29 e 30/10 mostraram:

- Listas do portal usam captcha invisível resolvido pela própria página, então um robô no servidor não serve.
- O token do portal novo expira rápido; o portal antigo reabre o novo. A duração da sessão do antigo não foi medida.
- A API de Dados Abertos, sem login, traz resultados, fornecedores e preço praticado, mas nada ao vivo.

## Decisão proposta

- **Sem proposta, lance ou chat enviados pelo servidor.** Um erro obriga a empresa e pode gerar sanção (Lei 14.133, art. 155 e 156). Lance automático foi descartado por enquanto em 2026-10-29.
- **Parte 1, só servidor e sem login:** vencedor, preço e marca por item das compras em que participamos, "ganha" automático e preço por CATMAT.
- **Parte 2, extensão do Chrome no PC da empresa:** lê o que a página logada já carrega, e uma pessoa sempre confere e salva. Só depois de conferir duração do login, comportamento do captcha e se a tela de disputa mostra as propostas dos outros.
- **Ordem:** depois do login e da medição de uso.

## Alternativas

- **Guardar o login gov.br no servidor:** expõe credencial sensível e não contorna o captcha.
- **Usar só o portal oficial:** continua sendo o caminho para operar a sessão, sem custo nosso.

## Consequências

- A parte 1 cabe na arquitetura atual, com tabelas e rotinas novas.
- A parte 2 cria um componente fora do servidor, com manutenção própria, e depende de um Chrome logado.

## Avaliação hoje

**Esperando decisão.** Só deve avançar se a medição mostrar que resolve uma dor real e o dono da empresa responder às perguntas de 2026-10-30. Até lá, não implementar.
