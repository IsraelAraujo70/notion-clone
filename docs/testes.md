# Testes e gates

Execute os comandos na raiz do repositório.

| Comando | O que verifica |
| --- | --- |
| `make test` | Testes Rust e Vitest: motor de blocos, invariantes, autorização e lógica pura do frontend. |
| `make test-e2e` | Cypress com frontend, API, banco e WebSocket: persistência, permissões e colaboração. |

No frontend, também estão disponíveis `npm test`, `npm run typecheck`, `npm run lint` e `npm run build`. No backend, use `cargo test`, `cargo fmt --check` e `cargo check`.

## Quando usar cada nível

Testes unitários devem cobrir regras determinísticas e casos de erro. Use Cypress quando o comportamento depende de navegador, serviços reais ou mais de um cliente, como convergência, reconexão e streaming de IA.
