# Boletim — especificação de interface (fase 1, uso interno)

Referência visual: os HTML em `telas/`. Abra no navegador; eles navegam entre si. São **referência de aparência e comportamento**, não código para copiar: reconstruir com os componentes e o sistema de estilo que o projeto já usa.

Os dados nos HTML (órgãos, valores, processos) são fictícios.

## Contexto que molda o design

Sistema interno de uma distribuidora de material médico-hospitalar, focado só em editais da área da saúde. Usuário principal: o dono da empresa, no desktop, quase sempre. O uso real é 90% **triagem diária**: abrir o boletim, descartar a maioria em segundos, favoritar poucos. Tudo o que não serve à triagem é secundário e pode ser simples.

Fontes (revisto com o Eduardo em 2026-09-24): editais vêm do **PNCP**; além deles, oportunidades que **só aparecem nos diários oficiais** — aquisição judicial e pregões estaduais do DOE/AL, avisos de licitação/dispensa/cotação das prefeituras (diário da AMA e de Maceió). Os dois tipos ficam no **mesmo boletim do dia, em seções separadas** ("Editais · PNCP" e "Só nos diários oficiais"), nunca misturados na mesma lista. Ver tela 01.

> A tela "Avisos judiciais" original (intimação/citação/sentença contra a empresa, "enviar ao jurídico") foi **retirada em 2026-09-24** a pedido do Eduardo: o "judicial" que interessa é a *aquisição* judicial — oportunidade de venda —, não processo contra a Distribuidora Exemplo.

## Tokens

Definir como CSS variables (ou no tema do projeto) com estes nomes:

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#F6F5F1` | fundo da área principal |
| `--surface` | `#FFFFFF` | cards, inputs, tabela |
| `--surface-muted` | `#FBFAF7` | cabeçalho de página, itens já vistos |
| `--border` | `#E4E2DC` | bordas de card e divisores |
| `--border-strong` | `#D9D6CE` | bordas de input e botão |
| `--ink` | `#16181D` | texto principal |
| `--ink-2` | `#45494F` | texto de item já visto |
| `--muted` | `#5B6069` | metadados |
| `--faint` | `#74797F` | rótulos e texto terciário |
| `--sidebar` | `#16181D` | fundo da navegação |
| `--sidebar-active` | `#262A31` | item ativo da navegação |
| `--sidebar-text` | `#C9C7C0` | itens inativos da navegação |
| `--accent` | `#1B5E4B` | ação primária, não visto, ganho |
| `--accent-strong` | `#14402F` | hover, texto sobre `--accent-soft` |
| `--accent-soft` | `#E4EFE8` | fundo de "ganha", banner de detecção |
| `--warn` | `#A8431F` | prazo curto (abertura em até 5 dias, tarefa vencendo) |
| `--warn-strong` | `#8E3818` | não visto em avisos judiciais |
| `--warn-soft` | `#FBEDE7` | fundo de chip de prazo e de "Intimação" |

Tipografia: **Fraunces 600** só no `h1` de cada página e na marca. **IBM Plex Sans** 400/500/600 para todo o resto. **IBM Plex Mono** 500 para valores, contagens e números de processo, sempre com `font-variant-numeric: tabular-nums`.

Raios: 7px em botões e inputs, 10px em cards, 5px em badges. Alvos clicáveis de ícone: 40×40.

## Estrutura

Barra lateral fixa de 224px com três grupos rotulados:

- **Licitações**: Caixa de entrada (contador de não vistos: editais acumulados + avisos relevantes de diário dos últimos 7 dias), Favoritos, Acompanhamento, Tarefas (contador).
- **Arquivo**: Boletins anteriores.

(O grupo "Diário Oficial · DOE/AL" com "Avisos judiciais" saiu em 2026-09-24 — os avisos de diário entraram no boletim.)

Rodapé da barra: horário do último sync.

## Telas

### 01 · Boletim do dia — `telas/01-boletim-do-dia.html`

A tela mais importante. Cabeçalho com setas de dia anterior/próximo (próximo desabilitado no dia atual), título "Boletim de <dia da semana>, <dd/mm>" e link para boletins anteriores. Linha de resumo: publicados hoje, não vistos, dentro dos filtros. Busca e "Exportar CSV" à direita.

Faixa de filtros mostra os filtros ativos (UF, palavras-chave do catálogo, modalidades) e os atalhos de teclado.

Cada edital é uma linha com **exatamente seis informações**: objeto (link para o detalhe), órgão, município/UF, modalidade, valor estimado e data de abertura. Não adicionar campos.

- Não visto: ponto `--accent` à esquerda, fundo `--surface`, objeto em 600.
- Visto: sem ponto, fundo `--surface-muted`, textos em `--ink-2`/`--faint`, abaixo de um divisor "Já vistos".
- Abertura em até 5 dias: data em `--warn`.
- Ações na própria linha: favoritar e descartar. Triagem sem abrir o edital.
- Atalhos: `J`/`K` movem a seleção, `F` favorita, `D` descarta, `Enter` abre. A linha selecionada precisa de estado visível de foco.
- Rodapé: quantos editais do dia ficaram fora dos filtros, com link para ver todos.

**Lista única de editais e avisos de diário** (2026-09-24, revisto no mesmo dia com o Eduardo — a primeira versão tinha duas seções, PNCP e "Só nos diários", e ele observou que quem usa quer o que bate com os filtros, não importa de onde veio). Avisos de diário que não estão entre os editais do PNCP entram na mesma lista (pregão do DOE/AL e aviso municipal que o PNCP já trouxe aparecem só como edital).

- **Ordem**: não vistos primeiro; dentro disso, por urgência — abertura do edital ou data da sessão do aviso; cotação e aquisição judicial sem data contam como publicação + 5 dias (prazo típico de proposta); o resto sem data vai pro fim.
- **Etiqueta de origem em toda linha**: "PNCP" no edital; no aviso, o selo de tipo (Aquisição judicial em `--warn-soft`/`--warn-strong`; Cotação, Dispensa, Licitação, Pregão neutros) e o diário nos metadados. A etiqueta existe porque o clique leva a lugares diferentes: edital abre o detalhe (itens, anexos), aviso abre a **tela do aviso** (`/aviso/[fonte]/[id]`, desde 2026-09-28 — antes abria direto a publicação, e o Eduardo estranhou cair num PDF). A tela do aviso tem o texto publicado, o bloco **"Onde está o edital?"** explicando por tipo por que não há itens/anexos (aquisição judicial: TR pedido por e-mail; cotação: antes da licitação; licitação/dispensa municipal e pregão estadual: edital no portal, entra como edital quando chegar ao PNCP), os e-mails e links citados no texto, e a mesma lateral do edital. A seta da linha continua abrindo a publicação original.
- Linha de aviso: texto (objeto ou, na aquisição judicial, os itens da página), quem publicou, diário com edição/página, processo em mono, data da sessão quando existe. Coluna de valor fica vazia (diário não informa), pra manter as datas alinhadas com as dos editais.
- Linha de edital ganha a **contagem de anexos** ("3 anexos") nos metadados — exceção deliberada às "seis informações", pedida pelo Eduardo: anexo é o que se lê pra decidir.
- Cabeçalho: "N dentro dos seus filtros · M não vistos", somando as duas origens.
- **Fora dos filtros**: aviso de diário sem palavra-chave (aquisição judicial e cotação da SMS de Maceió contam sempre como dentro). Rodapé: "X publicações do dia ficaram fora dos seus filtros (Y do PNCP, Z dos diários) · mostrar os Z dos diários". A busca atravessa tudo, inclusive os de fora.
- **Textos sem a palavra "filtros"** (2026-09-28, Eduardo): "filtros" dava a entender que o usuário tinha filtrado algo, e o sistema inteiro já é de um nicho só. Na tela: "N da área da saúde · M não vistos"; rodapé "X publicações de outros assuntos (sem produto da área da saúde) ficaram de fora"; faixa "Monitorando" em vez de "Filtros"; no arquivo, colunas "Publicados em AL" e "Da área da saúde". No código os nomes internos (`nosFiltros`, `foraDosFiltros`) continuam.
- Mesma triagem pra tudo: ponto de não visto, divisor "Já vistos", favoritar, descartar com desfazer, descartados recuperáveis. Tooltip nos botões com o atalho ("Favoritar (F)", "Descartar (D) — dá pra desfazer"). Estado dos avisos em `diario_status`, mesmo modelo de `edital_status`.

### 02 · Detalhe do edital — `telas/02-edital-detalhe.html`

Cabeçalho com voltar, objeto como título, órgão, número do processo, data de publicação e um chip de prazo de abertura.

Coluna principal: grade de dados (órgão, município, valor estimado, modo de disputa, prazo de propostas, amparo legal, fonte, portal), tabela de **itens de interesse** (só os itens que batem com o catálogo, com "X de Y itens"), e anexos com download individual e "Baixar tudo (.zip)".

**Anexos sempre presentes** (2026-09-24, pedido do Eduardo): itens e anexos vêm de uma **cópia salva no banco** (preenchida por job a cada 30min e atualizada quando o PNCP responde), não do PNCP ao vivo. Quando falta algo, a seção diz por quê em `--warn-soft`: "PNCP não respondeu agora — lista salva em dd/mm, hh:mm (download pode falhar até ele voltar)", "ainda não conseguimos buscar — tentamos de novo a cada 30 min" ou "edital removido do PNCP pelo órgão"; nos três casos, link pro portal da disputa, que costuma ter os mesmos documentos. O arquivo em si continua hospedado no PNCP (cópia dos PDFs fica pra depois, se valer o custo de armazenamento).

Coluna lateral (306px): botão favoritar separado do seletor de status do pipeline; anotação em texto livre; tarefas com responsável (lista simples de nomes, sem login) e prazo.

### 03 · Acompanhamento — `telas/03-acompanhamento.html`

**Tabela única, não kanban.** Filtro de status em pílulas no topo com contagem: Todas, Favoritadas, Gerenciadas, Em andamento, Finalizadas, Ganhas. Ordenação padrão por abertura mais próxima.

Colunas: favorito (estrela, coluna própria), edital (objeto + órgão + número), status, abertura, valor estimado, responsável, próxima tarefa com prazo. Export em CSV.

### 04 · Edital concluído — `telas/04-edital-resultado.html`

Mesma rota do detalhe, no estado em que o PNCP já tem resultado ou contrato.

- **Banner de detecção**: quando existe contrato com o CNPJ da empresa como fornecedor, mostrar a sugestão com dois botões, "Confirmar como ganha" e "Não é nosso". Nunca marcar como ganha sem confirmação.
- **Resultado por item**: item, descrição, vencedor, valor homologado, sua proposta, diferença percentual. A coluna "Sua proposta" depende de um dado que o PNCP não fornece; só exibir quando existir.
- **Contrato**: fornecedor, valor global, assinatura, vigência.
- Lateral com **dois campos distintos**: "Status interno" (editável, manual) e "Situação no PNCP" (somente leitura, vindo do sync). Linha do tempo mostrando a data do fato e a data em que o sync capturou. Próxima verificação e botão "Verificar agora".

### 06 · Boletins anteriores — `telas/06-arquivo.html`

Navegação por mês (a aba "Avisos judiciais" saiu com a tela 05; avisos de diário contam junto do dia do boletim). Tabela de dias: data, publicados, nos filtros, não vistos (em `--warn` quando > 0), favoritados, link para abrir. Busca que atravessa todos os meses.

## Regras de comportamento e dados

Estas decisões já foram tomadas; não reabrir sem perguntar.

1. Favorito é um campo separado do status do pipeline.
2. `status_interno` é manual e o sync nunca o sobrescreve. `situacao_pncp` é somente leitura.
3. Situação vinda do PNCP é gravada como histórico append-only (uma linha por mudança, com `capturado_em`), não como campo único. É o que alimenta a linha do tempo.
4. O re-sync consulta resultados e contratos só dos editais marcados para acompanhar, periodicamente.
5. Valor desconhecido de enum do PNCP (ex.: `situacaoCompraItemResultadoNome`): guardar a string crua, exibir como veio e não alterar status nenhum.
6. Vitória detectada por CNPJ é sugestão com confirmação de um clique, nunca escrita automática.
7. ~~Avisos judiciais: exibir o prazo citado no texto.~~ (tela retirada em 2026-09-24)
8. Dias sem publicação aparecem no arquivo com zero, não somem.
9. Export é CSV; sem XLSX nesta fase.

## Fora do escopo desta entrega

O email/aviso diário ainda não foi desenhado. Login e permissões não existem nesta fase.

## Ordem sugerida

1. Tokens e shell (barra lateral + layout da página).
2. Boletim do dia, incluindo atalhos de teclado.
3. Detalhe do edital.
4. Acompanhamento.
5. Boletins anteriores.
6. ~~Avisos judiciais.~~ Substituído pela seção "Só nos diários oficiais" no boletim (feito em 2026-09-24).
7. Edital concluído (depende do job de re-sync e do histórico de situação).
