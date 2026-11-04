-- Linha do tempo do edital (pedido do usuário, 2026-10-23): anotação deixa de
-- ser uma caixa só, reescrita a cada "Salvar", e vira uma lista de notas com
-- data e autor — mais as respostas às tarefas. A tela junta as notas com
-- mudança de etapa, tarefas e fatos do PNCP (lib/linha-do-tempo.ts).

CREATE TABLE notas (
  id          SERIAL PRIMARY KEY,
  fonte       TEXT NOT NULL,
  item_id     INTEGER NOT NULL,
  texto       TEXT NOT NULL,
  -- Sem login: quem escreveu é escolhido na tela e lembrado no navegador.
  autor_id    INTEGER REFERENCES responsaveis (id),
  -- Resposta a uma tarefa (o responsável de licitações responde ali o que o dono pediu).
  -- Tarefa excluída não leva a resposta junto.
  tarefa_id   INTEGER REFERENCES tarefas (id) ON DELETE SET NULL,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editada_em  TIMESTAMPTZ,
  -- Apagar só esconde: a nota é registro de trabalho, não some do banco.
  apagada_em  TIMESTAMPTZ
);

CREATE INDEX notas_item_idx ON notas (fonte, item_id);

-- Texto anterior de cada edição (o original fica guardado).
CREATE TABLE notas_versoes (
  id              SERIAL PRIMARY KEY,
  nota_id         INTEGER NOT NULL REFERENCES notas (id) ON DELETE CASCADE,
  texto           TEXT NOT NULL,
  substituida_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A anotação que já existia vira a primeira nota, com a data em que foi
-- salva. Autor: o primeiro responsável cadastrado (era quem escrevia as
-- anotações em 2026-10-23). A tabela antiga fica como estava, por segurança.
INSERT INTO notas (fonte, item_id, texto, autor_id, criada_em)
SELECT a.fonte, a.item_id, a.texto, (SELECT id FROM responsaveis ORDER BY id LIMIT 1), a.atualizado_em
FROM anotacoes a;

-- Aviso de diário ligado ao edital do PNCP quando ele aparece lá
-- (lib/ligar-avisos.ts): etapa, notas e tarefas passam pro edital, que tem
-- itens e anexos.
ALTER TABLE diario_status
  ADD COLUMN edital_id INTEGER REFERENCES editais (id),
  ADD COLUMN edital_ligado_em TIMESTAMPTZ,
  ADD COLUMN edital_buscado_em TIMESTAMPTZ,
  ADD COLUMN edital_busca_erro TEXT;
