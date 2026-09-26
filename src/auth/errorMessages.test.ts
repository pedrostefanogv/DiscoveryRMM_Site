import { describe, expect, it } from "vitest";
import { ApiError } from "@/api";
import { GENERIC_AUTH_ERROR_MESSAGE, resolveLoginErrorMessage } from "./errorMessages";

describe("resolveLoginErrorMessage", () => {
  it("mantém a mensagem do servidor para erros de credencial (401)", () => {
    const error = new ApiError(401, "Credenciais inválidas.");
    expect(resolveLoginErrorMessage(error)).toBe("Credenciais inválidas.");
  });

  it("mantém a mensagem do servidor para bloqueio temporário (429)", () => {
    const error = new ApiError(429, "Muitas tentativas. Tente novamente em 5 minutos.");
    expect(resolveLoginErrorMessage(error)).toBe(
      "Muitas tentativas. Tente novamente em 5 minutos.",
    );
  });

  it("esconde a mensagem de infraestrutura em 502 (gateway)", () => {
    const error = new ApiError(502, "Gateway indisponível");
    expect(resolveLoginErrorMessage(error)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("esconde a mensagem de infraestrutura em 503/504", () => {
    expect(resolveLoginErrorMessage(new ApiError(503, "Serviço indisponível"))).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
    expect(
      resolveLoginErrorMessage(new ApiError(504, "Tempo de resposta do gateway excedido")),
    ).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("usa a mensagem genérica para falhas de rede (TypeError)", () => {
    expect(resolveLoginErrorMessage(new TypeError("Failed to fetch"))).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
    expect(resolveLoginErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("usa a mensagem genérica quando o servidor devolve 401 sem texto", () => {
    expect(resolveLoginErrorMessage(new ApiError(401, "   "))).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
  });
});
