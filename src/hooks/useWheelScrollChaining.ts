import { useEffect, useRef, type RefObject } from "react";

/**
 * Rolagem encadeada em listas com scroll proprio.
 *
 * Espelha o comportamento do agent desktop (`bindSupportScrollChaining` no
 * app-support.js): a lista rola normalmente ate o limite e, ao chegar no topo
 * ou na base, o restante do delta e repassado ao ancestral rolavel mais proximo
 * (a pagina), em vez de "travar" a janela.
 *
 * Nao usamos `overscroll-contain`: se este JS nao rodar, o encadeamento nativo
 * do navegador continua funcionando como rede de seguranca.
 */

/** deltaMode: 0 = pixels, 1 = linhas, 2 = paginas. */
export function normalizeWheelDelta(
  event: { deltaY: number; deltaMode?: number } | null | undefined,
): number {
  if (!event) return 0;
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 100;
  return event.deltaY;
}

export function isScrollableVertically(
  el: HTMLElement | null | undefined,
): el is HTMLElement {
  return Boolean(el && el.scrollHeight > el.clientHeight);
}

/** A lista ainda consegue rolar na direcao do delta? */
export function canScrollInside(el: HTMLElement, deltaY: number): boolean {
  if (!isScrollableVertically(el)) return false;

  const atTop = el.scrollTop <= 0;
  const atBottom =
    el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

  return deltaY < 0 ? !atTop : !atBottom;
}

// Valor original de scroll-behavior por elemento enquanto uma rajada de roda
// estiver em andamento. Uma variavel local por evento NAO serve: dois eventos
// no mesmo frame fariam o segundo capturar "auto" (ja aplicado pelo primeiro) e
// restaurar "auto" no fim, desligando o smooth da pagina permanentemente.
const smoothScrollSuspensions = new WeakMap<HTMLElement, string>();

function requestFrame(callback: () => void) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}

export function suspendSmoothScroll(node: HTMLElement) {
  if (!smoothScrollSuspensions.has(node)) {
    smoothScrollSuspensions.set(node, node.style.scrollBehavior);
  }
  node.style.scrollBehavior = "auto";
}

export function restoreSmoothScroll(node: HTMLElement) {
  if (!smoothScrollSuspensions.has(node)) return;
  node.style.scrollBehavior = smoothScrollSuspensions.get(node) ?? "";
  smoothScrollSuspensions.delete(node);
}

/**
 * Repassa o delta ao ancestral rolavel mais proximo. Retorna true quando
 * algum ancestral se moveu.
 */
export function scrollNearestScrollableAncestor(
  el: HTMLElement | null | undefined,
  deltaY: number,
): boolean {
  let node: HTMLElement | null = el?.parentElement ?? null;

  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      const before = node.scrollTop;
      // Durante a rajada de roda o scroll-behavior: smooth reinicia a animacao
      // a cada evento e a rolagem parece travada; rola instantaneo e restaura.
      suspendSmoothScroll(node);
      node.scrollTop = before + deltaY;
      const moved = node.scrollTop !== before;
      const target = node;
      requestFrame(() => restoreSmoothScroll(target));
      if (moved) return true;
    }
    node = node.parentElement;
  }

  return false;
}

/**
 * Handler de `wheel`. Retorna true quando intercepta o evento (preventDefault +
 * repasse para a pagina).
 */
export function createWheelChainHandler(getEl: () => HTMLElement | null) {
  return (event: WheelEvent): boolean => {
    const el = getEl();
    // Eventos nao-cancelaveis (fling do trackpad) nao aceitam preventDefault;
    // nesse caso o encadeamento nativo cuida da rolagem.
    if (!el || event.cancelable === false) return false;

    const delta = normalizeWheelDelta(event);
    if (!delta) return false;
    if (canScrollInside(el, delta)) return false; // rola dentro da lista

    event.preventDefault();
    scrollNearestScrollableAncestor(el, delta);
    return true;
  };
}

/** Ref para o container com scroll proprio que deve encadear com a pagina. */
export function useWheelScrollChaining<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = createWheelChainHandler(() => ref.current);
    el.addEventListener("wheel", handler, { passive: false });

    return () => el.removeEventListener("wheel", handler);
  }, []);

  return ref;
}
