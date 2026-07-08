# Plano de Migração: Paginação Cursor-Based

> **Status:** Revisado — aguardando aprovação
> **Data:** 2026-07-08
> **Branch:** `dev`

---

## Contexto

A API do Discovery RMM migrou de paginação **offset-based** (`offset` + `limit`) para **cursor-based** (`cursor` + `limit`), usando o tipo canônico:

```
CursorPageDto<T> {
  items: T[];
  returnedItems: number;
  cursor: string | null;       // cursor eco da requisição
  nextCursor: string | null;   // cursor para próxima página (null = última)
  hasMore: boolean;            // true se há mais páginas
  limit: number;               // limite aplicado
}
```

O cursor é um token Base64 que codifica o ponteiro do último item (ex: `CreatedAt_ticks|Guid_N`).

---

## ⚠️ Bugs e Problemas Encontrados na Revisão

### BUG #1 — Endpoints `/page` de automação NÃO existem na API

**Severidade:** 🔴 Crítico

O frontend chama:

- `automationApi.listScriptsPage()` → `GET /api/v1/automation/scripts/page`
- `automationApi.listTasksPage()` → `GET /api/v1/automation/tasks/page`

Mas a OpenAPI spec **não tem** `/api/v1/automation/scripts/page` nem `/api/v1/automation/tasks/page`. Os endpoints reais são:

- `GET /api/v1/automation/scripts` (já aceita `cursor` + `limit`)
- `GET /api/v1/automation/tasks` (já aceita `cursor` + `limit`)

**Impacto:** As chamadas `listScriptsPage()` / `listTasksPage()` provavelmente retornam 404. As páginas de automação ainda usam `listScripts()` / `listTasks()` (offset) porque as versões `/page` não funcionam.

**Correção:** Remover os métodos `listScriptsPage()` / `listTasksPage()` e migrar `listScripts()` / `listTasks()` para usar `cursor` em vez de `offset`. Os endpoints base já suportam cursor.

---

### BUG #2 — `AutomationScriptPage` e `AutomationTaskPage` têm campos offset/total

**Severidade:** 🟡 Médio

```typescript
// src/api/types.ts linhas 2927-2933
export interface AutomationScriptPage {
  items: AutomationScriptSummary[];
  count: number;
  total: number; // ← não existe mais na resposta cursor
  limit: number;
  offset: number; // ← não existe mais na resposta cursor
}

// src/api/types.ts linhas 2996-3002
export interface AutomationTaskPage {
  items: AutomationTaskSummary[];
  count: number;
  total: number; // ← não existe mais
  limit: number;
  offset: number; // ← não existe mais
}
```

As páginas `AutomationScriptsPage.tsx` e `AutomationTasksPage.tsx` usam `list.data?.total` para calcular `canNext = offset + limit < total`. Com cursor, `total` não vem na resposta.

**Correção:** Substituir `AutomationScriptPage` e `AutomationTaskPage` por `CursorPageDto<AutomationScriptSummary>` e `CursorPageDto<AutomationTaskSummary>`. Usar `hasMore` + `nextCursor` para habilitar botão "próximo".

---

### BUG #3 — `TaskPreviewAgentsResponse` ainda usa offset/total

**Severidade:** 🟡 Médio

```typescript
// src/api/types.ts linhas 3051+
export interface TaskPreviewAgentsResponse {
  // ...
  items: TaskPreviewAgentItem[];
  count: number;
  total: number; // ← pode não existir mais
  limit: number;
  // falta: offset, cursor, nextCursor, hasMore
}
```

`getTaskPreviewAgents(id, limit=50, offset=0)` em `src/api/automation.ts:160` envia `offset` para a API. Precisa verificar se o endpoint `/api/v1/automation/tasks/{id}/preview-agents` ainda aceita `offset` ou se migrou para cursor.

**Correção:** Verificar na spec OpenAPI se o endpoint de preview-agents suporta cursor. Se sim, migrar; se não, manter como está (offset legado).

---

### BUG #4 — `AgentAlertsQuery` ainda tem campo `offset`

**Severidade:** 🟡 Médio

```typescript
// src/api/types.ts linhas 1912-1921
export interface AgentAlertsQuery {
  status?: string;
  scopeType?: string;
  scopeClientId?: string;
  scopeSiteId?: string;
  scopeAgentId?: string;
  ticketId?: string;
  limit?: number;
  offset?: number; // ← legado, não usado pelo endpoint /page
}
```

O hook `useAgentAlerts()` chama `agentAlertsApi.list()` (endpoint base `/api/v1/agent-alerts`) que **não existe mais** na spec OpenAPI — só existe `/api/v1/agent-alerts/page`. O endpoint base foi removido.

**Correção:** Migrar `useAgentAlerts()` para usar `agentAlertsApi.listPage()` e remover `offset` do `AgentAlertsQuery`.

---

### BUG #5 — `TicketsQuery` não tem campo `cursor`

**Severidade:** 🟡 Médio

```typescript
// src/api/types.ts linhas 2003-2016
export interface TicketsQuery {
  clientId?: string;
  // ... filtros ...
  limit?: number;
  offset?: number; // ← legado
  // falta: cursor?: string;
}
```

O `TicketsPageParams` em `tickets.ts` adiciona `cursor` via interseção, mas o `TicketsQuery` base ainda tem `offset`. A spec OpenAPI mostra que `/api/v1/Tickets` e `/api/v1/Tickets/page` aceitam **ambos** `Cursor` e `Offset` (híbrido), mas `Offset` é legado.

**Correção:** Adicionar `cursor?: string` ao `TicketsQuery`, marcar `offset` como deprecated.

---

### BUG #6 — `LogsQuery` é híbrido (cursor + offset)

**Severidade:** 🟢 Baixo

```typescript
export interface LogsQuery {
  // ... filtros ...
  cursor?: string;
  limit?: number;
  offset?: number; // ← legado, ainda presente
}
```

O endpoint `/api/v1/logs` aceita apenas `cursor` + `limit` (sem `offset` na spec). O `offset` no tipo é morto.

**Correção:** Remover `offset` do `LogsQuery`.

---

### BUG #7 — `P2PArtifactsDistributionParams` ainda usa offset

**Severidade:** 🟡 Médio

```typescript
// src/api/p2p.ts
export interface P2PArtifactsDistributionParams extends P2PQueryScope {
  artifactId?: string;
  limit?: number;
  offset?: number; // ← legado
}
```

Já existe `P2PArtifactsDistributionPageParams` com `cursor`, mas o tipo legado ainda está presente.

**Correção:** Remover `P2PArtifactsDistributionParams` ou marcar como deprecated.

---

### BUG #8 — `TicketList.tsx` calcula `hasNextPage` de forma frágil

**Severidade:** 🟡 Médio

```typescript
// src/pages/tickets/TicketList.tsx:369
const hasNextPage = visibleTickets.length === pageSize;
```

Isso assume que se a página retornou exatamente `pageSize` itens, há mais. Mas com cursor, a resposta tem `hasMore` explícito. Esse cálculo pode dar falso positivo (última página com exatamente `pageSize` itens) ou falso negativo (página com menos itens mas ainda há mais).

**Correção:** Usar `data?.hasMore` do `CursorPageDto`.

---

### BUG #9 — `AgentDetail.tsx` usa `useTickets({ agentId, limit: 5 })` sem paginação

**Severidade:** 🟢 Baixo

```typescript
// src/pages/agents/AgentDetail.tsx:197
const agentTickets = useTickets({ agentId: id, limit: 5 });
```

Isso usa o endpoint base `/api/v1/Tickets` (offset legado). Como só mostra 5 tickets, não há paginação. Mas se o endpoint base for removido, quebra.

**Correção:** Migrar para `useTicketsPage({ agentId, limit: 5 })` e usar `data.items`.

---

### BUG #10 — `TicketDetail.tsx` usa `useAutomationTasks({ offset: 0 })`

**Severidade:** 🟢 Baixo

```typescript
// src/pages/tickets/TicketDetail.tsx:793
const tasksQuery = useAutomationTasks({
  activeOnly: true,
  limit: 200,
  offset: 0,
});
```

Envia `offset: 0` que é ignorado pela API cursor. Funciona por acidente, mas precisa ser limpo.

---

## Mapeamento: Estado Atual vs Desejado

| Domínio                    | Endpoint API (spec real)                  | Módulo API (front)                  | Hook                               | Página                         | Status           |
| -------------------------- | ----------------------------------------- | ----------------------------------- | ---------------------------------- | ------------------------------ | ---------------- |
| Tickets                    | `GET /Tickets/page` ✅ cursor             | `listPage()` ✅                     | `useTickets()` ❌ offset           | `TicketList.tsx` ❌ offset     | Migrar           |
| Tickets (base)             | `GET /Tickets` ✅ híbrido                 | `list()` ✅                         | `useTickets()` ❌                  | `AgentDetail.tsx` ❌           | Migrar           |
| Agent Alerts               | `GET /agent-alerts/page` ✅ cursor        | `listPage()` ✅                     | `useAgentAlerts()` ❌ usa `list()` | —                              | Migrar           |
| Agent Alerts (base)        | ❌ **removido da API**                    | `list()` ❌ quebrado                | —                                  | —                              | **Remover**      |
| Automation Scripts         | `GET /automation/scripts` ✅ cursor       | `listScripts()` ❌ offset           | `useAutomationScripts()` ❌        | `AutomationScriptsPage.tsx` ❌ | Migrar           |
| Automation Scripts (/page) | ❌ **não existe**                         | `listScriptsPage()` ❌ 404          | —                                  | —                              | **Remover**      |
| Automation Tasks           | `GET /automation/tasks` ✅ cursor         | `listTasks()` ❌ offset             | `useAutomationTasks()` ❌          | `AutomationTasksPage.tsx` ❌   | Migrar           |
| Automation Tasks (/page)   | ❌ **não existe**                         | `listTasksPage()` ❌ 404            | —                                  | —                              | **Remover**      |
| Task Preview Agents        | `GET /tasks/{id}/preview-agents` ❓       | `getTaskPreviewAgents()` offset     | —                                  | `AutomationTasksPage.tsx:1770` | Verificar        |
| P2P Distribution           | `GET /p2p/artifacts/distribution/page` ✅ | `getArtifactsDistributionPage()` ✅ | —                                  | —                              | Migrar consumers |
| P2P Distribution (base)    | ❓ verificar                              | `getArtifactsDistribution()` offset | —                                  | —                              | Verificar        |
| Ticket Comments            | `GET /Tickets/{id}/comments` ✅ cursor    | `listComments()` ❌ sem cursor      | `useTicketComments()` ❌           | `TicketDetail.tsx`             | Migrar           |
| Logs                       | `GET /logs` ✅ cursor                     | `listPage()` ✅                     | `useLogsPage()` ✅                 | `LogViewer.tsx` ✅             | OK               |
| Software Inventory         | cursor nativo ✅                          | ✅                                  | ✅                                 | ✅                             | OK               |
| Agent Software             | cursor nativo ✅                          | ✅                                  | ✅                                 | ✅                             | OK               |
| Knowledge                  | cursor nativo ✅                          | ✅                                  | ✅                                 | ✅                             | OK               |
| App Store                  | cursor nativo ✅                          | ✅                                  | —                                  | —                              | OK               |
| Users                      | cursor nativo ✅                          | —                                   | —                                  | —                              | OK               |
| Monitoring Events          | cursor nativo ✅                          | ✅                                  | —                                  | —                              | OK               |

---

## Plano de Execução Revisado (8 Etapas)

### Etapa 0 — Verificar endpoints incertos

**Antes de qualquer mudança, confirmar:**

1. `GET /api/v1/agent-alerts` (base, sem `/page`) — existe ainda? Se não, `agentAlertsApi.list()` está quebrado.
2. `GET /api/v1/automation/tasks/{id}/preview-agents` — aceita `cursor` ou `offset`?
3. `GET /api/v1/ops/p2p/artifacts/distribution` (base, sem `/page`) — existe ainda?

**Ação:** Fazer requisições de teste com `curl` ou verificar no codebase da API.

**Tempo:** 30min

---

### Etapa 1 — Criar Hook Compartilhado `useCursorPagination`

**Arquivo novo:** `src/hooks/useCursorPagination.ts`

Extrai o padrão de stack manual `pageCursors[page-1]` replicado em 4 lugares:

- `SoftwareInventory.tsx`
- `AgentDetail.tsx`
- `KnowledgeList.tsx`
- `SoftwareStore.tsx`

```typescript
interface UseCursorPaginationOptions {
  initialLimit?: number;
}

interface CursorPaginationState {
  page: number;
  pageCursors: Array<string | null>;
  limit: number;
  cursor: string | null; // cursor da página atual
  goToPage: (page: number) => void;
  goToNext: (nextCursor: string | null) => void;
  goToPrev: () => void;
  reset: () => void;
  setLimit: (limit: number) => void;
}
```

**Tempo:** 30min
**Impacto:** Aditivo, nada quebra

---

### Etapa 2 — Migrar Automação (Scripts + Tasks)

> **Mudança crítica vs plano anterior:** os endpoints `/page` não existem. Migrar os métodos `listScripts()` / `listTasks()` diretamente para cursor.

**Arquivos afetados:**

- `src/api/automation.ts`:
  - Remover `listScriptsPage()` e `listTasksPage()` (endpoints 404)
  - Migrar `listScripts()`: trocar `offset` por `cursor` no retorno `CursorPageDto<AutomationScriptSummary>`
  - Migrar `listTasks()`: trocar `offset` por `cursor` no retorno `CursorPageDto<AutomationTaskSummary>`
  - Remover `offset` de `ListAutomationScriptsParams` e `ListAutomationTasksParams`
  - Verificar `getTaskPreviewAgents()` — manter offset se API ainda aceita, ou migrar
- `src/api/types.ts`:
  - Remover `AutomationScriptPage` e `AutomationTaskPage` (substituir por `CursorPageDto`)
- `src/hooks/useAutomation.ts`:
  - Atualizar `useAutomationScripts()` e `useAutomationTasks()` params (remover `offset`, adicionar `cursor`)
  - Query keys devem incluir `cursor` em vez de `offset`
- `src/pages/automation/AutomationScriptsPage.tsx`:
  - Trocar `offset` state por cursor stack
  - `canNext = list.data?.hasMore && !!list.data?.nextCursor`
  - `canPrev = page > 1`
  - Remover uso de `.total`
- `src/pages/automation/AutomationTasksPage.tsx`: mesmo que acima
- `src/pages/automation/AutomationAuditPage.tsx`: trocar `offset: 0` por `cursor: undefined`
- `src/pages/automation/AutomationOperationsPage.tsx`: mesmo que acima
- `src/pages/tickets/TicketDetail.tsx:793`: trocar `offset: 0` por `cursor: undefined`

**Tempo:** 3h
**Risco:** Alto — muitas páginas dependem disso

---

### Etapa 3 — Migrar `TicketList.tsx` para Cursor

**Arquivos afetados:**

- `src/api/types.ts`: adicionar `cursor?: string` ao `TicketsQuery`, marcar `offset` como deprecated
- `src/hooks/useTickets.ts`: adicionar `useTicketsPage()` hook usando `ticketsApi.listPage()`
- `src/pages/tickets/TicketList.tsx`:
  - Trocar `useTickets()` por `useTicketsPage()`
  - Substituir `offset = (page-1) * pageSize` por cursor stack
  - `hasNextPage = data?.hasMore ?? false` (em vez de `visibleTickets.length === pageSize`)
  - Resetar cursor stack quando filtros mudarem (já faz `setPage(1)`, precisa também limpar stack)
  - Saved views: ao aplicar, resetar cursor stack
- `src/pages/agents/AgentDetail.tsx:197`: trocar `useTickets({ agentId, limit: 5 })` por `useTicketsPage({ agentId, limit: 5 })` e usar `data.items`

**⚠️ Cuidado com Saved Views:**
O `TicketList.tsx` tem sistema de saved views que serializa filtros para JSON (`filterJson`). Verificar se o saved view não inclui `page` ou `offset` no filtro. Se incluir, remover do schema do saved view.

**Tempo:** 2h

---

### Etapa 4 — Migrar Agent Alerts para Cursor

**Arquivos afetados:**

- `src/api/agent-alerts.ts`:
  - Verificar se `list()` (endpoint base) ainda funciona ou se foi removido
  - Se removido: deletar `list()`, manter só `listPage()`
  - Se existe: marcar como deprecated
- `src/api/types.ts`: remover `offset` do `AgentAlertsQuery`, adicionar `cursor?: string`
- `src/hooks/useAgentAlerts.ts`: migrar `useAgentAlerts()` para usar `listPage()` em vez de `list()`
- Páginas que consomem `useAgentAlerts()`: ajustar para ler `data.items` em vez de `data` direto

**Tempo:** 1h

---

### Etapa 5 — Migrar P2P Artifacts Distribution

**Arquivos afetados:**

- `src/api/p2p.ts`: remover `P2PArtifactsDistributionParams` (offset) ou marcar deprecated
- Verificar se `getArtifactsDistribution()` (base) ainda funciona
- Migrar consumers de `getArtifactsDistribution()` para `getArtifactsDistributionPage()`

**Tempo:** 1h

---

### Etapa 6 — Migrar Ticket Comments para Cursor

**Arquivos afetados:**

- `src/api/tickets.ts`: `listComments(id, { cursor, limit })` em vez de `listComments(id)`
- `src/hooks/useTickets.ts`: `useTicketComments()` usar `useInfiniteQuery` ou cursor stack
- `src/pages/tickets/TicketDetail.tsx`: componente de comentários com "carregar mais" ou scroll infinito

**Tempo:** 1.5h

---

### Etapa 7 — Limpeza de Tipos Legados

**Arquivos afetados:**

- `src/api/types.ts`:
  - Remover `offset` de `AgentAlertsQuery`
  - Remover `offset` de `LogsQuery`
  - Adicionar `cursor?: string` ao `TicketsQuery` (se não feito na Etapa 3)
  - Remover `AutomationScriptPage` e `AutomationTaskPage` (se não feito na Etapa 2)
  - Verificar `TaskPreviewAgentsResponse` — adicionar campos cursor se necessário
- `src/api/automation.ts`: remover `offset` de params
- `src/api/p2p.ts`: remover `P2PArtifactsDistributionParams.offset`

**Tempo:** 1h

---

### Etapa 8 — Refatorar páginas existentes para usar `useCursorPagination`

**Arquivos afetados:**

- `src/pages/software/SoftwareInventory.tsx`: refatorar para usar hook compartilhado
- `src/pages/agents/AgentDetail.tsx`: refatorar stack de software
- `src/pages/knowledge/KnowledgeList.tsx`: refatorar stack de cursor
- `src/pages/software/SoftwareStore.tsx`: refatorar stack de cursor

**Tempo:** 1.5h
**Risco:** Baixo — já funcionam, só refatorando para usar hook compartilhado

---

## Resumo

| Etapa     | Descrição                                 | Tempo    | Risco |
| --------- | ----------------------------------------- | -------- | ----- |
| 0         | Verificar endpoints incertos              | 30min    | —     |
| 1         | Criar `useCursorPagination` hook          | 30min    | Baixo |
| 2         | Migrar Automação (Scripts + Tasks)        | 3h       | Alto  |
| 3         | Migrar `TicketList` para cursor           | 2h       | Médio |
| 4         | Migrar Agent Alerts                       | 1h       | Médio |
| 5         | Migrar P2P Distribution                   | 1h       | Baixo |
| 6         | Migrar Ticket Comments                    | 1.5h     | Médio |
| 7         | Limpeza de tipos legados                  | 1h       | Baixo |
| 8         | Refatorar páginas para hook compartilhado | 1.5h     | Baixo |
| **Total** |                                           | **~12h** |       |

**Ordem recomendada:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

---

## Pontos de Atenção

1. **Saved Views do TicketList** — verificar se `filterJson` não inclui `page`/`offset`. Se incluir, quebrar compatibilidade com views salvas.
2. **Query Keys do React Query** — ao mudar de `offset` para `cursor`, as query keys mudam. Isso invalida cache automaticamente (bom), mas pode causar refetch desnecessário se não for bem planejado.
3. **`placeholderData: keepPreviousData`** — adicionar nos hooks de página para evitar flicker ao trocar de página (já usado em `useSoftwareInventory`).
4. **Endpoint `/api/v1/Tickets` (base)** — ainda aceita `Cursor` e `Offset` (híbrido). O `Offset` é legado mas funciona. Migração pode ser gradual.
5. **Endpoint `/api/v1/agent-alerts` (base)** — pode ter sido removido. Verificar antes.
6. **`getTaskPreviewAgents`** — verificar se aceita cursor ou se é offset-only.
7. **URL params** — `TicketList.tsx` não sincroniza `page` com URL, então não há problema com cursor na URL.
8. **`DataTable` component** — faz paginação client-side com `showPagination={false}` no TicketList. Não precisa mudar.
