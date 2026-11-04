-- Execuções de captura por fonte (pedido do Eduardo, 2026-11-03). View, não
-- tabela: sync_runs já guarda fonte, horário, quantidade e erro de toda rota
-- de captura — tabela nova seria o mesmo dado gravado em dois lugares. Só pra
-- consulta; o alerta de fonte com erro ou zero item está em lib/saude.ts.
-- status 'vazio' = rodou sem erro e não achou nada (normal em várias fontes,
-- ver lib/saude-zero.ts).

CREATE OR REPLACE VIEW capture_runs AS
SELECT id,
       tipo        AS fonte,
       started_at  AS horario,
       finished_at,
       CASE WHEN erro IS NOT NULL THEN 'erro'
            WHEN COALESCE(total_api, 0) = 0 THEN 'vazio'
            ELSE 'ok' END AS status,
       total_api   AS itens,
       erro
FROM sync_runs;
