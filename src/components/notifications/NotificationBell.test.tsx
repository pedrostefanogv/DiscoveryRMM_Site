import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { markAsReadMock, deleteNotificationMock, notificationMock } = vi.hoisted(() => ({
  markAsReadMock: vi.fn(),
  deleteNotificationMock: vi.fn(),
  notificationMock: {
    id: 'n1',
    eventType: 'agent.offline',
    topic: 'agents',
    severity: 'Warning',
    title: 'Agente offline',
    message: 'O agente ATIVO-01 ficou offline.',
    payloadJson: null,
    isRead: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
}));

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [notificationMock],
    unreadCount: 0,
    isLoading: false,
    isFetching: false,
    markAsRead: markAsReadMock,
    markAllAsRead: vi.fn(),
    deleteNotification: deleteNotificationMock,
    refetch: vi.fn(),
  }),
}));

import { NotificationBell } from './NotificationBell';

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

function openBell() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir notificações' }));
  expect(screen.getByText('Notificações')).toBeTruthy();
}

describe('NotificationBell — card de notificações', () => {
  beforeEach(() => {
    markAsReadMock.mockReset().mockResolvedValue(undefined);
    deleteNotificationMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('fecha automaticamente ao clicar fora do card', () => {
    renderBell();
    openBell();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Notificações')).toBeNull();
  });

  it('não fecha ao clicar dentro do card', () => {
    renderBell();
    openBell();

    fireEvent.mouseDown(screen.getByText('Notificações'));

    expect(screen.getByText('Notificações')).toBeTruthy();
  });

  it('fecha com a tecla Escape', () => {
    renderBell();
    openBell();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Notificações')).toBeNull();
  });

  it('exclui a notificação por um botão acessível, sem abrir o item', () => {
    renderBell();
    openBell();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir notificação' }));

    expect(deleteNotificationMock).toHaveBeenCalledWith('n1');
    expect(markAsReadMock).not.toHaveBeenCalled();
  });

  it('abre a notificação com Enter (navegação por teclado)', () => {
    renderBell();
    openBell();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Agente offline' }), { key: 'Enter' });

    expect(markAsReadMock).toHaveBeenCalledWith('n1');
  });
});
