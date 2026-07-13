# Plano de Correção: Scroll Jump & Paginação Quebrada — AgentDetail

## Diagnóstico

### Problema 1: Scroll Jump (página sobe ao pesquisar/mudar de página)

**Causa raiz:** Quando os filtros mudam (busca, limit, order), o `useInfiniteQuery` no hook `useAgentSoftware` recebe uma nova `queryKey`. Sem `placeholderData: keepPreviousData`, o React Query descarta os dados anteriores imediatamente. `software.data` vira `undefined` → `softwareAllItems` = `[]` → a tabela colapsa em altura → o navegador perde a posição de scroll. Quando os novos dados chegam, a tabela expande mas o scroll já foi perdido.

**Causas secundárias:**

- `resetSoftwarePagination()` faz `setSoftwarePage(1)` + mudança de filtro = múltiplos re-renders com dados vazios
- Nenhuma estabilização de altura da tabela durante transições

### Problema 2: Paginação não muda os dados da tabela

**Causa raiz:** A paginação é **client-side** (slice de `softwareAllItems`), mas os dados vêm de uma API com **cursor pagination**. O `useInfiniteQuery` só carrega páginas sob demanda via `fetchNextPage()`. Quando o usuário muda de página:

1. `goToNextSoftwarePage` chama `software.fetchNextPage()` (async) + `setSoftwarePage(2)` (sync)
2. O componente re-renderiza com `softwarePage=2` mas `softwareAllItems` ainda só tem 10 itens
3. `softwareItems = softwareAllItems.slice(10, 20)` → **array vazio**
4. Só quando `fetchNextPage` resolve é que os itens aparecem

**Causas secundárias:**

- `useInfiniteQuery` é reinicializado toda vez que `limit`/`order`/`search` mudam (queryKey diferente), perdendo todas as páginas já carregadas
- Dupla chamada de `fetchNextPage`: uma em `goToNextSoftwarePage` e outra no `useEffect` de auto-fetch
- `needsMoreItems` é calculado com `startIdx` da página atual, mas `fetchNextPage` é assíncrono — cria race condition

---

## Plano de Correção

### Etapa 1: Estabilizar `useInfiniteQuery` com `placeholderData`

**Arquivo:** `src/hooks/useAgents.ts` — `useAgentSoftware()`

Adicionar `placeholderData: keepPreviousData` para manter os dados anteriores visíveis durante o refetch:

```ts
import { keepPreviousData } from '@tanstack/react-query';

return useInfiniteQuery({
  queryKey: KEYS.software(id, { ... }),
  queryFn: ({ pageParam }) => agentsApi.getSoftware(id, { ... }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  enabled: !!id,
  placeholderData: keepPreviousData,  // ← ADICIONAR
});
```

**Impacto:** Elimina o flash de tabela vazia durante transições de filtro/página. `softwareAllItems` mantém os dados anteriores até os novos chegarem.

### Etapa 2: Separar estado de "página visual" de "página de cursor"

**Arquivo:** `src/pages/agents/AgentDetail.tsx`

O problema fundamental é misturar cursor pagination (server-side) com slice client-side. A solução mais robusta é **pré-carregar proativamente** as páginas de cursor necessárias antes de permitir a navegação.

Alternativa mais simples e eficaz: substituir o slice client-side por **paginação real via cursor**, onde cada "página visual" corresponde a exatamente uma página de cursor da API.

```tsx
// NOVO: usar página de cursor diretamente, sem slice client-side
const softwareItems = software.data?.pages[softwarePage - 1]?.items ?? [];
const currentPageData = software.data?.pages[softwarePage - 1];
const softwareTotalCount = softwareSnapshot.data?.totalInstalled ?? 0;
const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));
```

E ajustar `goToNextSoftwarePage` / `goToPreviousSoftwarePage`:

```tsx
const goToNextSoftwarePage = () => {
  const nextPage = softwarePage + 1;
  // Se a página de cursor ainda não foi carregada, buscar
  if (!software.data?.pages[nextPage - 1] && software.hasNextPage) {
    software.fetchNextPage();
  }
  setSoftwarePage(nextPage);
};

const goToPreviousSoftwarePage = () => {
  setSoftwarePage((p) => Math.max(1, p - 1));
};
```

### Etapa 3: Corrigir auto-fetch para evitar race condition

Remover a chamada `fetchNextPage` dentro de `goToNextSoftwarePage` e deixar APENAS o `useEffect` gerenciar o auto-fetch:

```tsx
// useEffect de auto-fetch — única fonte de fetchNextPage
useEffect(() => {
  const neededPage = softwarePage;
  const pageLoaded = !!software.data?.pages[neededPage - 1];
  if (
    !pageLoaded &&
    software.hasNextPage &&
    !software.isFetching &&
    !software.isFetchingNextPage
  ) {
    software.fetchNextPage();
  }
}, [
  softwarePage,
  software.data?.pages,
  software.hasNextPage,
  software.isFetching,
  software.isFetchingNextPage,
  software.fetchNextPage,
]);
```

E simplificar `goToNextSoftwarePage`:

```tsx
const goToNextSoftwarePage = () => {
  setSoftwarePage((p) => p + 1);
  // O useEffect acima cuida do fetchNextPage automaticamente
};
```

### Etapa 4: Estabilizar altura da tabela com `min-height`

**Arquivo:** `src/pages/agents/AgentDetail.tsx` — seção da tabela de software

Adicionar `min-height` no container da tabela para evitar colapso durante transições:

```tsx
<div className="relative space-y-3" style={{ minHeight: '400px' }}>
```

### Etapa 5: Ajustar `handleApplySoftwareFilters` para manter posição de scroll

Quando o formulário de busca é submetido, garantir que o foco não mude para o início da página:

```tsx
const handleApplySoftwareFilters = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setSoftwareSearchApplied(softwareSearchInput.trim());
  resetSoftwarePagination();
  // Manter foco no campo de busca para evitar scroll jump
  (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus();
};
```

### Etapa 6: Adicionar `staleTime` adequado

Evitar refetch desnecessário quando o usuário só muda a página (sem mudar filtros):

```ts
return useInfiniteQuery({
  // ... existing config
  staleTime: 30_000, // 30 segundos — evita refetch ao trocar de página
  placeholderData: keepPreviousData,
});
```

---

## Resumo das alterações

| Arquivo                            | Alteração                                                   | Impacto                         |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `src/hooks/useAgents.ts`           | Adicionar `placeholderData: keepPreviousData` + `staleTime` | Elimina flash de tabela vazia   |
| `src/pages/agents/AgentDetail.tsx` | Refatorar paginação (cursor pages → visual pages)           | Paginação funciona corretamente |
| `src/pages/agents/AgentDetail.tsx` | Unificar auto-fetch no useEffect                            | Elimina race condition          |
| `src/pages/agents/AgentDetail.tsx` | Adicionar `min-height` na tabela                            | Previne collapse de altura      |
| `src/pages/agents/AgentDetail.tsx` | Manter foco no input após busca                             | Reduz scroll jump               |

## Ordem de implementação

1. **Primeiro:** `placeholderData` no hook (resolve flash de vazio)
2. **Segundo:** Refatorar paginação (resolve dados não mudando)
3. **Terceiro:** Unificar auto-fetch (resolve race condition)
4. **Quarto:** `min-height` + foco (melhorias de UX)
5. **Quinto:** `staleTime` (otimização)

---

## Nota sobre o design atual

A abordagem atual de "carregar todas as páginas de cursor e fazer slice client-side" funciona para datasets pequenos mas tem problemas:

- Para 106 itens com limit=10, são necessárias 11 chamadas de API para carregar tudo
- O `useInfiniteQuery` foi projetado para infinite scroll, não para paginação tradicional
- A alternativa proposta (1 página de cursor = 1 página visual) é mais alinhada com o modelo mental do cursor pagination
