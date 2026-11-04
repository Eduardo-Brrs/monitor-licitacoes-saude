-- Finalizar com resultado (pedido do usuário, 2026-10-27): ao encerrar uma
-- licitação gerenciada, diz o que aconteceu (ganhamos tudo, parte, nada;
-- anulada, fracassada, revogada; desistimos), quanto ganhou e uma
-- observação. Ganhou algo → status "ganha"; o resto → "finalizada".
-- O valor ganho é o total da licitação, não por item.

ALTER TABLE edital_status
  ADD COLUMN resultado TEXT,
  ADD COLUMN valor_ganho NUMERIC(14, 2),
  ADD COLUMN observacao_final TEXT,
  ADD COLUMN finalizada_em TIMESTAMPTZ;

ALTER TABLE diario_status
  ADD COLUMN resultado TEXT,
  ADD COLUMN valor_ganho NUMERIC(14, 2),
  ADD COLUMN observacao_final TEXT,
  ADD COLUMN finalizada_em TIMESTAMPTZ;

-- Texto pronto pra linha do tempo ("Finalizada: ganhamos parte dos itens,
-- R$ 12.000,00"). Mudança de etapa comum continua sem detalhe.
ALTER TABLE etapa_eventos ADD COLUMN detalhe TEXT;
