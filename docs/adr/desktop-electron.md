# ADR: aplicativo desktop com Electron

- Status: aceito para spike
- Data: 2026-07-20

## Contexto

O Reason já entrega editor, autenticação, colaboração, IA e databases pelo
frontend Next.js. O cliente mobile compartilha o protocolo e `@reason/core`, mas
mantém uma interface própria. Reconstruir o editor em SwiftUI duplicaria a UI e
criaria um terceiro motor que precisaria permanecer semanticamente igual aos
motores TypeScript e Rust.

O primeiro cliente desktop será online-first. Edição offline, backend embutido e
acesso geral ao filesystem não fazem parte deste spike.

## Decisão

Validar Electron com um renderer remoto que carrega a origem web do Reason. Em
desenvolvimento, o shell também aceita `localhost:3000` e `127.0.0.1:3000`; um
build empacotado aceita somente `https://reason.israeldeveloper.com.br`.

O renderer permanece sem Node, isolado e sandboxed. O preload expõe apenas
metadados estáticos versionados e não acessa tokens. Navegações internas são
comparadas por `URL.origin`; links HTTP externos são enviados ao navegador do
sistema e outros protocolos são negados. Webviews são bloqueadas. Somente as
permissões de leitura e escrita sanitizada do clipboard são aceitas para uma
origem do aplicativo; as demais permissões do Chromium são negadas.

O shell inicia em `/dashboard`, que preserva sessões válidas e redireciona para
`/login` quando não há autenticação. A landing page não faz parte da entrada do
aplicativo desktop. O ícone da janela, do Dock e dos pacotes usa somente a marca
quadrada do Reason, compartilhando o desenho de `frontend/app/icon.svg`.

## Alternativas

| Opção | Reaproveitamento | Segurança | Offline | Plataformas | Custo inicial |
| --- | --- | --- | --- | --- | --- |
| Electron remoto | Alto | Requer sandbox e allowlist rigorosas | Não | macOS, Windows, Linux | Baixo |
| Electron local | Alto | Menor dependência de código remoto, maior complexidade de origem | Possível | macOS, Windows, Linux | Médio |
| SwiftUI | Baixo | Superfície nativa menor | Possível | macOS | Alto |

Electron remoto é a escolha do spike porque valida o produto desktop com a
menor duplicação. O custo aceito é depender do deploy web e de conectividade.

## Critérios do spike

- [ ] Login, logout e persistência de sessão entre reinícios.
- [ ] Abertura de páginas e links públicos.
- [ ] Edição otimista, WebSocket e recuperação após reconexão.
- [ ] SSE das ações de IA.
- [ ] Upload, download e clipboard.
- [ ] Atalhos, CodeMirror e Mermaid.
- [ ] Convites e links externos.
- [x] Renderer sem Node, com isolamento de contexto e sandbox.
- [x] Allowlist de origem e bloqueio de janelas, webviews e protocolos não aprovados.
- [x] Testes automatizados para URLs internas e externas.

## Consequências

Uma falha de XSS no frontend passa a executar dentro de Chromium embarcado, mas
não recebe primitivas Node ou IPC genérico. O Electron precisa acompanhar
atualizações de segurança. O deploy web pode evoluir antes do shell instalado;
por isso, qualquer bridge futura deve manter versão e capability checks.

Se os fluxos funcionais não passarem, a próxima comparação será entre o output
Next standalone servido em loopback e um protocolo customizado. `file://` não é
uma alternativa aceita. SwiftUI só será reconsiderado se o produto se tornar
macOS-first e integrações nativas profundas justificarem a duplicação.

## Validação e saída

Execute:

```bash
node --version # 22.12 ou superior
npm --prefix desktop install
npm --prefix desktop test
make desktop
```

Com o frontend local em outra porta ou origem, defina `REASON_WEB_URL` somente
para uma URL aceita. O spike pode avançar para a estrutura definitiva quando os
itens funcionais acima forem exercitados e não surgir requisito confirmado de
offline ou de versionamento independente do frontend.
