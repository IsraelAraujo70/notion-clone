# API de IA

M5 concluido e verificado em 2026-07-14. Todas as rotas exigem `Authorization: Bearer <token>` e sao isoladas por `workspace_id` e usuario. O smoke no deploy/Railway permanece trabalho de M6.

## Provedor

O unico adaptador implementado e OpenRouter, usando Chat Completions com streaming e ferramentas `function`, e `/embeddings` para vetores. O chat padrao e `openai/gpt-5.6-luna`; o embedding e fixo em `openai/text-embedding-3-large`, com 3072 dimensoes.

Sem `OPENROUTER_API_KEY`, a API usa um provedor noop e as chamadas de IA falham como indisponiveis; o worker nao processa embeddings e deixa os jobs pendentes. O modelo de embedding e fixo pelo schema: outro valor em `AI_EMBEDDING_MODEL` faz o processo falhar na inicializacao.

| Variavel efetiva | Processo | Default/regra |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | API e worker | Necessaria para chamadas ao OpenRouter. |
| `OPENROUTER_BASE_URL` | API e worker | `https://openrouter.ai/api/v1`. |
| `AI_CHAT_MODEL` | API | `openai/gpt-5.6-luna`. |
| `AI_TITLE_MODEL` | API | `deepseek/deepseek-v4-flash`; gera um titulo curto na primeira mensagem da conversa. |
| `AI_EMBEDDING_MODEL` | API e worker | Deve ser `openai/text-embedding-3-large`. |
| `EMBEDDING_DIMENSIONS` | worker | Deve ser `3072`. |
| `EMBEDDING_BATCH_SIZE` | worker | 32, limitado entre 1 e 100. |
| `WORKER_INTERVAL_SECONDS` | worker | 5 segundos, minimo 1. |

## Conversas, mensagens e execucoes

- `GET /workspaces/{workspace_id}/ai/conversations`: lista conversas privadas do usuario, por atualizacao decrescente.
- `POST /workspaces/{workspace_id}/ai/conversations`: cria conversa privada; body opcional `{ "title": "Planejamento" }`. O titulo e limitado a 120 caracteres.
- `GET /workspaces/{workspace_id}/ai/conversations/{conversation_id}/messages`: lista as mensagens do proprio usuario em ordem cronologica.
- `GET /workspaces/{workspace_id}/ai/runs/{run_id}`: consulta run do proprio usuario, incluindo `action`, `status`, `model`, `operation_group_id`, `error`, `last_seq`, prazo e timestamps.

Conversas, mensagens, runs e uso sao persistidos. Cada evento de uso registra provedor, modelo e tokens de prompt/conclusao. O worker marca como falha um run `running` cujo prazo expirou.

Na primeira mensagem de uma conversa ainda intitulada `Nova conversa`, a API pede um titulo curto ao `AI_TITLE_MODEL` e registra o uso separadamente. Essa chamada tem timeout proprio; resposta invalida, indisponibilidade ou timeout usam as primeiras palavras da mensagem como fallback e nao interrompem o run principal. Mensagens posteriores nao substituem o titulo.

## Executar uma acao

`POST /workspaces/{workspace_id}/ai/actions/{action}` responde como `text/event-stream`. O body (maximo 16 KiB) e:

```json
{
  "conversationId": "uuid opcional",
  "pageId": "uuid opcional",
  "selection": ["uuid"],
  "mentionedPageIds": ["uuid"],
  "prompt": "instrucao do usuario"
}
```

`prompt` e obrigatorio, nao vazio e limitado a 2048 caracteres; a selecao aceita no maximo 64 blocos. `mentionedPageIds` aceita ate oito paginas e somente em `workspace_agent`; a UI oferece essas paginas por autocomplete de `@`, e o servidor resolve cada ID novamente com membership e `workspace_id` antes de incluir o conteudo.

| Acao | Permissao | Escopo forçado |
| --- | --- | --- |
| `continue_writing` | editor/owner | Exige um anchor e so insere blocos de conteudo imediatamente depois dele. Cada insercao e publicada separadamente. |
| `summarize_page` | editor/owner | Exige pagina e so insere um callout nao vazio no indice 0. |
| `transform_selection` | editor/owner | Exige selecao e so altera, apaga, move ou substitui raizes selecionadas nas posicoes existentes; o lote e atomico. |
| `workspace_agent` | membro | Somente leitura; responde com citacoes autorizadas ou com a resposta fixa de ausencia de fontes. |

As acoes de escrita recebem `read_context` e `apply_operations`. Q&A funciona como um harness iterativo somente leitura: comeca pelas paginas mencionadas por `@`, `read_page(page_id)` abre a pagina atual ou segue links de paginas filhas, `search_workspace(query, limit)` executa uma nova busca semantica permissionada a cada chamada e `select_citations` seleciona apenas fontes acumuladas por leituras/buscas autorizadas. O agente pode executar ate oito rodadas de ferramentas e ainda recebe uma rodada final para sintetizar a resposta; ele deve continuar alem de pistas intermediarias ate encontrar a resposta ou esgotar caminhos uteis. O historico recente da conversa participa das rodadas seguintes. Leituras sao limitadas, cycle-safe e sempre revalidam membership e `workspace_id`.

Ha no maximo 64 operacoes nas acoes de escrita. O servidor deduplica tool calls pelo ID e revalida cada operacao: nao ha delete permanente, paginas/imagens nao sao geradas e uma acao nao pode escapar do escopo. Respostas de Q&A so sao transmitidas depois de validar as citacoes e valores explicitos pedidos pela fonte; HTML bruto nao e renderizado no cliente, enquanto Markdown/GFM da resposta e exibido com links externos protegidos.

As operacoes de IA passam pelo mesmo apply de operacoes, autorizacao, transacao, idempotencia e broadcast de uma escrita humana. `actor_id` identifica o humano que autorizou a execucao; `operation_groups.source` e `"ai"`, com proveniencia `{runId, action, model}`. `last_seq` identifica a ultima operacao aplicada, inclusive em falha parcial; o cliente so fecha o grupo de undo depois de receber o cursor ate esse valor.

## Eventos SSE

O endpoint envia keep-alive a cada 10 segundos.

| Evento | Payload principal |
| --- | --- |
| `run` | `run_id` |
| `text` | `text` |
| `tool` | `name` |
| `usage` | `prompt_tokens`, `completion_tokens` |
| `completion` | `run_id`, `last_seq`, `message` opcional |
| `run_failed` | `run_id`, `group_id` opcional, `last_seq` opcional, `message` |

`completion.message` so existe com `conversationId` e inclui resposta/citacoes persistidas. Se o terminal nao trouxer metadados suficientes, o cliente consulta o run antes de finalizar a coordenacao do grupo.

## Contexto, recuperacao e futuro

O contexto e deterministico e limitado a 8000 caracteres: pedido, pagina/selecoes, breadcrumbs e resultados semanticos, nessa prioridade. O limite e uma estimativa conservadora por caracteres; a implementacao nao usa um tokenizer para contar tokens reais. Conteudo de blocos e marcado como nao confiavel. A busca semantica filtra membership no SQL e remove blocos ou ancestrais na lixeira antes de formar contexto ou citacoes.

## Evidencia M5

- `make eval-m5` passou como gate deterministico.
- `docs/evals/m5-live.mjs` passou 4/4 com `openai/gpt-5.6-luna` e `openai/text-embedding-3-large`, consumindo 18.075 tokens de prompt e 1.145 de conclusao. Cobre as quatro acoes, incluindo Q&A iterativo que segue a pagina filha `X` ate a nota com resposta `43`, limites de qualidade, citacoes/acesso, negacao a nao membro, uso/proveniencia e undo por operacoes inversas.
- `frontend/cypress/e2e/m5-ai.cy.ts` passou 1/1 com dois clientes `EditorPage`: insercoes ordenadas progressivas, colaboracao WebSocket, undo agrupado, deletes inversos e convergencia persistida sem reload de snapshot.

MCP e API publica para agentes externos **ainda sao futuros**; qualquer extensao deve usar este contrato de operacoes e as mesmas verificacoes de permissao.
