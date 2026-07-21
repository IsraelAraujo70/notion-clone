# Testes e gates

Execute os comandos na raiz do repositório.

| Comando | O que verifica |
| --- | --- |
| `make test` | Testes Rust, Vitest e Node: motor de blocos, invariantes, autorização, lógica pura do frontend e limites de segurança do shell desktop. |
| `make test-e2e` | Cypress com frontend, API, banco e WebSocket: persistência, permissões e colaboração. |

No frontend, também estão disponíveis `npm test`, `npm run typecheck`, `npm run lint` e `npm run build`. No backend, use `cargo test`, `cargo fmt --check` e `cargo check`. Em `desktop/`, `npm test` compila o processo principal e valida allowlists de navegação e links externos.

## Abas do dashboard e IA

Os gates `frontend/lib/dashboard-tabs.test.ts` e `frontend/components/dashboard/dashboard-tabs.test.tsx` cobrem payload versionado e escopado por usuário/workspace, deduplicação, deep links, fallback ao fechar, reconciliação, teclado, foco, drag-and-drop e ausência do rail no mobile. Os testes de `PageProvider`, navegação, command palette e IA verificam as integrações e garantem que o `workspace_agent` em tela cheia funcione sem `pageId`, nunca escreva antes da decisão do usuário, limite `Allow in this conversation` à conversa ativa e restaure o agrupamento concluído de ferramentas e operações durante a sessão do app.

O eval `frontend/cypress/e2e/dashboard-tabs.cy.ts` exercita o navegador real: restauração e reordenação após reload, uma única instância de editor e um único snapshot para a página ativa, preservação de `?block=`, fallback direita/esquerda/IA, marks da Performance API, SSE da IA sem contexto de página e viewport móvel sem abas. `frontend/cypress/e2e/m5-ai.cy.ts` continua cobrindo a IA contextual e o agrupamento de operações mutantes.

## Quando usar cada nível

Testes unitários devem cobrir regras determinísticas e casos de erro. Use Cypress quando o comportamento depende de navegador, serviços reais ou mais de um cliente, como convergência, reconexão e streaming de IA.
