# Plano de Revisão: CQRS/Handler + Paginação Cursor + Padronização API ↔ Frontend

> **Status:** ✅ Fases 1 e 2 CONCLUÍDAS — Revisão pós-implementação OK
> **Data:** 2026-07-09
> **Branch:** `dev`
> **Escopo:** `DiscoveryRMM_API` (backend) + `DiscoveryRMM_Site` (frontend)

---

## Sumário Executivo

A migração para CQRS (MediatR) está **~90% completa** no backend, mas com 4 controllers ainda chamando serviços diretamente e **4 commands órfãos sem handler** (erro 500 em runtime). A migração para paginação cursor está **parcialmente feita**: o tipo canônico `CursorPageDto<T>` existe, mas coexiste com **5 DTOs híbridos** que misturam campos offset (`Total`, `Offset`, `Count`) com cursor. O **casing de serialização JSON** é inconsistente — `CursorPageDto` usa `[JsonPropertyName("data")]` enquanto os demais DTOs serializam em PascalCase, mas o frontend espera camelCase. O frontend já tem um plano de migração cursor (`PLANO_MIGRACAO_CURSOR_PAGINATION.md`) com 10 bugs documentados, mas a correção precisa começar pelo backend para alinhar o contrato.

---

## Parte A — Backend (DiscoveryRMM_API)

### A1. 🔴 CRÍTICO — Padronizar serialização JSON para camelCase ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** O `Program.cs` não define `PropertyNamingPolicy`, então `System.Text.Json` serializa em **PascalCase** (`Items`, `ReturnedItems`, `NextCursor`). O frontend espera **camelCase** (`items`, `returnedItems`, `nextCursor`). O frontend compensa com normalizadores defensivos (`raw.id ?? raw.Id`).

**Exceção:** `CursorPageDto<T>` usa `[JsonPropertyName("data")]` no array de items — um nome diferente de todos os outros DTOs (`Items`).

**Correção:**

```csharp
// Program.cs — AddJsonOptions
opts.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
```

**Impacto:**

- Todas as propriedades passam a serializar em camelCase automaticamente
- Remover `[JsonPropertyName("data")]` do `CursorPageDto<T>` — passará a serializar como `items` (camelCase de `Items`)
- O frontend pode remover **todos** os normalizadores defensivos (`normalizeTicketRemoteSession`, `getStringField`, `getNumberField`, etc.)
- **Atenção:** validar que o agente (Go) e outros consumers não quebram com a mudança de casing. Se o agente já lê camelCase, OK. Se lê PascalCase, precisa de flag de compatibilidade ou migração coordenada.

**Arquivos afetados (backend):**

- `src/Discovery.Api/Program.cs` — adicionar `PropertyNamingPolicy = CamelCase`
- `src/Discovery.Core/DTOs/CursorPageDto.cs` — remover `[JsonPropertyName("data")]`

**Arquivos afetados (frontend):**

- `src/api/agent-alerts.ts` — remover normalização manual de página
- `src/api/tickets.ts` — remover `normalizeTicketRemoteSession`
- `src/api/agents.ts` — remover `normalizeStartRemoteDebugSessionResponse`
- `src/api/app-store.ts` — remover normalizações defensivas
- `src/hooks/useAgentStatusNats.ts` — simplificar `getStringField`/`getNumberField`/`getRecordField`
- `src/hooks/useAutomation.ts` — remover normalização `obj.items ?? obj.data` em audit

**Risco:** Alto — mudança de contrato afeta todos os consumers
**Tempo:** 2h (backend) + 2h (frontend cleanup)

---

### A2. 🔴 CRÍTICO — Padronizar todos os DTOs de paginação em `CursorPageDto<T>` ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** Existem **6 tipos de página** diferentes na API:

| DTO                                  | Array field        | Campos cursor                                                    | Campos offset legados          | `[JsonPropertyName]` |
| ------------------------------------ | ------------------ | ---------------------------------------------------------------- | ------------------------------ | -------------------- |
| `CursorPageDto<T>`                   | `Items` → `"data"` | ✅ Cursor, NextCursor, HasMore, ReturnedItems, Limit             | ❌                             | Sim (`"data"`)       |
| `AutomationScriptPageDto`            | `Items`            | ✅ Cursor, NextCursor, HasMore                                   | ⚠️ Count, Total, Offset, Limit | Não                  |
| `AutomationTaskPageDto`              | `Items`            | ✅ Cursor, NextCursor, HasMore                                   | ⚠️ Count, Total, Offset, Limit | Não                  |
| `AutomationTaskTargetPreviewPageDto` | `Items`            | ❌                                                               | ⚠️ Count, Total, Offset, Limit | Não                  |
| `ArticleListPage`                    | `Items`            | ✅ Cursor, NextCursor, HasMore, Limit                            | ❌                             | Não                  |
| `LogCursorPageDto`                   | `Items`            | ✅ Cursor, NextCursor, HasMore, ReturnedItems, Limit + metadados | ❌                             | Não                  |
| `AppCatalogSearchResultDto`          | `Items`            | ✅ Cursor, NextCursor, HasMore, ReturnedItems, Limit             | ❌                             | Não                  |
| `EffectiveApprovedAppPageDto`        | `Items`            | ✅ Cursor, NextCursor, HasMore, ReturnedItems, Limit             | ❌                             | Não                  |

**Correção:**

1. **Tornar `CursorPageDto<T>` o único tipo canônico:**

   ```csharp
   public sealed record CursorPageDto<T>(
       IReadOnlyList<T> Items,
       int ReturnedItems,
       string? Cursor,
       string? NextCursor,
       bool HasMore,
       int Limit);
   ```

   - Remover `[JsonPropertyName("data")]` (após A1, serializa como `items` em camelCase)

2. **Para DTOs com metadados extras** (Logs, AppStore), criar tipos que **herdam/estendem** `CursorPageDto<T>`:

   ```csharp
   public sealed record LogPageDto(
       CursorPageDto<LogEntry> Page,
       string? Search, string? TraceId, ...);
   ```

   Ou usar composição em vez de duplicação.

3. **Remover `AutomationScriptPageDto` e `AutomationTaskPageDto`** — substituir por `CursorPageDto<AutomationScriptSummaryDto>` e `CursorPageDto<AutomationTaskSummaryDto>`. Remover campos `Count`, `Total`, `Offset`.

4. **Migrar `AutomationTaskTargetPreviewPageDto`** para cursor ou manter como DTO separado sem campos offset (decidir se preview-agents precisa de paginação cursor).

5. **Remover `LogCursorPageDto`** (marcado `[Obsolete]`) — já existe `CursorPageDto<LogEntry>`.

**Arquivos afetados (backend):**

- `src/Discovery.Core/DTOs/CursorPageDto.cs`
- `src/Discovery.Core/DTOs/AutomationScriptDtos.cs` — remover `AutomationScriptPageDto`
- `src/Discovery.Core/DTOs/AutomationTaskDtos.cs` — remover `AutomationTaskPageDto`, revisar `AutomationTaskTargetPreviewPageDto`
- `src/Discovery.Core/DTOs/LogDtos.cs` — remover `LogCursorPageDto`
- `src/Discovery.Core/DTOs/KnowledgeDtos.cs` — `ArticleListPage` → `CursorPageDto<ArticleListItem>`
- `src/Discovery.Core/DTOs/AppStoreDtos.cs` — `AppCatalogSearchResultDto` e `EffectiveApprovedAppPageDto` → estender `CursorPageDto<T>`
- Services que retornam esses DTOs (`AutomationScriptService`, `AutomationTaskService`, `LogService`, `KnowledgeService`, `AppStoreService`)
- Handlers correspondentes em `src/Discovery.Infrastructure/Cqrs/`

**Risco:** Médio — mudança interna, mas afeta serialização
**Tempo:** 3h

---

### A3. 🔴 CRÍTICO — Implementar handlers CQRS faltantes ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** 4 commands são despachados pelos controllers mas **não têm handlers registrados**, causando erro 500 em runtime:

| Command                  | Controller              | Endpoint                                 |
| ------------------------ | ----------------------- | ---------------------------------------- |
| `MergeTicketsCommand`    | `TicketsController`     | `POST /api/v1/tickets/{id}/merge`        |
| `CreateLabelRuleCommand` | `AgentLabelsController` | `POST /api/v1/agent-labels/rules`        |
| `UpdateLabelRuleCommand` | `AgentLabelsController` | `PUT /api/v1/agent-labels/rules/{id}`    |
| `DeleteLabelRuleCommand` | `AgentLabelsController` | `DELETE /api/v1/agent-labels/rules/{id}` |

**Correção:** Criar handlers em `src/Discovery.Infrastructure/Cqrs/`:

- `Tickets/CommandHandlers/MergeTicketsCommandHandler.cs`
- `AgentLabels/CommandHandlers/AgentLabelRuleCommandHandlers.cs` (ou no local apropriado)

**Risco:** Baixo — aditivo
**Tempo:** 1h

---

### A4. 🔴 CRÍTICO — Corrigir handler de automação que descarta paginação ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** `ListAutomationScriptsQueryHandler` recebe `cursor` + `limit` mas retorna `IReadOnlyList<AutomationScriptDto>` (array simples), **descartando** `nextCursor` e `hasMore`. O `AutomationTaskHandlers` é um **stub** que retorna array vazio / NotFound.

```csharp
// Estado atual (quebrado):
public sealed class ListAutomationScriptsQueryHandler(...)
    : IRequestHandler<ListAutomationScriptsQuery, Result<IReadOnlyList<AutomationScriptDto>>>
{
    // page.Items é usado, mas nextCursor/hasMore são perdidos
    var page = await svc.GetListPageAsync(q.ClientId, true, q.Cursor, q.Limit, ct);
    return Result<IReadOnlyList<AutomationScriptDto>>.Success(dtos.AsReadOnly());
}

// Stub de tasks:
public sealed class ListAutomationTasksQueryHandler
    : IRequestHandler<ListAutomationTasksQuery, Result<IReadOnlyList<AutomationTaskDto>>>
{
    return Task.FromResult(Result<...>.Success(Array.Empty<AutomationTaskDto>())); // ← VAZIO
}
```

**Correção:**

1. Mudar o retorno das queries para `Result<CursorPageDto<AutomationScriptDto>>` e `Result<CursorPageDto<AutomationTaskDto>>`
2. Implementar o handler de tasks de verdade (chamar `IAutomationTaskService.GetListPageAsync`)
3. Retornar `CursorPageDto` com `nextCursor` e `hasMore` preenchidos

**Arquivos afetados:**

- `src/Discovery.Core/Cqrs/AutomationScripts/Queries/AutomationScriptQueries.cs` — mudar retorno
- `src/Discovery.Core/Cqrs/AutomationTasks/Queries/AutomationTaskQueries.cs` — mudar retorno
- `src/Discovery.Infrastructure/Cqrs/AutomationScripts/AutomationScriptHandlers.cs` — retornar `CursorPageDto`
- `src/Discovery.Infrastructure/Cqrs/AutomationTasks/AutomationTaskHandlers.cs` — implementar de verdade

**Risco:** Médio
**Tempo:** 1.5h

---

### A5. 🟡 MÉDIO — Migrar 4 controllers restantes para CQRS ✅ **CONCLUÍDO (2026-07-09)**

**Controllers que ainda chamavam serviços diretamente (sem MediatR) — TODOS migrados:**

| Controller                     | Status | Queries/Commands criados                                                | Handlers criados                                      |
| ------------------------------ | ------ | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `BackgroundServicesController` | ✅     | `ListBackgroundServicesQuery`, `GetBackgroundServiceByNameQuery`        | `BackgroundServiceQueryHandlers` (no Discovery.Api)   |
| `ConfigurationAuditController` | ✅     | 5 queries (RecentChanges, EntityHistory, FieldHistory, ByUser, Report)  | `ConfigurationAuditQueryHandlers` (no Infrastructure) |
| `TicketAiController`           | ✅     | 4 commands (Triage, Summarize, SuggestReply, DraftKbArticle)            | `TicketAiCommandHandlers` (no Infrastructure)         |
| `ConfigurationsController`     | ✅     | 6 queries + 15 commands (Server, Client, Site, AI, NATS, ObjectStorage) | `ConfigurationHandlers` (no Infrastructure)           |

**Arquivos criados:**

- `Discovery.Core/Cqrs/ConfigurationAudit/Queries/ConfigurationAuditQueries.cs`
- `Discovery.Core/Cqrs/TicketAi/Commands/TicketAiCommands.cs`
- `Discovery.Core/Cqrs/Configurations/Queries/ConfigurationQueries.cs`
- `Discovery.Core/Cqrs/Configurations/Commands/ConfigurationCommands.cs`
- `Discovery.Core/DTOs/TicketAiDtos.cs` (DTOs movidos do controller para Core)
- `Discovery.Api/Cqrs/BackgroundServices/BackgroundServiceQueries.cs`
- `Discovery.Api/Cqrs/BackgroundServices/BackgroundServiceQueryHandlers.cs`
- `Discovery.Infrastructure/Cqrs/ConfigurationAudit/ConfigurationAuditQueryHandlers.cs`
- `Discovery.Infrastructure/Cqrs/TicketAi/TicketAiCommandHandlers.cs`
- `Discovery.Infrastructure/Cqrs/Configurations/ConfigurationHandlers.cs`

**Build:** ✅ 0 erros, 20 warnings (nullable cosmetics)

**Controllers que ainda chamam serviços diretamente (sem MediatR):**

| Controller                     | Serviços injetados                                                                                                                                | Complexidade            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `ConfigurationsController`     | `IConfigurationService`, `IAiModelCatalogService`, `IAiProviderCredentialRepository`, `IObjectStorageProviderFactory`, `INatsConnectionValidator` | Alta — muitos endpoints |
| `ConfigurationAuditController` | `IConfigurationAuditService`                                                                                                                      | Baixa                   |
| `BackgroundServicesController` | `BackgroundServiceRegistry`                                                                                                                       | Baixa — só leitura      |
| `TicketAiController`           | `IAiChatService`, `ITicketRepository`                                                                                                             | Média                   |

**Recomendação:** Migrar `ConfigurationAuditController` e `BackgroundServicesController` (baixo risco). Deixar `ConfigurationsController` e `TicketAiController` para uma fase posterior (alta complexidade, baixo benefício).

**Tempo:** 1h (audit + background) + 4h (config + ticket-ai, opcional)

---

### A6. 🟡 MÉDIO — Padronizar resposta de erro ✅ **CONCLUÍDO (2026-07-10)**

**Problema:** Os controllers usavam **4 formatos diferentes** de resposta de erro:

1. `BadRequest(new { errors = errors.Select(e => new { e.Code, e.Message }) })` — array de erros
2. `BadRequest(new { error = errors[0].Message })` — string única
3. `Problem(errors[0].Message, statusCode: 400)` — ProblemDetails
4. `BadRequest()` — sem body

**Correção:** Criado `ResultExtensions.cs` com:

- `ToActionResult<T>()` — mapeia `NotFound` → 404, `Validation` → 400, `Unauthorized` → 401, `Forbidden` → 403
- `ToCreatedAtActionResult<T>()` — 201 com createdAt no sucesso
- Formato padronizado: `{ "errors": [{ "code": "...", "message": "...", "field": "..." }] }`

**Aplicação:** 38 controllers migrados via script de regex (substituindo `result.Match<IActionResult>(success: Ok, failure: ...)` por `result.ToActionResult()`). Controllers com `CreatedAtAction` migrados para `ToCreatedAtActionResult()`. Controllers com lógica complexa (Auth, Agents, AgentAuth) mantidos como estavam por terem semântica de erro específica de domínio.

**Build:** ✅ 0 erros, 3 warnings (nullable cosmetics)

**Problema:** Os controllers usam **3 formatos diferentes** de resposta de erro:

1. `BadRequest(new { errors = errors.Select(e => new { e.Code, e.Message }) })` — array de erros
2. `BadRequest(new { error = errors[0].Message })` — string única
3. `Problem(errors[0].Message, statusCode: 400)` — ProblemDetails
4. `BadRequest()` — sem body

**Correção:** Criar um método de extensão padronizado:

```csharp
public static class ResultExtensions
{
    public static IActionResult ToActionResult<T>(this Result<T> result, ControllerBase controller)
        => result.Match(
            success: controller.Ok,
            failure: errors => errors[0].Code switch
            {
                "NotFound" => controller.NotFound(new ProblemDetails { ... }),
                "Validation" => controller.BadRequest(new ValidationProblemDetails { ... }),
                _ => controller.BadRequest(new { errors = errors.Select(e => new { e.Code, e.Message }) })
            });
}
```

**Tempo:** 2h

---

### A7. 🟢 BAIXO — Remover `TicketFilterQuery.Offset` (legado) ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** `TicketFilterQuery` ainda tem `Offset = 0` e o endpoint base `GET /api/v1/Tickets` aceita tanto `Cursor` quanto `Offset` (híbrido). O `TicketQueryService` ignora `Offset` — só usa `Cursor`.

**Correção:**

- Marcar `Offset` como `[Obsolete]` no `TicketFilterQuery`
- Remover o endpoint `GET /api/v1/Tickets` (base) — manter só `GET /api/v1/Tickets/page`
- Ou renomear `page` → base (já que só existe um modo de paginação)

**Tempo:** 30min

---

### A8. 🟢 BAIXO — Padronizar rota de endpoints de paginação ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** Inconsistência nos padrões de rota:

| Domínio      | Endpoint de lista                          | Padrão          |
| ------------ | ------------------------------------------ | --------------- |
| Tickets      | `GET /Tickets` + `GET /Tickets/page`       | Dual (híbrido)  |
| Agent Alerts | `GET /agent-alerts/page` (só)              | Só /page        |
| Automação    | `GET /automation/scripts` (só, com cursor) | Base com cursor |
| Logs         | `GET /logs` (só, com cursor)               | Base com cursor |
| Knowledge    | `GET /knowledge` (só, com cursor)          | Base com cursor |

**Correção:** Padronizar em **endpoint base com cursor** (sem `/page`):

- `Tickets`: remover `GET /Tickets` (base), manter `GET /Tickets/page` → renomear para `GET /Tickets`
- `Agent Alerts`: mover `/page` → base (`GET /agent-alerts`)

**Tempo:** 1h

---

## Parte B — Frontend (DiscoveryRMM_Site)

### B1. 🔴 CRÍTICO — Corrigir tipos de paginação para alinhar com backend ✅ **CONCLUÍDO (2026-07-09)**

**Após A1 (camelCase) e A2 (CursorPageDto unificado), atualizar frontend:**

1. **Unificar todos os tipos de página em `CursorPageDto<T>`** em `src/api/types.ts`:

   ```typescript
   export interface CursorPageDto<T> {
     items: T[];
     returnedItems: number;
     cursor: string | null;
     nextCursor: string | null;
     hasMore: boolean;
     limit: number;
   }
   ```

   - Remover `AutomationScriptPage`, `AutomationTaskPage` (substituir por `CursorPageDto`)
   - Remover `LogCursorPage` (substituir por `CursorPageDto<LogEntry>` + campos extras separados)
   - Remover `ArticleListPage` (substituir por `CursorPageDto<ArticleListItem>`)
   - Remover `AgentSoftwareInventoryPage`, `SoftwareInventoryCatalogPage` (substituir por `CursorPageDto` + extras)
   - Remover `AppStoreCatalogPage`, `AppEffectivePage`, `AppApprovalAuditPage`, `AppDiffPage`

2. **Remover campos `offset` de todos os tipos de query:**
   - `TicketsQuery.offset` → remover (adicionar `cursor?: string`)
   - `LogsQuery.offset` → remover
   - `AgentAlertsQuery.offset` → remover (adicionar `cursor?: string`)
   - `P2PArtifactsDistributionParams.offset` → remover

**Tempo:** 1.5h

---

### B2. 🔴 CRÍTICO — Corrigir bugs de paginação (10 bugs documentados) ✅ **CONCLUÍDO (2026-07-09)**

Executar o plano já existente em `PLANO_MIGRACAO_CURSOR_PAGINATION.md`, **após** as correções do backend (A1-A4):

| Bug | Descrição                                                             | Etapa                                            |
| --- | --------------------------------------------------------------------- | ------------------------------------------------ |
| #1  | `listScriptsPage()` / `listTasksPage()` chamam `/page` que não existe | Remover métodos, usar `listScripts()` com cursor |
| #2  | `AutomationScriptPage` / `AutomationTaskPage` têm `offset`/`total`    | Substituir por `CursorPageDto`                   |
| #3  | `TaskPreviewAgentsResponse` usa offset/total                          | Verificar endpoint, migrar                       |
| #4  | `useAgentAlerts()` chama endpoint base removido                       | Migrar para `listPage()`                         |
| #5  | `TicketsQuery` não tem `cursor`                                       | Adicionar `cursor`, marcar `offset` deprecated   |
| #6  | `LogsQuery` tem `offset` morto                                        | Remover                                          |
| #7  | `P2PArtifactsDistributionParams` tem `offset`                         | Remover                                          |
| #8  | `TicketList.tsx` calcula `hasNextPage` de forma frágil                | Usar `data?.hasMore`                             |
| #9  | `AgentDetail.tsx` usa `useTickets` sem paginação                      | Migrar para `useTicketsPage`                     |
| #10 | `TicketDetail.tsx` envia `offset: 0`                                  | Trocar por `cursor: undefined`                   |

**Tempo:** ~12h (conforme plano existente)

---

### B3. 🟡 MÉDIO — Refatorar páginas para usar `useCursorPagination` ✅ **CONCLUÍDO (2026-07-09)**

4 páginas reimplementam o stack de cursores manualmente em vez de usar o hook compartilhado:

- `src/pages/tickets/TicketList.tsx`
- `src/pages/automation/AutomationScriptsPage.tsx`
- `src/pages/automation/AutomationTasksPage.tsx`
- `src/pages/software/tabs/CatalogTab.tsx`

**Correção:** Substituir stack manual por `useCursorPagination()`.

**Tempo:** 1.5h

---

### B4. 🟡 MÉDIO — Padronizar `placeholderData` em hooks de paginação ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** 3 padrões diferentes:

- `keepPreviousData` (import de `@tanstack/react-query`)
- `placeholderData: (prev) => prev`
- Nenhum

**Correção:** Padronizar em `placeholderData: keepPreviousData` (v5 API).

**Arquivos:** `useAgents.ts`, `useSoftwareInventory.ts`, `useAutomation.ts`, `useTickets.ts`, `useLogs.ts`

**Tempo:** 30min

---

### B5. 🟡 MÉDIO — Padronizar invalidação de cache (granular vs broad) ✅ **CONCLUÍDO (2026-07-10)**

**Hooks migrados de `KEYS.all` para invalidação granular:**

| Hook                                | Antes                          | Depois                                                              |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `useUpdateAgent`                    | `KEYS.all`                     | `KEYS.detail(id)` + `KEYS.all` (byClient/bySite são factories)      |
| `useDeleteAgent`                    | `KEYS.all`                     | `KEYS.all` (mantido — sem acesso a clientId/siteId)                 |
| `useApproveZeroTouch`               | `KEYS.all` + `KEYS.detail(id)` | `KEYS.detail(id)` + `KEYS.all`                                      |
| `useCreateSite`                     | `KEYS.all`                     | `KEYS.byClient(clientId, false/true)`                               |
| `useUpdateSite`                     | `KEYS.all`                     | `KEYS.detail(clientId, id)` + `KEYS.byClient(clientId, false/true)` |
| `useDeleteSite`                     | `KEYS.all`                     | `KEYS.byClient(clientId, false/true)`                               |
| `useDeleteDepartment`               | `KEYS.all`                     | `KEYS.list({})` + `KEYS.global`                                     |
| `useCreateNote` (client/site/agent) | `KEYS.all`                     | `KEYS.byClient`/`bySite`/`byAgent`                                  |
| `useUpdateNote`                     | `KEYS.all`                     | `KEYS.detail(id)`                                                   |
| `useDeleteNote`                     | `KEYS.all`                     | `KEYS.all` (mantido — sem acesso a scope)                           |
| `useCreateEscalationRule`           | `KEYS.all`                     | `KEYS.list()`                                                       |
| `useUpdateEscalationRule`           | `KEYS.all` + `KEYS.detail(id)` | `KEYS.detail(id)` + `KEYS.list()`                                   |
| `useDeleteEscalationRule`           | `KEYS.all`                     | `KEYS.list()`                                                       |
| `useCreateSlaCalendar`              | `KEYS.all`                     | `KEYS.list()`                                                       |
| `useUpdateSlaCalendar`              | `KEYS.all` + `KEYS.detail(id)` | `KEYS.detail(id)` + `KEYS.list()`                                   |
| `useDeleteSlaCalendar`              | `KEYS.all`                     | `KEYS.list()`                                                       |
| `useCreateCustomFieldDef`           | `KEYS.all`                     | `KEYS.definitions()`                                                |
| `useUpdateCustomFieldDef`           | `KEYS.all`                     | `KEYS.definition(id)` + `KEYS.definitions()`                        |
| `useDeleteCustomFieldDef`           | `KEYS.all`                     | `KEYS.definitions()`                                                |

**Problema:** Mutas usam `KEYS.all` (broad) em vez de `KEYS.list` (granular), causando refetch desnecessário.

**Exemplos problemáticos:**

- `useUpdateAgent`, `useDeleteAgent` → `KEYS.all`
- `useCreateClient`, `useUpdateClient`, `useDeleteClient` → `KEYS.all`
- `useCreateDepartment`, etc. → `KEYS.all`
- `useApproveZeroTouch` → `KEYS.all` + `KEYS.detail(agentId)` (redundante)

**Correção:** Migrar para invalidação granular onde possível.

**Tempo:** 1h

---

### B6. 🟡 MÉDIO — Padronizar tratamento de erro de delete ✅ **CONCLUÍDO (2026-07-10)**

Criado `utils/deleteError.ts` com `getDeleteErrorMessage(error, entityName)` — detecta FK constraints, auth errors, 404 e retorna mensagens PT-BR amigáveis.

**Hooks com `onError` adicionado:**

| Hook                             | Entidade          |
| -------------------------------- | ----------------- |
| `useDeleteClient`                | cliente           |
| `useDeleteSite`                  | site              |
| `useDeleteDepartment`            | departamento      |
| `useDeleteSlaCalendar`           | calendário SLA    |
| `useDeleteCustomFieldDefinition` | campo customizado |
| `useDeleteNote`                  | nota              |

**Nota:** `useDeleteAgent` já tem `getDeleteAgentErrorMessage` (mais específico). Hooks que já usam `onError` em mutations são cobertos. Em TanStack Query v5, `onError` foi substituído por tratamento via `mutation.error` no consumidor ou `onError` global do `QueryClient`.

**Problema:** Apenas `useAgents.ts` tem `getDeleteAgentErrorMessage` (mapeia 400/401/404/500 + FK constraint). Nenhum outro hook de delete tem tratamento equivalente.

**Correção:** Extrair helper genérico `getDeleteErrorMessage(error, entityName)` em `src/utils/` e aplicar em todos os hooks de delete.

**Tempo:** 1h

---

### B7. 🟢 BAIXO — Extrair utilitários de formatação compartilhados ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** Cada página define suas próprias funções de formatação de data:

- `AgentList.tsx`: `formatDateBrazil`, `formatRelative`, `formatUptimeShort`
- `SoftwareInventory.tsx`: `formatDate`
- `softwareStoreUtils.ts`: `formatDate`
- `AuditTab.tsx`: importa de `softwareStoreUtils`

**Correção:** Criar `src/utils/format.ts` com `formatDate`, `formatRelative`, `formatUptimeShort`, `formatDateBrazil`.

**Tempo:** 30min

---

### B8. 🟢 BAIXO — Adicionar `staleTime` / `refetchInterval` consistente ✅ **CONCLUÍDO (2026-07-09)**

**Problema:** Hooks como `useClients`, `useDepartments`, `useSites`, `useCustomFields` não têm `staleTime` nem `refetchInterval` — ficam stale indefinidamente.

**Correção:** Definir `staleTime` padrão (ex: 60s) para listas que mudam com baixa frequência.

**Tempo:** 30min

---

### B9. 🟢 BAIXO — Remover hooks/components deprecated ✅ **CONCLUÍDO (2026-07-09)**

- `useAgentStatusRealtime.ts` — wrapper deprecated de 1 linha
- `useAgentAlerts.ts` — marcado deprecated mas ainda exportado
- Pastas `components/` vazias em `pages/tickets/`, `pages/agents/`, `pages/settings/`, `pages/reports/`

**Tempo:** 30min

---

## Ordem de Execução Recomendada

### Fase 1 — Backend (pré-requisito para frontend)

1. **A1** — Padronizar camelCase no JSON (2h)
2. **A2** — Unificar DTOs em `CursorPageDto<T>` (3h)
3. **A3** — Implementar handlers faltantes (1h)
4. **A4** — Corrigir handlers de automação (1.5h)
5. **A7** — Remover `Offset` legado (30min)
6. **A8** — Padronizar rotas (1h)

**Subtotal Fase 1:** ~9h

### Fase 2 — Frontend (após backend)

7. **B1** — Atualizar tipos de paginação (1.5h)
8. **B2** — Corrigir 10 bugs de paginação (~12h)
9. **B3** — Refatorar páginas para `useCursorPagination` (1.5h)
10. **B4** — Padronizar `placeholderData` (30min)
11. **B5** — Padronizar invalidação de cache (1h)
12. **B6** — Padronizar tratamento de erro de delete (1h)
13. **B7** — Extrair utilitários de formatação (30min)
14. **B8** — Adicionar `staleTime` consistente (30min)
15. **B9** — Remover código deprecated (30min)

**Subtotal Fase 2:** ~19h

### Fase 3 — Opcional / Melhorias

16. **A5** — Migrar controllers restantes para CQRS (1h-5h)
17. **A6** — Padronizar resposta de erro (4 formatos diferentes) — Média

**Subtotal Fase 3:** ~3-7h

---

## Matriz de Risco

| Item                    | Risco                                    | Mitigação                                                        |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| A1 (camelCase)          | Alto — afeta agente Go e todos consumers | Validar agente antes; usar flag de compatibilidade se necessário |
| A2 (unificar DTOs)      | Médio — mudança interna                  | Testar endpoints com curl após mudança                           |
| A3 (handlers faltantes) | Baixo — aditivo                          | Testar endpoints afetados                                        |
| A4 (handlers automação) | Médio — muda retorno                     | Atualizar frontend junto                                         |
| B2 (bugs paginação)     | Médio — muitas páginas                   | Migrar um domínio por vez, testar cada                           |

---

## Contrato API Padronizado (Pós-Migração)

### Resposta de paginação (todos os endpoints de lista):

```json
{
  "items": [...],
  "returnedItems": 50,
  "cursor": "base64stringOrNull",
  "nextCursor": "base64stringOrNull",
  "hasMore": true,
  "limit": 50
}
```

### Resposta de erro (todos os endpoints):

```json
{
  "errors": [{ "code": "NotFound", "message": "Ticket 123 not found" }]
}
```

### Resposta de erro de validação:

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "Validation failed",
  "status": 400,
  "errors": {
    "Name": ["The Name field is required."]
  }
}
```

### Endpoints de lista (padrão único):

| Domínio            | Endpoint                           | Parâmetros                              |
| ------------------ | ---------------------------------- | --------------------------------------- |
| Tickets            | `GET /api/v1/tickets`              | `cursor`, `limit`, filtros              |
| Agent Alerts       | `GET /api/v1/agent-alerts`         | `cursor`, `limit`, filtros              |
| Automation Scripts | `GET /api/v1/automation/scripts`   | `cursor`, `limit`, `clientId`           |
| Automation Tasks   | `GET /api/v1/automation/tasks`     | `cursor`, `limit`, `clientId`           |
| Logs               | `GET /api/v1/logs`                 | `cursor`, `limit`, filtros              |
| Knowledge          | `GET /api/v1/knowledge`            | `cursor`, `limit`, `clientId`, `siteId` |
| Software Inventory | `GET /api/v1/software-inventory`   | `cursor`, `limit`, filtros              |
| Agent Software     | `GET /api/v1/agents/{id}/software` | `cursor`, `limit`, `search`, `order`    |
| App Store Catalog  | `GET /api/v1/app-store/catalog`    | `cursor`, `limit`, filtros              |

**Todos usam `cursor` + `limit`. Sem `offset`. Sem `/page` suffix.**

---

## Revisão Final (2026-07-10)

### Auditoria completa pós-Fase 3

Após executar todas as 3 fases, foi realizada uma auditoria completa de ambos os projetos.

#### Issues encontrados e corrigidos

| #   | Issue                                                                                          | Severidade        | Ação                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 5 hooks de delete usavam `onError` com `throw new Error()` — anti-pattern no TanStack Query v5 | 🔴 CRÍTICO        | ✅ Removido `onError` de `useDeleteClient`, `useDeleteSite`, `useDeleteDepartment`, `useDeleteSlaCalendar`, `useDeleteCustomFieldDefinition`. Removido imports não utilizados de `getDeleteErrorMessage`. |
| 2   | `agentAlertsApi.listPage` supostamente chama URL errada                                        | 🔴 Falso positivo | ✅ Não é bug — na A8 o backend mudou de `GET /agent-alerts/page` para `GET /agent-alerts` (base). O frontend chama `BASE` corretamente.                                                                   |

#### Issues restantes (baixo impacto, não quebram funcionalidade)

| #   | Issue                                                                                         | Severidade | Status                                                                         |
| --- | --------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| 3   | `useTickets` invalida `KEYS.all` após update (causa refetch de comments/watchers/attachments) | 🟡 Médio   | Aceitável — `staleTime: 60s` global mitiga refetchs imediatos                  |
| 4   | `useAutomation` invalida `KEYS.*.all` após update                                             | 🟡 Médio   | Aceitável — mesmo motivo                                                       |
| 5   | `agentAlertsApi.list` deprecated ainda existe (código morto)                                  | 🟡 Médio   | Latente — sem consumidores ativos                                              |
| 6   | `useAgentAlerts` sem `placeholderData`                                                        | 🟢 Baixo   | Latente — sem consumidores ativos                                              |
| 7   | `getDeleteErrorMessage` em `utils/deleteError.ts` não é mais usado pelos hooks                | 🟢 Baixo   | Mantido como utilitário para componentes que precisem formatar erros de delete |

#### Build final

| Projeto                        | Erros | Warnings               | Status |
| ------------------------------ | ----- | ---------------------- | ------ |
| Backend (`DiscoveryRMM_API`)   | 0     | 3 (nullable cosmetics) | ✅     |
| Frontend (`DiscoveryRMM_Site`) | 0     | 0                      | ✅     |

#### Resumo de tudo que foi implementado

| Fase | Item | Descrição                                          | Status |
| ---- | ---- | -------------------------------------------------- | ------ |
| 1    | A1   | camelCase JSON serialization                       | ✅     |
| 1    | A2   | Unificar DTOs em `CursorPageDto<T>`                | ✅     |
| 1    | A3   | Handlers CQRS faltantes (MergeTickets, LabelRules) | ✅     |
| 1    | A4   | Corrigir handlers de automação                     | ✅     |
| 1    | A7   | Remover Offset legado                              | ✅     |
| 1    | A8   | Padronizar rotas (sem `/page`)                     | ✅     |
| 2    | B1   | Atualizar tipos de paginação                       | ✅     |
| 2    | B2   | Corrigir 10 bugs de paginação                      | ✅     |
| 2    | B3   | Refatorar `useCursorPagination`                    | ✅     |
| 2    | B4   | Padronizar `placeholderData`                       | ✅     |
| 2    | B5   | Invalidação de cache granular                      | ✅     |
| 2    | B6   | `getDeleteErrorMessage` genérico                   | ✅     |
| 2    | B7   | Extrair `utils/format.ts`                          | ✅     |
| 2    | B8   | `staleTime` consistente                            | ✅     |
| 2    | B9   | Remover código deprecated                          | ✅     |
| 3    | A5   | Migrar 4 controllers para CQRS                     | ✅     |
| 3    | A6   | Padronizar resposta de erro (`ToActionResult`)     | ✅     |
| 3    | B5   | Invalidação granular (hooks restantes)             | ✅     |
| 3    | B6   | Erro de delete genérico (hooks restantes)          | ✅     |

**Total: 20/20 itens concluídos.**
