import { vi } from "vitest";

export interface RecordedXtermInstance {
  cols: number;
  rows: number;
  written: string[];
  disposed: boolean;
  openedInto: HTMLElement | null;
  triggerData: (data: string) => void;
  triggerResize: (cols: number, rows: number) => void;
}

export function createXtermHarness() {
  const instances: RecordedXtermInstance[] = [];

  class MockTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    element: HTMLElement | null = null;
    private dataListeners = new Set<(d: string) => void>();
    private resizeListeners = new Set<(s: { cols: number; rows: number }) => void>();
    private record: RecordedXtermInstance;

    buffer = {
      active: {
        cursorX: 0,
        cursorY: 0,
        viewportY: 0,
        baseY: 0,
        length: 1,
        getLine: (_y: number) => ({
          translateToString: () => "",
        }),
      },
    };

    constructor(opts: Record<string, unknown> = {}) {
      this.options = opts;
      const self = this;
      this.record = {
        get cols() {
          return self.cols;
        },
        get rows() {
          return self.rows;
        },
        written: [],
        disposed: false,
        openedInto: null,
        triggerData: (d: string) => {
          for (const cb of self.dataListeners) cb(d);
        },
        triggerResize: (c: number, r: number) => {
          self.cols = c;
          self.rows = r;
          for (const cb of self.resizeListeners) cb({ cols: c, rows: r });
        },
      };
      instances.push(this.record);
    }

    loadAddon = vi.fn((addon: { activate?: (t: unknown) => void }) => {
      addon?.activate?.(this);
    });

    open = vi.fn((el: HTMLElement) => {
      this.element = el;
      this.record.openedInto = el;
    });

    write = vi.fn((data: string | Uint8Array, cb?: () => void) => {
      const text =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      this.record.written.push(text);
      cb?.();
    });

    writeln = vi.fn((data: string) => {
      this.record.written.push(`${data}\r\n`);
    });

    clear = vi.fn();
    reset = vi.fn();
    focus = vi.fn();
    dispose = vi.fn(() => {
      this.record.disposed = true;
    });
    attachCustomKeyEventHandler = vi.fn();
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => "");
    selectAll = vi.fn();
    scrollToBottom = vi.fn();
    refresh = vi.fn();

    onData = vi.fn((cb: (d: string) => void) => {
      this.dataListeners.add(cb);
      return { dispose: () => this.dataListeners.delete(cb) };
    });

    onResize = vi.fn((cb: (s: { cols: number; rows: number }) => void) => {
      this.resizeListeners.add(cb);
      return { dispose: () => this.resizeListeners.delete(cb) };
    });
  }

  class MockFitAddon {
    activate = vi.fn();
    dispose = vi.fn();
    fit = vi.fn();
    proposeDimensions = vi.fn(() => ({ cols: 120, rows: 36 }));
  }

  class MockGenericAddon {
    activate = vi.fn();
    dispose = vi.fn();
    findNext = vi.fn(() => false);
    findPrevious = vi.fn(() => false);
    clearDecorations = vi.fn();
  }

  return {
    instances,
    Terminal: MockTerminal,
    FitAddon: MockFitAddon,
    WebLinksAddon: MockGenericAddon,
    SearchAddon: MockGenericAddon,
    ClipboardAddon: MockGenericAddon,
    reset() {
      instances.length = 0;
    },
  };
}

export const sharedXtermHarness = createXtermHarness();
