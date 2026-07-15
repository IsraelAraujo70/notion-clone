# Componentes do frontend

Use Atomic Design dentro dos diretórios de feature.

`components/ui/` contém o código vendorizado do shadcn. Não mova esses componentes para a árvore atômica nem crie wrappers apenas para renomeá-los.

- `atoms/`: elementos visuais reutilizáveis, sem fluxo de produto.
- `molecules/`: partes pequenas que recebem estado e callbacks.
- `organisms/`: superfícies compostas, como editor, sidebar, diálogos e painéis.
- `templates/`: composição de tela; arquivos de rota devem compor templates.

Lógica determinística pertence a `frontend/lib/`; componentes não devem duplicar regras do motor de blocos. Detalhes de HTTP e sincronização ficam em `lib/api.ts` e `lib/sync/`.

Prefira props explícitas e componentes controlados. Mantenha módulos de produto abaixo de 350 linhas e templates abaixo de 200 quando for prático. Valide mudanças estruturais com os testes do frontend.
