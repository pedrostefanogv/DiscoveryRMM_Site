import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./ProfilePage";

const mocks = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  security: null as Record<string, unknown> | null,
  keys: undefined as Array<Record<string, unknown>> | undefined,
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

vi.mock("@/hooks", () => ({
  useMyProfile: () => ({ data: mocks.profile, isLoading: false, isError: false, refetch: vi.fn() }),
  useMySecurity: () => ({ data: mocks.security, isLoading: false, isError: false, refetch: vi.fn() }),
  useMfaKeys: () => ({ data: mocks.keys, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateMyProfile: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useChangeMyPassword: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRenameMfaKey: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteMfaKey: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useNowTick: () => Date.now(),
}));

const PROFILE = {
  login: "ana",
  email: "ana@empresa.com",
  fullName: "Ana",
};

const KEY = {
  id: "k1",
  name: "YubiKey 5C",
  keyType: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  lastUsedAt: null,
};

beforeEach(() => {
  mocks.profile = PROFILE;
  mocks.security = {
    mfaRequired: true,
    mfaConfigured: true,
    roleMfaRequirement: "Fido2",
    keys: [KEY],
  };
  mocks.keys = [KEY];
});

describe("ProfilePage", () => {
  it("renderiza sem quebrar quando o payload de segurança não traz keys", () => {
    // Regressão do erro em produção: "can't access property length, q.keys is undefined".
    mocks.security = {
      mfaRequired: true,
      mfaConfigured: false,
      roleMfaRequirement: "Fido2",
    };
    mocks.keys = undefined;

    render(<ProfilePage />);

    expect(screen.getByText(/0 chave/)).toBeTruthy();
    expect(
      screen.getByText("Nenhuma chave de autenticação cadastrada para este usuário."),
    ).toBeTruthy();
  });

  it("lista as chaves do endpoint /mfa/keys", () => {
    render(<ProfilePage />);

    expect(screen.getByText("YubiKey 5C")).toBeTruthy();
    expect(screen.getByText(/1 chave/)).toBeTruthy();
  });

  it("usa security.keys como fallback quando o endpoint não devolveu chaves", () => {
    mocks.keys = [];

    render(<ProfilePage />);

    expect(screen.getByText("YubiKey 5C")).toBeTruthy();
    expect(
      screen.queryByText("Nenhuma chave de autenticação cadastrada para este usuário."),
    ).toBeNull();
  });

  it("mostra a política mínima de senha em vez de exigir 8 caracteres", () => {
    render(<ProfilePage />);

    expect(screen.getByText("Mínimo de 12 caracteres.")).toBeTruthy();
  });
});
