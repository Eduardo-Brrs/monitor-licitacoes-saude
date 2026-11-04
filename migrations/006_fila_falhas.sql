-- Memória de falhas das filas (2026-11-04). Item que falha vai pro fim da fila
-- na rodada seguinte e, se continuar falhando, o vigia avisa por e-mail. Linha
-- some quando o item dá certo. Ver lib/fila.ts e docs/adr/0012-filas-resilientes.md.
CREATE TABLE fila_falhas (
  fila               TEXT NOT NULL,
  chave              TEXT NOT NULL,
  tentativas         INTEGER NOT NULL DEFAULT 1,
  primeira_falha_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  falhou_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  erro               TEXT,
  PRIMARY KEY (fila, chave)
);
