# Reason

Reason é um workspace colaborativo para escrever e organizar documentos em blocos. Páginas, textos, listas, imagens e subpáginas formam uma árvore; cada alteração vira uma operação persistida e sincronizada. O produto possui clientes web e mobile Android em desenvolvimento sobre o mesmo protocolo.

**Produção:** [reason.israeldeveloper.com.br](https://reason.israeldeveloper.com.br)

## O que já funciona

- Cadastro, sessões, perfil, workspaces, convites e papéis de acesso.
- Editor de blocos com atalhos, slash menu, reordenação, indentação, undo/redo e páginas aninhadas.
- Persistência, lixeira, restauração, links públicos revogáveis e transferência de páginas entre workspaces.
- Alterações otimistas, colaboração por WebSocket e recuperação por cursor após desconexão.
- Busca textual isolada por workspace.
- IA para continuar, resumir e transformar conteúdo, além de Q&A com busca semântica e citações.
- MCP autenticado para agentes lerem, pesquisarem e editarem blocos, além de receberem imagens.

Não fazem parte da versão atual: databases no estilo Notion, cliente desktop/offline e permissões por página.

## Princípios técnicos

1. **Tudo é bloco.** Uma página é um bloco com filhos. `content` define a ordem; `parentId` define pertencimento.
2. **Toda escrita é uma operação.** Frontend e backend aplicam as mesmas regras, com idempotência, cursor por workspace e LWW por propriedade.
3. **A IA não tem atalho.** Escritas de IA passam pela mesma autorização, transação, log, sincronização e undo das escritas humanas.

## Arquitetura

O frontend Next.js aplica alterações localmente. A API Rust autoriza, valida e persiste operações no PostgreSQL. WebSocket distribui mudanças; SSE transmite execuções de IA. Um worker processa embeddings e limpeza de arquivos. O PostgreSQL também armazena busca textual e vetores com pgvector.

```text
Browser ── HTTP / WebSocket / SSE ── API Rust ── PostgreSQL + pgvector
                                         └────── worker / armazenamento S3
```

As decisões e os limites estão em [docs/arquitetura.md](docs/arquitetura.md).

## Desenvolvimento local

Pré-requisitos: Docker Desktop, Node.js e npm. Rust só é necessário para executar comandos Cargo fora do container.

```bash
cp .env.example .env
make dev
```

`make dev` inicia PostgreSQL, MinIO, API e worker em Docker, além do Next.js na máquina.

- Web: `http://localhost:3000`
- API: `http://localhost:18080`
- PostgreSQL: `localhost:55433` (`notion_clone`)
- MinIO: `http://localhost:9000`

Use `make backend` quando não precisar do frontend.

### Mobile

O cliente Expo em `mobile/` usa a API de produção por padrão. Para apontar para outra API:

```bash
cd mobile
cp .env.example .env
npm install
npm start
```

Em um aparelho Android, uma API local precisa usar o IP acessível da máquina, não `localhost`. Para gerar um APK interno, configure o EAS e execute `eas build --profile preview --platform android`.

O workflow `Android beta` gera um APK pelo GitHub Actions e publica o asset `reason-beta.apk` no release fixo `android-beta`. A landing aponta para esse asset por padrão; `NEXT_PUBLIC_ANDROID_APK_URL` permite substituir a URL.

## Verificação

```bash
make test       # Rust + core compartilhado + Vitest + typecheck mobile
make test-e2e   # Cypress com a stack completa
make down       # encerra o ambiente local
```

Veja [docs/testes.md](docs/testes.md) para saber o que cada gate cobre.

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Protocolo de blocos e operações](docs/protocolo.md)
- [API](docs/api.md)
- [MCP](docs/mcp.md)
- [Testes e gates](docs/testes.md)
