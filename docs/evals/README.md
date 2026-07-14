# Evals

## M5: IA

- `make eval-m5`: gate deterministico de contexto, restricoes das ferramentas, pos-condicoes e metadados de grupos de operacoes.
- `m5-live.mjs`: eval pago, opt-in, contra API local com `OPENROUTER_API_KEY`; possui quatro fixtures com limiares explicitos. A fixture de Q&A parte da pagina atual, segue a pagina filha `X` e deve encontrar/citar a nota com resposta `43`. Em 2026-07-14 passou 4/4 usando `openai/gpt-5.6-luna` e `openai/text-embedding-3-large`, com 18.075 tokens de prompt e 1.145 de conclusao.
- `m5-ai.cy.ts`: E2E de browser. Em 2026-07-14 passou 1/1 com dois `EditorPage` reais, cobrindo streaming de insercoes ordenadas, colaboracao WebSocket, undo agrupado, operacoes inversas e convergencia persistida sem reload.

O eval ao vivo exige provedor pago e deve ser executado somente de forma consciente. O smoke no ambiente Railway publicado nao faz parte desta evidencia: e trabalho pendente de M6.
