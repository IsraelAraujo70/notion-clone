# Protocolo de blocos e operações

Este documento é o contrato canônico do protocolo. As representações tipadas ficam em [`packages/core/src/contracts.ts`](../packages/core/src/contracts.ts) e [`backend/src/domain/block.rs`](../backend/src/domain/block.rs). Mudanças devem manter os dois motores equivalentes.

## Modelo e invariantes

Tudo que o usuário escreve é um bloco. Página também é bloco e pode conter outros blocos. Cada bloco possui `id`, `workspaceId`, `type`, `properties`, `content`, `parentId`, estado de lixeira e versões de propriedade.

- `content` é a lista ordenada de filhos vivos; `parentId` define o pai. Os dois lados mudam atomicamente.
- O container raiz do workspace não aparece na sidebar e não pode ser movido ou apagado.
- Um bloco pertence a um único pai. Movimentos não aceitam ciclos nem autorreferência.
- Apagar remove a raiz da subárvore do `content` do pai, mas preserva os descendentes ligados a ela. Restaurar reverte esse processo.
- Índices são limitados ao intervalo válido. Restauração usa `trashedIndex`, ajustado caso a lista tenha mudado.
- Uma página filha aparece como link no conteúdo da página atual. Sua própria subárvore é carregada apenas ao abri-la.

Tipos atuais: `page`, `paragraph`, `heading1`, `heading2`, `heading3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `quote`, `code`, `callout`, `divider`, `image`, `mermaid`, `database` e `database_row`. As propriedades são JSON e variam por tipo. Blocos `mermaid` armazenam a fonte do diagrama em `properties.text`.

Um bloco `database` armazena `title`, `view` (`table` ou `board`), a lista dinâmica `statuses` e o `schema` de propriedades, incluindo nome, tipo, largura visual e, para `tags`, seu catálogo `options`. Os tipos atuais de propriedade são `title`, `text`, `number`, `checkbox`, `status`, `tags` e `date`. Valores de `tags` são listas de strings e valores de `date` são strings ISO no formato `YYYY-MM-DD`. O schema e os valores das linhas usam o `JSONB` de `properties`; não existe uma tabela paralela por propriedade. Suas linhas são blocos filhos `database_row`, ordenados pelo `content` do database, com `title`, `status` e valores adicionais indexados pelo id da propriedade. Tabela e Kanban são apenas visualizações da mesma lista de linhas; trocar a visualização não duplica conteúdo. Cada linha pode conter blocos e ser aberta como uma subpágina, mas continua pertencendo diretamente ao database.

Vínculos com pull requests são projeções externas associadas a um bloco `page` ou `database_row`; não são propriedades do bloco e não criam outro caminho de escrita de conteúdo. Instalações, snapshots e vínculos ficam em tabelas próprias com `workspace_id`. Arquivos e patches são buscados sob demanda no GitHub. Criar ou remover o vínculo não consome `seq`, enquanto qualquer alteração futura no conteúdo da nota continua obrigada a usar as operações deste protocolo. GitHub Issues e sincronização automática de status ainda não fazem parte do protocolo.

Blocos textuais, exceto `code` e `mermaid`, podem armazenar Markdown inline em `properties.text`. Os clientes preservam a fonte e renderizam somente o subconjunto `**negrito**`, `*itálico*`, `~riscado~`/`~~riscado~~` e `` `código` ``. Uma barra invertida escapa marcadores; delimitadores incompletos permanecem literais. HTML, links e imagens não são interpretados.

## Operações do cliente

Toda operação possui um `opId` UUID gerado pelo cliente.

| Tipo | Efeito |
| --- | --- |
| `insert_block` | Insere um bloco novo, sem filhos, em `parentId` e `index`. |
| `update_block` | Aplica um patch nas propriedades e pode alterar `blockType`. `null` remove uma propriedade. |
| `move_block` | Remove o bloco do pai atual e o insere em `newParentId` e `index`. |
| `delete_block` | Move uma subárvore viva para a lixeira. |
| `restore_block` | Restaura uma raiz da lixeira com seus descendentes. |

```json
{"type":"update_block","opId":"uuid","blockId":"uuid","properties":{"text":"Título"},"propVersions":{"text":3}}
```

O corpo de `insert_block` inclui um snapshot do bloco, mas o servidor substitui `workspaceId` e `parentId` pelos valores autorizados. Filhos devem ser criados em operações posteriores.

## Transferência entre workspaces

`transfer_subtree_out` e `transfer_subtree_in` são operações internas. O endpoint genérico de operações não as aceita e elas não entram no undo local.

`POST /workspaces/{id}/pages/{pageId}/transfer` move uma página viva, com toda a subárvore, para o topo de outro workspace. A ação exige `owner` nos dois workspaces e usa `transfer_id` como chave de idempotência. A mudança e os logs dos dois workspaces são confirmados na mesma transação.

Clientes da origem recebem `transfer_subtree_out`. Clientes do destino recebem `transfer_subtree_in` com o snapshot transferido. Links públicos são revogados e embeddings são recriados no destino.

## Idempotência, ordem e LWW

`opId` é único por workspace. Repetir uma operação aceita devolve o mesmo `{ "op_id": "…", "seq": 12 }`, sem reaplicar a mudança. Uma operação rejeitada não cria log nem consome `seq`.

Cada workspace possui um `seq` monotônico. A transação que aceita a operação também grava o log e atribui o cursor. Locks por workspace serializam alterações estruturais.

`update_block` resolve propriedades por LWW. `propVersions` informa a versão observada de cada chave; `_type` representa mudança de tipo.

- versão menor que a armazenada: ignora a chave;
- versão maior ou igual: grava a chave; empate usa ordem de chegada;
- versão ausente: usa a versão armazenada mais um.

## Aplicação otimista e undo

O frontend aplica a operação antes da rede e a coloca na fila HTTP. O backend aplica a mesma semântica. O eco WebSocket com `opId` próprio é ignorado. Se uma operação for rejeitada, a fila para e a interface oferece recarregar o estado remoto.

Undo emite operações inversas, em vez de restaurar snapshots fora do protocolo. Um grupo de IA só entra no histórico quando o cliente observa seu `last_seq`, garantindo que todas as operações transmitidas façam parte da inversão.

## Catch-up e WebSocket

O cliente abre `WS /workspaces/{id}/ws?token=…`. Depois da mensagem `hello`, busca `GET /workspaces/{id}/operations?after_seq=<cursor>`.

A primeira página fixa `latest_seq` como `up_to_seq`; as próximas mantêm esse limite. Eventos ao vivo ficam em buffer durante a recuperação. O cursor só avança quando o próximo `seq` contíguo está disponível. ACKs HTTP não avançam o cursor de entrega.

O WebSocket transmite operações, heartbeat e presença efêmera. Se o cliente detectar uma lacuna ou perder a conexão, deve reconectar e recuperar pelo log.

## Grupos de IA

`operation_groups` guarda origem, ordem e proveniência. Em grupos de IA, `source` é `ai` e a proveniência inclui execução, ação e modelo. O ator continua sendo o usuário autorizado. Todas as superfícies de IA, inclusive `workspace_agent`, podem propor operações. O usuário pode aprovar uma única proposta ou autorizar as próximas propostas da mesma conversa; essa autorização é limitada ao usuário, workspace e `conversation_id`, e nunca se aplica a outra conversa. Mesmo com autorização da conversa, cada proposta continua emitindo `approval_requested` e `approval_resolved`, sendo revalidada e aplicada separadamente. Rascunhos de blocos textuais usam `properties.text` e páginas usam `properties.title`; o compilador normaliza `rich_text` legado e rejeita inserções textuais sem conteúdo visível. Uma proposta não recebe `seq`, não entra no log, não é transmitida e não participa do undo. Somente após aprovação e nova validação de permissão/escopo ela passa pelo mesmo `ApplyOperationUseCase` do editor. Rejeições não consomem ordinal do grupo.
