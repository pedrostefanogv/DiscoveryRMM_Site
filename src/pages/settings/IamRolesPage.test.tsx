import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IamRolesPage from "./IamRolesPage";

/**
 * Testes do painel de permissões em LOTE.
 *
 * O mock de "@/hooks" é o ponto central: ele prova que a página usa os hooks de
 * lote (uma chamada com a lista de ids) e NÃO os hooks unitários 1-a-1 — que era
 * justamente a experiência antiga, uma permissão por clique.
 */
const mocks = vi.hoisted(() => ({
  roles: [] as Array<Record<string, unknown>>,
  catalog: [] as Array<Record<string, unknown>>,
  rolePermissions: [] as Array<Record<string, unknown>>,
  canManage: true,
  bulkAddMutateAsync: vi.fn(),
  bulkRemoveMutateAsync: vi.fn(),
  addMutateAsync: vi.fn(),
  removeMutate: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    session: {
      stage: "authenticated",
      accessToken: "token",
      refreshToken: "refresh",
      temporaryMfaToken: null,
      expiresAt: Date.now() + 60_000,
      loginResponse: null,
    },
  }),
}));

vi.mock("@/auth/authorization", () => ({
  useAuthorization: () => ({
    hasAnyPermission: () => mocks.canManage,
    hasPermission: () => mocks.canManage,
  }),
}));

vi.mock("@/hooks", () => ({
  useIamRoles: () => ({
    data: mocks.roles,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useIamPermissionsCatalog: () => ({
    data: mocks.catalog,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useIamRolePermissions: () => ({
    data: mocks.rolePermissions,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateIamRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateIamRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteIamRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAddIamRolePermission: () => ({
    isPending: false,
    mutateAsync: mocks.addMutateAsync,
    mutate: vi.fn(),
  }),
  useRemoveIamRolePermission: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
    mutate: mocks.removeMutate,
  }),
  useBulkAddIamRolePermissions: () => ({
    isPending: false,
    mutateAsync: mocks.bulkAddMutateAsync,
  }),
  useBulkRemoveIamRolePermissions: () => ({
    isPending: false,
    mutateAsync: mocks.bulkRemoveMutateAsync,
  }),
}));

const ROLE_CUSTOM = {
  id: "role-1",
  name: "Operador N1",
  description: "Atende chamados",
  mfaRequirement: "None",
  isSystem: false,
  isActive: true,
};

const ROLE_SYSTEM = {
  id: "role-sys",
  name: "Administrador",
  description: "Role de sistema",
  mfaRequirement: "Fido2",
  isSystem: true,
  isActive: true,
};

const PERM_USERS_VIEW = {
  id: "perm-1",
  code: "Users.View",
  name: "Users:View",
  resourceType: "Users",
  actionType: "View",
};

const PERM_USERS_EDIT = {
  id: "perm-2",
  code: "Users.Edit",
  name: "Users:Edit",
  resourceType: "Users",
  actionType: "Edit",
};

const PERM_AGENTS_VIEW = {
  id: "perm-3",
  code: "Agents.View",
  name: "Agents:View",
  resourceType: "Agents",
  actionType: "View",
};

/** 104 permissões sintéticas: o tamanho real do catálogo em produção. */
function buildLargeCatalog() {
  const permissions: Array<Record<string, unknown>> = [];
  const resources = ["Users", "Agents", "Sites", "Tickets", "Patches", "Reports"];
  const actions = ["View", "Edit", "Create", "Delete"];

  for (let index = 0; index < 104; index += 1) {
    const resource = resources[index % resources.length];
    const action = actions[index % actions.length];
    permissions.push({
      id: `perm-${index}`,
      code: `${resource}.${action}`,
      name: `${resource}:${action} ${index}`,
      resourceType: resource,
      actionType: action,
    });
  }

  return permissions;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <IamRolesPage />
    </MemoryRouter>,
  );
}

/** Seleciona a role na DataTable (o clique na linha abre o painel). */
function selectRole(name: string) {
  fireEvent.click(screen.getByText(name));
}

beforeEach(() => {
  mocks.roles = [ROLE_CUSTOM, ROLE_SYSTEM];
  mocks.catalog = [PERM_USERS_EDIT, PERM_AGENTS_VIEW, PERM_USERS_VIEW];
  mocks.rolePermissions = [PERM_USERS_VIEW];
  mocks.canManage = true;
  mocks.bulkAddMutateAsync = vi.fn().mockResolvedValue({ added: 2, skipped: 0 });
  mocks.bulkRemoveMutateAsync = vi.fn().mockResolvedValue({ removed: 2, skipped: 0 });
  mocks.addMutateAsync = vi.fn().mockResolvedValue({});
  mocks.removeMutate = vi.fn();
});

describe("IamRolesPage - permissões em lote", () => {
  it("renderiza o multi-select e os botões de lote com uma role selecionada", () => {
    renderPage();
    selectRole("Operador N1");

    expect(screen.getByRole("group", { name: "Permissões" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Atribuir 0 permissão\(ões\) selecionada\(s\)/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Remover 0 permissão\(ões\) selecionada\(s\)/ }),
    ).toBeTruthy();
    // A permissão já vinculada continua listada e traz o selo do componente.
    expect(screen.getByText("Já vinculada")).toBeTruthy();
  });

  it("atribui VÁRIAS permissões numa única chamada de lote com os ids certos", async () => {
    renderPage();
    selectRole("Operador N1");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Users.Edit - Users:Edit" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Agents.View - Agents:View" }),
    );

    const assignButton = screen.getByRole("button", {
      name: /Atribuir 2 permissão\(ões\) selecionada\(s\)/,
    });
    fireEvent.click(assignButton);

    await waitFor(() => {
      expect(mocks.bulkAddMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(mocks.bulkAddMutateAsync).toHaveBeenCalledWith({
      permissionIds: ["perm-2", "perm-3"],
    });
    // O fluxo novo não pode disparar a atribuição unitária.
    expect(mocks.addMutateAsync).not.toHaveBeenCalled();
  });

  it("remove VÁRIAS permissões já vinculadas numa única chamada de lote", async () => {
    mocks.rolePermissions = [PERM_USERS_VIEW, PERM_USERS_EDIT];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    selectRole("Operador N1");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Users.View - Users:View" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Users.Edit - Users:Edit" }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Remover 2 permissão\(ões\) selecionada\(s\)/,
      }),
    );

    await waitFor(() => {
      expect(mocks.bulkRemoveMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mocks.bulkRemoveMutateAsync).toHaveBeenCalledWith({
      permissionIds: ["perm-1", "perm-2"],
    });
    // Remoção em lote não usa o hook unitário (que removeria uma por vez).
    expect(mocks.removeMutate).not.toHaveBeenCalled();
  });

  it("não executa o lote de remoção quando a confirmação é recusada", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPage();
    selectRole("Operador N1");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Users.View - Users:View" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Remover 1 permissão\(ões\) selecionada\(s\)/,
      }),
    );

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledTimes(1);
    });
    expect(mocks.bulkRemoveMutateAsync).not.toHaveBeenCalled();
  });

  it("role de sistema não mostra multi-select, checkbox nem botões de lote", () => {
    renderPage();
    selectRole("Administrador");

    expect(screen.queryByRole("group", { name: "Permissões" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Atribuir .* selecionada\(s\)/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Remover .* selecionada\(s\)/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: /Selecionar Users/ }),
    ).toBeNull();
    // A mensagem de role de sistema continua na página.
    expect(
      screen.getByText(
        "Roles de sistema não podem ser alteradas ou ter permissões modificadas.",
      ),
    ).toBeTruthy();
  });

  it("sem claim de permissão de escrita também não mostra os controles de lote", () => {
    mocks.canManage = false;

    renderPage();
    selectRole("Operador N1");

    expect(screen.queryByRole("group", { name: "Permissões" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Atribuir .* selecionada\(s\)/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Remover .* selecionada\(s\)/ }),
    ).toBeNull();
  });

  it("funciona com 104+ permissões no catálogo (busca e seleção em massa)", async () => {
    mocks.catalog = buildLargeCatalog();
    mocks.rolePermissions = [];

    renderPage();
    selectRole("Operador N1");

    // O catálogo inteiro é oferecido ao componente (nada de pré-filtro na página):
    // o contador vivo e o resumo aria-live mostram os 104 de 104.
    expect(
      screen.getAllByText(/104 de 104 permissão\(ões\)/).length,
    ).toBeGreaterThan(0);

    // Busca por NOME dentro do componente: "Agents:Edit 13" casa exatamente uma
    // permissão — filtrar pelo código "Agents.Edit" traria nove.
    const searchBox = screen.getByLabelText("Buscar permissão");
    fireEvent.change(searchBox, { target: { value: "Agents:Edit 13" } });

    await waitFor(() => {
      expect(
        screen.getAllByText(/1 de 104 permissão\(ões\)/).length,
      ).toBeGreaterThan(0);
    });

    // "Selecionar todos os N resultados" age SÓ sobre o filtrado.
    fireEvent.click(
      screen.getByRole("button", { name: /Selecionar todos os 1 resultados/ }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Atribuir 1 permissão\(ões\) selecionada\(s\)/,
      }),
    );

    await waitFor(() => {
      expect(mocks.bulkAddMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.bulkAddMutateAsync).toHaveBeenCalledWith({
      permissionIds: ["perm-13"],
    });
  });

  it("agrupa as permissões vinculadas por recurso e filtra as já vinculadas", async () => {
    mocks.rolePermissions = [PERM_USERS_VIEW, PERM_USERS_EDIT, PERM_AGENTS_VIEW];

    renderPage();
    selectRole("Operador N1");

    // Cabeçalho por recurso com contador por grupo.
    expect(screen.getByText("Agents (1 de 1)")).toBeTruthy();
    expect(screen.getByText("Users (2 de 2)")).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText("Buscar entre as permissões vinculadas..."),
      { target: { value: "agents" } },
    );

    await waitFor(() => {
      expect(screen.getByText(/1 de 3 permissão\(ões\) vinculada\(s\) exibida\(s\)/)).toBeTruthy();
    });

    // A lista vinculada some do grupo Users; o catálogo do multi-select continua
    // oferecendo a permissão (ela é uma opção válida, só não está vinculada aqui).
    const linkedRegion = document.querySelectorAll("section");
    const linkedLabels = Array.from(linkedRegion).flatMap((section) =>
      Array.from(section.querySelectorAll("p.font-medium")).map((node) => node.textContent),
    );
    expect(linkedLabels).toContain("Agents.View - Agents:View");
    expect(linkedLabels).not.toContain("Users.View - Users:View");
  });

  it("mostra contagens honestas no toast usando o retorno {added, skipped}", async () => {
    const toast = (await import("react-hot-toast")).default;
    mocks.bulkAddMutateAsync = vi.fn().mockResolvedValue({ added: 1, skipped: 1 });

    renderPage();
    selectRole("Operador N1");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Users.Edit - Users:Edit" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Agents.View - Agents:View" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Atribuir 2 permissão\(ões\) selecionada\(s\)/,
      }),
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "1 permissão(ões) atribuída(s). 1 já estava(m) vinculada(s).",
      );
    });
  });
});
