import { describe, expect, it } from 'vitest';
import { upsertCommentPage } from './commentPages';

describe('upsertCommentPage', () => {
  it('adiciona uma página nova', () => {
    const result = upsertCommentPage([], undefined, [{ id: 'a' }]);
    expect(result).toEqual([{ cursor: undefined, items: [{ id: 'a' }] }]);
  });

  it('substitui os itens quando a mesma página é refeita (regressão do comentário)', () => {
    const first = upsertCommentPage([], undefined, [{ id: 'a' }]);
    const afterRefetch = upsertCommentPage(first, undefined, [{ id: 'novo' }, { id: 'a' }]);

    expect(afterRefetch).toEqual([{ cursor: undefined, items: [{ id: 'novo' }, { id: 'a' }] }]);
  });

  it('mantém páginas diferentes e atualiza só a do cursor correspondente', () => {
    let pages = upsertCommentPage([], undefined, [{ id: 'p1' }]);
    pages = upsertCommentPage(pages, 'c2', [{ id: 'p2' }]);
    pages = upsertCommentPage(pages, 'c2', [{ id: 'p2-atualizada' }]);

    expect(pages).toEqual([
      { cursor: undefined, items: [{ id: 'p1' }] },
      { cursor: 'c2', items: [{ id: 'p2-atualizada' }] },
    ]);
  });
});
