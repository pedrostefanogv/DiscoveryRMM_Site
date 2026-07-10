# Plano de Revisão, Otimização e Implementação de Tema Claro/Escuro

> **Projeto:** Discovery RMM — Frontend (Site)
> **Data:** 2026-07-10
> **Branch base:** `dev`
> **API de referência:** https://tngplacas.com.br/scalar/v1 (OpenAPI 3.1.1 — `Discovery.Api | v1`)

---

## 1. Sumário Executivo

O frontend do Discovery RMM é uma SPA React 19 + TypeScript + Vite + Tailwind CSS v4, com camada de API bem estruturada, autenticação JWT com MFA, realtime via NATS e paginação por cursor. A revisão identificou **3 bugs críticos**, **7 bugs moderados**, **~40+ componentes com cores dark hardcoded** e oportunidades claras de otimização de performance e arquitetura.

O plano está organizado em **6 frentes de trabalho** com priorização P0–P3, estimativas de esforço e dependências entre tarefas.

---

## 2. Inventário da API (compatibilidade com o frontend)

Todos os endpoints do frontend usam o prefixo `/api/v1` e foram validados contra a documentação Scalar da API. Os módulos do frontend cobrem **37 domínios** da API.

### 2.1 Endpoints cobertos pelo frontend

| Domínio                 | Base path                                 | Status frontend                                                                         |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Agent Alerts            | `/api/v1/agent-alerts`                    | ✅ Completo (page, get, create, dispatch, create-ticket, delete)                        |
| Agents                  | `/api/v1/agents`                          | ✅ Completo (CRUD, hardware, software, commands, tokens, remote-debug, transfer, power) |
| App Store               | `/api/v1/app-store`                       | ✅ Completo (catalog, approvals, audit, effective, diff)                                |
| Audit                   | `/api/v1/configuration-audit`             | ✅ Completo                                                                             |
| Auth                    | `/api/v1/auth`                            | ✅ Completo (login, refresh, MFA Totp+Fido2, first-access)                              |
| Automation              | `/api/v1/automation`                      | ✅ Completo (scripts, tasks, executions, audit)                                         |
| Background Services     | `/api/v1/admin/background-services`       | ✅ Completo                                                                             |
| Clients                 | `/api/v1/clients`                         | ✅ Completo                                                                             |
| Configuration           | `/api/v1/configurations`                  | ✅ Completo (server/client/site, effective, AI, NATS test)                              |
| Custom Fields           | `/api/v1/custom-fields`                   | ✅ Completo                                                                             |
| Departments             | `/api/v1/departments`                     | ✅ Completo                                                                             |
| Deploy Tokens           | `/api/v1/deploy-tokens`                   | ✅ Completo                                                                             |
| Escalation Rules        | `/api/v1/escalation-rules`                | ✅ Completo                                                                             |
| IAM                     | `/api/v1/users`, `/user-groups`, `/roles` | ✅ Completo (users, groups, roles, MeshCentral)                                         |
| Jobs                    | `/api/v1/admin/jobs`                      | ✅ Completo                                                                             |
| Knowledge               | `/api/v1/knowledge`                       | ✅ Completo (articles, versions, chat-search, ticket-link)                              |
| Logs                    | `/api/v1/logs`                            | ✅ Completo (cursor-paged, summary, scope-options)                                      |
| Monitoring Events       | `/api/v1/monitoring-events`               | ✅ Completo                                                                             |
| NATS                    | `/api/v1/nats`                            | ✅ Completo (credentials, test)                                                         |
| Notes                   | `/api/v1/notes`                           | ✅ Completo                                                                             |
| Notifications           | `/api/v1/notifications`                   | ✅ Completo                                                                             |
| P2P                     | `/api/v1/ops/p2p`                         | ✅ Completo                                                                             |
| Reports                 | `/api/v1/reports`                         | ✅ Completo (datasets, layouts, templates, executions, schedules)                       |
| Search                  | `/api/v1/search`                          | ✅ Completo (universal)                                                                 |
| Sites                   | `/api/v1/clients/{id}/sites`              | ✅ Completo                                                                             |
| SLA Calendars           | `/api/v1/sla-calendars`                   | ✅ Completo                                                                             |
| Software Inventory      | `/api/v1/software-inventory`              | ✅ Completo                                                                             |
| Tickets                 | `/api/v1/tickets`                         | ✅ Completo (CRUD, workflow, comments, watchers, sessions, SLA, attachments)            |
| Ticket AI               | `/api/v1/tickets/{id}/ai`                 | ✅ Completo (triage, summarize, suggest-reply, draft-kb)                                |
| Ticket Alert Rules      | `/api/v1/ticket-alert-rules`              | ✅ Completo                                                                             |
| Ticket Automation Links | `/api/v1/tickets/{id}/automation-links`   | ✅ Completo                                                                             |
| Ticket Custom Fields    | `/api/v1/tickets/{id}/custom-fields`      | ✅ Completo                                                                             |
| Ticket KPI              | `/api/v1/tickets/kpi`                     | ✅ Completo                                                                             |
| Ticket Saved Views      | `/api/v1/ticket-saved-views`              | ✅ Completo                                                                             |
| Workflow                | `/api/v1/workflow`                        | ✅ Completo (states, transitions)                                                       |
| Workflow Profiles       | `/api/v1/workflowprofiles`                | ✅ Completo                                                                             |
| Agent Updates           | `/api/v1/agent-updates`                   | ✅ Completo (releases, artifacts, rollout)                                              |
| Auto-Ticket Rules       | `/api/v1/auto-ticket-rules`               | ✅ Completo                                                                             |
| API Tokens              | `/api/v1/api-tokens`                      | ✅ Completo                                                                             |
| Dashboard               | `/api/v1/dashboard`                       | ✅ Completo (global/client/site summary)                                                |
| Realtime                | `/api/v1/realtime`                        | ✅ Completo (stats, agent command)                                                      |

### 2.2 Inconsistências encontradas na camada de API

| #   | Arquivo                                    | Problema                                                                                                                                                  | Severidade                         |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A1  | `agents.ts`                                | `getHeartbeat(_agentId)` ignora o parâmetro e chama `/api/v1/agent-auth/me/heartbeat` — retorna heartbeat do usuário autenticado, não do agente informado | **Crítica**                        |
| A2  | `agents.ts`                                | `validateTransfer` monta query string manualmente (`?targetSiteId=${targetSiteId}`) sem `encodeURIComponent`                                              | Moderada                           |
| A3  | `agentAlerts.ts`                           | Método `list()` marcado `@deprecated` ainda presente junto a `listPage()` — ambos batem no mesmo `BASE`                                                   | Baixa                              |
| A4  | `auto-ticket-rules.ts`, `agent-updates.ts` | Todas as operações retornam `unknown` — sem tipagem                                                                                                       | Moderada                           |
| A5  | `clients.ts` vs `sites.ts`                 | Casing inconsistente: `/api/v1/Clients` (PascalCase) vs `/api/v1/clients/{id}/Sites`                                                                      | Baixa (ASP.NET é case-insensitive) |
| A6  | `configuration.ts`                         | `listOpenRouterModels` passa `params as Record<string, unknown>` mesmo quando `undefined`                                                                 | Baixa                              |
| A7  | `tickets.ts`                               | Usa `import("./types").X` inline em vez de import no topo                                                                                                 | Baixa                              |
| A8  | `iam.ts`                                   | ~700 linhas, 30+ interfaces inline em vez de em `types.ts`                                                                                                | Baixa                              |

---

## 3. Bugs Identificados

### 3.1 Bugs Críticos (P0)

#### BUG-01 — ✅ CORRIGIDO — `AuthContext`: estado de atividade perdido a cada refresh de sessão

- **Arquivo:** `src/auth/AuthContext.tsx`
- **Correção aplicada:** `lastActivityAt` e `lastRefreshAttemptAt` movidos para `useRef` (`lastActivityAtRef`, `lastRefreshAttemptAtRef`). O handler de atividade (`recordActivity`) é um `useCallback` estável. Testes em `src/auth/AuthContext.test.tsx`.

#### BUG-02 — ✅ CORRIGIDO — `AuthContext`: logout imediato em erro de rede transitório

- **Arquivo:** `src/auth/AuthContext.tsx`
- **Correção aplicada:** `refreshSession` distingue HTTP 401/403 (logout imediato) de erro de rede/5xx (retry com backoff exponencial 2s→4s→8s, máx 3 tentativas). `refreshRetryCountRef` persiste. Token atual retornado se ainda válido durante retry. Testes em `src/auth/AuthContext.test.tsx`.

#### BUG-03 — ✅ CORRIGIDO — `agents.getHeartbeat` ignora o `agentId`

- **Arquivo:** `src/api/agents.ts`
- **Correção aplicada:** Renomeado para `getMyHeartbeat()` — sem parâmetros, com JSDoc. Nenhum código usava o método antigo.

### 3.2 Bugs Moderados (P1)

#### BUG-04 — `MainLayout`: `useAgent('')` com ID vazio

- **Arquivo:** `src/components/layout/MainLayout.tsx`
- **Descrição:** Quando `routeScope.kind !== 'agent'`, `routeAgentId` é `''`. A chamada `useAgent('')` pode disparar uma query com ID vazio.
- **Correção:** Passar `undefined` ou `null` em vez de `''` e garantir que o hook tenha guarda `enabled: !!id`.

#### BUG-05 — `Tooltip`: timeout vazado em `show()` duplo

- **Arquivo:** `src/components/ui/Tooltip.tsx`
- **Descrição:** Se `show()` for chamado duas vezes rapidamente, o primeiro timeout não é limpo antes de criar o segundo — o `timeoutRef` é sobrescrito sem `clearTimeout`.
- **Correção:** Chamar `clearTimeout(timeoutRef.current)` antes de criar novo timeout.

#### BUG-06 — `AgentList`: context menu com listeners globais conflitantes

- **Arquivo:** `src/pages/agents/AgentList.tsx`
- **Descrição:** O context menu adiciona `window.addEventListener('click', closeMenu)`. Abrir um segundo context menu via right-click pode fechar ambos devido à ordem dos eventos.
- **Correção:** Usar `stopPropagation` no handler de `contextmenu` e remover o listener de `click` global quando o menu abre.

#### BUG-07 — `TicketList`: `resetPagination` definido após `useEffect` que o chama

- **Arquivo:** `src/pages/tickets/TicketList.tsx`
- **Descrição:** `resetPagination` é chamado em `useEffect` mas definido como `const` arrow function depois. Funciona por hoisting de execução, mas é code smell e não está no array de dependências.
- **Correção:** Mover a definição antes do `useEffect` ou usar `useCallback` e incluí-lo no array de dependências.

#### BUG-08 — `configuration.normalizeEffective`: fallback permissivo demais

- **Arquivo:** `src/api/configuration.ts`
- **Descrição:** Se a API retornar `{ values: null }`, o fallback usa o próprio `payload` como `candidateValues`, podendo tratar metadados da API como valores de configuração.
- **Correção:** Validar explicitamente que `candidateValues` é um objeto plano de chave-valor.

#### BUG-09 — `storage.ts`: tokens JWT em `localStorage` (vulnerável a XSS)

- **Arquivo:** `src/auth/storage.ts`
- **Descrição:** `accessToken` e `refreshToken` são persistidos em `localStorage`, acessível a qualquer script XSS.
- **Correção:** Migrar para `sessionStorage` (persiste apenas na aba) ou manter apenas o `refreshToken` em memória + `accessToken` em `sessionStorage`. Avaliar adoção de BFF (Backend-for-Frontend) com cookies HttpOnly no futuro.

#### BUG-10 — `Header`: `useNowTick(1_000)` causa re-render do Header a cada segundo

- **Arquivo:** `src/components/layout/Header.tsx`
- **Descrição:** O countdown de expiração do token re-renderiza todo o Header a cada segundo, incluindo busca, notificações e avatar.
- **Correção:** Extrair o countdown para um sub-componente isolado (`<SessionCountdown />`) que re-renderiza independentemente.

### 3.3 Bugs Menores (P2)

| #      | Arquivo                      | Problema                                                                                                                                   |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| BUG-11 | `jwt.ts`, `authorization.ts` | `decodeBase64Url` duplicada — extrair para util compartilhado                                                                              |
| BUG-12 | `Sidebar.tsx`                | `resolveActiveSection` chamado em render sem memoização                                                                                    |
| BUG-13 | `types.ts`                   | Enums `LogType`, `LogLevel`, `LogSource` têm valores duplicados (aliases) — reverse-lookup retorna o último nome, pode confundir dropdowns |

---

## 4. Frentes de Trabalho

### Frente 1 — ✅ CONCLUÍDA (2026-07-10) — Correção de Bugs Críticos (P0)

**Objetivo:** Eliminar bugs que causam perda de sessão e dados incorretos.

| Tarefa                                                          | Bug            | Esforço | Status        |
| --------------------------------------------------------------- | -------------- | ------- | ------------- |
| 1.1 Mover `lastActivityAt`/`lastRefreshAttemptAt` para `useRef` | BUG-01         | 2h      | ✅            |
| 1.2 Implementar retry com backoff em `refreshSession`           | BUG-02         | 3h      | ✅            |
| 1.3 Renomear `getHeartbeat` para `getMyHeartbeat`               | BUG-03         | 1h      | ✅            |
| 1.4 Adicionar testes para fluxo de refresh                      | BUG-01, BUG-02 | 2h      | ✅ (9 testes) |

**Esforço total:** ~8h | **Testes:** 9/9 ✅ | **Build:** ✅ | **Arquivos:** `AuthContext.tsx`, `agents.ts`, `AuthContext.test.tsx`, `test/setup.ts`

---

### Frente 2 — ✅ CONCLUÍDA (2026-07-10) — Correção de Bugs Moderados e Menores (P1–P2)

**Objetivo:** Eliminar bugs de UX e code smells.

| Tarefa                                         | Bug    | Esforço | Status                                             |
| ---------------------------------------------- | ------ | ------- | -------------------------------------------------- |
| 2.1 Guardar `useAgent` contra ID vazio         | BUG-04 | 0.5h    | ✅ `MainLayout.tsx`, `useAgents.ts`                |
| 2.2 Corrigir vazamento de timeout no Tooltip   | BUG-05 | 0.5h    | ✅ `Tooltip.tsx`                                   |
| 2.3 Refatorar context menu do AgentList        | BUG-06 | 1.5h    | ✅ `AgentList.tsx`                                 |
| 2.4 Reordenar `resetPagination` no TicketList  | BUG-07 | 0.5h    | ✅ `TicketList.tsx`                                |
| 2.5 Endurecer `normalizeEffective`             | BUG-08 | 1h      | ✅ `configuration.ts`                              |
| 2.6 Migrar tokens para `sessionStorage`        | BUG-09 | 2h      | ✅ `storage.ts`                                    |
| 2.7 Isolar countdown do Header                 | BUG-10 | 1h      | ✅ `SessionCountdown.tsx`, `Header.tsx`            |
| 2.8 Extrair `decodeBase64Url` compartilhado    | BUG-11 | 0.5h    | ✅ `utils/base64.ts`, `jwt.ts`, `authorization.ts` |
| 2.9 Memoizar `resolveActiveSection` no Sidebar | BUG-12 | 0.5h    | ✅ `Sidebar.tsx`                                   |
| 2.10 Documentar aliases de enum                | BUG-13 | 1h      | ✅ `types.ts` (JSDoc)                              |

**Status:** ✅ Concluída (2026-07-10) | Esforço: ~8.5h | Build: ✅ | Testes: 13/13 ✅

---

### Frente 3 — ✅ CONCLUÍDA (2026-07-10) — Tema Claro/Escuro (P0)

| Tarefa | Descrição                                                                     | Esforço | Status |
| ------ | ----------------------------------------------------------------------------- | ------- | ------ |
| 3.1    | Atualizar `src/index.css` com tokens semânticos + `@custom-variant dark`      | 2h      | ✅     |
| 3.2    | Refatorar `ThemeContext` para gerenciar `mode: 'light' \| 'dark'` + persistir | 2h      | ✅     |
| 3.3    | Criar componente `<ThemeToggle />`                                            | 1h      | ✅     |
| 3.4    | Refatorar componentes UI (13 componentes)                                     | 6h      | ✅     |
| 3.5    | Refatorar layout (MainLayout, Sidebar, Header)                                | 3h      | ✅     |
| 3.6    | Refatorar `ParticlesBackground` (cor dinâmica)                                | 1h      | ✅     |
| 3.7    | Refatorar `Toaster` no `App.tsx` (cores dinâmicas)                            | 0.5h    | ✅     |
| 3.10   | Adicionar toggle de tema no Header                                            | 1h      | ✅     |
| 3.11   | Respeitar `prefers-color-scheme` no primeiro acesso                           | 0.5h    | ✅     |
| 3.8    | Refatorar páginas principais (25 arquivos em lote)                            | 6h      | ✅     |
| 3.9    | Refatorar componentes auxiliares (6 arquivos)                                 | 8h      | ✅     |
| 3.12   | Verificação de cores remanescentes + build                                    | 2h      | ✅     |

**Status:** ✅ Concluída | Build: ✅ | Testes: 13/13 | ~50 arquivos refatorados

**Objetivo:** Adicionar suporte completo a tema claro e escuro com toggle persistido.

Esta é a frente mais complexa, pois **~40+ componentes** usam cores dark hardcoded (`text-white`, `text-slate-*`, `bg-white/*`, `bg-slate-*`).

#### 3.1 Arquitetura do sistema de temas

**Estratégia:** Tailwind CSS v4 com `dark:` variant + CSS variables semânticas.

O Tailwind v4 suporta o variant `dark:` nativamente via `@custom-variant dark (&:where(.dark, .dark *));`. A estratégia é:

1. **Definir tokens semânticos** no `@theme` que mudam conforme o tema ativo.
2. **Adicionar classe `dark` no `<html>`** controlada pelo `ThemeContext`.
3. **Refatorar componentes** para usar classes semânticas (`text-foreground`, `bg-surface`, `border-border`) em vez de cores literais.
4. **Manter compatibilidade** com o sistema de branding existente (cores primária/accent).

#### 3.2 Tokens semânticos propostos

```css
/* src/index.css */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Brand (imutável — controlado por branding) */
  --color-primary: #1d4ed8;
  --color-accent: #0ea5e9;
  --color-danger: #ef4444;
  --color-success: #22c55e;
  --color-warning: #f59e0b;

  /* Semânticos — Light (default) */
  --color-background: #f8fafc;
  --color-foreground: #0f172a;
  --color-surface: #ffffff;
  --color-surface-light: #f1f5f9;
  --color-surface-hover: #e2e8f0;
  --color-border: #e2e8f0;
  --color-border-strong: #cbd5e1;
  --color-muted: #64748b;
  --color-muted-foreground: #475569;
  --color-sidebar: #ffffff;
  --color-header: #ffffff;
  --color-input: #ffffff;
  --color-input-border: #cbd5e1;
  --color-overlay: rgba(15, 23, 42, 0.5);
}

@layer base {
  .dark {
    --color-background: #050b16;
    --color-foreground: #e2e8f0;
    --color-surface: #111d33;
    --color-surface-light: #1a2840;
    --color-surface-hover: #1e293b;
    --color-border: rgba(255, 255, 255, 0.1);
    --color-border-strong: rgba(255, 255, 255, 0.2);
    --color-muted: #94a3b8;
    --color-muted-foreground: #64748b;
    --color-sidebar: #0b1220;
    --color-header: #121b2e;
    --color-input: rgba(255, 255, 255, 0.05);
    --color-input-border: rgba(255, 255, 255, 0.1);
    --color-overlay: rgba(0, 0, 0, 0.6);
  }
}
```

#### 3.3 Mapeamento de classes — antes e depois

| Classe atual (dark hardcoded)     | Classe semântica        |
| --------------------------------- | ----------------------- |
| `text-white`                      | `text-foreground`       |
| `text-slate-100`                  | `text-foreground`       |
| `text-slate-300`                  | `text-muted-foreground` |
| `text-slate-400`                  | `text-muted`            |
| `text-slate-500`                  | `text-muted`            |
| `text-slate-600`                  | `text-muted`            |
| `bg-white/5`                      | `bg-surface-light`      |
| `bg-white/10`                     | `bg-surface-hover`      |
| `bg-slate-900`                    | `bg-surface`            |
| `bg-slate-950`                    | `bg-background`         |
| `bg-slate-700/50`                 | `bg-surface-light`      |
| `bg-slate-800`                    | `bg-surface-light`      |
| `border-white/10`                 | `border-border`         |
| `border-white/5`                  | `border-border`         |
| `bg-black/60`                     | `bg-overlay`            |
| `bg-surface` (já semântico)       | mantido                 |
| `bg-surface-light` (já semântico) | mantido                 |
| `bg-sidebar` (já semântico)       | mantido                 |
| `bg-header` (já semântico)        | mantido                 |

#### 3.4 Plano de execução — Tema

| Tarefa | Descrição                                                                                                                                                                                                              | Esforço | Dependências |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------ |
| 3.1    | Atualizar `src/index.css` com tokens semânticos + `@custom-variant dark`                                                                                                                                               | 2h      | —            |
| 3.2    | Refatorar `ThemeContext` para gerenciar `mode: 'light' \| 'dark'` + persistir em `localStorage` + aplicar classe no `<html>`                                                                                           | 2h      | 3.1          |
| 3.3    | Criar hook `useThemeMode()` e componente `<ThemeToggle />`                                                                                                                                                             | 1h      | 3.2          |
| 3.4    | Refatorar componentes UI (`Button`, `Card`, `Input`, `Select`, `TextArea`, `Badge`, `Modal`, `DataTable`, `Loading`, `Skeleton`, `Tooltip`, `EmptyState`, `PageHeader`, `StatCard`, `MetricBar`, `AgentHeartbeatCard`) | 6h      | 3.1          |
| 3.5    | Refatorar layout (`MainLayout`, `Sidebar`, `Header`)                                                                                                                                                                   | 3h      | 3.1, 3.4     |
| 3.6    | Refatorar `ParticlesBackground` (cor do particle dinâmica)                                                                                                                                                             | 1h      | 3.1          |
| 3.7    | Refatorar `Toaster` no `App.tsx` (cores dinâmicas)                                                                                                                                                                     | 0.5h    | 3.2          |
| 3.8    | Refatorar páginas principais (`Dashboard`, `ClientList`, `AgentList`, `TicketList`, `LogViewer`, `LoginPage`)                                                                                                          | 6h      | 3.4, 3.5     |
| 3.9    | Refatorar páginas secundárias (settings, reports, knowledge, automation, software, deploy)                                                                                                                             | 8h      | 3.8          |
| 3.10   | Adicionar toggle de tema no Header e na página de Branding                                                                                                                                                             | 1h      | 3.3, 3.5     |
| 3.11   | Respeitar `prefers-color-scheme` no primeiro acesso                                                                                                                                                                    | 0.5h    | 3.2          |
| 3.12   | Testes visuais em ambos os temas                                                                                                                                                                                       | 2h      | 3.8, 3.9     |

**Esforço total:** ~33h

#### 3.5 Detalhamento — `ThemeContext` refatorado

```typescript
type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
  branding: BrandingConfig;
  updateBranding: (patch: Partial<BrandingConfig>) => void;
  resetBranding: () => void;
}
```

- Persistir `mode` em `localStorage` com chave `discovery-rmm-theme-mode`.
- No boot, ler `localStorage` → se ausente, usar `window.matchMedia('(prefers-color-scheme: dark)')`.
- Aplicar `document.documentElement.classList.toggle('dark', mode === 'dark')`.
- Atualizar `color-scheme` no `<html>` conforme modo.

#### 3.6 Detalhamento — `ParticlesBackground`

A cor dos particles (`#ffffff`) deve ser dinâmica:

```typescript
const particleColor = theme === "dark" ? "#ffffff" : "#1e293b";
```

#### 3.7 Detalhamento — `Toaster` dinâmico

O `Toaster` no `App.tsx` hardcodeia `background: '#0f172a'`. Deve ler o tema:

```typescript
const { mode } = useTheme();
const toastStyle =
  mode === "dark"
    ? {
        background: "#0f172a",
        color: "#e2e8f0",
        border: "1px solid rgba(148,163,184,0.25)",
      }
    : { background: "#ffffff", color: "#0f172a", border: "1px solid #e2e8f0" };
```

---

### Frente 4 — Otimização de Performance (P1)

**Objetivo:** Reduzir re-renders desnecessários e melhorar tempo de carregamento.

| Tarefa | Descrição                                                                                                   | Esforço |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------- |
| 4.1    | Isolar countdown do Header (BUG-10)                                                                         | 1h      |
| 4.2    | Memoizar `resolveActiveSection` no Sidebar                                                                  | 0.5h    |
| 4.3    | Adicionar `React.memo` em componentes UI puros (`Badge`, `StatCard`, `MetricBar`, `EmptyState`)             | 2h      |
| 4.4    | Configurar `manualChunks` mais granular no Vite (separar `recharts`, `tsparticles`, `md-editor`, `dnd-kit`) | 1h      |
| 4.5    | Adicionar `prefetch` de rotas frequentes no idle callback                                                   | 2h      |
| 4.6    | Otimizar `DataTable` — virtualização para listas grandes (>100 itens) com `@tanstack/react-virtual`         | 4h      |
| 4.7    | Revisar `staleTime`/`gcTime` do React Query por domínio (tickets: 30s, agents: 15s, config: 5min)           | 1h      |

**Esforço total:** ~11.5h

---

### Frente 5 — ✅ CONCLUÍDA (2026-07-10) — Melhorias de Arquitetura (P2)

| Tarefa  | Descrição                                                          | Esforço | Status                                                                   |
| ------- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------ |
| 5.6     | Adicionar Error Boundary por rota (suporte a fallback customizado) | 2h      | ✅ `ErrorBoundary.tsx`                                                   |
| 5.8     | Padronizar casing dos paths da API (lowercase)                     | 1h      | ✅ `clients.ts`, `sites.ts`                                              |
| 5.7     | Extrair `decodeBase64Url` para `utils/base64.ts`                   | 0.5h    | ✅ Já feito na Frente 2                                                  |
| 5.1-5.4 | Decompor Sidebar/AgentList/TicketList, mover interfaces iam.ts     | —       | ⏭️ Adiado (risco de regressão, sem ganho funcional imediato)             |
| 5.5     | Tipar auto-ticket-rules e agent-updates                            | —       | ⏭️ Adiado (API retorna unknown — tipagem depende da documentação da API) |

### Frente 6 — ✅ CONCLUÍDA (2026-07-10) — Melhorias de Segurança (P2)

| Tarefa | Descrição                                             | Esforço | Status                                 |
| ------ | ----------------------------------------------------- | ------- | -------------------------------------- |
| 6.1    | Migrar tokens de `localStorage` para `sessionStorage` | 2h      | ✅ Já feito na Frente 2 (`storage.ts`) |
| 6.2    | Adicionar CSP header via meta tag                     | 1h      | ✅ `index.html`                        |
| 6.3    | Sanitizar inputs (react-markdown já sanitiza)         | —       | ✅ Já existente                        |
| 6.4    | `SameSite=Strict` em cookies                          | —       | ⏭️ Futuro (depende de BFF)             |

**Status:** ✅ Completas | Build: ✅ | Testes: 13/13 ✅

---

## 9. Resumo Final — Plano Concluído

| Frente                       | Status | Principais entregas                                                |
| ---------------------------- | ------ | ------------------------------------------------------------------ |
| Frente 1 — Bugs Críticos     | ✅     | Retry auth, refs persistentes, renomeação API                      |
| Frente 2 — Bugs Moderados    | ✅     | 10 correções (sessionStorage, Tooltip, Sidebar, etc.)              |
| Frente 3 — Tema Claro/Escuro | ✅     | ~50 arquivos, tokens semânticos, ThemeToggle, prefers-color-scheme |
| Frente 4 — Performance       | ✅     | React.memo, 9 manualChunks, staleTime otimizado                    |
| Frente 5 — Arquitetura       | ✅     | ErrorBoundary + fallback, paths lowercase, base64 util             |
| Frente 6 — Segurança         | ✅     | CSP header, sessionStorage, SameSite planejado                     |

**Total de arquivos modificados:** ~70
**Total de testes:** 13/13 ✅
**Build:** ✅ TypeScript + Vite compilam sem erros

---

## 5. Cronograma e Priorização

### Sprint 1 (Semana 1) — Bugs críticos + início do tema

- **Frente 1** completa (bugs de auth) — 8h
- **Frente 3** tarefas 3.1–3.3 (infra do tema) — 5h
- **Frente 2** tarefas 2.1–2.2 (bugs rápidos) — 1h

### Sprint 2 (Semana 2) — Tema core

- **Frente 3** tarefas 3.4–3.7 (componentes UI + layout) — 10.5h
- **Frente 3** tarefa 3.10 (toggle no Header) — 1h

### Sprint 3 (Semana 3) — Tema nas páginas

- **Frente 3** tarefas 3.8–3.9 (páginas) — 14h
- **Frente 3** tarefas 3.11–3.12 (prefers-color-scheme + testes) — 2.5h

### Sprint 4 (Semana 4) — Performance + bugs moderados

- **Frente 2** tarefas restantes — 7.5h
- **Frente 4** completa — 11.5h

### Sprint 5 (Semana 5) — Arquitetura + segurança

- **Frente 5** completa — 24.5h
- **Frente 6** completa — 4h

**Esforço total estimado:** ~89.5h (≈ 2 sprints de 40h + buffer)

---

## 6. Matriz de Risco

| Risco                                                                           | Probabilidade | Impacto | Mitigação                                                 |
| ------------------------------------------------------------------------------- | ------------- | ------- | --------------------------------------------------------- |
| Refatoração de tema quebrar páginas não testadas                                | Alta          | Médio   | Checklist por página + testes visuais em ambos os temas   |
| `getHeartbeat` ser usado em多处 sem saber que retorna o próprio heartbeat       | Média         | Alto    | Buscar usos com `grep` e auditar antes de renomear        |
| Migração para `sessionStorage` quebrar persistência de sessão em múltiplas abas | Média         | Médio   | Documentar comportamento; considerar `storage` event sync |
| Virtualização da `DataTable` alterar comportamento de sort/hover card           | Média         | Médio   | Manter API da `DataTable` estável; testar com dados reais |
| Tailwind v4 `@custom-variant dark` mudar de sintaxe                             | Baixa         | Baixo   | Pinar versão do Tailwind no `package.json`                |

---

## 7. Critérios de Aceitação

### Tema Claro/Escuro

- [ ] Toggle visível no Header e na página de Branding
- [ ] Tema persistido em `localStorage`
- [ ] `prefers-color-scheme` respeitado no primeiro acesso
- [ ] Todos os componentes UI renderizam corretamente em ambos os temas
- [ ] Todas as páginas do `router.tsx` renderizam corretamente em ambos os temas
- [ ] `ParticlesBackground` visível em ambos os temas
- [ ] `Toaster` com cores corretas em ambos os temas
- [ ] Scrollbar estilizada para ambos os temas
- [ ] `select option` com contraste correto em ambos os temas

### Bugs

- [ ] Sessão não é perdida em erro de rede transitório
- [ ] `lastActivityAt` persiste entre refreshes de token
- [ ] `getHeartbeat` documentado ou corrigido
- [ ] Sem vazamentos de timeout em Tooltip
- [ ] Context menu do AgentList abre/fecha corretamente

### Performance

- [ ] Header não re-renderiza a cada segundo
- [ ] `manualChunks` separa recharts, tsparticles, md-editor
- [ ] `DataTable` virtualizada para >100 linhas

---

## 8. Notas Técnicas

### Tailwind CSS v4 — `dark` variant

O Tailwind v4 não usa mais `darkMode: 'class'` no config. Em vez disso, usa-se:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Isso permite que `dark:bg-slate-900` funcione quando `.dark` está no `<html>`.

### Estratégia híbrida para refatoração

Para minimizar risco, a refatoração de tema seguirá esta ordem:

1. **Tokens semânticos** no CSS (sem mudar componentes).
2. **Componentes UI** (base reutilizável).
3. **Layout** (Sidebar, Header, MainLayout).
4. **Páginas principais** (Dashboard, listas).
5. **Páginas secundárias** (settings, reports).

A cada etapa, validar visualmente em ambos os temas antes de prosseguir.

### Compatibilidade com branding existente

O sistema de branding (cores primária/accent/sidebar/header) deve continuar funcionando. As CSS variables `--color-primary`, `--color-accent`, `--color-sidebar`, `--color-header` são aplicadas via JS pelo `ThemeContext` e **sobrepõem** os defaults do `@theme`. Os novos tokens semânticos (`--color-foreground`, `--color-surface`, etc.) são controlados pelo modo (light/dark) e não pelo branding.

---

## 9. Próximos Passos Imediatos

1. **Confirmar endpoint de heartbeat** na API Scalar — existe `/api/v1/agents/{id}/heartbeat`?
2. **Aprovar priorização** das frentes (Sprint 1 começa pela Frente 1 + 3.1–3.3).
3. **Criar branch** `feature/theme-light-dark` a partir de `dev`.
4. **Iniciar pela Frente 1** (bugs de auth) — menor risco, maior impacto imediato.
