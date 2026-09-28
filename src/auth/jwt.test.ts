import { describe, expect, it } from "vitest";
import { getUserIdFromJwt, getUserNameFromJwt } from "./jwt";

/** Monta um JWT sintaticamente válido (só o payload importa para a leitura). */
function makeToken(payload: Record<string, unknown>): string {
  const base64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `header.${base64url}.signature`;
}

function makeRawToken(base64urlPayload: string): string {
  return `header.${base64urlPayload}.signature`;
}

describe("getUserNameFromJwt", () => {
  it("devolve o login do claim unique_name (autor dos comentarios no backend)", () => {
    expect(getUserNameFromJwt(makeToken({ unique_name: "pedro.stefano" }))).toBe(
      "pedro.stefano",
    );
  });

  it("aceita o claim longo de name como fallback", () => {
    const token = makeToken({
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "tecnico.1",
    });

    expect(getUserNameFromJwt(token)).toBe("tecnico.1");
  });

  it("aceita o claim name como fallback", () => {
    expect(getUserNameFromJwt(makeToken({ name: "suporte" }))).toBe("suporte");
  });

  it("prefere unique_name quando ha mais de um candidato", () => {
    const token = makeToken({ unique_name: "login", name: "Nome Completo" });

    expect(getUserNameFromJwt(token)).toBe("login");
  });

  it("ignora candidatos vazios ou so com espacos", () => {
    expect(getUserNameFromJwt(makeToken({ unique_name: "   " }))).toBeNull();
  });

  it("devolve null para token nulo, curto ou payload invalido", () => {
    expect(getUserNameFromJwt(null)).toBeNull();
    expect(getUserNameFromJwt("")).toBeNull();
    expect(getUserNameFromJwt("sem-segmentos")).toBeNull();
    expect(getUserNameFromJwt(makeRawToken("bm90LWpzb24"))).toBeNull();
  });
});

describe("getUserIdFromJwt", () => {
  it("continua lendo o sub do token", () => {
    expect(getUserIdFromJwt(makeToken({ sub: "user-1" }))).toBe("user-1");
  });
});
