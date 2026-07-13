# Editor e sidebar UX eval

Execute `make eval-editor-sidebar-ux` contra a stack Docker. O cenário cria uma
página real e falha se qualquer uma destas provas deixar de valer:

- um bloco TypeScript mantém quatro linhas, tokens destacados e a linguagem após reload;
- a sidebar aceita o arrasto de 240px para 360px e restaura a preferência local;
- uma cadeia de oito páginas deixa o título mais profundo com ao menos 96px úteis;
- o botão de expansão ocupa o mesmo slot do emoji, sem sobreposição, nos modos claro e escuro.

Capturas do Cypress são geradas quando uma asserção visual falha; elas não fazem
parte do repositório.
