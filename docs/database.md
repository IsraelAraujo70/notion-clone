# Banco de dados: IA e embeddings

Migracoes `0012` a `0014` foram aplicadas com sucesso em PostgreSQL 17 com pgvector 0.8.4. O indice HNSW usa `halfvec_cosine_ops`.

## IA e proveniencia

- `operation_groups`: `workspace_id`, `actor_id`, `source` (`human`/`ai`), `provenance` e data. `actor_id` sempre identifica o humano que autorizou a escrita, inclusive quando `source = 'ai'`; a proveniencia da IA nao cria um ator artificial. `operations.group_id` e `group_ordinal` preservam a ordem por grupo.
- `ai_conversations` e `ai_messages`: conversas e mensagens privadas por usuario/workspace; mensagens guardam citacoes JSON.
- `ai_runs`: acao, estado, modelo, grupo, erro, `last_seq`, prazo e conclusao.
- `ai_usage_events`: tokens de prompt/conclusao por provedor, modelo e run.

O grupo e metadado do envelope da operacao, nao do payload canonico. `last_seq` permite esperar o cursor de sync antes de tornar um grupo elegivel para undo.

## Embeddings

`block_embeddings` tem chave `(workspace_id, block_id)`, modelo, hash SHA-256 de `modelo + byte NUL + conteudo`, `HALFVEC(3072)` e `embedded_at`. O modelo e `openai/text-embedding-3-large`.

`block_embedding_jobs` e a outbox duravel/coalescente com a mesma chave: uma mudanca substitui o trabalho pendente do bloco. Guarda conteudo, hash, modelo, dimensoes, tentativas, disponibilidade, erro e lease (`lease_token`/`leased_until`).

O worker usa `FOR UPDATE SKIP LOCKED`, lease de 120 segundos e lotes. So conclui se lease, hash, modelo e dimensoes ainda coincidirem; resultado obsoleto e descartado. Falhas liberam o lease e usam backoff exponencial de 5 segundos ate uma hora. Sem chave OpenRouter, os jobs permanecem pendentes.

O conteudo canonico concatena `title`, `text` e `caption` nao vazios; divisores e blocos vazios nao entram. Conteudo vivo existente foi enfileirado pela migracao e escritas posteriores atualizam a outbox na transacao.

## Recuperacao semantica

A consulta de vizinhos filtra `workspace_id`, modelo e membership antes do `LIMIT` HNSW. Depois elimina blocos/ancestrais na lixeira e a raiz interna do workspace. Contexto e citacoes, portanto, nao dependem de filtragem posterior em memoria.
