-- Atas e contratos ganhos (pedido do usuário, 2026-10-27): o que vem depois
-- de "Finalizar → ganhamos". Substitui a planilha "Tabela de Licitações 2026"
-- (aba "Atas e Contratos válidos"). Preenchida à mão; a licitação de origem
-- no sistema (fonte, item_id) é opcional — ata antiga não passou por aqui.

CREATE TABLE atas (
  id             SERIAL PRIMARY KEY,
  tipo           TEXT NOT NULL DEFAULT 'ata' CHECK (tipo IN ('ata', 'contrato')),
  numero         TEXT NOT NULL,             -- "ARP 719/2025", "CONTRATO 184/2026"
  processo       TEXT,
  edital         TEXT,
  orgao          TEXT NOT NULL,
  destino        TEXT,
  prazo_entrega  TEXT,                      -- "20 Dias"
  validade       DATE,
  prorrogacao    TEXT,
  observacao     TEXT,
  fonte          TEXT,
  item_id        INTEGER,
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizada_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX atas_origem_idx ON atas (fonte, item_id);

-- Uma linha por produto ganho. Valor de compra = cotação original (orçamento
-- da época da licitação) × quantidade; margem atual = venda ÷ cotação
-- revisada − 1 (pedido do usuário, 2026-10-27). Contas feitas na tela, não guardadas.
CREATE TABLE ata_itens (
  id                  SERIAL PRIMARY KEY,
  ata_id              INTEGER NOT NULL REFERENCES atas (id) ON DELETE CASCADE,
  produto             TEXT NOT NULL,
  catmat              TEXT,
  marca               TEXT,
  fornecedor          TEXT,
  cotacao_original    NUMERIC(14, 4),
  cotacao_revisada    NUMERIC(14, 4),
  atualizacao_precos  TEXT,                 -- "Julho/2025"
  preco_venda         NUMERIC(14, 4),
  quantidade          NUMERIC(14, 2),
  quantidade_minima   NUMERIC(14, 2),
  pendencia           TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ata_itens_ata_idx ON ata_itens (ata_id);

-- Pedidos do órgão, em R$, um por linha com data — saldo a pedir = valor de
-- venda − soma dos pedidos. Data NULL = veio da planilha sem data.
CREATE TABLE ata_pedidos (
  id           SERIAL PRIMARY KEY,
  ata_item_id  INTEGER NOT NULL REFERENCES ata_itens (id) ON DELETE CASCADE,
  data         DATE,
  valor        NUMERIC(14, 2) NOT NULL,
  observacao   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ata_pedidos_item_idx ON ata_pedidos (ata_item_id);
