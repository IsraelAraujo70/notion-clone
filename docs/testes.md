# Testes e gates

Execute os comandos na raiz do repositório.

| Comando | O que verifica |
| --- | --- |
| `make test` | Testes Rust, Vitest e Node: motor de blocos, invariantes, autorização, lógica pura do frontend e limites de segurança do shell desktop. |
| `make test-e2e` | Cypress com frontend, API, banco e WebSocket: persistência, permissões e colaboração. |

No frontend, também estão disponíveis `npm test`, `npm run typecheck`, `npm run lint` e `npm run build`. No backend, use `cargo test`, `cargo fmt --check` e `cargo check`. Em `desktop/`, `npm test` compila o processo principal e valida allowlists de navegação e links externos.

## Quando usar cada nível

Testes unitários devem cobrir regras determinísticas e casos de erro. Use Cypress quando o comportamento depende de navegador, serviços reais ou mais de um cliente, como convergência, reconexão e streaming de IA.
