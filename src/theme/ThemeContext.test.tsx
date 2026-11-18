import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  THEME_MODE_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "./ThemeContext";

type MatchMediaListener = (e: MediaQueryListEvent) => void;

function createMockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaListener>();

  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((event: string, cb: MatchMediaListener) => {
      if (event === "change") listeners.add(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: MatchMediaListener) => {
      if (event === "change") listeners.delete(cb);
    }),
    addListener: vi.fn((cb: MatchMediaListener) => {
      listeners.add(cb);
    }),
    removeListener: vi.fn((cb: MatchMediaListener) => {
      listeners.delete(cb);
    }),
    dispatchEvent: vi.fn(),
  };

  const matchMedia = vi.fn(() => mql as unknown as MediaQueryList);

  const emitChange = (nextMatches: boolean) => {
    matches = nextMatches;
    const event = {
      matches: nextMatches,
      media: "(prefers-color-scheme: dark)",
    } as MediaQueryListEvent;
    for (const listener of listeners) {
      listener(event);
    }
  };

  return { matchMedia, emitChange };
}

function ThemeConsumer() {
  const { mode, toggleMode, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={toggleMode}>
        toggle
      </button>
      <button type="button" onClick={() => setMode("light")}>
        set-light
      </button>
      <button type="button" onClick={() => setMode("dark")}>
        set-dark
      </button>
    </div>
  );
}

describe("ThemeContext", () => {
  const originalMatchMedia = window.matchMedia;
  const originalLocalStorage = window.localStorage;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: originalLocalStorage,
    });
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("(a) respects OS light preference without writing localStorage on mount", () => {
    const { matchMedia } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();
  });

  it("(b) respects OS dark preference without writing localStorage on mount", () => {
    const { matchMedia } = createMockMatchMedia(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();
  });

  it("(c) tracks OS matchMedia change events dynamically when no preference is stored", () => {
    const { matchMedia, emitChange } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("light");

    act(() => {
      emitChange(true);
    });
    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();

    act(() => {
      emitChange(false);
    });
    expect(screen.getByTestId("mode").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();
  });

  it("(d) persists explicit setMode/toggleMode and stops OS changes from overriding", () => {
    const { matchMedia, emitChange } = createMockMatchMedia(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    const { unmount } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("dark");

    fireEvent.click(screen.getByText("set-light"));
    expect(screen.getByTestId("mode").textContent).toBe("light");
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // OS switches to dark, but explicit stored preference must win
    act(() => {
      emitChange(true);
    });
    expect(screen.getByTestId("mode").textContent).toBe("light");

    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("dark");

    // Remount preserves stored dark even if OS flips to light
    unmount();
    const { matchMedia: lightMatchMedia } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: lightMatchMedia,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("dark");
  });

  it("(e) ignores invalid localStorage values and keeps tracking OS changes", () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, "system");
    const { matchMedia, emitChange } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("light");

    act(() => {
      emitChange(true);
    });
    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("(f) falls back cleanly to dark when matchMedia is missing or localStorage throws", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("SecurityError");
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Calling toggleMode / setMode must not throw when localStorage.setItem throws
    expect(() => {
      fireEvent.click(screen.getByText("toggle"));
    }).not.toThrow();
    expect(screen.getByTestId("mode").textContent).toBe("light");
  });

  it("(g) supports legacy MediaQueryList with only addListener/removeListener", () => {
    let matches = false;
    const listeners = new Set<MatchMediaListener>();
    const addListener = vi.fn((cb: MatchMediaListener) => {
      listeners.add(cb);
    });
    const removeListener = vi.fn((cb: MatchMediaListener) => {
      listeners.delete(cb);
    });

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(
        () =>
          ({
            get matches() {
              return matches;
            },
            media: "(prefers-color-scheme: dark)",
            addListener,
            removeListener,
          }) as unknown as MediaQueryList,
      ),
    });

    const { unmount } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode").textContent).toBe("light");
    expect(addListener).toHaveBeenCalledTimes(1);

    act(() => {
      matches = true;
      for (const listener of listeners) {
        listener({
          matches: true,
          media: "(prefers-color-scheme: dark)",
        } as MediaQueryListEvent);
      }
    });

    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("(h) handles minimal MediaQueryList stubs lacking both addEventListener and addListener", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(
        () =>
          ({
            matches: true,
            media: "(prefers-color-scheme: dark)",
          }) as unknown as MediaQueryList,
      ),
    });

    let unmount!: () => void;
    expect(() => {
      ({ unmount } = render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      ));
    }).not.toThrow();

    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(() => unmount()).not.toThrow();
  });
});
