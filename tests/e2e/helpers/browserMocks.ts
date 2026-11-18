import { vi } from "vitest";

export interface RecordedFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string | null;
  bodyJson: unknown;
}

export type FetchRouteHandler = (
  req: RecordedFetchCall,
) => Response | Promise<Response> | { status?: number; body?: unknown; headers?: Record<string, string> };

export interface FetchRoute {
  method?: string;
  match: string | RegExp | ((url: string) => boolean);
  handler: FetchRouteHandler;
}

export function installFetchMock(routes: FetchRoute[]) {
  const calls: RecordedFetchCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(rawHeaders)) {
      for (const [k, v] of rawHeaders) {
        headers[k.toLowerCase()] = v;
      }
    } else if (rawHeaders && typeof rawHeaders === "object") {
      for (const [k, v] of Object.entries(rawHeaders)) {
        headers[k.toLowerCase()] = String(v);
      }
    }

    let bodyText: string | null = null;
    if (typeof init?.body === "string") {
      bodyText = init.body;
    } else if (init?.body != null) {
      if (init.body instanceof URLSearchParams) {
        bodyText = init.body.toString();
      } else if (ArrayBuffer.isView(init.body)) {
        bodyText = new TextDecoder().decode(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        bodyText = new TextDecoder().decode(new Uint8Array(init.body));
      }
    } else if (input instanceof Request && input.body != null) {
      try {
        bodyText = await input.clone().text();
      } catch {
        bodyText = null;
      }
    }
    let bodyJson: unknown = null;
    if (bodyText && bodyText.trimStart().startsWith("{")) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = null;
      }
    }

    const reqRecord: RecordedFetchCall = { url, method, headers, bodyText, bodyJson };
    calls.push(reqRecord);

    for (const route of routes) {
      if (route.method && route.method.toUpperCase() !== method) continue;
      const matched =
        typeof route.match === "string"
          ? url.includes(route.match)
          : route.match instanceof RegExp
            ? route.match.test(url)
            : route.match(url);
      if (!matched) continue;

      const res = await route.handler(reqRecord);
      if (res instanceof Response) return res;
      const status = res.status ?? 200;
      const resHeaders: Record<string, string> = {
        "content-type": "application/json",
        ...res.headers,
      };
      const serialized =
        typeof res.body === "string"
          ? res.body
          : res.body === undefined
            ? ""
            : JSON.stringify(res.body);
      return new Response(serialized, { status, headers: resHeaders });
    }

    return new Response(JSON.stringify({ message: `Unmocked fetch: ${method} ${url}` }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export interface FakePrintWindowRecord {
  url?: string | URL;
  target?: string;
  features?: string;
  writtenHtml: string;
  closed: boolean;
  focusMock: ReturnType<typeof vi.fn>;
  printMock: ReturnType<typeof vi.fn>;
  closeMock: ReturnType<typeof vi.fn>;
}

export function installWindowOpenMock(options: { blocked?: boolean } = {}) {
  const opened: FakePrintWindowRecord[] = [];

  const openSpy = vi.spyOn(window, "open").mockImplementation((url, target, features) => {
    if (options.blocked) {
      opened.push({
        url,
        target,
        features,
        writtenHtml: "",
        closed: false,
        focusMock: vi.fn(),
        printMock: vi.fn(),
        closeMock: vi.fn(),
      });
      return null;
    }

    const record: FakePrintWindowRecord = {
      url,
      target,
      features,
      writtenHtml: "",
      closed: false,
      focusMock: vi.fn(),
      printMock: vi.fn(),
      closeMock: vi.fn(() => {
        record.closed = true;
      }),
    };
    opened.push(record);

    const fakeDoc = {
      readyState: "complete",
      open: vi.fn(),
      write: vi.fn((chunk: string) => {
        record.writtenHtml += chunk;
      }),
      close: vi.fn(),
    };

    return {
      document: fakeDoc,
      focus: record.focusMock,
      print: record.printMock,
      close: record.closeMock,
      closed: false,
      opener: features?.includes("noopener") ? null : window,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
  });

  return { openSpy, opened };
}

export function installMatchMediaMock(initialDark = false) {
  let darkMatches = initialDark;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  const mql = {
    get matches() {
      return darkMatches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null as ((e: MediaQueryListEvent) => void) | null,
    addEventListener: vi.fn((type: string, cb: (e: MediaQueryListEvent) => void) => {
      if (type === "change") listeners.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: (e: MediaQueryListEvent) => void) => {
      if (type === "change") listeners.delete(cb);
    }),
    addListener: vi.fn((cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    }),
    removeListener: vi.fn((cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    }),
    dispatchEvent: vi.fn(() => true),
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => {
      if (query.includes("prefers-color-scheme: dark")) return mql;
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      };
    }),
  });

  return {
    mql,
    setDark(nextDark: boolean) {
      darkMatches = nextDark;
      const evt = {
        matches: nextDark,
        media: "(prefers-color-scheme: dark)",
      } as MediaQueryListEvent;
      for (const cb of listeners) {
        cb(evt);
      }
      if (typeof mql.onchange === "function") {
        mql.onchange(evt);
      }
    },
  };
}

const sharedBroadcastBuses = new Map<string, Set<{
  name: string;
  closed: boolean;
  onmessage: ((event: MessageEvent) => unknown) | null;
  listeners: Set<EventListenerOrEventListenerObject>;
}>>();

export function installBroadcastChannelMock() {
  const original = globalThis.BroadcastChannel;
  const buses = sharedBroadcastBuses;
  const createdChannels: MockBroadcastChannel[] = [];

  class MockBroadcastChannel {
    readonly name: string;
    closed = false;
    onmessage: ((event: MessageEvent) => unknown) | null = null;
    listeners = new Set<EventListenerOrEventListenerObject>();

    constructor(name: string) {
      this.name = name;
      if (!buses.has(name)) buses.set(name, new Set());
      buses.get(name)!.add(this);
      createdChannels.push(this);
    }

    postMessage(data: unknown) {
      if (this.closed) return;
      const peers = buses.get(this.name);
      if (!peers) return;
      for (const peer of peers) {
        if (peer === this || peer.closed) continue;
        queueMicrotask(() => {
          if (peer.closed) return;
          const ev = new MessageEvent("message", { data });
          peer.onmessage?.(ev);
          for (const l of peer.listeners) {
            if (typeof l === "function") l(ev);
            else l.handleEvent(ev);
          }
        });
      }
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "message") this.listeners.add(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "message") this.listeners.delete(listener);
    }

    close() {
      this.closed = true;
      buses.get(this.name)?.delete(this);
    }
  }

  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel as unknown as typeof BroadcastChannel);

  return {
    createdChannels,
    restore() {
      for (const ch of createdChannels) {
        if (!ch.closed) {
          ch.close();
        }
      }
      sharedBroadcastBuses.clear();
      vi.stubGlobal("BroadcastChannel", original);
    },
  };
}

export function installResizeObserverMock() {
  const original = globalThis.ResizeObserver;
  const instances: Array<{ disconnect: ReturnType<typeof vi.fn>; observe: ReturnType<typeof vi.fn> }> = [];

  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(_cb: ResizeObserverCallback) {
      instances.push(this);
    }
  }

  vi.stubGlobal("ResizeObserver", MockResizeObserver as unknown as typeof ResizeObserver);
  return {
    instances,
    restore() {
      vi.stubGlobal("ResizeObserver", original);
    },
  };
}

export interface CreatedBitmapRecord {
  blob: Blob;
  type: string;
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
  closed: boolean;
}

export function installCanvasAndBitmapMock() {
  const createdBitmaps: CreatedBitmapRecord[] = [];
  const drawCalls: Array<{ args: unknown[] }> = [];

  const ctx2d = {
    drawImage: vi.fn((...args: unknown[]) => {
      drawCalls.push({ args });
    }),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    })),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
  };

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    ((contextId: string) => (contextId === "2d" ? ctx2d : null)) as never,
  );

  const originalCreateImageBitmap = globalThis.createImageBitmap;
  let deferredResolver: ((bmp: ImageBitmap) => void) | null = null;
  let deferNext = false;

  const createImageBitmapMock = vi.fn(async (source: ImageBitmapSource) => {
    const blob = source instanceof Blob ? source : new Blob([]);
    const record: CreatedBitmapRecord = {
      blob,
      type: blob.type,
      width: 1280,
      height: 720,
      closed: false,
      close: vi.fn(() => {
        record.closed = true;
      }),
    };
    createdBitmaps.push(record);

    const bitmapObj = {
      width: record.width,
      height: record.height,
      close: record.close,
    } as unknown as ImageBitmap;

    if (deferNext) {
      deferNext = false;
      return new Promise<ImageBitmap>((resolve) => {
        deferredResolver = () => resolve(bitmapObj);
      });
    }
    return bitmapObj;
  });

  vi.stubGlobal("createImageBitmap", createImageBitmapMock);

  return {
    createdBitmaps,
    drawCalls,
    ctx2d,
    createImageBitmapMock,
    deferNextBitmap() {
      deferNext = true;
    },
    resolveDeferredBitmap() {
      deferredResolver?.({} as ImageBitmap);
      deferredResolver = null;
    },
    restore() {
      vi.stubGlobal("createImageBitmap", originalCreateImageBitmap);
    },
  };
}

export function installObjectUrlMock() {
  let seq = 0;
  const createdObjects = new Map<string, Blob | MediaSource>();
  const revokedUrls: string[] = [];

  const createSpy = vi
    .spyOn(URL, "createObjectURL")
    .mockImplementation((obj: Blob | MediaSource) => {
      const url = `blob:e2e-mock-${++seq}`;
      createdObjects.set(url, obj);
      return url;
    });

  const revokeSpy = vi
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation((url: string) => {
      revokedUrls.push(url);
    });

  return { createdObjects, revokedUrls, createSpy, revokeSpy };
}
