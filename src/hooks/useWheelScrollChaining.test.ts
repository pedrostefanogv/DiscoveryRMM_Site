import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canScrollInside,
  createWheelChainHandler,
  normalizeWheelDelta,
  scrollNearestScrollableAncestor,
  useWheelScrollChaining,
} from "./useWheelScrollChaining";

/** Elemento com "layout" controlado (jsdom nao calcula scrollHeight/clientHeight). */
function makeScroller(options: {
  scrollTop?: number;
  clientHeight?: number;
  scrollHeight?: number;
} = {}) {
  const el = document.createElement("div");
  const sizes = {
    scrollTop: options.scrollTop ?? 0,
    clientHeight: options.clientHeight ?? 100,
    scrollHeight: options.scrollHeight ?? 200,
  };

  Object.defineProperty(el, "clientHeight", { get: () => sizes.clientHeight, configurable: true });
  Object.defineProperty(el, "scrollHeight", { get: () => sizes.scrollHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    get: () => sizes.scrollTop,
    set: (value: number) => { sizes.scrollTop = value; },
    configurable: true,
  });

  return { el, sizes };
}

function spyOverflowAuto() {
  return vi
    .spyOn(window, "getComputedStyle")
    .mockReturnValue({ overflowY: "auto" } as unknown as CSSStyleDeclaration);
}

function fakeWheelEvent(deltaY: number, deltaMode = 0) {
  return {
    deltaY,
    deltaMode,
    cancelable: true,
    preventDefault: vi.fn(),
  } as unknown as WheelEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeWheelDelta", () => {
  it("converte linhas e paginas para pixels", () => {
    expect(normalizeWheelDelta({ deltaY: 3, deltaMode: 0 })).toBe(3);
    expect(normalizeWheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(normalizeWheelDelta({ deltaY: 2, deltaMode: 2 })).toBe(200);
  });

  it("trata evento ausente", () => {
    expect(normalizeWheelDelta(null)).toBe(0);
    expect(normalizeWheelDelta(undefined)).toBe(0);
  });
});

describe("canScrollInside", () => {
  it("false quando a lista nao tem overflow", () => {
    const { el } = makeScroller({ clientHeight: 200, scrollHeight: 200 });
    expect(canScrollInside(el, 100)).toBe(false);
  });

  it("false apenas no limite da direcao", () => {
    const { el } = makeScroller({ scrollTop: 100, clientHeight: 100, scrollHeight: 200 });
    expect(canScrollInside(el, 100)).toBe(false); // no fim
    expect(canScrollInside(el, -100)).toBe(true); // ainda sobe

    el.scrollTop = 0;
    expect(canScrollInside(el, -100)).toBe(false); // no topo
    expect(canScrollInside(el, 100)).toBe(true); // ainda desce

    el.scrollTop = 50;
    expect(canScrollInside(el, 100)).toBe(true);
    expect(canScrollInside(el, -100)).toBe(true);
  });
});

describe("scrollNearestScrollableAncestor", () => {
  it("rola o ancestral rolavel e suspende/restaura o smooth", () => {
    spyOverflowAuto();
    const { el: list, sizes: listSizes } = makeScroller({ scrollTop: 100 });
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 2000 });
    page.style.scrollBehavior = "smooth";
    page.appendChild(list);

    expect(scrollNearestScrollableAncestor(list, 120)).toBe(true);
    expect(pageSizes.scrollTop).toBe(120);
    // durante a rajada o smooth fica suspenso...
    expect(page.style.scrollBehavior).toBe("auto");
    // ...e e restaurado no frame seguinte
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(page.style.scrollBehavior).toBe("smooth");
        expect(listSizes.scrollTop).toBe(100);
        resolve();
      });
    });
  });

  it("nao mexe em ancestral sem overflow", () => {
    spyOverflowAuto();
    const { el: list } = makeScroller({ scrollTop: 100 });
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 500 });
    page.appendChild(list);

    expect(scrollNearestScrollableAncestor(list, 120)).toBe(false);
    expect(pageSizes.scrollTop).toBe(0);
  });
});

describe("createWheelChainHandler", () => {
  it("no fim da lista: preventDefault e repassa para a pagina", () => {
    spyOverflowAuto();
    const { el: list } = makeScroller({ scrollTop: 100, clientHeight: 100, scrollHeight: 200 });
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 2000 });
    page.appendChild(list);

    const handler = createWheelChainHandler(() => list);
    const event = fakeWheelEvent(120);

    expect(handler(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(pageSizes.scrollTop).toBe(120);
  });

  it("no meio da lista: nao intercepta (rolagem nativa continua)", () => {
    spyOverflowAuto();
    const { el: list } = makeScroller({ scrollTop: 50, clientHeight: 100, scrollHeight: 200 });
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 2000 });
    page.appendChild(list);

    const handler = createWheelChainHandler(() => list);
    const event = fakeWheelEvent(120);

    expect(handler(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pageSizes.scrollTop).toBe(0);
  });

  it("evento nao-cancelavel (fling): nao intercepta", () => {
    spyOverflowAuto();
    const { el: list } = makeScroller({ scrollTop: 100, clientHeight: 100, scrollHeight: 200 });
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 2000 });
    page.appendChild(list);

    const handler = createWheelChainHandler(() => list);
    const event = { ...fakeWheelEvent(120), cancelable: false } as unknown as WheelEvent;

    expect(handler(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pageSizes.scrollTop).toBe(0);
  });

  it("sem elemento: nao quebra", () => {
    const handler = createWheelChainHandler(() => null);
    expect(handler(fakeWheelEvent(120))).toBe(false);
  });
});

describe("useWheelScrollChaining", () => {
  function Probe() {
    const ref = useWheelScrollChaining<HTMLDivElement>();
    return createElement("div", { ref, "data-testid": "list" });
  }

  function withLayout(node: HTMLElement, scrollTop: number) {
    Object.defineProperty(node, "clientHeight", { get: () => 100, configurable: true });
    Object.defineProperty(node, "scrollHeight", { get: () => 200, configurable: true });
    Object.defineProperty(node, "scrollTop", { get: () => scrollTop, configurable: true });
  }

  // O container do render e a propria "pagina", para que o ref do hook (a lista)
  // tenha parentElement rolavel sem reposicionar nos do React.
  function renderInPage(page: HTMLElement) {
    return render(createElement(Probe), { container: page });
  }

  it("encadeia a rolagem para a pagina no fim da lista", () => {
    spyOverflowAuto();
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 2000 });

    const { getByTestId, unmount } = renderInPage(page);
    const list = getByTestId("list") as HTMLElement;
    withLayout(list, 100); // lista no fim

    const notPrevented = list.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );

    expect(notPrevented).toBe(false); // preventDefault foi chamado
    expect(pageSizes.scrollTop).toBe(120);

    unmount();

    // Depois de desmontar o listener sai: o evento volta a ser cancelavel.
    const afterUnmount = list.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );
    expect(afterUnmount).toBe(true);
  });

  it("nao intercepta no meio da lista", () => {
    spyOverflowAuto();
    const { el: page, sizes: pageSizes } = makeScroller({ clientHeight: 500, scrollHeight: 2000 });

    const { getByTestId } = renderInPage(page);
    const list = getByTestId("list") as HTMLElement;
    withLayout(list, 50); // meio

    const notPrevented = list.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );

    expect(notPrevented).toBe(true);
    expect(pageSizes.scrollTop).toBe(0);
  });
});
