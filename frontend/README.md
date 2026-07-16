# Frontend do Reason

Aplicação Next.js do Reason. As rotas em `app/` devem permanecer finas; o editor usa o motor em `lib/engine/`, transporte HTTP em `lib/api.ts` e sincronização em `lib/sync/`.

Leia [AGENTS.md](../AGENTS.md), o [protocolo](../docs/protocolo.md) e as [regras de componentes](components/README.md) antes de alterar o editor. Toda escrita deve usar uma operação tipada e aplicar a mesma semântica do backend.

## Desenvolvimento

```bash
npm install
npm run dev
```

O app usa `http://localhost:3000` e lê `NEXT_PUBLIC_API_BASE_URL`; localmente use `http://localhost:18080`.

## Idiomas

O inglês é o idioma padrão da interface. O usuário pode selecionar português na landing page, nas telas de autenticação ou em **Settings > Appearance**; a preferência fica salva no navegador.

Textos traduzíveis usam `useI18n()` e os catálogos em `lib/i18n/locales/pt/`. Novos textos devem ser escritos em inglês e receber a tradução correspondente no catálogo da feature. Conteúdo criado pelo usuário e mensagens retornadas pela API não são traduzidos.

## Validação

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```

A documentação geral fica no [README](../README.md) e em [docs/testes.md](../docs/testes.md).
