# Análise de Frontend — Permissão por Departamento/Time nos Chamados

**Projeto:** DiscoveryRMM_Site (React + TypeScript)
**Task:** task-2 — Análise Frontend: UX de permissões por departamento
**Escopo:** somente leitura de código. Nenhum arquivo `.tsx`/`.ts` foi alterado.
**Data:** 2026-11-07

---

## 0. Requisito (recapitulação)

- Cada **departamento** tem seu **TIME** de atendimento; somente membros desse time podem **TRATAR/ATENDER** os chamados daquele departamento.
- Demais usuários podem **ABRIR** chamado para o departamento, mas só podem **FECHAR** o chamado que **eles mesmos abriram**.
- **Agentes remotos** idem: fechar somente os que ele mesmo abriu.
- O time do departamento atende **TODOS** os chamados do departamento ao qual tem vínculo.

**Conclusão antecipada (resumo executivo):** a UI **hoje não implementa nenhuma** dessas regras. Não existe gating por departamento, não existe gating por "sou o solicitante", não existe indicação de "time do departamento" e não há fila "Meu time". A autorização existente na console é **puramente por permissão de recurso** (`tickets.*`, `tickets.edit`, `admin.*`), com escopo **global** — nunca por departamento.

---

## 1. Inventário das telas/componentes de chamado

### 1.1 `src/pages/tickets/*`

#### `TicketList.tsx` (2.114 linhas)
- **O que faz:** listagem paginada por cursor de chamados, com KPIs, filtros (cliente, estado, prioridade, status aberto/fechado, texto, template, resposta de questionário), visões salvas, hover-card e menu de contexto por linha. Contém também o `CreateTicketModal` (criação de chamado).
- **Ações de escrita expostas:**
  - **Criar chamado** — `CreateTicketModal`, `TicketList.tsx:1639`; submissão em `handleSubmit` `TicketList.tsx:1893-1919` (usa `useCreateTicket`).
  - **Editar/atribuir chamado** — `assignTicketToUser` `TicketList.tsx:786-799` (usa `useUpdateTicket`).
  - **Assumir chamado** — `handleContextMenuTakeOwnership` `TicketList.tsx:846-866`.
  - **Transferir/Atribuir (departamento + responsável)** — `handleConfirmAssign` `TicketList.tsx:878-917`; patch parcial de `departmentId`/`assignedToUserId` em `TicketList.tsx:894-899`.
  - **Acompanhar (watcher)** — `handleContextMenuFollow` `TicketList.tsx:819-844`.
  - **Criar/editar/excluir visão salva** — `TicketList.tsx:399-401`.
  - **Criar chamado NÃO aplica filtro por vínculo do usuário** — ver seção 4.
- **Menu de contexto (JSX):** `TicketList.tsx:1462-1501` — botões "Acompanhar" (1.470), "Assumir" (1.480), "Transferir / Atribuir" (1.490).
- **Modal Transferir/Atribuir:** `TicketList.tsx:1505-1544`; seletor de departamento `TicketList.tsx:1515-1522`; seletor de responsável `TicketList.tsx:1524-1529`.

#### `TicketDetail.tsx` (3.161 linhas)
- **O que faz:** tela de detalhe do chamado. Cabeçalho com prioridade/estado/Reabrir/Conhecimento/**Excluir**; corpo com "Chamado" (somente leitura) + abas Comentários, Timeline, Anexos, Automação, IA, Chat; sidebar com CSAT, Resumo geral (estado, categoria, prioridade, solicitante, agent, departamento, responsável, SLA, campos do departamento, vínculos, watchers, triagem por IA).
- **Componente principal:** `TicketDetail` `TicketDetail.tsx:129-396`.
- **Ações de escrita expostas:**
  - **Fechar / mudar estado do workflow** — `saveState` `TicketDetail.tsx:1384-1401` (hook `useUpdateTicketWorkflow`); botão "Alterar estado" `TicketDetail.tsx:1555-1563`; `Select` de novo estado `TicketDetail.tsx:1568-1575`; botão "Salvar" `TicketDetail.tsx:1577-1584`.
  - **Reabrir chamado** — `ReopenButton` `TicketDetail.tsx:1151-1172` (botão `1168`, usa `useReopenTicket`).
  - **Excluir chamado (soft delete)** — `DeleteTicketButton` `TicketDetail.tsx:1259-1293` (botão `1281-1291`); renderizado sempre no cabeçalho em `TicketDetail.tsx:229`.
  - **Editar/assumir/transferir** — `TicketSummaryPanel` `TicketDetail.tsx:1294-1772`: `changeAgent` `1349-1361`, `changeRequester` `1415-1427`, `changeDepartment` `1429-1455`, `assumeTicket` `1457-1470`.
  - **Comentar / nota interna** — botão "Enviar" `TicketDetail.tsx:2420-2422` (sempre habilitado exceto por tamanho do texto).
  - **Anexar arquivo** — `TicketDetail.tsx:2401-2413`.
  - **Avaliar (CSAT)** — `TicketRatingCard` `TicketDetail.tsx:368-372` (única exceção de gating por "sou o solicitante": ver seção 2).
  - **Watchers / campos do departamento / vínculos / triagem IA** — `TicketDetail.tsx:1717`, `1733`, `1737`, `1721`.

#### `TicketOpeningSection.tsx` (**componente dentro de `TicketDetail.tsx`**, `TicketDetail.tsx:1175-1252`)
- **O que faz:** exibe o formulário/respostas registrados na abertura por template (somente leitura). Retorna `null` quando o chamado não tem template (`TicketDetail.tsx:1186`).
- **Ações de escrita:** **nenhuma** (é puramente de leitura).

#### `TicketRunbookPanel.tsx` (110 linhas)
- **O que faz:** painel de execução de runbook dentro da área de macros do detalhe do chamado; executa a macro escolhida (`POST /api/v1/tickets/{id}/runbook/execute`) e mostra o resultado por passo.
- **Ações de escrita expostas:** **executar runbook** — `run()` `TicketRunbookPanel.tsx:25-34`; botão "Executar runbook" `TicketRunbookPanel.tsx:57-65`. **Sem nenhuma guarda**: o botão só depende de `!selectedMacro || execute.isPending` (`TicketRunbookPanel.tsx:60`).
- **Onde é montado:** `TicketDetail.tsx:2358` (`<TicketRunbookPanel ticketId={ticketId} macros={...} />`).

#### `TicketChatPanel.tsx` (34 linhas)
- **O que faz:** adaptador do chat de suporte vinculado ao chamado (usa `SupportChatPanel` com cliente escopado pelo ticket).
- **Ações de escrita expostas:** iniciar/responder/encerrar chat — delegadas ao `SupportChatPanel` via prop `canManage` (`TicketChatPanel.tsx:19-32`).

#### `TicketMacrosPage.tsx` (rota `/tickets/macros`)
- **O que faz:** CRUD de macros de chamado (cliente/departamento, conteúdo, passos de runbook).
- **Ações de escrita expostas:** criar/editar/excluir macro (`useCreateTicketMacro`, `useUpdateTicketMacro`, `useDeleteTicketMacro` — `TicketMacrosPage.tsx:4-5`).
- **Gating:** **nenhum gating interno no arquivo** (busca por `useAuthorization|PermissionGate` retornou vazio). A rota tem `PermissionGate` externo — ver seção 2.

#### `AutoTicketRulesPage.tsx` (549 linhas, rota `/tickets/auto-rules`)
- **O que faz:** CRUD de regras de auto-abertura de chamado a partir de alertas (escopo Global/Client/Site, prioridade, categoria, departamento destino, perfil de workflow) + dry-run + estatísticas.
- **Ações de escrita expostas:** criar/editar/excluir regra, executar dry-run.
- **Gating:** nenhum interno; rota protegida por `PermissionGate`.

#### `TicketSlaPage.tsx` (1.863 linhas, rota `/tickets/sla`)
- **O que faz:** CRUD de calendários de SLA, feriados, regras de escalonamento; usa `useDepartments`, `useIamUsers`, `useWorkflowProfiles`.
- **Ações de escrita expostas:** criar/editar/excluir calendário, adicionar/remover feriado, criar/editar/excluir regra de escalonamento.
- **Gating:** nenhum interno; rota em `router.tsx:268` (**sem `PermissionGate`** — ver seção 2).

### 1.2 `src/components/tickets/*`

| Componente | O que faz | Ações de escrita | Gating hoje |
|---|---|---|---|
| `DepartmentPickerModal.tsx` (135 linhas) | Modal de **transferência de departamento** do chamado; busca, lista departamentos ativos, mostra selo "Global", permite "Sem departamento" | `onSave(departmentId \| null)` `DepartmentPickerModal.tsx:128` | Nenhum. Filtra só por `isActive !== false` e nome (`DepartmentPickerModal.tsx:42-47`) |
| `AgentPickerModal.tsx` (109 linhas) | Modal de vínculo da **máquina (agent)** ao chamado | `onSave(agentId \| null)` `AgentPickerModal.tsx:27` | Nenhum |
| `RequesterPickerModal.tsx` | Modal de vínculo do **solicitante** | `onSave(userId \| null)` | Nenhum |
| `TicketFieldsSection.tsx` (534 linhas) | Campos do departamento + campos adicionais do chamado, editáveis na tela do atendente | `upsertValue.mutateAsync` `TicketFieldsSection.tsx:131` e `418`; botão "Salvar" `253` e `490` | Nenhum |
| `TicketStateBadge.tsx` (105 linhas) | Badge visual do estado do workflow (cor do próprio estado, contraste WCAG) | Nenhuma (apresentação) | N/A |
| `WatchersSection.tsx` (242 linhas) | Quem acompanha o chamado; adicionar/remover watcher | `addWatcher.mutate` `WatchersSection.tsx:79`; `removeWatcher.mutate` `WatchersSection.tsx:98`; botão `226-231` | Nenhum (só `disabled={!selectedUserId}` em `229`) |
| `TicketRelationsSection.tsx` (280 linhas) | Vínculos entre chamados (duplicado, bloqueia, relacionado, pai/filho) | `create.mutate` `TicketRelationsSection.tsx:81`; `remove.mutate` `154`; botão "Vincular chamado" `245-247` | Nenhum |
| `TicketAiAssignmentCard.tsx` (143 linhas) | Decisão da triagem por IA (escolhido, confiança, motivo, candidatos); permite rodar triagem sob demanda ou reavaliar e atribuir | `usePreviewTicketAssignment`, `useApplyTicketAssignment` `TicketAiAssignmentCard.tsx:31-32` | Nenhum |

---

## 2. Como a UI hoje decide o que mostrar (gating de permissão)

### 2.1 Infraestrutura de autorização existente

- **Hook central:** `useAuthorization()` em `src/auth/authorization.ts:150-235`. Lê o JWT (`parseJwtPayload` `authorization.ts:23-33`), coleta claims de permissão (`PERMISSION_KEYS` `authorization.ts:7-15`) e de role (`ROLE_KEYS` `authorization.ts:17-21`).
- **Semântica FAIL-CLOSED:** sem o claim de permissões no token, `hasPermission` retorna `false` para tudo (`authorization.ts:168` e `185`).
- **Expansão/aliases:** `expandPermission` `authorization.ts:97-120`; `PERMISSION_FAMILY_ALIASES` `authorization.ts:78-88`; `ACTION_ALIASES` `authorization.ts:91-95` (ex.: `write` → `edit/create/delete/execute`).
- **Comparação de escopo:** `matchesSinglePermission` `authorization.ts:122-137` e `matchesPermission` `authorization.ts:139-148` — aceitam curinga `*` e prefixo `recurso.*`. **Não há nenhum conceito de escopo por departamento, cliente, site ou propriedade do recurso.**
- **Helpers de conveniência:** `canViewDeploy`, `canViewSoftware`, `canViewAutomation`, `canViewReports`, `canViewSettings`, `canManageIdentity` em `authorization.ts:223-253+`.
- **Guardas de rota:** `RequirePermission` `src/auth/AuthGuards.tsx:47-64` e `PermissionGate` `AuthGuards.tsx:70-87`. Ambos só avaliam `anyOf`/`allOf` de strings de permissão e redirecionam para `fallbackPath` (**não há variante de "sem permissão" contextual, só redirect**).
- **Nenhum uso de `RequirePermission` no app**: o grep em `src` só encontra a definição (`AuthGuards.tsx:41,47,51,66`); **todas as rotas usam `PermissionGate`**.

### 2.2 Gates nas rotas de chamado (`src/router.tsx`)

| Rota | Linha | Gate |
|---|---|---|
| `tickets` | `router.tsx:256-260` | `anyOf={['tickets.*','tickets.view','admin.*']}` |
| `tickets/alerts` | `router.tsx:264` | **sem `PermissionGate`** |
| `tickets/sla` | `router.tsx:268` | **sem `PermissionGate`** |
| `tickets/csat` | `router.tsx:272-276` | `['tickets.*','tickets.view','reports.*','settings.*','admin.*']` |
| `tickets/macros` | `router.tsx:280-284` | `['tickets.*','tickets.edit','admin.*']` |
| `tickets/templates*+` | `router.tsx:288-316` | `['tickets.*','tickets.edit','admin.*']` |
| `tickets/departments` | `router.tsx:320-324` | `['settings.*','settings.read','departments.*','admin.*']` |
| `tickets/departments/:departmentId` | `router.tsx:328-332` | idem acima |
| `tickets/auto-rules` | `router.tsx:336-340` | `['tickets.*','tickets.edit','admin.*']` |
| `tickets/auto-policy` | `router.tsx:344-348` | `['tickets.*','tickets.edit','admin.*']` |
| `tickets/:id` (detalhe) | `router.tsx:352-356` | `['tickets.*','tickets.view','admin.*']` |
| `tickets/:id/chat` | `router.tsx:187` | **sem `PermissionGate`** |

**Leitura crítica:** o gate de `tickets/:id` é o **mesmo** para abrir e para atender. **Não há separação entre "ver" e "tratar"** — quem tem `tickets.view` entra no detalhe e recebe **todos** os controles de escrita.

### 2.3 Onde há gating real dentro das telas de chamado (lista exaustiva)

O grep por `useAuthorization|hasPermission|hasAnyPermission|canManage|PermissionGate|RequirePermission` em `src/pages/tickets` e `src/components/tickets` retornou **apenas**:

1. `TicketChatWindow.tsx:2,25,69` — `canManage={authz.hasAnyPermission(TICKET_CHAT_PERMISSIONS)}` com `TICKET_CHAT_PERMISSIONS = ['tickets.chat','tickets.*','tickets.edit','admin.*']` (`TicketChatWindow.tsx:8`). **Escopo global, não por departamento.**
2. `TicketDetail.tsx:28,178,179,344` — mesma lista `TICKET_CHAT_PERMISSIONS` (`TicketDetail.tsx:90`) aplicada **somente ao chat**.
3. `SupportChatPanel.tsx:19,136,140` — permissão de **controle remoto** (`REMOTE_CONTROL_PERMISSIONS`) e `canManage` do chat; `SupportChatPanel.tsx:476-477,490,531,536`.
4. `TicketList.tsx:1366,1393` — `const canManage = !!currentUserId && view.userId === currentUserId;` — **NÃO é permissão**: controla apenas os botões de **editar/excluir a própria VISÃO SALVA** (`TicketList.tsx:1393`), comparando o dono do saved view.

**Em `src/components/tickets/*`, o mesmo grep retornou ZERO ocorrências.** Nenhum componente de chamado consulta autorização.

### 2.4 Existe gating por departamento? **NÃO.**

- **Nenhum arquivo do front busca o vínculo do usuário logado com um departamento.** Não existe hook `useMyDepartments`, `useMyTeam`, nem consulta a `/departments/{id}/effective` para decidir UI na área de chamados.
- O único dado de time existente é `DepartmentEffectiveMemberDto` (`src/api/types.ts:911-922`) exposto em `DepartmentEffectiveDto.team` (`src/api/types.ts:942`), normalizado em `normalizeDepartmentEffective` (`src/api/departments.ts:138-198`, leitura do time em `departments.ts:146` e `162-166`).
- Esse time é consumido **exclusivamente** na administração do departamento: `DepartmentMembersCard` em `src/pages/settings/DepartmentDetailPage.tsx:712-832` (card "Equipe do departamento" em `754`, cujo subtítulo diz *"Usuários elegíveis para auto-atribuição (round-robin / menos chamados)"* — `DepartmentDetailPage.tsx:755`) e nas métricas de triagem por IA (`DepartmentDetailPage.tsx:1444-1540`).
- **Portanto: na área de chamados, a UI não sabe quem é do time do departamento.** Isso é a lacuna estrutural nº 1.

### 2.5 Existe gating por "sou o solicitante"? **Quase — um único ponto, e em outro fluxo.**

- **Único caso:** `TicketRatingCard` (`src/components/tickets/TicketRatingCard.tsx`). A regra está em `TicketRatingCard.tsx:39-40`:
  ```ts
  const requesterId = ticket.requesterUserId ?? null;
  const canRate = !requesterId || requesterId === currentUserId;
  ```
  e é aplicada como **estado informativo**, não como bloqueio de dados: `TicketRatingCard.tsx:69-72` mostra *"Aguardando a avaliação de {requesterName}"* em vez do formulário.
- **Observações importantes:**
  - É **CSAT (avaliação)**, não fechamento de chamado. Não atende ao requisito.
  - A comparação é **fail-open**: sem `requesterUserId` (legado/chat/agent), `canRate` fica `true` para qualquer usuário — comportamento documentado no comentário `TicketRatingCard.tsx:37-38`.
  - `currentUserId` vem de `getUserIdFromJwt` (`TicketDetail.tsx:152-155`), propagado em `TicketDetail.tsx:370`.
- **Não existe nenhum outro gating por solicitante.** Em particular, **não há gating por "quem abriu" sobre fechar, reabrir, excluir, atribuir, transferir, comentar ou executar runbook.**

### 2.6 Resumo do modelo vigente

| Dimensão | Existe gating? | Evidência |
|---|---|---|
| Por permissão de recurso (`tickets.*`) | **Sim** | `router.tsx:256-356`; `TicketDetail.tsx:179`; `TicketChatWindow.tsx:69` |
| Por departamento do usuário | **Não** | grep vazio em `src/pages/tickets` e `src/components/tickets` |
| Por "sou o solicitante" | **Apenas CSAT** | `TicketRatingCard.tsx:39-40,69-72` |
| Por "sou do time do departamento" | **Não** | idem |
| Por "sou o responsável (assigned)" | **Não** | `TicketDetail.tsx:1678-1703` mostra "você" mas não restringe nada |

---

## 3. Onde está a ação de FECHAR chamado e quais guardas existem hoje

**Resposta curta: a ação existe, é o botão "Salvar" da troca de estado do workflow, e ela NÃO TEM NENHUMA GUARDA.**

### 3.1 Localização exata

- **Handler:** `saveState` — `src/pages/tickets/TicketDetail.tsx:1384-1401`.
  Chama `useUpdateTicketWorkflow` (`TicketDetail.tsx:1365`) com `{ id: ticketId, data: { workflowStateId: selectedState } }` (`TicketDetail.tsx:1386-1387`).
- **Hook:** `useUpdateTicketWorkflow` — `src/hooks/useTickets.ts:146-158`.
- **Endpoint:** `ticketsApi.updateWorkflowState` — `src/api/tickets.ts:158-161`, `PATCH /api/v1/tickets/{id}/workflow-state` com `{ targetStateId }`.
- **UI:** bloco "Estado" do Resumo geral (`TicketDetail.tsx:1550-1588`):
  - Botão "Alterar estado" (ícone refresh): `TicketDetail.tsx:1555-1563` — **sem `disabled`, sem condicional**.
  - `Select` "Novo estado": `TicketDetail.tsx:1568-1575` — `disabled={workflowStates.isLoading}` apenas (`1572`).
  - Botão "Salvar": `TicketDetail.tsx:1577-1584` — `disabled={!selectedState || selectedState === currentStateId}` (`1581`) e `loading={updateWorkflow.isPending}` (`1580`).

### 3.2 Guardas existentes — enumeração completa

| Guarda | Existe? | Evidência |
|---|---|---|
| Permissão de recurso (`tickets.edit`) | **Não** | o gate da rota `tickets/:id` é `tickets.view` (`router.tsx:354`); nenhuma checagem no componente |
| É do time do departamento? | **Não** | — |
| É o solicitante / abriu o chamado? | **Não** | — |
| É o responsável (`assignedToUserId`)? | **Não** | — |
| O chamado já está fechado? | **Não** para o estado; apenas para o SLA (visual) | `TicketDetail.tsx:1497` (`isFrozen`) |
| A transição é válida? | **Parcial e indireta** | apenas um texto de ajuda `hint` no `Select` (`TicketDetail.tsx:1574`) — a validação real é do backend, e o erro cai num toast genérico (`TicketDetail.tsx:1393-1399`: *"Transição inválida ou erro ao atualizar"*) |
| Confirmação antes de fechar | **Não** | — |

**Observação:** o `Select` lista **todos** os estados do workflow sem filtrar transições permitidas a partir do estado atual — `stateOptions` é montado em `TicketDetail.tsx:1374-1380` a partir de `workflowStates.data` inteiro. Hoje o usuário pode escolher um estado inválido, enviar, e receber um toast de erro do backend.

### 3.3 Outras ações "terminais" sem guarda (mesmo bloco de risco)

- **Reabrir:** `ReopenButton` `TicketDetail.tsx:1151-1172`. Único condicional é `if (!isClosed) return null` (`1154`). **Sem permissão, sem vínculo, sem solicitante.**
- **Excluir:** `DeleteTicketButton` `TicketDetail.tsx:1259-1293`, renderizado incondicionalmente no cabeçalho (`TicketDetail.tsx:229`). Única barreira é o `window.confirm` (`1264`).
- **Assumir:** `assumeTicket` `TicketDetail.tsx:1457-1470` — só exige `currentUserId` não nulo.
- **Transferir departamento:** `changeDepartment` `TicketDetail.tsx:1429-1455` — sem validação de que o usuário pertence ao departamento destino.
- **Executar runbook:** `TicketRunbookPanel.tsx:25-34,57-65` — sem guarda alguma.

---

## 4. Como funciona o seletor de departamento na abertura de chamado

O requisito fala de "abrir chamado para o departamento". Há **dois** pontos distintos de seleção de departamento — e **nenhum dos dois filtra por vínculo do usuário**.

### 4.1 Abertura — `CreateTicketModal` (`src/pages/tickets/TicketList.tsx:1639-2114`)

- **Fonte dos departamentos:** `useDepartments({ clientId: selectedClient || undefined, includeGlobal: true })` — `TicketList.tsx:1650`.
- **Opções do `Select`:** `deptOpts` — `TicketList.tsx:1823`; campo renderizado em `TicketList.tsx:1966-1974` (`label="Departamento *"`, `id="field-dept"`).
- **Ciclo de vida da seleção:** `handleDeptChange` `TicketList.tsx:1791-1797`; efeito de obrigatoriedade/pré-seleção `TicketList.tsx:1801-1818` (pré-seleciona se houver **exatamente um** departamento em `1806`; limpa se sair do escopo do cliente em `1813-1815`).
- **Validação:** departamento é **obrigatório** — `TicketList.tsx:1836` e `1971`.
- **Hint atual:** `TicketList.tsx:1973` — *"Departamentos globais — escolha o cliente para ver os dele"*.
- **Conclusão:** o seletor lista **todos** os departamentos ativos do escopo do cliente + globais. **Não consulta o vínculo do usuário logado com nenhum departamento.** Um usuário sem vínculo algum vê e seleciona qualquer departamento — o que **está correto** frente ao requisito ("demais usuários podem ABRIR chamado para o departamento"), mas a UI **não distingue** os departamentos em que ele é do time dos demais. Não há agrupamento, selo "Meu time" ou pré-seleção pelo vínculo.

### 4.2 Transferência — `DepartmentPickerModal` (`src/components/tickets/DepartmentPickerModal.tsx`)

- **Fonte:** prop `departments` — no detalhe vem de `useDepartments({ clientId, includeGlobal: true })` (`TicketDetail.tsx:1404`) e é passada em `TicketDetail.tsx:1760-1769`.
- **Filtro interno:** `DepartmentPickerModal.tsx:40-47` — apenas `department.isActive !== false` (`42`), termo de busca por nome (`43-45`) e corte de 50 itens (`46`).
- **Não filtra por vínculo do usuário.** No menu de contexto da lista, o seletor equivalente usa `useDepartments` filtrado só por `isActive` (`TicketList.tsx:594-596`) e o modal em `TicketList.tsx:1515-1522`.
- **Comportamento de "Sem departamento":** `DepartmentPickerModal.tsx:69-84`; salvar com `null` remove o vínculo (`DepartmentPickerModal.tsx:128-130`).

### 4.3 Observação de contrato

O `Department` (`src/api/types.ts` ~880-900) **não expõe** nenhum campo de time/equipe. Para a UI decidir "sou do time deste departamento" em um `Select`, será preciso ou (a) carregar `/departments/{id}/effective` para cada opção — caro —, ou (b) um endpoint novo do tipo "meus departamentos"/"sou membro".

---

## 5. Gaps de UX — o que falta para o requisito

### G1. Não existe noção de "sou do time do departamento" no cliente
- **Onde falta:** todo o módulo de chamados. Não há hook, store ou campo de `Ticket` que responda "o usuário logado é membro do time do departamento deste chamado".
- `Ticket` (`src/api/types.ts:675-711`) tem `departmentId` (`680`) e `requesterUserId` (`706`), mas **nenhum campo de time/equipe** e **nenhum flag de permissão contextual**.
- **Telas a alterar:** `TicketDetail.tsx` (todo o gating) e `TicketList.tsx` (ações de linha).
- **Dependência de backend:** não verificado. A UI não tem como derivar isso hoje sem novo dado.

### G2. Fechar/trocar estado não tem guarda alguma
- **Arquivo:linha:** `TicketDetail.tsx:1555-1563` (botão), `1568-1575` (select), `1577-1584` (Salvar), `1384-1401` (handler).
- **Falta:** bloquear (ou ocultar) a ação quando o usuário **não é do time** e **não é o solicitante**.

### G3. Excluir chamado exposto a qualquer um que veja o detalhe
- **Arquivo:linha:** `TicketDetail.tsx:1259-1293` e render incondicional em `TicketDetail.tsx:229`.
- **Falta:** restringir a time/admin.

### G4. Reabrir sem guarda
- **Arquivo:linha:** `TicketDetail.tsx:1151-1172` (render em `TicketDetail.tsx:225`).
- **Falta:** mesma regra do fechar (o requisito trata fechar; reabrir é o inverso e precisa de decisão explícita).

### G5. Transferir departamento sem validar o destino
- **Arquivo:linha:** `changeDepartment` `TicketDetail.tsx:1429-1455`; `DepartmentPickerModal.tsx:40-47` (filtro sem vínculo); `handleConfirmAssign` `TicketList.tsx:878-917`.
- **Falta:** usuário só transfere para departamento do qual é do time (ou é admin).

### G6. Assumir/atribuir sem restrição de time
- **Arquivo:linha:** `assumeTicket` `TicketDetail.tsx:1457-1470`; `handleContextMenuTakeOwnership` `TicketList.tsx:846-866`; seletor de responsável `TicketList.tsx:1524-1529`; `assignUserOptions` montado a partir de **todos** os usuários do IAM (`TicketList.tsx` ~`assignUserOptions`, depende de `useIamUsers`, `TicketList.tsx:406`).
- **Detalhe de precisão:** a lista de candidatos deveria ser a **equipe do departamento** (`DepartmentEffectiveMemberDto`), que hoje só é usada em `DepartmentDetailPage.tsx:712-832`.

### G7. Comentar / nota interna sem distinção
- **Arquivo:linha:** `TicketDetail.tsx:2420-2422` (botão Enviar, sem gating); checkbox "Nota interna" `TicketDetail.tsx:2414-2418` — **qualquer usuário que veja o chamado pode criar nota interna**.
- **Falta:** decidir se o solicitante externo pode comentar/ver notas internas.

### G8. Executar runbook sem guarda
- **Arquivo:linha:** `TicketRunbookPanel.tsx:25-34`, botão `57-65` (montado em `TicketDetail.tsx:2358`).
- **Falta:** restringir a membros do time — é ação de "tratar/atender" por excelência (executa scripts em máquina).

### G9. Chat do chamado com escopo global, não por departamento
- **Arquivo:linha:** `TicketDetail.tsx:90,178-179,344`; `TicketChatWindow.tsx:8,25,69`.
- **Hoje:** qualquer um com `tickets.chat|tickets.*|tickets.edit|admin.*` (em **qualquer** departamento) inicia/responde chat.

### G10. Não existe fila "Meu time"
- **Arquivo:linha:** `TicketList.tsx:369-383` (`useTickets` com `clientId`, `workflowStateId`, `priority`, `isClosed`, `text`, `templateId`, `answerKey`, `answerValue`, `answerMatch`) — **sem `departmentId` e sem `assignedToUserId`**, embora ambos existam em `TicketsQuery` (`src/api/types.ts:2992-3014`, campos `departmentId` em `2997` e `assignedToUserId` em `2999`).
- **Filtros expostos na UI:** cliente, estado, prioridade, status, texto, template, resposta (`TicketList.tsx:330-338`). **Não há filtro por departamento nem por responsável.**
- **Achado colateral (provável bug):** `TicketSavedViewFilter` prevê `assignedToUserId` (**lido** em `parseSavedViewFilter`, `TicketList.tsx:140`), mas `buildCurrentFilter` (`TicketList.tsx:934-944`) **nunca grava** esse campo ao salvar uma visão, e `applySavedView` (`TicketList.tsx:946-971`) **ignora** o campo ao aplicar (não há `setFilterAssigned...`). O filtro por responsável é lido e descartado — não verificado se há teste cobrindo isso.

### G11. Erro 403 não tem tratamento amigável
- **Arquivo:linha:** a mensagem genérica é `"Acesso negado"` em `STATUS_FALLBACK_MESSAGE` (`src/api/client.ts:62-73`, entrada `403` em `client.ts:65`) e o `ApiError` carrega `status` (`client.ts:40,52`).
- **Como aparece hoje:** como `toast.error(err.message)` cru — ex.: `TicketDetail.tsx:1393-1399` (*"Transição inválida ou erro ao atualizar"*), `TicketDetail.tsx:1466-1467` (*"Não foi possível assumir o chamado."*), `TicketList.tsx:913-915`. **Nenhum ponto traduz 403 em "você não é do time do departamento X"**, nem oferece caminho de saída.
- **Infra que já existe e poderia ser usada:** `isMissingEndpointError` (`src/api/departments.ts:26-31`) mostra o padrão de inspecionar `ApiError.status`; `SAFE_AUTH_STATUSES` em `src/auth/errorMessages.ts:15` já inclui `403` (`errorMessages.ts:40`).

### G12. Rotas sem `PermissionGate`
- `tickets/alerts` (`router.tsx:264`), `tickets/sla` (`router.tsx:268`) e `tickets/:id/chat` (`router.tsx:187`) não têm gate de rota.

---

## 6. Recomendações de UX (padrões de mercado)

### 6.1 Ocultar vs desabilitar — regra de decisão
- **Ocultar** quando a ação é **estruturalmente inviável** para o perfil e nunca fará sentido: excluir chamado para quem não é do time; transferir departamento para quem não é gestor; executar runbook para quem não é do time. Evita poluição e reduz superfície de erro.
- **Desabilitar com `title`/`aria-describedby` explicativo** quando o usuário **precisa saber que a ação existe e por que está bloqueada** — caso central do requisito: **fechar chamado**. O solicitante deve ver o botão de fechar **apenas no próprio chamado**; nos demais, o controle não deve existir.
- **Nunca** manter o botão habilitado confiando só no backend (situação atual de `TicketDetail.tsx:1577-1584`).
- Para o bloco de estado (`TicketDetail.tsx:1550-1588`), recomenda-se **substituir o `Select`+Salvar por botões nomeados da transição** ("Fechar chamado", "Resolver", "Aguardando cliente"), já que hoje o usuário não sabe qual estado corresponde a "fechar" e o `Select` (`1374-1380`) lista transições inválidas.

### 6.2 Explicação de "sem permissão"
- Um `Tooltip`/`title` curto: *"Somente o time de {Departamento} trata chamados deste departamento."*
- Para o solicitante: *"Você pode fechar este chamado porque foi você quem abriu."*
- **Não usar `PermissionGate` (que faz `Navigate`) nem `toast` de erro para comunicar restrição de UI** — o padrão do app hoje é redirect (`AuthGuards.tsx:59-61,82-84`) e toast (`client.ts:65`), ambos ruins para explicar contexto. Preferir texto inline persistente, como já é feito (bom precedente) em `TicketRatingCard.tsx:69-72` e em `TicketList.tsx:1975-1988`.

### 6.3 Badge "Time do departamento"
- Selo ao lado do nome do departamento no Resumo geral (`TicketDetail.tsx:1653-1676`) e na lista.
- Reaproveitar o padrão visual de `Badge color="accent"` com o texto "você" usado em `TicketDetail.tsx:1685` e o selo "Global" de `DepartmentPickerModal.tsx:110-114`.
- No `CreateTicketModal`, marcar as opções de `deptOpts` (`TicketList.tsx:1823`) com "Meu time" e ordená-las primeiro; pré-selecionar o departamento do usuário quando houver um único vínculo (hoje só pré-seleciona se houver **um único departamento global no escopo**, `TicketList.tsx:1805-1808`).

### 6.4 Fila "Meu time"
- Adicionar filtro por departamento e por responsável na `TicketList` — os hooks já aceitam os parâmetros via `TicketsQuery` (`src/api/types.ts:2997,2999`) e `TicketsQuery` já é repassado a `ticketsApi.list` (`useTickets.ts:42-48`).
- Entregar como **visão rápida fixa** (chips acima da tabela) além das visões salvas: "Meu time", "Meus chamados", "Não atribuídos do meu time".
- Corrigir o descarte de `assignedToUserId` em `buildCurrentFilter`/`applySavedView` (`TicketList.tsx:934-944` e `946-971`) para que visões salvas por responsável funcionem (G10).

### 6.5 Indicador de quem pode fechar
- Linha explícita no Resumo geral, no formato já usado em `TicketDetail.tsx:1661-1663` (texto `text-xs text-muted` sob o valor): *"Pode fechar: time de {Departamento} e {nome do solicitante}"*.
- Ícone de cadeado (`Icon name="lock"`, já usado em `TicketDetail.tsx:2416`) sobre ações bloqueadas.

### 6.6 Estados de erro 403 amigáveis
- Interceptar `ApiError` com `status === 403` (`client.ts:40,52`) antes do `toast.error` genérico nos pontos listados em G11 e traduzir para: *"Você não faz parte do time de {Departamento}. Peça inclusão a um administrador."*, com ação "Ver departamento".
- Centralizar em um helper (ex.: `src/utils/ticketPermissionError.ts`) para não repetir a lógica — hoje cada handler formata a mensagem à mão (`TicketDetail.tsx:1393-1399`, `1457-1470`, `TicketList.tsx:834-843`).

### 6.7 Ponto de arquitetura de UI
- Criar um único ponto de decisão no cliente (hook, ex.: `useTicketPermissions(ticket)`) devolvendo `{ canTreat, canClose, canAssign, canTransfer, canDelete, canRunbook, canComment }`, e consumir esse objeto em `TicketDetail.tsx` e `TicketList.tsx`.
- **Justificativa:** hoje o gating é inexistente e disperso; a lógica de `canManage` do chat já está duplicada em três arquivos (`TicketDetail.tsx:90`, `TicketChatWindow.tsx:8`, e `AgentSupportChatWindow.tsx:10`), o que mostra o custo de não centralizar.
- **Atenção:** `useAuthorization` é memoizado por `session.accessToken` (`authorization.ts:219`) e tem cache de decisão por instância (`authorization.ts:182`). Qualquer novo hook de permissão contextual **não pode** entrar nesse cache sem incluir o `ticketId`.

---

## 7. Impacto em testes existentes

### 7.1 Testes diretamente afetados (tocarão gating novo)

| Arquivo | Linhas | Por que será afetado |
|---|---|---|
| `src/pages/tickets/TicketDetail.hooks.test.tsx` | 187 | Monta `/tickets/:id`; mocka `@/auth/AuthContext` com `accessToken: null` (`TicketDetail.hooks.test.tsx:53-55`) e `@/auth/jwt` com `getUserIdFromJwt: () => null` (`57-59`). Novo gating que dependa de permissão/identidade tornará esse cenário `sem permissão` — o teste que hoje garante ausência do erro React #310 precisa passar a mockar autorização/identidade. |
| `src/pages/tickets/TicketDetail.comments.test.tsx` | 286 | Mocka o JWT com `unique_name`/`sub` mutável (`comments.test.tsx:18-25,39`). Cobre envio de comentário — se comentar passar a ser restrito, precisa de cenário autorizado e não autorizado. |
| `src/pages/tickets/TicketDetail.commentsOrder.test.tsx` | 212 | Renderiza o detalhe e interage com o compositor de comentários; mesmo risco do anterior. |
| `src/components/tickets/DepartmentPickerModal.test.tsx` | 56 | Cobre busca, seleção, transferência, "Sem departamento" e lista vazia (`DepartmentPickerModal.test.tsx:20-55`). Se o modal passar a filtrar por vínculo do usuário, o mock `departments` (`5-8`) precisa de metadados de time. |
| `src/pages/tickets/TicketOpeningSection.test.tsx` | 155 | Importa `TicketOpeningSection` de `./TicketDetail` (`TicketOpeningSection.test.tsx:15`) e monta um `Ticket` completo (`17-34`). Se `Ticket` ganhar campos de time/permissão obrigatórios, a fábrica precisa ser atualizada. |
| `src/components/tickets/TicketFieldsSection.test.tsx` | 294 | Cobre edição/salvamento de campos (`TicketFieldsSection.tsx:131,418`); se a edição virar restrita ao time, precisa de cenário autorizado. |
| `src/components/tickets/WatchersSection.test.tsx` | 99 | Cobre adicionar/remover watcher (`WatchersSection.tsx:79,98`). |
| `src/components/tickets/TicketRelationsSection.test.tsx` | 158 | Cobre criar/remover vínculo (`TicketRelationsSection.tsx:81,154`). |
| `src/components/tickets/TicketAiAssignmentCard.test.tsx` | 128 | Cobre triagem/atribuição por IA; se aplicar atribuição exigir ser do time, muda. |
| `src/pages/tickets/TicketRunbookFlow.test.tsx` | 77 | Executa o `TicketRunbookPanel` direto (`TicketRunbookFlow.test.tsx:57,74`); se o painel ganhar prop de permissão, o teste quebra. |
| `src/components/tickets/AgentPickerModal.test.tsx` | 49 | Modal de vínculo de máquina; afetado se o vínculo de agent passar a ser restrito. |
| `src/components/tickets/RequesterPickerModal.test.tsx` | 42 | Modal de solicitante; afetado por regras de "quem pode trocar o solicitante". |
| `src/components/tickets/TicketRatingCard.test.tsx` | 87 | Cobre `canRate` (`TicketRatingCard.tsx:39-40`); referência de como testar gating por solicitante. |
| `src/components/tickets/TicketStateBadge.test.tsx` | 107 | Baixo risco (apresentação), afetado apenas se o badge ganhar estado "bloqueado". |

### 7.2 Testes potencialmente afetados (rotas/administração)

| Arquivo | Linhas | Motivo |
|---|---|---|
| `src/pages/tickets/AutoTicketRulesPage.test.tsx` | 169 | Se `/tickets/auto-rules` ganhar gate adicional por departamento. |
| `src/pages/settings/DepartmentInheritance.test.tsx` | 570 | Cobre herança de time/equipe (referencia `department` em `DepartmentInheritance.test.tsx:68-79`); se o time passar a decidir permissão de atendimento, a semântica muda. |
| `src/pages/settings/DepartmentMemberProfileRow.test.tsx` | 109 | Perfil de membro do time. |
| `src/auth/authorization.test.ts` | — | Cobre o fail-closed de `useAuthorization` (`authorization.test.ts:3,20,23`); qualquer permissão contextual nova **não** deve alterar esse contrato, mas o teste é a rede de segurança dessa mudança. |

### 7.3 Padrão de mock já existente (aproveitar)
Vários testes já mockam autorização com `useAuthorization: () => ({ hasAnyPermission: () => true })`:
- `src/pages/agents/AgentList.test.tsx:139` (forma `vi.mock('@/auth/authorization', ...)`)
- `src/pages/agents/AgentDetail.test.tsx:203`
- `src/components/agents/AgentWindowsUpdatesPanel.test.tsx:76`
- `src/pages/Dashboard.test.tsx:66`
- `src/pages/clients/ClientDetail.test.tsx:96`
- `src/pages/clients/SiteDetail.test.tsx:98`
- `src/pages/automation/AutomationOperationsPage.test.tsx:68` (com mock parametrizável: `hasAnyPermission: hasAnyPermissionMock`)

**Nenhum teste da pasta `src/pages/tickets` ou `src/components/tickets` hoje mocka `@/auth/authorization`** — consequência direta de não haver gating nessas telas. Ao introduzir gating, esses mocks precisarão ser adicionados (o padrão de `AutomationOperationsPage.test.tsx:68` é o mais adequado, por permitir testar negado e permitido).

### 7.4 Não verificado
- Se o backend já rejeita fechar/transferir/excluir sem vínculo (as mensagens de 403 e a política real de autorização) — **não verificado**; esta análise é restrita ao frontend.
- Se existe endpoint "meus departamentos"/"sou membro" — **não verificado**.
- Se há testes E2E fora de `*.test.tsx` — **não verificado**.
- Contagem exata de suíte/cobertura de testes executada — **não executada** (análise somente leitura; nenhum comando de teste foi rodado).

---

## 8. Lista consolidada de arquivos a alterar (arquivo:linha)

| # | Arquivo:linha | O que alterar |
|---|---|---|
| 1 | `src/pages/tickets/TicketDetail.tsx:1550-1588` | Gating de fechar/estado; trocar `Select`+Salvar por transições nomeadas |
| 2 | `src/pages/tickets/TicketDetail.tsx:1384-1401` | `saveState` — validar permissão antes do `mutate` |
| 3 | `src/pages/tickets/TicketDetail.tsx:1151-1172` | `ReopenButton` — guarda de reabertura |
| 4 | `src/pages/tickets/TicketDetail.tsx:1259-1293` + `:229` | `DeleteTicketButton` — ocultar para quem não é do time |
| 5 | `src/pages/tickets/TicketDetail.tsx:1457-1470` | `assumeTicket` — restringir a membros do time |
| 6 | `src/pages/tickets/TicketDetail.tsx:1429-1455` | `changeDepartment` — validar departamento destino |
| 7 | `src/pages/tickets/TicketDetail.tsx:1653-1676` | Badge "Meu time" + indicador de quem pode fechar |
| 8 | `src/pages/tickets/TicketDetail.tsx:2414-2422` | Gating de comentar / nota interna |
| 9 | `src/pages/tickets/TicketDetail.tsx:90,178-179,344` | Chat — escopo por departamento |
| 10 | `src/pages/tickets/TicketDetail.tsx:2358` | Passar permissão ao `TicketRunbookPanel` |
| 11 | `src/pages/tickets/TicketRunbookPanel.tsx:25-34,57-65` | Guarda de execução de runbook |
| 12 | `src/pages/tickets/TicketList.tsx:1462-1501` | Menu de contexto — ocultar/bloquear conforme perfil |
| 13 | `src/pages/tickets/TicketList.tsx:878-917` | `handleConfirmAssign` — validar departamento/responsável |
| 14 | `src/pages/tickets/TicketList.tsx:846-866` | Assumir — restringir a membros do time |
| 15 | `src/pages/tickets/TicketList.tsx:1823,1966-1974` | Marcar/ordenar departamentos "Meu time" na abertura |
| 16 | `src/pages/tickets/TicketList.tsx:330-338,934-971` | Filtros "Meu time"/"Meus chamados"; corrigir `assignedToUserId` |
| 17 | `src/pages/tickets/TicketList.tsx:369-383` | Passar `departmentId`/`assignedToUserId` ao `useTickets` |
| 18 | `src/components/tickets/DepartmentPickerModal.tsx:40-47` | Filtro/selo por vínculo do usuário |
| 19 | `src/components/tickets/WatchersSection.tsx:79,98,226-231` | Gating de watchers |
| 20 | `src/components/tickets/TicketRelationsSection.tsx:81,154,245-247` | Gating de vínculos |
| 21 | `src/components/tickets/TicketFieldsSection.tsx:131,253,418,490` | Gating de edição de campos |
| 22 | `src/components/tickets/TicketAiAssignmentCard.tsx:31-32` | Gating de reavaliar/atribuir por IA |
| 23 | `src/router.tsx:264,268,187` | Adicionar `PermissionGate` ausente |
| 24 | `src/api/client.ts:62-73` + handlers de `TicketDetail.tsx`/`TicketList.tsx` | Tradução amigável de 403 |

**Novos artefatos sugeridos (não existem hoje):** hook `useTicketPermissions` (gating contextual), helper de mensagem 403, e opcionalmente um `DepartmentTeamBadge`.

---

*Análise produzida com base em leitura de código (somente leitura). Nenhum arquivo `.tsx`/`.ts` foi modificado. Todas as referências de linha correspondem ao estado do repositório no momento da análise.*
