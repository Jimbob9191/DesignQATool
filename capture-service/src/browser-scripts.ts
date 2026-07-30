// These run inside the captured page via page.evaluate(). Playwright
// serializes each function by calling .toString() on it — only the
// function's own literal source is available in the injected context, NOT
// any module-scope constants/helpers it closes over. Every function here
// must therefore be fully self-contained (no references outside its own
// body).

export type ElementMapEntry = {
  selector: string;
  tag: string;
  role: string | null;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
};

export function neutralizeFixedAndSticky(): void {
  const elements = document.querySelectorAll<HTMLElement>("*");
  for (const el of elements) {
    const style = getComputedStyle(el);
    if (style.position === "fixed" || style.position === "sticky") {
      const rect = el.getBoundingClientRect();
      el.style.position = "absolute";
      el.style.top = `${rect.top + window.scrollY}px`;
      el.style.left = `${rect.left + window.scrollX}px`;
    }
  }
}

export async function autoScrollToTriggerLazyLoad(): Promise<void> {
  await new Promise<void>((resolve) => {
    let scrolled = 0;
    const step = 400;
    const cap = 20000;
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      scrolled += step;
      if (scrolled >= document.body.scrollHeight || scrolled > cap) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
  window.scrollTo(0, 0);
}

export function buildElementMap(): ElementMapEntry[] {
  const MAX_ELEMENT_ENTRIES = 4000;
  const MIN_ELEMENT_SIZE = 8;

  function cssSelectorFor(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return `body > ${parts.join(" > ")}`;
  }

  const results: ElementMapEntry[] = [];
  // Scoped to body's descendants only — html/head/title/meta/script etc.
  // aren't meaningful pin-anchor targets, and this keeps every selector's
  // "body > ..." prefix correct (nothing outside body's subtree included).
  const all = document.body.querySelectorAll("*");

  for (const el of all) {
    if (results.length >= MAX_ELEMENT_ENTRIES) break;

    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_ELEMENT_SIZE || rect.height < MIN_ELEMENT_SIZE) continue;

    const text = (el.textContent ?? "").trim().slice(0, 80);

    results.push({
      selector: cssSelectorFor(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      text,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
  }

  return results;
}
