import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticlePagesTree from './ArticlePagesTree';

const NODES = [
  {
    id: 'p1',
    articleId: 'a1',
    parentPageId: null,
    title: 'Redes',
    content: '',
    sortOrder: 0,
    childCount: 1,
    children: [
      {
        id: 'p1-1',
        articleId: 'a1',
        parentPageId: 'p1',
        title: 'VPN',
        content: '',
        sortOrder: 0,
        childCount: 0,
        children: [],
      },
    ],
  },
  {
    id: 'p2',
    articleId: 'a1',
    parentPageId: null,
    title: 'Impressoras',
    content: '',
    sortOrder: 1,
    childCount: 0,
    children: [],
  },
];

describe('ArticlePagesTree keyboard navigation', () => {
  it('navigates between home and subpages with arrow keys', () => {
    const onSelect = vi.fn();
    const onSelectHome = vi.fn();

    render(
      <ArticlePagesTree
        nodes={NODES}
        activePageId={null}
        homeLabel="Início"
        homeActive={true}
        onSelect={onSelect}
        onSelectHome={onSelectHome}
      />,
    );

    const homeItem = screen.getByRole('treeitem', { name: /Início/i });
    homeItem.focus();
    fireEvent.keyDown(homeItem, { key: 'ArrowDown' });

    const redesItem = screen.getByRole('treeitem', { name: /Redes/i });
    expect(document.activeElement).toBe(redesItem);

    fireEvent.keyDown(redesItem, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('p1');
  });
});
