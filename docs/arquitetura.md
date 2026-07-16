# Arquitetura

## Visão geral

Reason é um monorepo com frontend Next.js, API Rust e PostgreSQL com pgvector. A API e o worker usam o mesmo banco. MinIO substitui o armazenamento S3 no ambiente local. Em produção, frontend, API, worker e PostgreSQL rodam no Railway.

```text
Navegador ── HTTP / WebSocket / SSE ── API Rust ── PostgreSQL + pgvector
Cliente MCP ── Streamable HTTP ────────────┤  │
     │                                      ├── armazenamento S3
     └── token com escopos e grants         └── worker: mídia e embeddings
```

## Frontend

`frontend/app/` contém rotas e limites do Next.js. Componentes de produto ficam nas respectivas features; `components/ui/` contém o código vendorizado do shadcn. As transformações da árvore vivem em `frontend/lib/engine/`, o transporte HTTP em `lib/api.ts` e a sincronização em `lib/sync/`.

O editor mantém uma árvore local e aplica cada operação antes da resposta da rede. A fila envia operações em ordem e pode agrupar atualizações textuais pendentes. Alterações estruturais, undo e navegação preservam a ordem. O cliente ignora o próprio eco por `opId` e aplica eventos remotos pelo `seq` do workspace.

## Backend

O backend usa Ports and Adapters:

- `domain/`: blocos, operações, invariantes e erros determinísticos.
- `application/`: casos de uso, autorização e portas de infraestrutura.
- `adapters/`: HTTP/WebSocket, PostgreSQL, armazenamento, email e IA.
- `bootstrap/`: configuração, injeção de dependências, router e health check.

Handlers cuidam do transporte e chamam casos de uso. SQL, locks e transações pertencem ao adapter PostgreSQL. O domínio não conhece Axum, SQLx, variáveis de ambiente ou provedores externos.

## Escrita e sincronização

1. O cliente aplica uma operação localmente e a envia por HTTP.
2. A API autoriza o usuário e grava a mutação, o log e o cursor na mesma transação.
3. Alterações estruturais são serializadas por workspace. A operação recebe o próximo `seq` e é publicada no hub.
4. O WebSocket entrega o evento. Após uma desconexão, o cliente busca o log desde o último `seq` contíguo e mantém eventos ao vivo em buffer até preencher as lacunas.

O hub WebSocket fica em memória e atende uma instância da API. O log durável evita perda de dados, mas várias réplicas da API exigiriam pub/sub entre instâncias. O protocolo não precisa mudar para isso.

## IA e embeddings

A IA é cliente do motor de operações. Ações de escrita validam o escopo e chamam o mesmo caso de uso usado pelo editor. O grupo registra `source: "ai"`; `actor_id` continua sendo o usuário que autorizou a ação. Q&A é somente leitura.

Conversas, execuções e uso são privados por usuário e workspace. O contexto e a busca semântica respeitam membership e lixeira. Embeddings ficam no PostgreSQL; uma outbox agrupa atualizações e o worker as processa com lease e retry. Não existe banco vetorial nem caminho de escrita exclusivo para IA.

## MCP

O MCP é um adapter stateless montado em `/mcp`. Tokens de integração são separados das sessões do navegador, armazenados por hash e limitados por escopo, expiração e grants de workspace. As ferramentas reusam os casos de uso de páginas, embeddings e operações; uma remoção de membership ou mudança de papel vale imediatamente.

Leituras de imagem partem de um `block_id` autorizado, não de uma chave S3 fornecida livremente. Escritas MCP passam pelo mesmo apply atômico, log, cursor e broadcast do editor e da IA; o `actor_id` permanece o usuário dono do token.

## Persistência e segurança

PostgreSQL guarda usuários, sessões, workspaces, membros, blocos, operações, links públicos, busca, dados de IA e embeddings. Todo conteúdo de tenant carrega `workspace_id`, usado também nos filtros de autorização.

`blocks` mantém `parent_id`, `content`, propriedades JSON e versões LWW. `operations` mantém a operação aceita, `op_id` e o `seq` monotônico. A mudança do bloco, o log e o cursor são atômicos.

Rotas privadas usam sessão bearer. `viewer` lê; `editor` e `owner` escrevem, publicam e removem permanentemente; apenas `owner` administra membros e exclui o workspace. Transferir conteúdo exige `owner` nos dois workspaces.

Links públicos são somente leitura, revogáveis e não expõem subpáginas. Imagens usam armazenamento compatível com S3; exclusões permanentes criam jobs para que o worker remova os objetos com retry.

## Decisões e limites

- LWW por propriedade e serialização estrutural substituem CRDT. A solução é simples e testável, mas duas edições concorrentes na mesma propriedade podem se sobrescrever.
- Uma página é uma árvore de blocos, não um documento rico único. Isso simplifica estrutura e sincronização, ao custo de formatação inline limitada.
- PostgreSQL concentra metadados, busca e vetores. É suficiente na escala atual; crescimento maior pode exigir particionamento por workspace.
- Ainda não existem réplica offline, permissão por página, databases estilo Notion, pub/sub entre réplicas ou observabilidade operacional completa.
