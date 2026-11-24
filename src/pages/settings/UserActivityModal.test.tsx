import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserActivityModal } from "./UserActivityModal";
import type { UserDto } from "@/api";

const mockUseIamUserActivity = vi.fn();
const mockUseIamUserSessions = vi.fn();
const mockUseIamUserSecurityState = vi.fn();
const mockRevokeSessionMutateAsync = vi.fn();
const mockRevokeAllSessionsMutateAsync = vi.fn();

vi.mock("@/hooks", () => ({
  useIamUserActivity: (...args: unknown[]) => mockUseIamUserActivity(...args),
  useIamUserSessions: (...args: unknown[]) => mockUseIamUserSessions(...args),
  useIamUserSecurityState: (...args: unknown[]) =>
    mockUseIamUserSecurityState(...args),
  useRevokeIamUserSession: () => ({
    mutateAsync: mockRevokeSessionMutateAsync,
    isPending: false,
  }),
  useRevokeAllIamUserSessions: () => ({
    mutateAsync: mockRevokeAllSessionsMutateAsync,
    isPending: false,
  }),
}));

const sampleUser: UserDto = {
  id: "user-1",
  login: "pedro",
  email: "pedro@empresa.com",
  fullName: "Pedro Silva",
  isActive: true,
  mfaRequired: true,
  createdAt: "2026-10-01T10:00:00Z",
  lastLoginAt: "2026-11-24T12:00:00Z",
};

describe("UserActivityModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevokeSessionMutateAsync.mockResolvedValue(undefined);
    mockRevokeAllSessionsMutateAsync.mockResolvedValue(undefined);

    mockUseIamUserActivity.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      data: {
        items: [
          {
            id: "auth:1",
            category: "auth",
            eventType: "login_success",
            title: "Login realizado com sucesso",
            summary: "Browser Chrome",
            success: true,
            failureReason: null,
            ipAddress: "10.0.0.15",
            userAgent: "Mozilla/5.0",
            actorLogin: "pedro",
            role: "self",
            targetType: "User",
            targetId: "user-1",
            linkPath: null,
            details: null,
            occurredAt: "2026-11-24T12:00:00Z",
          },
          {
            id: "remote:2",
            category: "remote",
            eventType: "remote.screen",
            title: "Sessão remota (Screen) em SRV-01",
            summary: "Tipo: Screen · Status: closed",
            success: true,
            failureReason: null,
            ipAddress: null,
            userAgent: null,
            actorLogin: "pedro",
            role: "actor",
            targetType: "Agent",
            targetId: "agent-1",
            linkPath: "/agents/agent-1",
            details: "Nota: Manutenção",
            occurredAt: "2026-11-24T11:30:00Z",
          },
        ],
        categoryCounts: { auth: 1, remote: 1 },
        totalReturned: 2,
      },
    });

    mockUseIamUserSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      data: [
        {
          id: "sess-1",
          createdAt: "2026-11-24T12:00:00Z",
          expiresAt: "2026-11-24T20:00:00Z",
          revokedAt: null,
          isActive: true,
          isExpired: false,
          isRevoked: false,
          mfaVerified: true,
          ipAddress: "10.0.0.15",
          userAgent: "Chrome 130",
        },
        {
          id: "sess-2",
          createdAt: "2026-11-23T10:00:00Z",
          expiresAt: "2026-11-23T18:00:00Z",
          revokedAt: "2026-11-23T15:00:00Z",
          isActive: false,
          isExpired: false,
          isRevoked: true,
          mfaVerified: true,
          ipAddress: "10.0.0.12",
          userAgent: "Firefox 129",
        },
      ],
    });

    mockUseIamUserSecurityState.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        id: "user-1",
        isActive: true,
        mfaRequired: true,
        mfaConfigured: true,
        mustChangePassword: false,
        mustChangeProfile: false,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        mfaFailedAttempts: 0,
        mfaLockoutUntil: null,
        lastLoginAt: "2026-11-24T12:00:00Z",
      },
    });
  });

  it("renders summary stats, activity items, and switches category filter", () => {
    render(
      <MemoryRouter>
        <UserActivityModal user={sampleUser} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Atividade e Logs: Pedro Silva"),
    ).toBeDefined();
    expect(screen.getByText("Sessões ativas")).toBeDefined();
    expect(screen.getByText("Regular")).toBeDefined();
    expect(
      screen.getByText("Login realizado com sucesso"),
    ).toBeDefined();
    expect(
      screen.getByText("Sessão remota (Screen) em SRV-01"),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Acesso Remoto/i }));
    expect(mockUseIamUserActivity).toHaveBeenLastCalledWith(
      "user-1",
      "remote",
      100,
      undefined,
    );

    fireEvent.click(screen.getByRole("button", { name: /^30 dias$/i }));
    expect(mockUseIamUserActivity).toHaveBeenLastCalledWith(
      "user-1",
      "remote",
      100,
      30,
    );
  });

  it("displays sessions tab and revokes single and all sessions after confirmation", async () => {
    render(
      <MemoryRouter>
        <UserActivityModal user={sampleUser} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Sessões e acessos/i }),
    );
    expect(screen.getByText("IP: 10.0.0.15")).toBeDefined();
    expect(screen.getByText("IP: 10.0.0.12")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^Encerrar$/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Encerrar sessão/i }),
    );
    await waitFor(() => {
      expect(mockRevokeSessionMutateAsync).toHaveBeenCalledWith("sess-1");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Encerrar todas as sessões/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Encerrar todas$/i }),
    );
    await waitFor(() => {
      expect(mockRevokeAllSessionsMutateAsync).toHaveBeenCalledTimes(1);
    });
  });
});
