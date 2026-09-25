import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackgroundTimer } from "./createBackgroundTimer";

describe("createBackgroundTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // jsdom nao implementa Worker: o helper precisa degradar para o setInterval
  // da janela sem quebrar (e o stop precisa realmente parar).
  it("usa window.setInterval quando Worker nao existe", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();

    const stop = createBackgroundTimer(5_000, onTick);
    vi.advanceTimersByTime(15_000);
    expect(onTick).toHaveBeenCalledTimes(3);

    stop();
    vi.advanceTimersByTime(15_000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });
});
