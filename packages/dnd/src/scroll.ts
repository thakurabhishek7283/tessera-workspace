const OVERFLOW = /(auto|scroll|overlay)/;

/** The parent in the composed tree: crosses shadow boundaries through the host. */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Ancestors of `el` that can scroll on either axis, nearest first (the page scroller included). */
export function scrollParents(el: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let node = composedParent(el); node; node = composedParent(node)) {
    const style = getComputedStyle(node);
    const x = OVERFLOW.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    const y = OVERFLOW.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    if (x || y) found.push(node as HTMLElement);
  }
  const page = document.scrollingElement as HTMLElement | null;
  if (page && !found.includes(page)) found.push(page);
  return found;
}
