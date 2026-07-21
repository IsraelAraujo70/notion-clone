# Arquitetura

## Visão geral

Reason é um monorepo com frontend Next.js, API Rust e PostgreSQL com pgvector. A API e o worker usam o mesmo banco. MinIO substitui o armazenamento S3 no ambiente local. Em produção, frontend, API, worker e PostgreSQL rodam no Railway.

```text
Navegador ── HTTP / WebSocket / SSE ── API Rust ── PostgreSQL + pgvector
App Expo ─── HTTP / WebSocket / SSE ──────┤
Cliente MCP ── Streamable HTTP ────────────┤  │
     │                                      ├── armazenamento S3
     └── token com escopos e grants         ├── worker: mídia e embeddings
                                            └── GitHub App / REST API
```

## Frontend

`frontend/app/` contém rotas e limites do Next.js. Componentes de produto ficam nas respectivas features; `components/ui/` contém o código vendorizado do shadcn. As transformações da árvore e contratos compartilhados vivem em `packages/core/`, o transporte HTTP em `frontend/lib/api.ts` e a sincronização em `frontend/lib/sync/`. A feature `components/code-review/` contém parser e projeções puras de diff, além das superfícies unified/split; `components/github/` coordena instalação, vínculo e carregamento dos arquivos sem expor token GitHub ao navegador.

O editor mantém uma árvore local e aplica cada operação antes da resposta da rede. A fila envia operações em ordem e pode agrupar atualizações textuais pendentes. Alterações estruturais, undo e navegação preservam a ordem. O cliente ignora o próprio eco por `opId` e aplica eventos remotos pelo `seq` do workspace.

## Mobile

`mobile/` contém o cliente Expo/React Native, inicialmente direcionado ao Android. Sessões ficam no SecureStore e snapshots de workspaces e páginas ficam em SQLite para leitura sem conexão. A primeira versão é online-first: operações de escrita não são aceitas offline até existir uma fila persistente com reconciliação explícita. O editor nativo aplica texto, título, checklist, inserção, duplicação, transformação, movimento hierárquico e exclusão otimisticamente pela mesma fila de operações da web.

A navegação principal usa uma stack nativa plana para lista e editor. Fluxos transitórios, como aparência, usam `formSheet` no iOS e uma tela regular no Android. Componentes de domínio ficam em `mobile/features/`; o menu aberto por long press é uma superfície global sobre o editor e não altera a rota ativa da página.

O chat mobile usa as mesmas conversas e ações `workspace_agent` da web. `expo/fetch` mantém o SSE incremental; contratos e parser vivem em `packages/core/src/ai/`. O feed aplica eco otimista, preserva a posição quando o usuário consulta mensagens anteriores, acompanha deltas somente próximo ao fim e apresenta ferramentas como atividade compacta. O draft é persistido localmente por workspace e citações navegam para o bloco de origem.

`packages/core/` contém contratos, aplicação determinística de operações, undo e fila compartilhados entre web e mobile. Componentes visuais não são compartilhados: o editor web usa DOM, enquanto o mobile usa controles e gestos nativos que emitem as mesmas operações. O mobile reproduz as nove paletas light/dark da web e usa as mesmas famílias tipográficas Inter, Bricolage Grotesque e IBM Plex Mono.

## Desktop (spike)

`desktop/` contém um shell Electron experimental e online-first. Ele carrega o frontend web sem acesso Node no renderer, com isolamento de contexto, sandbox, sessão persistente e allowlist exata de origem. O preload expõe somente metadados estáticos versionados e não acessa credenciais. Navegações externas HTTP são abertas pelo sistema; outros protocolos, webviews e permissões não aprovadas são bloqueados. A decisão e os critérios para avançar estão em `docs/adr/desktop-electron.md`.

## Backend

O backend usa Ports and Adapters:

- `domain/`: blocos, operações, invariantes e erros determinísticos.
- `application/`: casos de uso, autorização e portas de infraestrutura.
- `adapters/`: HTTP/WebSocket, PostgreSQL, armazenamento, email e IA.
- `bootstrap/`: configuração, injeção de dependências, router e health check.

Handlers cuidam do transporte e chamam casos de uso. SQL, locks e transações pertencem ao adapter PostgreSQL. O domínio não conhece Axum, SQLx, variáveis de ambiente ou provedores externos.

## GitHub

A integração usa uma GitHub App opcional. O owner inicia a instalação com sessão Reason; o setup troca um state curto e de uso único por um segundo state OAuth. O destino interno de retorno é validado e persistido junto ao hash do state, sem aceitar URL arbitrária nem expor o UUID da página ao GitHub. O callback também trata cancelamento e só associa a instalação depois que a listagem paginada `GET /user/installations` confirma que o usuário OAuth tem acesso ao `installation_id` retornado pelo setup. Tokens OAuth e de instalação ficam apenas em memória. A chave privada e o client secret vêm do ambiente e nunca alcançam o frontend.

A migration `0021` descarta states OAuth efêmeros criados antes desse vínculo seguro; instalações iniciadas durante o deploy precisam ser reiniciadas, sem perda de instalação ou vínculo persistente.

`github_installations` e `github_pr_links` são projeções externas com isolamento por `workspace_id` e FKs compostas para bloco e instalação. Vincular exige `editor` ou `owner`; o alvo é validado antes da chamada externa e novamente na transação de persistência. Ler links, metadados e arquivos exige membership, e o editor consulta apenas o vínculo do bloco ativo. Diffs são carregados sob demanda com paginação e limite explícito; respostas truncadas informam que a revisão precisa continuar no GitHub. Essa persistência não altera `blocks`, o log de operações nem o cursor de sync.

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

O MCP é um adapter stateless montado em `/mcp`. Tokens de integração são separados das sessões do navegador, armazenados por hash e limitados por escopo, expiração e grants de workspace. As ferramentas reusam os casos de uso de páginas, embeddings, operações e vínculos GitHub; uma remoção de membership ou mudança de papel vale imediatamente. `github:read` e `github:write` são separados de `content:read` e `content:write` para que acesso a notas não conceda integração externa implicitamente.

Leituras de imagem partem de um `block_id` autorizado, não de uma chave S3 fornecida livremente. Escritas MCP passam pelo mesmo apply atômico, log, cursor e broadcast do editor e da IA; o `actor_id` permanece o usuário dono do token.

## Persistência e segurança

PostgreSQL guarda usuários, sessões, workspaces, membros, blocos, operações, links públicos, busca, dados de IA, embeddings e projeções GitHub. Todo conteúdo de tenant carrega `workspace_id`, usado também nos filtros de autorização.

`blocks` mantém `parent_id`, `content`, propriedades JSON e versões LWW. `operations` mantém a operação aceita, `op_id` e o `seq` monotônico. A mudança do bloco, o log e o cursor são atômicos.

Rotas privadas usam sessão bearer. `viewer` lê; `editor` e `owner` escrevem, publicam e removem permanentemente; apenas `owner` administra membros e exclui o workspace. Transferir conteúdo exige `owner` nos dois workspaces.

Links públicos são somente leitura, revogáveis e não expõem subpáginas. Imagens usam armazenamento compatível com S3; exclusões permanentes criam jobs para que o worker remova os objetos com retry.

## Decisões e limites

- LWW por propriedade e serialização estrutural substituem CRDT. A solução é simples e testável, mas duas edições concorrentes na mesma propriedade podem se sobrescrever.
- Uma página é uma árvore de blocos, não um documento rico único. Isso simplifica estrutura e sincronização, ao custo de formatação inline limitada.
- PostgreSQL concentra metadados, busca e vetores. É suficiente na escala atual; crescimento maior pode exigir particionamento por workspace.
- Ainda não existem réplica offline, permissão por página, databases estilo Notion, pub/sub entre réplicas ou observabilidade operacional completa.
