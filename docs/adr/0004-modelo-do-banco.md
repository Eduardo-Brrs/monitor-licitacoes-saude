# ADR 0004: Modelo do banco

- **Status:** Aceita
- **Data:** 2026-08 a 2026-10; revisão em 2026-10-07

## Contexto

Cada fonte tem formato e chave próprios. O sistema precisa guardar o que foi capturado sem misturar com o que a equipe faz com cada item.

## Decisão

O banco é organizado em cinco grupos:

| Grupo | Tabelas | Regra |
|---|---|---|
| Captura | `editais`, `itens_pendentes`, `doe_al_matches`, `doe_al_licitacoes`, `doe_al_cotacoes`, `diario_municipal_materias` | Uma por fonte, com chave natural única para deduplicar |
| Estado de uso | `edital_status`, `diario_status`, `tarefas`, `notas`, `notas_versoes` | Separado da captura; item sem linha é "não visto" |
| Histórico | `edital_eventos`, `etapa_eventos` | Só acréscimo, nunca apagar |
| Negócio | `atas`, `ata_itens`, `ata_pedidos` | Preenchido à mão; contém dado comercial sensível |
| Operação | `sync_runs`, `doe_al_edicoes_verificadas`, `schema_migrations` | Controle das rotinas; `capture_runs` é uma view de consulta |

- **Boletim pelo dia da captura:** coluna `boletim_dia`, com corte às 18h e fim de semana indo para segunda.
- **Datas em vez de booleanos** no estado de uso, porque o "quando" alimenta desfazer e linha do tempo.
- **Migrações versionadas:** só arquivos novos em `migrations/NNN_*.sql`, uma transação por arquivo e hash em `schema_migrations`.
- **`responsaveis`** é a tabela de pessoas e será a base do login ([ADR 0007](0007-login-e-senha.md)).

## Alternativas

- **Tabela central de "oportunidades":** toda fonte pendurada numa tabela só. É o desenho mais limpo e evitaria as duas dívidas abaixo, mas exige migrar dados e reescrever as consultas de boletim, pesquisa e acompanhamento.

## Consequências

Dívidas conhecidas:

1. **`UNION` em código:** boletim, pesquisa e arquivo juntam as fontes em consultas próprias, e fonte nova repete esse trabalho.
2. **`(fonte, item_id)` sem chave estrangeira:** `diario_status`, `tarefas`, `notas` e `etapa_eventos` apontam para itens sem garantia do banco, então pode sobrar registro órfão.
3. **`anotacoes`** continua no banco depois da migração para `notas`; pode ser removida após conferência.

## Avaliação hoje

**Manter, sem refazer.** Separar captura de estado de uso foi a melhor decisão do banco. Uma tabela por fonte fazia sentido com uma fonte, e a hora de rever era na terceira. Com o sistema restrito a uso interno e o número de fontes estável, o custo de migrar não se paga. **Gatilho para reabrir:** duas fontes novas, ou um registro órfão com impacto real.
