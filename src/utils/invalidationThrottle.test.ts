import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelScheduledInvalidations,
  invalidateThrottled,
} from "./invalidationThrottle";

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value,
    configurable: true,
  });
}

describe("invalidateThrottled", () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    queryClient = new QueryClient();
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    cancelScheduledInvalidations(queryClient);
    setVisibility("visible");
    vi.useRealTimers();
  });

  it("invalida imediatamente a primeira chamada (leading edge)", () => {
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dashboard", "global", "24h"],
      refetchType: "active",
    });
  });

  it("coalesce a rajada em uma única invalidação no fim da janela", async () => {
    // Primeira chamada roda na hora...
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    // ...as demais dentro da janela são agendadas (trailing edge), não perdidas.
    await vi.advanceTimersByTimeAsync(1_000);
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    await vi.advanceTimersByTimeAsync(1_000);
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    await vi.advanceTimersByTimeAsync(1_000);
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);

    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(7_000);
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("não invalida duas vezes seguidas para a mesma chave dentro da janela", async () => {
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);

    // Só a chamada imediata + uma agendada.
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("mantém janelas independentes por query key", () => {
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    invalidateThrottled(queryClient, ["realtime", "stats"], 10_000);

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("com a aba oculta não gera requisição e atualiza ao voltar a ficar visível", async () => {
    setVisibility("hidden");

    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);
    invalidateThrottled(queryClient, ["dashboard", "global", "24h"], 10_000);

    // Apenas marcação de "stale" (refetchType none), nenhum fetch ativo.
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dashboard", "global", "24h"],
      refetchType: "none",
    });

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(invalidateSpy).toHaveBeenLastCalledWith({
      queryKey: ["dashboard", "global", "24h"],
      refetchType: "active",
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });
});
