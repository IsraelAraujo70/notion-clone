# API

Base local: `http://localhost:18080`. Rotas privadas usam `Authorization: Bearer <session>`.

Leituras exigem membership. `viewer` apenas lê; `editor` e `owner` escrevem, publicam e removem conteúdo permanentemente; somente `owner` administra membros e exclui workspaces. Transferências exigem `owner` na origem e no destino.

Página privada ausente, em lixeira ou de outro workspace responde `404`. Links públicos inválidos, revogados ou apagados também respondem `404`, sem revelar se o conteúdo já existiu.

## Sistema e autenticação

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/`, `/health` | Identificação e health check. |
| POST | `/auth/signup`, `/auth/login` | Cria conta ou sessão. |
| POST | `/auth/password/forgot`, `/auth/password/reset` | Solicita ou conclui redefinição de senha. |
| POST | `/auth/password/change`, `/auth/logout` | Altera a senha ou encerra a sessão. |
| GET/PATCH | `/auth/me` | Consulta ou altera nome e avatar. |
| POST | `/auth/me/avatar/presign` | Gera URL de upload para JPEG, PNG ou WebP. |
| GET | `/app/summary` | Dados iniciais do shell autenticado. |
| GET/POST | `/integrations/mcp/tokens` | Lista ou cria tokens MCP. |
| DELETE | `/integrations/mcp/tokens/{token_id}` | Revoga um token MCP. |

Para alterar o avatar: peça o presign, envie o arquivo para a URL retornada e grave a chave com `PATCH /auth/me`.

## Workspaces e membros

| Método | Rota | Uso |
| --- | --- | --- |
| GET/POST | `/workspaces` | Lista ou cria workspace. |
| DELETE | `/workspaces/{workspace_id}` | Exclui workspace. |
| GET | `/workspaces/{workspace_id}/members` | Lista membros. |
| PATCH/DELETE | `/workspaces/{workspace_id}/members/{user_id}` | Altera papel ou remove membro. |
| GET/POST | `/workspaces/{workspace_id}/invites` | Lista ou cria convite. |
| DELETE | `/workspaces/{workspace_id}/invites/{invite_id}` | Revoga convite. |
| GET | `/workspace-invites/{token}` | Exibe um convite sem exigir sessão. |
| POST | `/workspace-invites/{token}/accept` | Aceita o convite autenticado. |

Papéis válidos: `owner`, `editor` e `viewer`.

## Páginas, operações e sync

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/workspaces/{workspace_id}/pages` | Árvore da sidebar e raiz interna. |
| GET | `/workspaces/{workspace_id}/pages/{page_id}` | Subárvore, breadcrumbs, editores recentes e `seq`. |
| POST | `/workspaces/{workspace_id}/operations` | Aplica uma operação do [protocolo](protocolo.md). |
| GET | `/workspaces/{workspace_id}/operations?after_seq=&limit=&up_to_seq=` | Log paginado para catch-up. |
| GET | `/workspaces/{workspace_id}/ws?token=` | WebSocket de operações e presença. |
| POST | `/workspaces/{workspace_id}/pages/{page_id}/transfer` | Transfere página e subárvore. |

`POST /workspaces/{workspace_id}/operations` aceita as cinco operações de cliente e retorna `{ "op_id": "uuid", "seq": 12 }`. O catch-up usa limite padrão de 500 e máximo de 1000.

Transferência:

```json
{"destination_workspace_id":"uuid","transfer_id":"uuid"}
```

```json
{"transfer_id":"uuid","source_seq":19,"destination_seq":7}
```

## Busca, compartilhamento, lixeira e mídia

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/search?q=&limit=` | Busca textual nos workspaces acessíveis. |
| GET/POST/DELETE | `/workspaces/{workspace_id}/pages/{page_id}/public-link` | Consulta, cria ou revoga link público. |
| GET | `/public/pages/{token}` | Lê uma página pública sem suas subpáginas. |
| GET | `/workspaces/{workspace_id}/trash` | Lista raízes apagadas sem outro ancestral no lixo, com tipo e contexto da página mais próxima. |
| DELETE | `/workspaces/{workspace_id}/trash/{block_id}` | Exclui uma raiz permanentemente. |
| POST | `/workspaces/{workspace_id}/uploads/presign` | Gera URL de upload de imagem. |
| GET | `/media/{key}` | Redireciona para uma URL temporária do objeto. |

Cada item da lixeira contém `id`, `type`, `title`, `trashed_at`, `page_id` e `page_title`. Os dois campos de página são `null` quando não há uma página visível na ancestralidade. Busca aceita `q` entre 2 e 200 caracteres e `limit` de até 50. A exclusão permanente retorna `202` e agenda a limpeza dos arquivos.

## IA

| Método | Rota | Uso |
| --- | --- | --- |
| GET/POST | `/workspaces/{workspace_id}/ai/conversations` | Lista ou cria conversa privada. |
| GET | `/workspaces/{workspace_id}/ai/conversations/{conversation_id}/messages` | Lista mensagens da conversa. |
| GET | `/workspaces/{workspace_id}/ai/runs/{run_id}` | Consulta uma execução do usuário. |
| POST | `/workspaces/{workspace_id}/ai/runs/{run_id}/proposals/{proposal_id}` | Aprova ou rejeita uma operação proposta. Aceita `{ approved, allowConversation }`; `allowConversation` autoriza propostas futuras somente na conversa ativa. |
| POST | `/workspaces/{workspace_id}/ai/actions/{action}` | Executa uma ação e retorna SSE. |

`action` aceita `continue_writing`, `summarize_page`, `transform_selection`, `transform_page` ou `workspace_agent`. O body contém `prompt` e pode incluir `conversationId`, `pageId`, `selection` e `mentionedPageIds`. Leituras exigem membership; qualquer operação proposta exige `editor` ou `owner` e só passa pelo apply canônico após aprovação única ou autorização explícita da conversa. `transform_page` recebe `pageId` e o servidor deriva a subárvore mutável completa; `transform_selection` continua restrito aos IDs de `selection`.

O stream SSE envia `run`, `text`, `tool`, `approval_requested`, `approval_resolved`, `usage`, `completion` ou `run_failed`, além de keep-alive.

## MCP

`POST /mcp` implementa o transporte MCP stateless. Diferentemente das outras rotas privadas, usa um bearer token com prefixo `rsn_mcp_`, grants de workspace e escopos próprios. O endpoint oferece leitura de páginas, busca semântica, imagens multimodais e escrita pelo motor de operações.

O contrato, os escopos e a configuração dos clientes estão em [mcp.md](mcp.md).
