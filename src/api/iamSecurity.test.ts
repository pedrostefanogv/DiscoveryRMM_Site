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
  it("envia o PRIMEIRO grupo na criação (vínculo atômico) e não mascara falhas dos seguintes", async () => {
    // O primeiro grupo vai no corpo do POST /users (a API cria usuário + senha +
    // vínculo numa transação). Antes todos os vínculos vinham depois, em loop, e
    // uma conta "criada com acesso" podia ficar sem acesso nenhum.
    const bodies: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/users")) {
          bodies.push(JSON.parse(String(init?.body ?? "{}")));
          return jsonResponse({ id: "u1" }, 201);
        }
        if (url.includes("/members")) return jsonResponse({ message: "Permissão insuficiente." }, 403);
        return jsonResponse({}, 404);
      }),
    );

    const result = await iamApi.createUserWithGroups({
      user: { login: "ana", email: "ana@empresa.com", fullName: "Ana", password: "SenhaForte#2026", mfaRequired: true },
      groupIds: ["g1", "g2"],
    });

    // O grupo inicial foi no create.
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { groupId?: string }).groupId).toBe("g1");

    // O primeiro grupo conta como vinculado; só o segundo falha em loop.
    expect(result.id).toBe("u1");
    expect(result.groupsAssigned).toBe(1);
    expect(result.groupsFailed).toHaveLength(1);
    expect(result.groupsFailed[0]!.groupId).toBe("g2");
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
      // O primeiro (g1) vai no create; g2 vira chamada de membro; "" é ignorado.
      groupIds: ["g1", " g2 ", ""],
    });

    expect(result.groupsAssigned).toBe(2);
    expect(result.groupsFailed).toEqual([]);
  });

  it("não envia groupId quando nenhum grupo é informado", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/api/v1/users")) {
          bodies.push(JSON.parse(String(init?.body ?? "{}")));
          return jsonResponse({ id: "u3" }, 201);
        }
        return jsonResponse({}, 404);
      }),
    );

    const result = await iamApi.createUserWithGroups({
      user: { login: "caio", email: "caio@empresa.com", fullName: "Caio", password: "SenhaForte#2026", mfaRequired: true },
      groupIds: [],
    });

    expect((bodies[0] as { groupId?: string }).groupId).toBeUndefined();
    expect(result.groupsAssigned).toBe(0);
    expect(result.groupsFailed).toEqual([]);
  });
});
