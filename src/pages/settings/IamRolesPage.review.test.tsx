import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IamRolesPage from './IamRolesPage';
import { ApiError } from '@/api';

/**
 * REVISÃO ADVERSARIAL — IamRolesPage (atribuição/remoção EM LOTE).
 *
 * Ataca o CONJUNTO: página + PermissionMultiSelect + hooks de lote + contrato da API.
 * Nenhum teste aqui repete o caminho feliz: cada um tenta quebrar um gate, vazar
 * estado entre as duas listas (atribuir x remover), disparar hook unitário no fluxo
 * em lote, ou transformar uma resposta vazia em mensagem mentirosa.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks dos hooks. Os UNITÁRIOS são espiões de primeira classe porque a hipótese
// 5 exige PROVAR que eles não são chamados pelo fluxo em lote.
// ─────────────────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  roles: [] as Array<Record<string, unknown>>,
  catalog: [] as Array<Record<string, unknown>>,
  linked: [] as Array<Record<string, unknown>>,
  rolesLoading: false,
  catalogLoading: false,
  linkedLoading: false,
  bulkAdd: vi.fn(),
  bulkRemove: vi.fn(),
  unitAdd: vi.fn(),
  unitRemove: vi.fn(),
  hasAnyPermission: vi.fn(() => true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    session: {
      stage: 'authenticated',
      accessToken: 'token-de-teste',
      refreshToken: 'refresh',
      temporaryMfaToken: null,
      expiresAt: Date.now() + 60_000,
      loginResponse: null,
    },
  }),
}));

vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission: mocks.hasAnyPermission }),
}));

vi.mock('@/hooks', () => ({
  useIamRoles: () => ({
    data: mocks.roles,
    isLoading: mocks.rolesLoading,
    isError: false,
    refetch: vi.fn(),
  }),
  useIamPermissionsCatalog: () => ({
    data: mocks.catalog,
    isLoading: mocks.catalogLoading,
    isError: false,
    refetch: vi.fn(),
  }),
  useIamRolePermissions: () => ({
    data: mocks.linked,
    isLoading: mocks.linkedLoading,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateIamRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateIamRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteIamRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  // Hooks de LOTE (caminho esperado pelo fluxo).
  useBulkAddIamRolePermissions: () => ({ isPending: false, mutateAsync: mocks.bulkAdd }),
  useBulkRemoveIamRolePermissions: () => ({ isPending: false, mutateAsync: mocks.bulkRemove }),
  // Hooks UNITÁRIOS: existem para a linha "Remover a permissão X", mas NÃO podem
  // ser tocados pelo botão de lote.
  useAddIamRolePermission: () => ({ isPending: false, mutateAsync: mocks.unitAdd, mutate: mocks.unitAdd }),
  useRemoveIamRolePermission: () => ({ isPending: false, mutateAsync: mocks.unitRemove, mutate: mocks.unitRemove }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_CUSTOM = {
  id: 'role-1',
  name: 'Operador',
  description: 'Role de operação',
  mfaRequirement: 'None',
  isSystem: false,
  isActive: true,
};

const ROLE_SISTEMA = {
  id: 'role-sys',
  name: 'Administrador do sistema',
  description: 'Role de sistema',
  mfaRequirement: 'Fido2',
  isSystem: true,
  isActive: true,
};

/** Catálogo no formato REAL da API: code + name (`code - name` no rótulo). */
function catalogo(total = 5): Array<Record<string, unknown>> {
  const recursos = ['Users', 'Roles', 'Agents', 'Patches', 'Tickets'];
  return Array.from({ length: total }, (_, indice) => {
    const recurso = recursos[indice % recursos.length];
    const acao = `Acao${String(indice).padStart(3, '0')}`;
    return {
      id: `cat-${indice}`,
      code: `${recurso}.${acao}`,
      name: `${acao} descrita`,
      resourceType: recurso,
    };
  });
}

function renderPagina() {
  return render(
    <MemoryRouter>
      <IamRolesPage />
    </MemoryRouter>,
  );
}

/** Clica na linha da role na DataTable para abrir o painel de permissões. */
function abrirPainel(nomeDaRole: string) {
  fireEvent.click(screen.getByText(nomeDaRole));
}

function buscarNoCatalogo(termo: string) {
  fireEvent.change(screen.getByLabelText('Buscar permissão'), { target: { value: termo } });
}

function buscarNasVinculadas(termo: string) {
  fireEvent.change(screen.getByLabelText('Buscar entre as permissões vinculadas...'), {
    target: { value: termo },
  });
}

/**
 * O botão de lote tem TEXTO e aria-label diferentes ("Selecionar todas as N
 * vinculadas" x "Selecionar todas as N permissões vinculadas visíveis"). O nome
 * acessível é o aria-label; este helper casa pelos dois sem acoplar ao texto exato.
 */
function botaoLoteVinculadas(total: number): HTMLButtonElement {
  return screen.getByRole('button', {
    name: new RegExp(`Selecionar todas? as ${total}`),
  }) as HTMLButtonElement;
}

/** Alterna um checkbox do catálogo pelo rótulo composto (`code - name`). */
function marcarNoCatalogo(rotulo: string) {
  fireEvent.click(screen.getByLabelText(rotulo));
}

beforeEach(() => {
  mocks.roles = [ROLE_CUSTOM];
  mocks.catalog = catalogo(5);
  mocks.linked = [];
  mocks.rolesLoading = false;
  mocks.catalogLoading = false;
  mocks.linkedLoading = false;
  mocks.hasAnyPermission.mockReturnValue(true);
  mocks.bulkAdd.mockReset().mockResolvedValue({ added: 0, skipped: 0 });
  mocks.bulkRemove.mockReset().mockResolvedValue({ removed: 0, skipped: 0 });
  mocks.unitAdd.mockReset().mockResolvedValue({});
  mocks.unitRemove.mockReset().mockResolvedValue({});
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REVIEW IamRolesPage — hipótese 3: as duas listas NÃO vazam estado', () => {
  it('marcar para ATRIBUIR não seleciona nada na lista de REMOÇÃO', async () => {
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    // Marca 2 no catálogo (cat-3 e cat-4 são os NÃO vinculados).
    marcarNoCatalogo('Patches.Acao003 - Acao003 descrita');
    marcarNoCatalogo('Tickets.Acao004 - Acao004 descrita');

    // O botão de ATRIBUIR passou a contar 2...
    expect(screen.getByRole('button', { name: 'Atribuir 2 permissão(ões) selecionada(s)' })).toBeTruthy();
    // ...e o de REMOVER continua em 0: nenhum vazamento entre as listas.
    expect(screen.getByRole('button', { name: 'Remover 0 permissão(ões) selecionada(s)' })).toBeTruthy();
  });

  it('selecionar para REMOVER não enche o multi-select de atribuição', async () => {
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    // Seleciona uma vinculada para remoção.
    const primeiraVinculada = 'Selecionar Users.Acao000 - Acao000 descrita';
    fireEvent.click(screen.getByLabelText(primeiraVinculada));

    // O contador de ATRIBUIÇÃO continua em zero.
    expect(screen.getByRole('button', { name: /Atribuir 0 permissão\(ões\) selecionada\(s\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover 1 permissão(ões) selecionada(s)' })).toBeTruthy();
  });

  it('permissão JÁ vinculada aparece travada e marcada no multi-select (nunca como nova)', async () => {
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    // As 2 vinculadas ficam travadas no seletor do catálogo.
    const travados = screen
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).disabled);
    expect(travados.length).toBe(2);

    // Mesmo com 2 travados, o botão de lote oferece apenas as 3 restantes.
    expect(
      screen.getByRole('button', { name: /Selecionar todos os 3 resultados/ }),
    ).toBeTruthy();
  });

  it('alternar entre as duas buscas não transfere seleção de uma para a outra', async () => {
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    buscarNoCatalogo('Users');
    const botaoLote = screen.getByRole('button', { name: /Selecionar todos os \d+ resultados/ });
    fireEvent.click(botaoLote);

    buscarNasVinculadas('Users');
    expect(screen.getByRole('button', { name: 'Remover 0 permissão(ões) selecionada(s)' })).toBeTruthy();
  });
});

describe('REVIEW IamRolesPage — hipótese 4: gates (sistema / canManage / sem claims)', () => {
  it('role de sistema: nenhum controle de lote, nenhum checkbox e nenhuma mutação', async () => {
    mocks.roles = [ROLE_SISTEMA];
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Administrador do sistema');

    expect(screen.queryByLabelText('Buscar permissão')).toBeNull();
    expect(screen.queryByRole('button', { name: /Atribuir \d+ permissão/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remover \d+ permissão/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Selecionar todas as \d+ vinculadas/ })).toBeNull();
    // Nenhum checkbox de seleção (nem do catálogo nem da lista vinculada).
    expect(screen.queryAllByRole('checkbox').length).toBe(0);

    // O aviso de role de sistema continua visível.
    expect(
      screen.getByText('Roles de sistema não podem ser alteradas ou ter permissões modificadas.'),
    ).toBeTruthy();

    expect(mocks.bulkAdd).not.toHaveBeenCalled();
    expect(mocks.bulkRemove).not.toHaveBeenCalled();
    expect(mocks.unitAdd).not.toHaveBeenCalled();
    expect(mocks.unitRemove).not.toHaveBeenCalled();
  });

  it('canManage=false (sem claim de escrita): nenhum controle e nenhuma mutação', async () => {
    mocks.hasAnyPermission.mockReturnValue(false);
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    expect(screen.queryByLabelText('Buscar permissão')).toBeNull();
    expect(screen.queryAllByRole('checkbox').length).toBe(0);
    expect(mocks.bulkAdd).not.toHaveBeenCalled();
    expect(mocks.bulkRemove).not.toHaveBeenCalled();
    // Nem o botão de criar role deve existir.
    expect(screen.queryByRole('button', { name: /Nova role/ })).toBeNull();
  });

  it('sem claims: o gate NÃO libera por padrão (fail-closed)', async () => {
    // Comportamento real de useAuthorization: sem o claim, hasAnyPermission=false.
    mocks.hasAnyPermission.mockReturnValue(false);
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    expect(screen.queryByLabelText('Buscar permissão')).toBeNull();
    expect(screen.queryAllByRole('checkbox').length).toBe(0);
  });
});

describe('REVIEW IamRolesPage — hipótese 5: lote vs unitário (FOCO)', () => {
  it('"Atribuir N selecionada(s)" chama SÓ o hook de lote, com os ids exatos', async () => {
    renderPagina();
    abrirPainel('Operador');

    // Marca dois itens do catálogo (cat-0 = Users, cat-3 = Patches).
    marcarNoCatalogo('Users.Acao000 - Acao000 descrita');
    marcarNoCatalogo('Patches.Acao003 - Acao003 descrita');

    mocks.bulkAdd.mockResolvedValue({ added: 2, skipped: 0 });

    fireEvent.click(screen.getByRole('button', { name: /Atribuir 2 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.bulkAdd).toHaveBeenCalledTimes(1));
    expect(mocks.bulkAdd).toHaveBeenCalledWith({ permissionIds: ['cat-0', 'cat-3'] });

    // PROVA central: nenhum hook unitário foi disparado.
    expect(mocks.unitAdd).not.toHaveBeenCalled();
    expect(mocks.unitRemove).not.toHaveBeenCalled();

    // E uma única requisição em lote (não N chamadas).
    expect(mocks.bulkAdd.mock.calls.length).toBe(1);
  });

  it('"Remover N selecionada(s)" chama SÓ o hook de remoção em lote, com os ids exatos', async () => {
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    fireEvent.click(botaoLoteVinculadas(3));
    mocks.bulkRemove.mockResolvedValue({ removed: 3, skipped: 0 });

    fireEvent.click(screen.getByRole('button', { name: /Remover 3 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.bulkRemove).toHaveBeenCalledTimes(1));
    // A página ordena as vinculadas por GRUPO e depois por rótulo
    // (buildPermissionEntries, IamRolesPage.tsx:326), então a ordem enviada é
    // Agents (cat-2) -> Roles (cat-1) -> Users (cat-0), não a ordem do array de
    // entrada. O contrato que importa é o CONJUNTO de ids, não a ordem.
    const enviados = (mocks.bulkRemove.mock.calls[0][0] as { permissionIds: string[] })
      .permissionIds;
    expect([...enviados].sort()).toEqual(['cat-0', 'cat-1', 'cat-2']);
    expect(enviados.length).toBe(3);
    expect(new Set(enviados).size).toBe(3);
    expect(mocks.unitRemove).not.toHaveBeenCalled();
    expect(mocks.unitAdd).not.toHaveBeenCalled();
    expect(mocks.bulkRemove.mock.calls.length).toBe(1);
  });

  it('window.confirm = false não dispara NENHUMA mutação de remoção', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    fireEvent.click(botaoLoteVinculadas(3));
    fireEvent.click(screen.getByRole('button', { name: /Remover 3 permissão\(ões\) selecionada\(s\)/ }));

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.bulkRemove).not.toHaveBeenCalled();
    expect(mocks.unitRemove).not.toHaveBeenCalled();
    // A seleção continua de pé (o operador cancelou, não perdeu o trabalho).
    expect(screen.getByRole('button', { name: /Remover 3 permissão\(ões\) selecionada\(s\)/ })).toBeTruthy();
  });

  it('o botão de LOTE nunca cai no hook unitário nem quando o lote falha', async () => {
    mocks.bulkAdd.mockRejectedValue(new ApiError(400, 'Lote inválido.'));
    renderPagina();
    abrirPainel('Operador');

    marcarNoCatalogo('Users.Acao000 - Acao000 descrita');
    fireEvent.click(screen.getByRole('button', { name: /Atribuir 1 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.unitAdd).not.toHaveBeenCalled();
  });

  it('o botão unitário da linha ("Remover a permissão X") continua sendo o único uso do hook unitário', async () => {
    mocks.linked = catalogo(1);
    renderPagina();
    abrirPainel('Operador');

    // cat-0 é a permissão vinculada "Rótulo do recurso 0".
    fireEvent.click(screen.getByLabelText('Remover a permissão Users.Acao000 - Acao000 descrita'));

    await waitFor(() => expect(mocks.unitRemove).toHaveBeenCalledTimes(1));
    // react-query chama mutate(variables, options): o 1º argumento é o id.
    expect(mocks.unitRemove.mock.calls[0][0]).toBe('cat-0');
    // E ele NÃO é o hook de lote.
    expect(mocks.bulkRemove).not.toHaveBeenCalled();
  });
});

describe('REVIEW IamRolesPage — hipótese 6: erro de rede/ApiError', () => {
  it('falha no lote de ATRIBUIÇÃO: toast com a mensagem da ApiError e seleção preservada', async () => {
    mocks.bulkAdd.mockRejectedValue(new ApiError(409, 'Permissão já concedida por outra role.'));
    renderPagina();
    abrirPainel('Operador');

    marcarNoCatalogo('Users.Acao000 - Acao000 descrita');
    fireEvent.click(screen.getByRole('button', { name: /Atribuir 1 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Permissão já concedida por outra role.'));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    // A seleção NÃO pode sumir: o operador precisa poder tentar de novo.
    expect(screen.getByRole('button', { name: /Atribuir 1 permissão\(ões\) selecionada\(s\)/ })).toBeTruthy();
    expect((screen.getByLabelText('Users.Acao000 - Acao000 descrita') as HTMLInputElement).checked).toBe(true);
  });

  it('falha no lote de REMOÇÃO: toast com a mensagem da ApiError e seleção preservada', async () => {
    mocks.bulkRemove.mockRejectedValue(new ApiError(403, 'Roles de sistema não podem ser alteradas.'));
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    fireEvent.click(botaoLoteVinculadas(2));
    fireEvent.click(screen.getByRole('button', { name: /Remover 2 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Roles de sistema não podem ser alteradas.'),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // Seleção preservada após o erro.
    expect(screen.getByRole('button', { name: /Remover 2 permissão\(ões\) selecionada\(s\)/ })).toBeTruthy();
  });

  it('erro NÃO-ApiError cai no fallback textual (nunca "undefined" no toast)', async () => {
    mocks.bulkAdd.mockRejectedValue(new Error('rede caiu'));
    renderPagina();
    abrirPainel('Operador');

    marcarNoCatalogo('Users.Acao000 - Acao000 descrita');
    fireEvent.click(screen.getByRole('button', { name: /Atribuir 1 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    const mensagem = mocks.toastError.mock.calls[0][0] as string;
    expect(mensagem).toBe('Não foi possível atribuir as permissões.');
    expect(mensagem).not.toContain('undefined');
  });
});

describe('REVIEW IamRolesPage — hipótese 7: idempotência ({added:0, skipped:N})', () => {
  it('{added:0, skipped:N} NÃO pode virar "N atribuídas"', async () => {
    // Cenário real de idempotência: o operador seleciona só o que está atribuível
    // (as vinculadas nem são clicáveis), mas o backend responde que nada foi
    // adicionado porque outra sessão já vinculou tudo antes.
    mocks.bulkAdd.mockResolvedValue({ added: 0, skipped: 2 });
    mocks.linked = catalogo(3); // cat-0..cat-2 vinculadas
    mocks.catalog = catalogo(5); // cat-3 e cat-4 atribuíveis
    renderPagina();
    abrirPainel('Operador');

    marcarNoCatalogo('Patches.Acao003 - Acao003 descrita');
    marcarNoCatalogo('Tickets.Acao004 - Acao004 descrita');

    fireEvent.click(screen.getByRole('button', { name: /Atribuir 2 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    const mensagem = mocks.toastSuccess.mock.calls[0][0] as string;
    expect(mensagem).toBe('0 permissão(ões) atribuída(s). 2 já estava(m) vinculada(s).');
    // A mensagem NÃO pode afirmar que 2 foram atribuídas.
    expect(mensagem.startsWith('2 permissão(ões) atribuída(s)')).toBe(false);
  });

  it('{removed:0, skipped:2} NÃO pode virar "2 removidas"', async () => {
    mocks.bulkRemove.mockResolvedValue({ removed: 0, skipped: 2 });
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    fireEvent.click(botaoLoteVinculadas(2));
    fireEvent.click(screen.getByRole('button', { name: /Remover 2 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    const mensagem = mocks.toastSuccess.mock.calls[0][0] as string;
    expect(mensagem).toBe('0 permissão(ões) removida(s). 2 não estava(m) vinculada(s).');
    expect(mensagem.startsWith('2 permissão(ões) removida(s)')).toBe(false);
  });

  it('sucesso real ({added:2, skipped:1}) reporta as duas contagens corretamente', async () => {
    mocks.bulkAdd.mockResolvedValue({ added: 2, skipped: 1 });
    renderPagina();
    abrirPainel('Operador');

    marcarNoCatalogo('Users.Acao000 - Acao000 descrita');
    marcarNoCatalogo('Roles.Acao001 - Acao001 descrita');
    marcarNoCatalogo('Agents.Acao002 - Acao002 descrita');

    fireEvent.click(screen.getByRole('button', { name: /Atribuir 3 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      '2 permissão(ões) atribuída(s). 1 já estava(m) vinculada(s).',
    );
  });
});

describe('REVIEW IamRolesPage — hipótese 1 (página) e 8: escala e acessibilidade', () => {
  it('catálogo de 150 itens renderiza, filtra e o lote manda só o subconjunto visível', async () => {
    mocks.catalog = catalogo(150);
    mocks.bulkAdd.mockResolvedValue({ added: 5, skipped: 0 });
    renderPagina();
    abrirPainel('Operador');

    expect(screen.getAllByRole('checkbox').length).toBe(150);

    buscarNoCatalogo('Users.');
    const visiveis = screen.getAllByRole('checkbox');
    expect(visiveis.length).toBe(30); // 150 / 5 recursos

    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 30 resultados/ }));
    fireEvent.click(screen.getByRole('button', { name: /Atribuir 30 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.bulkAdd).toHaveBeenCalledTimes(1));
    const enviados = (mocks.bulkAdd.mock.calls[0][0] as { permissionIds: string[] }).permissionIds;
    expect(enviados.length).toBe(30);
    expect(new Set(enviados).size).toBe(30);
    // Só ids do recurso Users (índices múltiplos de 5 no catálogo sintético).
    expect(enviados.every((id) => Number(id.replace('cat-', '')) % 5 === 0)).toBe(true);
  });

  it('todo checkbox tem nome acessível e os botões de lote têm rótulo textual', async () => {
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    for (const checkbox of screen.getAllByRole('checkbox')) {
      const nome = checkbox.getAttribute('aria-label');
      expect(nome).toBeTruthy();
      expect(screen.getByLabelText(nome!)).toBeTruthy();
    }

    // Botões de lote anunciam a contagem no próprio nome acessível.
    expect(botaoLoteVinculadas(2)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover 0 permissão(ões) selecionada(s)' })).toBeTruthy();
  });

  it('ação destrutiva é <button> focável, não <div onClick>', async () => {
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    fireEvent.click(botaoLoteVinculadas(2));

    const botaoRemover = screen.getByRole('button', { name: /Remover 2 permissão\(ões\) selecionada\(s\)/ });
    expect(botaoRemover.tagName).toBe('BUTTON');
    expect(botaoRemover.getAttribute('disabled')).toBeNull();
  });

  it('resumo das vinculadas é anunciado em aria-live="polite"', async () => {
    mocks.linked = catalogo(2);
    renderPagina();
    abrirPainel('Operador');

    const regioes = Array.from(document.querySelectorAll('[aria-live="polite"]'));
    expect(regioes.some((r) => /vinculada\(s\) exibida\(s\)/.test(r.textContent ?? ''))).toBe(true);
  });
});

describe('REVIEW IamRolesPage — lista vinculada: filtro não perde seleção', () => {
  it('filtro que esconde uma vinculada SELECIONADA não a remove do lote', async () => {
    mocks.linked = catalogo(5);
    mocks.bulkRemove.mockResolvedValue({ removed: 2, skipped: 0 });
    renderPagina();
    abrirPainel('Operador');

    // Seleciona TODAS as 5 vinculadas.
    fireEvent.click(botaoLoteVinculadas(5));

    // Filtra por Users (esconde 4 das 5) — o botão de lote deve continuar contando 5.
    buscarNasVinculadas('Users.');
    expect(screen.getByRole('button', { name: /Remover 5 permissão\(ões\) selecionada\(s\)/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Remover 5 permissão\(ões\) selecionada\(s\)/ }));

    await waitFor(() => expect(mocks.bulkRemove).toHaveBeenCalledTimes(1));
    // As 5 continuam sendo removidas, inclusive as escondidas pelo filtro.
    expect((mocks.bulkRemove.mock.calls[0][0] as { permissionIds: string[] }).permissionIds.length).toBe(5);
  });

  it('filtro sem resultado mostra a mensagem e não permite lote vazio', async () => {
    mocks.linked = catalogo(3);
    renderPagina();
    abrirPainel('Operador');

    buscarNasVinculadas('zzz-nao-existe');

    expect(screen.getByText('Nenhuma permissão vinculada corresponde ao filtro.')).toBeTruthy();
    expect(botaoLoteVinculadas(0).disabled).toBe(true);
  });
});
