CREATE TABLE IF NOT EXISTS editais (
  id                          SERIAL PRIMARY KEY,
  numero_controle_pncp        TEXT UNIQUE NOT NULL,
  orgao_cnpj                  TEXT NOT NULL,
  orgao_razao_social          TEXT,
  ano_compra                  INTEGER NOT NULL,
  sequencial_compra           INTEGER NOT NULL,
  municipio_nome              TEXT,
  uf                          CHAR(2),
  objeto_compra               TEXT,
  modalidade_id               INTEGER,
  modalidade_nome             TEXT,
  situacao_id                 TEXT,
  situacao_nome               TEXT,
  srp                         BOOLEAN,
  valor_total_estimado        NUMERIC(15, 2),
  data_publicacao_pncp        TIMESTAMPTZ,
  data_abertura_proposta      TIMESTAMPTZ,
  data_encerramento_proposta  TIMESTAMPTZ,
  link_sistema_origem         TEXT,
  keywords_matched            TEXT[],
  raw_json                    JSONB,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id               SERIAL PRIMARY KEY,
  tipo             TEXT NOT NULL DEFAULT 'sync',
  data_consultada  DATE NOT NULL,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  total_api        INTEGER,
  total_matched    INTEGER,
  total_novos      INTEGER,
  erro             TEXT
);

ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'sync';

-- Compras cujo objeto geral não bateu nenhuma keyword, aguardando checagem
-- item a item (o objeto geral às vezes é genérico demais, mas um item
-- específico dentro da compra pode ser relevante — ex: ultrassom escondido
-- num pregão de equipamento agropecuário). Verificado em lotes pequenos por
-- /api/verificar-itens, espaçado ao longo do dia (não em bloco, pra não
-- estourar rate limit do PNCP nem o tempo máximo da função da Vercel).
CREATE TABLE IF NOT EXISTS itens_pendentes (
  numero_controle_pncp        TEXT PRIMARY KEY,
  orgao_cnpj                  TEXT NOT NULL,
  ano_compra                  INTEGER NOT NULL,
  sequencial_compra           INTEGER NOT NULL,
  data_abertura_proposta      TIMESTAMPTZ,
  data_encerramento_proposta  TIMESTAMPTZ,
  contratacao_json            JSONB NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'pendente', -- pendente | sem_match | match
  verificado_em               TIMESTAMPTZ,
  criado_em                   TIMESTAMPTZ DEFAULT NOW()
);

-- Achados de "aquisição judicial" (OPME/medicamento) no Diário Oficial do
-- Estado de Alagoas — canal separado do PNCP, publicado pela AMGESP, cobre
-- itens que não existem em nenhuma modalidade do PNCP nem no Diário do
-- Município. Ver lib/doe.ts. Sem número de controle canônico como o PNCP;
-- "pagina_id" (campo "id" da API do DOE-AL, único por página de edição) é a
-- chave de dedup.
CREATE TABLE IF NOT EXISTS doe_al_matches (
  id                SERIAL PRIMARY KEY,
  pagina_id         BIGINT UNIQUE NOT NULL,
  edition_id        BIGINT NOT NULL,
  edition_number    INTEGER,
  page_number       INTEGER,
  publication_date  DATE NOT NULL,
  processo_numero   TEXT,
  keywords_matched  TEXT[] NOT NULL,
  snippet           TEXT NOT NULL,
  pdf_url           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 'busca' (via searchES, o caminho normal) ou 'pdf_fallback' (baixa o PDF e lê
-- o texto direto, usado quando a busca full-text deles está indisponível ou
-- desatualizada — achado em 2026-09-14, ver o log de validação (privado)).
ALTER TABLE doe_al_matches ADD COLUMN IF NOT EXISTS fonte TEXT NOT NULL DEFAULT 'busca';

CREATE INDEX IF NOT EXISTS idx_doe_al_matches_data ON doe_al_matches (publication_date DESC);

-- Controla quais edições já tiveram o PDF baixado e verificado pelo fallback,
-- pra não reprocessar a mesma edição em todo run (PDF de 2-5MB, ~1-2s pra
-- extrair o texto). Guardado mesmo quando não acha nada ("ocorrencias" 0),
-- diferente de doe_al_matches (que só guarda achado positivo) — sem isso não
-- daria pra distinguir "ainda não verificou" de "verificou e não tinha nada".
CREATE TABLE IF NOT EXISTS doe_al_edicoes_verificadas (
  edition_id        BIGINT PRIMARY KEY,
  edition_number    INTEGER,
  publication_date  DATE,
  ocorrencias       INTEGER NOT NULL DEFAULT 0,
  verificado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Avisos de Pregão Eletrônico de órgãos estaduais (AMGESP, UNCISAL) lidos do
-- PDF do DOE-AL — backup pro PNCP quando ele cai, adicionado em 2026-09-23.
-- Ver extrairAvisosLicitacao em lib/doe.ts. Guarda todo aviso, não só os que
-- batem keyword: o objeto no diário é bem mais curto que no PNCP (ex: "Dietas
-- (suplementos)" não bate nada) e o volume é baixo (~20/semana), então
-- keywords_matched fica informativo, mesmo critério de doe_al_matches.
-- "processo" fica sem o prefixo "E:", no mesmo formato do campo processo do
-- PNCP depois de tirar o prefixo — é por ele que se cruza com editais.
-- Uma linha por aviso publicado: o mesmo processo aparece de novo se for
-- reaberto ou revogado, e "tipo" diz qual foi.
CREATE TABLE IF NOT EXISTS doe_al_licitacoes (
  id                  SERIAL PRIMARY KEY,
  processo            TEXT NOT NULL,
  tipo                TEXT NOT NULL,
  numero_pregao       TEXT NOT NULL,
  orgao_sigla         TEXT,
  numero_contratacao  TEXT,
  objeto              TEXT NOT NULL,
  data_realizacao     TIMESTAMPTZ,
  keywords_matched    TEXT[] NOT NULL DEFAULT '{}',
  edition_id          BIGINT NOT NULL,
  edition_number      INTEGER NOT NULL,
  page_number         INTEGER,
  publication_date    DATE NOT NULL,
  pdf_url             TEXT,
  trecho              TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (processo, tipo, edition_number)
);

CREATE INDEX IF NOT EXISTS idx_doe_al_licitacoes_data ON doe_al_licitacoes (publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_doe_al_licitacoes_processo ON doe_al_licitacoes (processo);

-- Edições verificadas antes de existir o extrator de licitações só tinham
-- passado pela busca da aquisição judicial. Nulo aqui = ainda falta ler os
-- avisos de licitação dessa edição (o sync reprocessa só essa parte).
ALTER TABLE doe_al_edicoes_verificadas ADD COLUMN IF NOT EXISTS licitacoes_verificadas_em TIMESTAMPTZ;

-- Edição normal e suplemento do mesmo dia têm o MESMO número (ex: 2886 e
-- 2886 suplemento) — achado em 2026-09-23. Com a identidade só por
-- edition_number (fix de 2026-09-21), o suplemento nunca era lido e, pior, se
-- ele aparecesse primeiro na lista a edição normal é que seria pulada.
-- Identidade passa a ser (edition_number, suplemento). Linhas antigas ficam
-- FALSE, e estão certas: todas têm ocorrências de aquisição judicial, que só
-- aparece na edição normal.
ALTER TABLE doe_al_edicoes_verificadas ADD COLUMN IF NOT EXISTS suplemento BOOLEAN NOT NULL DEFAULT FALSE;

-- Avisos de cotação estaduais que não são aquisição judicial (SESAU, AMGESP,
-- UNCISAL...), lidos do PDF do DOE-AL — adicionado em 2026-09-30, ver
-- extrairAvisosCotacao em lib/doe.ts. Guarda todos (a maioria não é da área),
-- a tela só mostra os que batem keyword no objeto. "chave" é o número de
-- protocolo da publicação no diário (único por aviso). Aviso sem protocolo
-- legível fica com uma chave montada da página e do objeto. "prazo" é o fim
-- do prazo de proposta ("05 dias úteis a partir desta publicação"), calculado
-- na captura.
CREATE TABLE IF NOT EXISTS doe_al_cotacoes (
  id                SERIAL PRIMARY KEY,
  chave             TEXT NOT NULL,
  orgao             TEXT,
  numero_cotacao    TEXT,
  processo          TEXT,
  objeto            TEXT,
  corpo             TEXT NOT NULL,
  keywords_matched  TEXT[] NOT NULL DEFAULT '{}',
  prazo             TIMESTAMPTZ,
  edition_id        BIGINT NOT NULL,
  edition_number    INTEGER NOT NULL,
  suplemento        BOOLEAN NOT NULL DEFAULT FALSE,
  page_number       INTEGER,
  publication_date  DATE NOT NULL,
  pdf_url           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (edition_number, suplemento, chave)
);

CREATE INDEX IF NOT EXISTS idx_doe_al_cotacoes_data ON doe_al_cotacoes (publication_date DESC);

-- Nulo = ainda falta ler as cotações dessa edição (mesmo esquema de
-- licitacoes_verificadas_em).
ALTER TABLE doe_al_edicoes_verificadas ADD COLUMN IF NOT EXISTS cotacoes_verificadas_em TIMESTAMPTZ;

-- Avisos dos diários oficiais municipais (AMA e Maceió, plataforma SIGPub) —
-- adicionado em 2026-09-23, ver lib/diario-municipal.ts. Uma linha por
-- matéria (publicação individual), chave natural = (diario, codigo), o código
-- identificador que o próprio diário dá a cada matéria. Guarda todo aviso
-- aberto (licitação, dispensa, cotação), keyword só informativa — mesmo
-- critério de doe_al_licitacoes. Aviso e reaviso do mesmo processo são
-- matérias diferentes, "processo" agrupa os dois.
CREATE TABLE IF NOT EXISTS diario_municipal_materias (
  id                SERIAL PRIMARY KEY,
  diario            TEXT NOT NULL,
  codigo            TEXT NOT NULL,
  titulo            TEXT NOT NULL,
  entidade          TEXT NOT NULL,
  orgao             TEXT,
  data_circulacao   DATE NOT NULL,
  edicao            INTEGER,
  processo          TEXT,
  objeto            TEXT,
  corpo             TEXT NOT NULL,
  keywords_matched  TEXT[] NOT NULL DEFAULT '{}',
  url               TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (diario, codigo)
);

CREATE INDEX IF NOT EXISTS idx_diario_municipal_data ON diario_municipal_materias (data_circulacao DESC);
CREATE INDEX IF NOT EXISTS idx_diario_municipal_keywords ON diario_municipal_materias USING GIN (keywords_matched);

-- Cópia dos anexos e itens de cada edital (2026-09-24). Antes a tela de
-- detalhe consultava o PNCP ao vivo e, com ele fora do ar, não mostrava nada
-- — pedido do Eduardo: edital tem que ter os anexos junto, e quando não der,
-- dizer por quê. Preenchido pelo /api/atualizar-detalhes (cron a cada 30min)
-- e atualizado pela própria tela quando o PNCP responde. NULL em arquivos_json
-- = ainda não conseguimos buscar (diferente de [] = o edital não tem anexo).
-- detalhe_erro guarda a última falha, pra tela explicar o que houve.
ALTER TABLE editais ADD COLUMN IF NOT EXISTS arquivos_json JSONB;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS itens_json JSONB;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS detalhe_atualizado_em TIMESTAMPTZ;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS detalhe_tentado_em TIMESTAMPTZ;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS detalhe_erro TEXT;

-- Estado de triagem por edital, alimentado pela interface (não pelo sync).
-- Uma linha por edital, criada só na primeira interação — edital sem linha
-- aqui é "não visto", que é o estado inicial de todo mundo. Favorito é campo
-- separado do status do pipeline por decisão de design (ver
-- docs/design/DESIGN.md, "Regras de comportamento e dados"), então quando o
-- status interno entrar ele vira coluna nova aqui, não um valor de favorito.
-- Datas em vez de booleanos em visto/descartado porque o "quando" é usado
-- pelo desfazer do descarte e pela linha do tempo de acompanhamento.
CREATE TABLE IF NOT EXISTS edital_status (
  edital_id      INTEGER PRIMARY KEY REFERENCES editais (id) ON DELETE CASCADE,
  favorito       BOOLEAN NOT NULL DEFAULT FALSE,
  visto_em       TIMESTAMPTZ,
  descartado_em  TIMESTAMPTZ,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mesmo modelo de edital_status, pros avisos dos diários (seção "Só nos
-- diários" do boletim, 2026-09-24). Os avisos vêm de três tabelas com ids
-- independentes, então a chave é (fonte, aviso_id): 'judicial' ->
-- doe_al_matches, 'doe_licitacao' -> doe_al_licitacoes, 'doe_cotacao' ->
-- doe_al_cotacoes (desde 2026-09-30), 'municipal' ->
-- diario_municipal_materias. Sem linha aqui = não visto.
CREATE TABLE IF NOT EXISTS diario_status (
  fonte          TEXT NOT NULL,
  aviso_id       INTEGER NOT NULL,
  favorito       BOOLEAN NOT NULL DEFAULT FALSE,
  visto_em       TIMESTAMPTZ,
  descartado_em  TIMESTAMPTZ,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fonte, aviso_id)
);

CREATE INDEX IF NOT EXISTS idx_edital_status_favorito
  ON edital_status (edital_id) WHERE favorito;

-- Acompanhamento (2026-09-28). Status interno do pipeline, manual — o sync
-- nunca escreve aqui (regra 2 do DESIGN.md). NULL = sem status, favorito é
-- eixo separado (regra 1). Valores: gerenciada, em_andamento, finalizada, ganha.
ALTER TABLE edital_status ADD COLUMN IF NOT EXISTS status_interno TEXT;
ALTER TABLE diario_status ADD COLUMN IF NOT EXISTS status_interno TEXT;

-- Responsáveis por tarefa: lista simples de nomes, sem login nesta fase.
CREATE TABLE IF NOT EXISTS responsaveis (
  id         SERIAL PRIMARY KEY,
  nome       TEXT UNIQUE NOT NULL,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cadastre os responsáveis: INSERT INTO responsaveis (nome) VALUES ('Fulano'), ('Beltrana');

-- Anotação e tarefas valem pra edital do PNCP e pra aviso de diário, então a
-- chave é (fonte, item_id) como em diario_status: fonte 'pncp' -> editais,
-- 'judicial' / 'doe_licitacao' / 'doe_cotacao' / 'municipal' -> tabelas dos diários.
CREATE TABLE IF NOT EXISTS anotacoes (
  fonte          TEXT NOT NULL,
  item_id        INTEGER NOT NULL,
  texto          TEXT NOT NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fonte, item_id)
);

CREATE TABLE IF NOT EXISTS tarefas (
  id              SERIAL PRIMARY KEY,
  fonte           TEXT NOT NULL,
  item_id         INTEGER NOT NULL,
  descricao       TEXT NOT NULL,
  responsavel_id  INTEGER REFERENCES responsaveis (id),
  prazo           DATE,
  concluida_em    TIMESTAMPTZ,
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_item ON tarefas (fonte, item_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_pendentes ON tarefas (prazo) WHERE concluida_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_editais_data_publicacao ON editais (data_publicacao_pncp DESC);
CREATE INDEX IF NOT EXISTS idx_editais_uf ON editais (uf);
CREATE INDEX IF NOT EXISTS idx_editais_keywords ON editais USING GIN (keywords_matched);
CREATE INDEX IF NOT EXISTS idx_sync_runs_data ON sync_runs (data_consultada DESC);
-- Ordena a fila por prazo mais próximo primeiro (não FIFO), pra edital
-- urgente não ficar esperando atrás de um sem pressa se a fila crescer.
CREATE INDEX IF NOT EXISTS idx_itens_pendentes_fila
  ON itens_pendentes (status, data_encerramento_proposta, data_abertura_proposta);


-- Acompanhamento automático (item 9 do MVP, 2026-09-28). Só editais
-- favoritados ou com status interno são reconsultados, a cada 12h
-- (app/api/acompanhar, lib/acompanhamento-pncp.ts). A situação geral da
-- compra no PNCP fica em "Divulgada" pra sempre, então o que vale é a
-- situação de cada item, o resultado (vencedor) por item, atas e contratos.
-- acompanhamento_json = retrato mais recente disso tudo.
ALTER TABLE editais ADD COLUMN IF NOT EXISTS acompanhamento_json JSONB;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS acompanhamento_em TIMESTAMPTZ;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS acompanhamento_tentado_em TIMESTAMPTZ;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS acompanhamento_erro TEXT;

-- Linha do tempo, só acréscimo (regra 3 do DESIGN.md): uma linha por fato
-- novo visto no PNCP, com a data do fato e a data em que o sync capturou.
-- chave identifica o fato (ex: 'contrato:7', 'homologados:10') e evita
-- gravar o mesmo fato duas vezes.
CREATE TABLE IF NOT EXISTS edital_eventos (
  id            SERIAL PRIMARY KEY,
  edital_id     INTEGER NOT NULL REFERENCES editais (id) ON DELETE CASCADE,
  chave         TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  descricao     TEXT NOT NULL,
  data_fato     TIMESTAMPTZ,
  capturado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dados         JSONB,
  UNIQUE (edital_id, chave)
);

-- "Não é nosso" no banner de vitória detectada: esconde a sugestão sem
-- mexer no status (regra 6, vitória por CNPJ é sempre sugestão).
ALTER TABLE edital_status ADD COLUMN IF NOT EXISTS vitoria_descartada_em TIMESTAMPTZ;


-- Data da sessão / prazo de proposta extraída do texto do aviso municipal
-- (extrairDataSessao em lib/diario-municipal.ts, 2026-09-28). NULL = o texto
-- não traz data reconhecível.
ALTER TABLE diario_municipal_materias ADD COLUMN IF NOT EXISTS data_sessao TIMESTAMPTZ;
