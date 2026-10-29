# Padrões de UI — Discovery RMM (Site)

Documento curto com as convenções aplicadas no front. Ao criar/alterar telas,
siga estes padrões para manter consistência visual e de comportamento.

## 1. Cabeçalho de página

Sempre use `PageHeader` (`src/components/ui/PageHeader.tsx`) — nunca `<h1>` manual.

```tsx
<PageHeader
  title="Título da tela"
  description="Uma linha explicando o objetivo da tela."
  onBack={handleGoBack}        // apenas telas de detalhe/edição
>
  <Button>Ação principal</Button>
</PageHeader>
```

- `description` aceita `ReactNode` para casos dinâmicos (ex.: "atualizando…").
- Telas de detalhe usam **somente o ícone** de voltar (`onBack`); o texto fica no
  `aria-label` (`backLabel`). Não duplique botão "Voltar" no corpo da página.
- Ações da página vão em `children` (alinhadas à direita em telas largas).

## 2. Cards

- `Card` + `CardHeader` para blocos de conteúdo.
- **Nada de hover em card estático.** Hover (elevação/sombra) é exclusivo de
  card clicável, via `.glass-card-interactive` (`index.css`).
- Cards clicáveis continuam usando `Card` dentro de `<Link>` quando a ação é
  navegação.

## 3. Tabelas

- Sempre `DataTable` (`src/components/ui/DataTable.tsx`).
- Paginação é **interna** do `DataTable` (`Pagination`); não implemente rodapé
  próprio.
- Listas server-side com cursor: use `Pagination` em **modo cursor**
  (`page`, `totalPages={1}`, `cursor={{...}}`, `showFirstLast={false}`).
- Listas locais com total conhecido: `Pagination` numérico
  (`totalItems` + `pageSize`), que mostra "Mostrando X–Y de Z".
- Exceção intencional: tabelas de agregação curtas (≤5 linhas, ex.: AiCostCockpit,
  PatchesOverview) usam `showPagination={false}`.

## 4. Datas, números e tamanhos

Fonte única: `src/utils/format.ts`. Não use `toLocaleDateString/toLocaleString` direto no JSX.

| Função | Saída |
| --- | --- |
| `formatDate(v)` | `dd/mm/aaaa` |
| `formatDateTime(v, fallback='—')` | `dd/mm/aaaa, hh:mm:ss` |
| `formatDateCompact(v, fallback)` | `dd/mm, hh:mm` |
| `formatDateBrazil(v)` | `dd/mm/aaaa, hh:mm` |
| `formatBytes(v, fallback='—')` | B → TB, 0 casas ≥10 e 1 casa <10 |

- Valor ausente/inválido → `EMPTY_VALUE` (`—`), nunca "Invalid Date".
- "Zero é um dado observável" (ex.: tráfego P2P): passe `fallback = '0 B'`.

## 5. Hover e animação

- Hover apenas em elementos interativos (botão, link, linha clicável, card clicável).
- Feedback sutil: cor/borda. Evite `translateY`/`scale`/`shadow-xl` em cards.
- Transições curtas (`0.15s ease`) e respeitando `prefers-reduced-motion` (já global).

## 6. Acessibilidade mínima

- Elemento clicável não nativo → `role`, `tabIndex={0}` e `onKeyDown` (Enter/Espaço).
- Cabeçalho de coluna ordenável → `aria-sort` + foco por teclado.
- Árvores/listas hierárquicas → `role="tree"` / `role="treeitem"` + `aria-selected`.
- Botões só-ícone → `aria-label` descritivo.

## 7. Estados vazios e carregamento

- `EmptyState` (`src/components/ui/EmptyState.tsx`) para lista vazia dentro de card.
- `Loading` / `ErrorDisplay` para carregamento e erro; não invente spinner local.
