# MCP do Reason

O Reason expõe um servidor MCP stateless em `POST /mcp`. Cada requisição usa um token de integração em `Authorization: Bearer <token>`. O transporte responde JSON conforme Streamable HTTP e anuncia a versão MCP `2025-06-18`.

## Criar um token

Tokens são criados com uma sessão normal do Reason. O valor bruto aparece somente na resposta de criação; o banco guarda apenas seu hash.

Na interface, abra o menu do usuário e acesse **Configurações > Integrações**. Escolha o nome, a validade, os workspaces e as permissões. Copie o token assim que ele for criado, pois o segredo não será exibido novamente. A mesma tela lista e revoga tokens existentes.

Para automação, use a API:

```http
POST /integrations/mcp/tokens
Authorization: Bearer <sessão>
Content-Type: application/json

{
  "name": "OpenCode",
  "workspace_ids": ["uuid-do-workspace"],
  "scopes": ["content:read", "content:write", "search:read", "media:read"],
  "expires_in_days": 30
}
```

Escopos disponíveis:

| Escopo | Permite |
| --- | --- |
| `content:read` | Listar e ler páginas. |
| `content:write` | Aplicar operações tipadas. O papel atual ainda precisa ser `editor` ou `owner`. |
| `search:read` | Fazer busca semântica no workspace. |
| `media:read` | Receber o conteúdo de um bloco de imagem. |

Use `GET /integrations/mcp/tokens` para listar integrações e `DELETE /integrations/mcp/tokens/{token_id}` para revogar. Remover o usuário de um workspace também bloqueia o acesso imediatamente, mesmo que o grant continue no token.

## Configurar um cliente

Use a URL pública da API, não a URL do frontend:

```json
{
  "mcpServers": {
    "reason": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer rsn_mcp_SEU_TOKEN"
      }
    }
  }
}
```

No ambiente local, a URL padrão é `http://localhost:18080/mcp`.

### OpenCode

O repositório inclui `opencode.json` com o servidor remoto habilitado. Exporte o token no ambiente antes de iniciar o OpenCode:

```bash
export REASON_MCP_TOKEN=rsn_mcp_SEU_TOKEN
opencode
```

O arquivo versionado referencia `{env:REASON_MCP_TOKEN}` e nunca contém o segredo. O OpenCode carrega a configuração apenas ao iniciar; reinicie-o após alterar o token ou o arquivo.

## Ferramentas

| Ferramenta | Escopo | Uso |
| --- | --- | --- |
| `reason_list_workspaces` | qualquer | Lista apenas grants que ainda têm membership. |
| `reason_list_pages` | `content:read` | Lista páginas e a raiz interna. |
| `reason_read_page` | `content:read` | Retorna a árvore ordenada de blocos. |
| `reason_search` | `search:read` | Usa os embeddings existentes e retorna página, bloco, texto e score. |
| `reason_get_image` | `media:read` | Retorna metadados e conteúdo MCP `image` em base64. |
| `reason_apply_operations` | `content:write` | Aplica de 1 a 50 operações em uma transação. |

`reason_get_image` recebe `workspace_id` e `block_id`, nunca uma chave S3 livre. O servidor comprova membership, tipo do bloco, estado da lixeira e prefixo do objeto antes de baixar até 10 MiB.

`reason_apply_operations` aceita somente `insert_block`, `update_block`, `move_block`, `delete_block` e `restore_block`. O lote usa o motor canônico, mantém idempotência por `op_id`, incrementa `seq` e publica as alterações no WebSocket. Repetir ou reagrupar operações já aceitas devolve seus ACKs originais sem reaplicá-las.

## Segurança

- Tokens têm grants explícitos de workspace, escopos, expiração e revogação.
- Membership e papel são reavaliados em cada ferramenta pelos casos de uso existentes.
- Tokens de integração não autenticam rotas de perfil, senha ou administração.
- Requisições com header `Origin` são recusadas para reduzir risco de DNS rebinding.
- O body MCP é limitado a 1 MiB, lotes a 50 operações, busca a 50 resultados e imagens a 10 MiB.
- Logs HTTP usam o template da rota e não registram o header de autorização nem argumentos MCP.

O servidor é stateless: clientes devem enviar o bearer token em toda requisição. `GET /mcp` e sessões SSE não são necessários nesta versão porque não há notificações iniciadas pelo servidor.
