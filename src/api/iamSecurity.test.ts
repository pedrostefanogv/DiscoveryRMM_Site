import { afterEach, describe, expect, it, vi } from "vitest";
import { iamApi } from "./iam";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("iamApi.getMySecurity", () => {
  it("normaliza resposta sem a propriedade keys (regressão do crash da ProfilePage)", async () => {
    // Era exatamente o que /users/me/security devolvia antes da correção: um UserDto.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ login: "ana", email: "ana@empresa.com", mfaRequired: true, mfaConfigured: false }),
      ),
    );

    const result = await iamApi.getMySecurity();

    expect(result.keys).toEqual([]);
    expect(result.roleMfaRequirement).toBe("None");
    expect(result.mfaRequired).toBe(true);
  });

  it("preserva as chaves quando o backend as devolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          mfaRequired: true,
          mfaConfigured: true,
          roleMfaRequirement: "Fido2",
          keys: [
            {
              id: "k1",
              name: "YubiKey",
              keyType: 0,
              isActive: true,
              createdAt: "2026-01-01T00:00:00Z",
              lastUsedAt: null,
            },
          ],
        }),
      ),
    );

    const result = await iamApi.getMySecurity();

    expect(result.keys).toHaveLength(1);
    expect(result.keys[0]!.name).toBe("YubiKey");
    expect(result.roleMfaRequirement).toBe("Fido2");
  });
});

describe("iamApi.createUserWithGroups", () => {
  it("não mascara a criação do usuário quando um vínculo de grupo falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/users")) return jsonResponse({ id: "u1" }, 201);
        if (url.includes("/members")) return jsonResponse({ message: "Permissão insuficiente." }, 403);
        return jsonResponse({}, 404);
      }),
    );

    const result = await iamApi.createUserWithGroups({
      user: { login: "ana", email: "ana@empresa.com", fullName: "Ana", password: "SenhaForte#2026", mfaRequired: true },
      groupIds: ["g1", "g2"],
    });

    expect(result.id).toBe("u1");
    expect(result.groupsAssigned).toBe(0);
    expect(result.groupsFailed).toHaveLength(2);
    expect(result.groupsFailed[0]!.message).toContain("Permissão insuficiente");
  });

  it("conta os vínculos aplicados com sucesso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/users")) return jsonResponse({ id: "u2" }, 201);
        return new Response(null, { status: 204 });
      }),
    );

    const result = await iamApi.createUserWithGroups({
      user: { login: "bia", email: "bia@empresa.com", fullName: "Bia", password: "SenhaForte#2026", mfaRequired: true },
      groupIds: ["g1", " g2 ", ""],
    });

    expect(result.groupsAssigned).toBe(2);
    expect(result.groupsFailed).toEqual([]);
  });
});
