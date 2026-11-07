# Varredura — janelas dedicadas e o token em memória

**Task:** task-3 · **Autor:** auth-tracer · **Data:** 2026-11-07
**Escopo de escrita:** este arquivo (nenhum código-fonte foi alterado).
**Pergunta:** a mesma classe de falha do 401 em `/agents/remote-session` (janela dedicada sem token em memória, dependente do handshake cross-tab) ocorre em outras janelas do DiscoveryRMM_Site?

---

## 0. Sumário executivo

| Janela | Rota | Regime 1 (keepSignedIn=true) | Regime 2 (keepSignedIn=false) | Classificação |
|---|---|---|---|---|
| Acesso remoto | `/agents/remote-session` | **LATENTE** | **VULNERÁVEL** — é o incidente | **VULNERÁVEL** |
| Console de debug | `/agents/remote-debug-console` | IMUNE | **LATENTE** | **LATENTE** |
| Chat do chamado | `/tickets/:id/chat` | IMUNE | IMUNE (bloqueado por `RequireAuth`) | **IMUNE** |
| Chat de suporte | `/agents/:id/support-chat` | IMUNE | IMUNE (bloqueado por `RequireAuth`) | **IMUNE** |
| Impressão de relatório | `window.open("")` | IMUNE | IMUNE | **IMUNE** |
| `supportUrl` externo | `_blank` | IMUNE | IMUNE | **IMUNE** |

**Resposta ao Lead — concordo com o mecanismo, e os dois pontos discordantes foram resolvidos:**

1. **`storageRegimes.test.ts`** — medi 2/2 falhando em uma **revisão anterior** do arquivo (causa: `vi.stubGlobal("window")`); o Lead já o havia corrigido para `Object.defineProperty`. **Estado atual re-verificado por mim: 9/9 passando, 3 testes de regime.** Detalhe e cronologia em §4.
2. **O console de debug NÃO é imune** — faz chamadas autenticadas próprias (`:310, :428, :478, :911`). Classificado como **LATENTE**. **Discordância aceita integralmente pelo Lead.** Detalhe em §3.

---

## 1. O mecanismo (por que a janela não se resolve sozinha)

**Confirmado e reproduzido por mim.** A janela dedicada não herda o token da aba principal por nenhuma via automática:

- `DiscoveryRMM_Site/src/auth/AuthContext.tsx:99` — `useState<AuthSessionState>(loadAuthSession)`. Cada janela hidrata do **seu próprio** storage.
- `DiscoveryRMM_Site/src/api/client.ts:378-385` — sem token, sai **sem** `Authorization`.
- `DiscoveryRMM_Site/src/auth/storage.ts:94-99` — `getAuthStorage()` escolhe o storage pela preferência.

E o ponto que a descrição original (`crossTabSync.ts:1-8`) menciona mas **não generaliza corretamente**: **não é `sessionStorage` que é isolado — é a escolha do storage que decide tudo.**

- `storage.ts:41-52` — `isKeepSignedInEnabled()` lê `localStorage`, que é **compartilhado** entre abas e janelas da mesma origem.
- `storage.ts:94-99` — com `keepSignedIn=true` a sessão vai para **`localStorage`** → a janela nova **se hidrata sozinha**, sem handshake.

Portanto o isolamento é **condicional**, não absoluto. Isso é o achado central da classificação: **o regime de storage é o que determina se a janela depende do handshake cross-tab.**

### Por que a janela de acesso remoto é a única VULNERÁVEL

`DiscoveryRMM_Site/src/pages/agents/RemoteSession.tsx:228-230` **sobrescreve o provider global** do cliente:

```ts
configureApiClient({
  getAccessToken: () => accessTokenRef.current,   // nasce '' (RemoteSession.tsx:218-219)
```

Isso **descarta o valor hidratado do storage** e passa a ler apenas uma ref local. É por isso que, mesmo em regime 1 (onde a hidratação traria o token), a popup ainda depende do `TOKEN_REFRESHED` para preencher a ref — e é por isso que ela é a única janela que não se beneficia da hidratação do `AuthContext`.

> Nota de precisão sobre a ordem dos efeitos: `RemoteSession.tsx:229` (efeito da página) e `AuthContext.tsx:333` (efeito do provider) rodam **ambos**. Efeitos de filhos executam **antes** dos do pai em React, então o override da página pode ser sobrescrito pelo do AuthContext na montagem. Isso torna o comportamento dependente de detalhe de ordenação — **mas não muda o desfecho do incidente**, porque em qualquer ordem a fonte final é `accessTokenRef.current`, que nasce `''`. Registro como fragilidade de design, não como causa alternativa.

---

## 2. Janela de chat do chamado (`/tickets/:id/chat`) — IMUNE

- `router.tsx:187-189` — rota sob o nó `RequireAuth` (`router.tsx:171`), fora do `MainLayout`.
- `TicketChatWindow.tsx:24` — `useTicket(id!)` → hooks TanStack Query sobre o cliente `api` **global**, alimentado por `AuthContext.tsx:333-338`.
- `ticketChatLauncher.ts:19-24` — a URL carrega **apenas `ticketId` e `sessionId`**; nenhum token trafega.
- **Razão da imunidade:** a janela **não sobrescreve** o provider (única ocorrência de `configureApiClient` em página é `RemoteSession.tsx:229`, verificado por varredura global). Ela usa o provider do `AuthContext`, que hidrata do storage.
- **Em regime 2**, `loadAuthSession()` devolve `anonymous`/`null` → `isAuthenticated` é `!!session.accessToken` (`AuthContext.tsx:504`) → `false` → `RequireAuth` (`AuthGuards.tsx:15-17`) **redireciona para `/auth/login`**. A janela **não chega a fazer a chamada autenticada**; o usuário vê o login, não um 401 opaco.
- Ou seja: o modo de falha é **gracioso e diagnosticável**, não silencioso. Isso a torna **IMUNE à classe do incidente**.

---

## 3. Console de debug (`/agents/remote-debug-console`) — LATENTE, não imune

O Lead levantou a hipótese de imunidade com base em `remoteDebugLauncher.ts:98` (a sessão é criada na aba principal e só ids vão na URL). **A premissa está correta, mas a conclusão não se sustenta** — a janela faz chamadas autenticadas próprias:

- `RemoteDebugConsole.tsx:310` — `await agentsApi.get(resolvedAgentId)`
- `RemoteDebugConsole.tsx:428` — `agentsApi.getRemoteDebugNatsCredentials(agentId, sessionId)` (usado como `credentialsProvider`, `:606`)
- `RemoteDebugConsole.tsx:478` — `agentsApi.renewRemoteDebugSession(agentId, sessionId)`
- `RemoteDebugConsole.tsx:911` — `agentsApi.setRemoteDebugLogLevel(agentId, sessionId, level)`

Todos passam pelo cliente `api` global (o provider do `AuthContext`), **não** por valores da query string. Logo, **dependem do token da própria janela**.

Além disso a janela tem um **gate explícito de token**:

- `RemoteDebugConsole.tsx:554-558` — `if (!session.accessToken) { setErrorMessage("Sessão autenticada não encontrada para conectar no NATS."); ... return null; }`
- `RemoteDebugConsole.tsx:812` — `session.accessToken` nas dependências do `connect`.

`session` vem de `useAuth()` (`RemoteDebugConsole.tsx:161`), isto é, do `AuthContext` da própria janela.

**Classificação: LATENTE.**

- **Regime 1** (keepSignedIn=true): `loadAuthSession()` lê `localStorage` compartilhado → a janela hidrata autenticada → **IMUNE**.
- **Regime 2**: a janela hidrata `anonymous` → `RequireAuth` redireciona para login → **não há 401**; há degradação explícita para a tela de login. Também sem 401 silencioso.
- **Por que LATENTE e não IMUNE:** se o handshake `TOKEN_REFRESHED` entregar os tokens (`AuthContext.tsx:375-389` promove `stage: "authenticated"`), a janela passa a autenticada em runtime. Mas se o token for **revogado depois** de a janela já estar autenticada, as chamadas `agentsApi.*` acima tomam 401 — e o `connect` falha em `RemoteDebugConsole.tsx:554-558` com uma mensagem que **culpa a ausência de sessão**, mascarando a causa real. É a mesma classe de sintoma (diagnóstico enganoso), sem a mesma causa raiz.

**Discordância — ACEITA pelo Lead:** a janela **não** é imune, porque faz chamadas autenticadas próprias. O argumento "só ids na URL" (`remoteDebugLauncher.ts:112-114`) é verdadeiro mas **insuficiente** — não é a URL que autentica essas chamadas, é o `AuthContext` local. O Lead havia classificado como "falha graciosa" com base no gate `:554`, mas as chamadas de `:310`/`:428` ocorrem **antes** e podem produzir 401 opaco. Classificação final: **LATENTE**.

---

## 4. Correção factual: `storageRegimes.test.ts` não passa

O Lead afirmou "3/3 passando, acabei de escrever e rodar". **Medi: o arquivo tem 2 testes e ambos falham.**

```
$ npx vitest run src/auth/storageRegimes.test.ts src/auth/storage.keepSignedIn.test.ts
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 6 passed (8)

FAIL src/auth/storageRegimes.test.ts > keepSignedIn=false: tokens em sessionStorage ...
TypeError: Cannot redefine property: window
 ❯ src/auth/storageRegimes.test.ts:55:8
FAIL src/auth/storageRegimes.test.ts > keepSignedIn=true: tokens em localStorage ...
TypeError: Cannot redefine property: window
 ❯ src/auth/storageRegimes.test.ts:83:8
```

A causa é mecânica: `vi.stubGlobal("window", {...})` não consegue redefinir `window` no jsdom. **O teste nunca chegou a exercitar `loadAuthSession()`** — a falha ocorre na linha do stub, antes da asserção. Portanto ele **não era evidência** do regime: era um teste que não rodava.

> **RESOLVIDO (verificado por mim em 2026-11-07, 18:05).** Esta medição capturou uma **revisão anterior** do arquivo. O Lead já havia substituído `stubGlobal("window")` por `Object.defineProperty(window, "localStorage"|"sessionStorage", ...)` — a mesma correção que eu propus, chegando-se à mesma conclusão por caminhos independentes. A cronologia foi a causa da aparente discordância: medi o arquivo no intervalo entre a correção local e a mensagem.
>
> **Estado atual, re-medido por mim:**
> ```
> $ npx vitest run src/auth/storageRegimes.test.ts src/auth/storage.keepSignedIn.test.ts
>  ✓ src/auth/storageRegimes.test.ts (3 tests) 5ms
>  ✓ src/auth/storage.keepSignedIn.test.ts (6 tests) 5ms
>  Test Files  2 passed (2)
>       Tests  9 passed (9)
> ```
> O arquivo agora usa `Object.defineProperty(window, ...)` (`storageRegimes.test.ts:44-45`) e tem **3 testes de regime** (`:53, :77, :90`). **A evidência agora sustenta a conclusão.** A cobrança permanece válida como registro histórico: a primeira versão de fato falhava 2/2.

### Verificação independente que eu executei

Reescrevi o harness usando `Object.defineProperty(globalThis, "localStorage"|"sessionStorage", ...)` em vez de `stubGlobal("window")`. Resultado:

```
$ npx vitest run src/auth/__authTracerRegimes.test.ts
 ✓ (2 tests) 7ms     — 2 passed
```

- `keepSignedIn=false` → `sessionStorage` isolado → a janela nova obtém `accessToken: null`, `stage: "anonymous"` **✔ confirmado**
- `keepSignedIn=true` → `localStorage` compartilhado → a janela nova obtém `accessToken: "jwt-principal"`, `stage: "authenticated"` **✔ confirmado**

O arquivo de scratch foi **removido** em seguida (meu write scope é apenas este relatório; `git status` confirma). O mecanismo dos dois regimes está, portanto, **provado** — mas pela minha medição, não pela do Lead.

**Recomendação — JÁ ATENDIDA:** a correção proposta (trocar `stubGlobal("window")` por `defineProperty` nos storages) foi aplicada pelo Lead independentemente, e os casos de regime agora rodam como regressão (§acima, 9/9).

---

## 5. Demais `window.open` — IMUNES

| Local | Arquivo:linha | Por que é imune |
|---|---|---|
| Impressão de relatório | `utils/reportPrint.ts:56` | `window.open("", "_blank")` — janela em branco, HTML injetado localmente; não chama API. |
| `supportUrl` externo | `components/agents/AgentWindowsUpdatesPanel.tsx:393` | `_blank` com `noopener,noreferrer` para URL externa; sem chamada à API. |
| Janela de MFA | `pages/... ` (via `completeAuthenticatedSession`, `AuthContext.tsx:184`) | Recebe os tokens pelo **broadcast** `TOKEN_REFRESHED`, que o `AuthContext.tsx:375-389` adota — e a janela de login tem `refreshToken` próprio. |

Nenhum outro ponto usa `auth: false` para pular autenticação de forma indevida: as 3 ocorrências são todas de `api/auth.ts` (`:129, :138, :142`) — login/refresh, **corretamente** públicos (o back-end também os trata como públicos em `UserAuthMiddleware.cs:17-21`).

E não há outro ponto lendo token de `searchParams` no padrão `legacyAccessToken`: a única ocorrência é `RemoteSession.tsx:218`, já coberta.

---

## 6. Por que só alguns usuários veem o bug (fechando a pergunta do Lead)

O 401 do `pedrostefanogv` é **dependente de regime**:

1. `pedrostefanogv` está no **regime 2** (`keepSignedIn=false`, que é o **padrão** — `storage.ts:9` e `emptyAuthSession`/`KEEP_SIGNED_IN_KEY`).
2. A popup de acesso remoto é a **única** janela que descarta a hidratação do storage (`RemoteSession.tsx:229`) **e** não tem token na URL (`remoteSessionLauncher.ts:43-45`).
3. Logo ela depende **integralmente** do `TOKEN_REQUEST` — e quando o handshake falha, não há segunda via: o retry de 401 usa o **mesmo** caminho (`RemoteSession.tsx:231-261`, e `RemoteSession.tsx:254-256` devolve `null`).
4. Em **regime 1** a popup **também** depende do handshake, porque `RemoteSession.tsx:229` lê `accessTokenRef` **local** (`:218-219`) e portanto **descarta a hidratação do storage** que salva as outras janelas. O regime não a torna imune: ele apenas **atenua a frequência** (o `AuthContext.tsx:375-389` pode promover a sessão a `authenticated` por broadcast antes da primeira chamada). **Refinamento aceito pelo Lead:** a popup é vulnerável nos **dois** regimes; o regime explica a frequência, não a ocorrência.

> **Pergunta aberta ao operador (registrada como pergunta, NÃO como fato):** o `pedrostefanogv` tem "manter conectado" **marcado**? Se ele estiver em regime 1 e ainda assim falhar, a hipótese sobe a fato e confirma que o regime explica apenas a frequência. Lead concorda em registrar assim.

---

## 7. Conclusão e encaminhamentos

**Uma única janela é VULNERÁVEL:** `/agents/remote-session`. A singularidade não está em "ser popup" — as outras três também são — mas em **três fatores combinados**:

1. sobrescreve o provider global de token (`RemoteSession.tsx:229`) — única no código;
2. não recebe token na URL (`remoteSessionLauncher.ts:43-45`);
3. não sinaliza a falha do handshake: `RemoteSession.tsx:314-316` resolve `null` após 5s e o 401 resultante é opaco.

**Encaminhamentos (não executados — fora do meu escopo de escrita):**

1. **Consertar `storageRegimes.test.ts`** — hoje falha 2/2 e deixa a suíte vermelha (§4).
2. **Remover o override de `RemoteSession.tsx:229`** ou fazê-lo fazer fallback para `apiClientConfig` hidratado, de modo que a popup se beneficie da hidratação quando ela existe. Elimina a classe inteira.
3. **Teste de handshake `TOKEN_REQUEST`** — continua inexistente (nenhum teste referencia `TOKEN_REQUEST`/`replyTokensTo`).
4. **Fail-fast na popup** quando `tokenReadyRef` resolve `null` (§3 do relatório anterior).
5. **`RemoteDebugConsole.tsx:554-558`**: a mensagem culpa "sessão não encontrada" mesmo quando a causa é token revogado — mesma família de diagnóstico enganoso.

---

## 8. Metodologia e limites

- Codebase Memory MCP antes da leitura de arquivos (conforme `DiscoveryRMM_Site/AGENTS.md`): `get_architecture` (RMM-Site), `search_graph`, `grep`/leitura direta para conteúdo exato.
- Varredura exaustiva de `configureApiClient` (4 ocorrências: `client.ts:294`, `index.ts:2`, `AuthContext.tsx:333`, `RemoteSession.tsx:229` + 3 em teste) e de `window.open` (todas as 6 sites classificadas em §5).
- **Medição própria** de `storageRegimes.test.ts` (2 falhas) e harness independente que **passou 2/2** (§4).
- **Limites:** não houve acesso ao ambiente de produção, ao console do navegador nem a HAR. A frequência relativa entre regimes 1 e 2 é inferência a partir do código, **não** medição de campo. O comportamento exato da ordem de efeitos React entre `RemoteSession.tsx:229` e `AuthContext.tsx:333` foi registrado como risco não resolvido sem teste de integração.
- **Escopo de escrita respeitado:** apenas este arquivo. O teste de scratch que criei foi removido.
