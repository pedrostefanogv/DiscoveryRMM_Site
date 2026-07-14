# Plano de Correção: Paginação de Software — AgentDetail

> **Data:** 2026-07-14
> **Status:** Análise completa, pronto para implementação
> **Arquivos afetados:** `src/pages/agents/AgentDetail.tsx`, `src/hooks/useAgents.ts`, `src/components/ui/DataTable.tsx`

---

## 1. Diagnóstico

### Sintoma observado (em produção)

Na URL `https://tngplacas.com.br/agents/019ea230-8206-7fab-9116-53913a069fd8`:

- A aba "Inventário de Aplicativos" mostra badge **106**
- O card "Total instalado" mostra **106**
- A paginação exibe **"Página 11 de 11 · 106 itens no total"**
- Porém, a **página 11 exibe 10 itens** em vez de 6 (106 - 100 = 6 esperados)
- O botão "Atualizar" está desabilitado (agente offline)

### Arquitetura atual

```
useAgentSoftware(id, { limit: 500 })
    └── useInfiniteQuery → agentsApi.getSoftware(id, { limit: 500 })
         └── Retorna AgentSoftwareInventoryPage { items[], nextCursor, hasMore }
              └── Apenas PRIMEIRA página é carregada (fetchNextPage nunca é chamado)

softwareAllItems = software.data?.pages.flatMap(p => p.items) ?? []
    └── Paginação client-side: slice(startIdx, startIdx + limit)
```

O hook busca com `limit: 500` para tentar carregar tudo em uma única página da API, e então faz paginação client-side com `softwareLimitSelected` (10/30/50).

---

## 2. Bugs Identificados

### 🔴 Bug 1 (CRÍTICO): `useInfiniteQuery` sem auto-fetch de páginas restantes

**Arquivo:** `src/hooks/useAgents.ts` — `useAgentSoftware()`

O hook usa `useInfiniteQuery` com `limit: 500`, mas **nunca chama `fetchNextPage()`**. Se o backend retornar menos de 500 itens por página (com `hasMore: true` e `nextCursor` definido), apenas a primeira página é carregada.

```ts
// useAgents.ts — linha 139-170
return useInfiniteQuery({
  queryKey: KEYS.software(id, { ... }),
  queryFn: ({ pageParam }) => agentsApi.getSoftware(id, { ... }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  enabled: !!id,
  staleTime: 30_000,
  placeholderData: keepPreviousData,
  // ❌ Sem fetchNextPage automático
});
```

**Impacto:** Se o backend tem um cap de limite (ex: max 100 itens por página), `softwareAllItems` terá apenas 100 itens mesmo que o total seja 106. Os últimos 6 itens nunca aparecem.

**Verificação necessária:** Confirmar com a API se `limit=500` é respeitado ou se há um cap máximo.

---

### 🔴 Bug 2 (CRÍTICO): `softwareTotalPages` calculado sobre itens carregados, não sobre total real

**Arquivo:** `src/pages/agents/AgentDetail.tsx` — linhas 279-282

```ts
const softwareAllItems =
  software.data?.pages.flatMap((p) => p.items ?? []) ?? [];
const softwareTotalCount = softwareAllItems.length; // ← itens CARREGADOS, não total real
const limit = Number(softwareLimitSelected);
const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));
```

`softwareTotalCount` é a contagem de itens efetivamente carregados pela API, **não** o total real. O snapshot endpoint (`useAgentSoftwareSnapshot`) tem o total real em `totalInstalled`.

**Impacto:** Se a API retornar 100 itens (de 106 totais), `softwareTotalPages = 10` e o usuário nunca vê os últimos 6. A aba mostra `softwareTotalCount` = 100, mas o card mostra `softwareSnapshot.data?.totalInstalled` = 106 — **inconsistência visível**.

---

### 🟡 Bug 3 (MÉDIO): Discrepância de contagem entre componentes

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

| Componente                             | Variável exibida                                              | Valor esperado   |
| -------------------------------------- | ------------------------------------------------------------- | ---------------- |
| Badge da aba (linha 1365)              | `softwareTotalCount`                                          | Itens carregados |
| Card "Total instalado" (linha 1457)    | `softwareSnapshot.data?.totalInstalled ?? softwareTotalCount` | Total real       |
| Subtítulo (linha 1430)                 | `softwareTotalCount`                                          | Itens carregados |
| Texto de paginação (linhas 1495, 1529) | `softwareTotalCount`                                          | Itens carregados |

Se `softwareAllItems.length ≠ softwareSnapshot.data?.totalInstalled`, o usuário vê números diferentes em lugares diferentes da mesma tela.

---

### 🟡 Bug 4 (MÉDIO): Ordenação client-side apenas na página atual

**Arquivo:** `src/pages/agents/AgentDetail.tsx` + `src/components/ui/DataTable.tsx`

O `DataTable` recebe `data={softwareItems}` (apenas o slice da página atual). O `DataTable` tem ordenação interna (`handleSort`) que ordena apenas os itens recebidos:

```ts
// DataTable.tsx — linha 73-84
const sorted = useMemo(() => {
  if (!sort || !sort.key || !sort.direction) return data;
  return [...data].sort((a, b) => { ... });
}, [data, sort, columns]);
```

Como `data` é apenas `softwareItems` (slice da página), a ordenação só afeta a página atual, não o conjunto completo. O usuário clica no header "Aplicativo" para ordenar alfabeticamente, mas apenas os 10 itens da página atual são reordenados.

**Impacto:** Comportamento confuso — ordenação parece não funcionar corretamente ao trocar de página.

---

### 🟡 Bug 5 (MÉDIO): `useEffect` de correção de página causa re-render pós-render

**Arquivo:** `src/pages/agents/AgentDetail.tsx` — linhas 286-291

```ts
useEffect(() => {
  if (softwareTotalPages > 0 && softwarePage > softwareTotalPages) {
    setSoftwarePage(softwareTotalPages);
  }
}, [softwareTotalPages, softwarePage]);
```

Este `useEffect` roda **após** o render. Se `softwareTotalPages` diminui (ex: busca reduz resultados), o componente primeiro renderiza com `softwarePage` inválido (página 11 de 5), exibindo tabela vazia, e só depois corrige. Isso causa um flash de tabela vazia.

**Impacto:** Flash visual de tabela vazia ao aplicar filtros que reduzem o número de páginas.

---

### 🟢 Bug 6 (BAIXO): Delay fixo de 3s no refresh de software

**Arquivo:** `src/pages/agents/AgentDetail.tsx` — linhas 683-695

```ts
const handleRefreshSoftware = async () => {
  // ...
  await agentsApi.refreshData(id, { software: true });
  toast.success("Solicitação de coleta de software enviada ao agente.");
  await new Promise((r) => setTimeout(r, 3000)); // ← delay fixo arbitrário
  await software.refetch();
  await softwareSnapshot.refetch();
  // ...
};
```

O delay de 3 segundos é um hack. Se a coleta levar mais que 3s, os dados não serão atualizados. Se levar menos, o usuário espera desnecessariamente.

**Impacto:** UX degradada — refresh pode não refletir dados atualizados ou esperar tempo desnecessário.

---

### 🟢 Bug 7 (BAIXO): Possíveis duplicatas em `softwareAllItems`

**Arquivo:** `src/pages/agents/AgentDetail.tsx` — linha 279

O comentário no código diz:

```ts
// O cursor pagination do backend retorna itens duplicados entre páginas,
// então usar fetchNextPage + slice client-side é inviável.
```

Se o backend tem um bug conhecido de duplicatas em cursor pagination, e o `useInfiniteQuery` acumula páginas (ex: via cache com `keepPreviousData`), `softwareAllItems` pode conter duplicatas. Não há dedupicação.

**Impacto:** Contagem inflada e itens repetidos na tabela.

---

### 🟢 Bug 8 (BAIXO): `softwareLimitOptions` não reflete o limit real da API

**Arquivo:** `src/pages/agents/AgentDetail.tsx` — linhas 719-723

```ts
const softwareLimitOptions = [
  { value: "10", label: "10 por página" },
  { value: "30", label: "30 por página" },
  { value: "50", label: "50 por página" },
];
```

O hook busca com `limit: 500` da API, mas o seletor oferece 10/30/50 para paginação client-side. Não há opção para ver todos os itens de uma vez. Para 106 itens, o usuário precisa navegar 11 páginas com limit=10.

**Impacto:** UX — sem opção "ver todos", navegação excessiva para datasets pequenos.

---

## 3. Plano de Correção

### Etapa 1: Usar `totalInstalled` do snapshot como fonte de verdade para total

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

Substituir `softwareTotalCount` por uma fonte confiável:

```ts
// ANTES:
const softwareTotalCount = softwareAllItems.length;
const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));

// DEPOIS:
const softwareTotalCount =
  softwareSnapshot.data?.totalInstalled ?? softwareAllItems.length;
const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));
```

Isso garante que a paginação reflita o total real, não apenas os itens carregados.

---

### Etapa 2: Adicionar deduplicação em `softwareAllItems`

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

```ts
// ANTES:
const softwareAllItems =
  software.data?.pages.flatMap((p) => p.items ?? []) ?? [];

// DEPOIS:
const softwareAllItems = useMemo(() => {
  const allPages = software.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  // Deduplicar por inventoryId (chave única do inventário)
  const seen = new Set<string>();
  return allPages.filter((item) => {
    if (seen.has(item.inventoryId)) return false;
    seen.add(item.inventoryId);
    return true;
  });
}, [software.data?.pages]);
```

---

### Etapa 3: Garantir que todas as páginas de cursor sejam carregadas

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

Adicionar `useEffect` para auto-fetch de páginas restantes:

```ts
useEffect(() => {
  // Se a API indicar que há mais páginas e não estamos buscando, carregar a próxima
  if (
    software.hasNextPage &&
    !software.isFetching &&
    !software.isFetchingNextPage &&
    software.data
  ) {
    software.fetchNextPage();
  }
}, [
  software.hasNextPage,
  software.isFetching,
  software.isFetchingNextPage,
  software.fetchNextPage,
  software.data,
]);
```

Isso garante que todos os itens sejam carregados mesmo se o backend limitar o tamanho da página.

---

### Etapa 4: Corrigir ordenação para aplicar sobre todos os itens, não apenas a página atual

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

Desabilitar a ordenação interna do `DataTable` e aplicar ordenação sobre `softwareAllItems` antes do slice:

```ts
// ANTES:
const softwareItems = softwareAllItems.slice(startIdx, startIdx + limit);
// ...
<DataTable data={softwareItems} showPagination={false} />

// DEPOIS:
const [clientSort, setClientSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

const sortedAllItems = useMemo(() => {
  if (!clientSort) return softwareAllItems;
  return [...softwareAllItems].sort((a, b) => {
    const valA = String((a as Record<string, unknown>)[clientSort.key] ?? '');
    const valB = String((b as Record<string, unknown>)[clientSort.key] ?? '');
    const cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base', numeric: true });
    return clientSort.direction === 'asc' ? cmp : -cmp;
  });
}, [softwareAllItems, clientSort]);

const softwareItems = sortedAllItems.slice(startIdx, startIdx + limit);
// ...
<DataTable
  data={softwareItems}
  showPagination={false}
  sortable={false}  // ← desabilitar sort interno do DataTable
/>
```

Alternativa: adicionar prop `sortable={false}` nas colunas do `DataTable` para desabilitar ordenação client-side e manter apenas a ordenação da API (`softwareOrder`).

---

### Etapa 5: Corrigir `useEffect` de correção de página para evitar flash

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

Usar cálculo derivado em vez de `useEffect`:

```ts
// ANTES:
const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));
const startIdx = (softwarePage - 1) * limit;
const softwareItems = softwareAllItems.slice(startIdx, startIdx + limit);

useEffect(() => {
  if (softwareTotalPages > 0 && softwarePage > softwareTotalPages) {
    setSoftwarePage(softwareTotalPages);
  }
}, [softwareTotalPages, softwarePage]);

// DEPOIS:
const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));
const safeSoftwarePage = Math.min(softwarePage, softwareTotalPages);
const startIdx = (safeSoftwarePage - 1) * limit;
const softwareItems = sortedAllItems.slice(startIdx, startIdx + limit);

// Sincronizar estado apenas se necessário (sem flash)
useEffect(() => {
  if (softwarePage !== safeSoftwarePage) {
    setSoftwarePage(safeSoftwarePage);
  }
}, [softwarePage, safeSoftwarePage]);
```

Usar `safeSoftwarePage` em todos os lugares onde `softwarePage` era usado para renderização.

---

### Etapa 6: Unificar contagem exibida em todos os componentes

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

Usar `softwareTotalCount` (agora baseado em `totalInstalled` do snapshot) em todos os lugares:

| Local                  | Variável             | Valor      |
| ---------------------- | -------------------- | ---------- |
| Badge da aba           | `softwareTotalCount` | Total real |
| Card "Total instalado" | `softwareTotalCount` | Total real |
| Subtítulo              | `softwareTotalCount` | Total real |
| Texto de paginação     | `softwareTotalCount` | Total real |

---

### Etapa 7: Substituir delay fixo por polling no refresh

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

```ts
const handleRefreshSoftware = async () => {
  if (!id || isRefreshingSoftware) return;
  setIsRefreshingSoftware(true);
  try {
    await agentsApi.refreshData(id, { software: true });
    toast.success("Solicitação de coleta de software enviada ao agente.");

    // Polling do snapshot até que updatedAt mude
    const previousUpdatedAt = softwareSnapshot.data?.updatedAt;
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
      const refreshed = await softwareSnapshot.refetch();
      if (refreshed.data?.updatedAt !== previousUpdatedAt) break;
      attempts++;
    }

    await software.refetch();
  } catch (error) {
    const msg =
      error instanceof ApiError
        ? error.message
        : "Falha ao solicitar refresh de software.";
    toast.error(msg);
  } finally {
    setIsRefreshingSoftware(false);
  }
};
```

---

### Etapa 8 (opcional): Adicionar opção "Todos" no seletor de limite

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

```ts
const softwareLimitOptions = [
  { value: "10", label: "10 por página" },
  { value: "30", label: "30 por página" },
  { value: "50", label: "50 por página" },
  { value: "100", label: "100 por página" },
  { value: "500", label: "Todos" },
];
```

E ajustar o cálculo de `limit`:

```ts
const limit =
  softwareLimitSelected === "500"
    ? softwareTotalCount
    : Number(softwareLimitSelected);
```

---

## 4. Resumo das Alterações

| #   | Arquivo           | Alteração                                               | Prioridade |
| --- | ----------------- | ------------------------------------------------------- | ---------- |
| 1   | `AgentDetail.tsx` | Usar `totalInstalled` do snapshot como total            | 🔴 CRÍTICA |
| 2   | `AgentDetail.tsx` | Deduplicar `softwareAllItems` por `inventoryId`         | 🔴 CRÍTICA |
| 3   | `AgentDetail.tsx` | Auto-fetch de páginas restantes via `useEffect`         | 🔴 CRÍTICA |
| 4   | `AgentDetail.tsx` | Ordenação sobre todos os itens, não apenas página atual | 🟡 MÉDIA   |
| 5   | `AgentDetail.tsx` | Corrigir flash com `safeSoftwarePage` derivado          | 🟡 MÉDIA   |
| 6   | `AgentDetail.tsx` | Unificar contagem em todos os componentes               | 🟡 MÉDIA   |
| 7   | `AgentDetail.tsx` | Substituir delay fixo por polling no refresh            | 🟢 BAIXA   |
| 8   | `AgentDetail.tsx` | Adicionar opção "Todos" no seletor de limite            | 🟢 BAIXA   |

---

## 5. Ordem de Implementação

1. **Etapa 1** — Usar `totalInstalled` do snapshot (resolve contagem incorreta)
2. **Etapa 2** — Deduplicação (resolve itens repetidos)
3. **Etapa 3** — Auto-fetch (resolve itens faltantes)
4. **Etapa 5** — `safeSoftwarePage` (resolve flash de tabela vazia)
5. **Etapa 6** — Unificar contagem (resolve inconsistência visual)
6. **Etapa 4** — Ordenação correta (resolve sort quebrado)
7. **Etapa 7** — Polling no refresh (melhoria de UX)
8. **Etapa 8** — Opção "Todos" (melhoria de UX)

---

## 6. Validação

Após implementar, validar:

- [ ] Com 106 itens e limit=10, página 11 mostra exatamente 6 itens
- [ ] Badge da aba, card e paginação mostram o mesmo número
- [ ] Navegação entre páginas funciona (Voltar/Avançar)
- [ ] Busca reduz resultados e corrige página automaticamente sem flash
- [ ] Ordenação por coluna afeta todo o conjunto, não apenas a página atual
- [ ] Refresh de software atualiza dados sem delay fixo desnecessário
- [ ] Sem itens duplicados na tabela
