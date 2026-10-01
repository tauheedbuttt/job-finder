import { splitSentences } from "@job-finder/core";

const LEAF = "p, li, h1, h2, h3, h4, h5, h6, td, dd, div";
const BLOCK = `${LEAF}, ul, ol, table, section, article, blockquote, pre`;

export function root(doc: Document): Element | null {
  return doc.querySelector(".description--jobentry") ?? doc.querySelector(".description-box");
}

// Last h2 that comes before the description box.
export function heading(doc: Document): Element | null {
  const box = doc.querySelector(".description-box");
  if (!box) return null;
  return [...doc.querySelectorAll("h2")].findLast((h) => h.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null;
}

export function leaves(el: Element): Element[] {
  return [...el.querySelectorAll(LEAF)].filter((b) => !b.querySelector(BLOCK) && b.textContent?.trim());
}

// Replaces each leaf block's text with English and returns the original HTML.
export async function english(el: Element, translate: (texts: string[]) => Promise<string[]>): Promise<string> {
  const original = el.innerHTML;
  const parts = leaves(el).map((b) => ({ b, texts: splitSentences(b.textContent ?? "").map((p) => p.text) }));
  const en = await translate(parts.flatMap((p) => p.texts));
  let i = 0;
  for (const { b, texts } of parts) {
    if (texts.length) b.textContent = texts.map((t) => en[i++] ?? t).join(" ");
  }
  return original;
}
