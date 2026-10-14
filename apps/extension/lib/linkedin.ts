import type { Level } from "./badge";

const APPLY = /^(easy apply|apply)\b/i;
const SAVE = /^(save|saved)\b/i;

export type Kind = "chips" | "apply" | "title" | "fixed";
export type Spot = { kind: Kind; ref: Element | null };

const RANK: Record<Kind, number> = { chips: 0, apply: 1, title: 2, fixed: 3 };

// Job id from a view, slug view or split view URL.
export function jobId(url: string): string | null {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("currentJobId") ?? u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1];
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export type Said = { language: Level; experience: Level };

const TTL = 24 * 60 * 60 * 1000;
// Own key, so old Finnish verdicts under `badge:` never show as language verdicts.
const memo = (id: string) => `lang:${id}`;

export async function seen(id: string, now = Date.now()): Promise<Said | null> {
  const got = (await browser.storage.local.get(memo(id)))[memo(id)] as (Said & { at: number }) | undefined;
  if (!got) return null;
  if (now - got.at < TTL) return { language: got.language, experience: got.experience };
  await browser.storage.local.remove(memo(id));
  return null;
}

export async function keep(id: string, said: Said, now = Date.now()): Promise<void> {
  await browser.storage.local.set({ [memo(id)]: { ...said, at: now } });
}

export const canonical = (id: string) => `https://www.linkedin.com/jobs/view/${id}/`;
export const guest = (id: string) => `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;

const said = (el: Element, re: RegExp) => re.test((el.textContent ?? "").replace(/\s+/g, " ").trim()) || re.test(el.getAttribute("aria-label") ?? "");

// First Apply control after the title, so search bar "Easy Apply" chips are skipped.
export function apply(root: ParentNode): Element | null {
  const h1 = root.querySelector("h1");
  const all = [...root.querySelectorAll("button, a")].filter((b) => said(b, APPLY));
  return all.find((b) => h1 && h1.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ?? all[0] ?? null;
}

// Climb to the container that also holds Save, that is the Apply row.
export function bar(button: Element): Element {
  let up = button.parentElement;
  for (let i = 0; i < 6 && up; i++, up = up.parentElement) {
    if ([...up.querySelectorAll("button, a")].some((b) => said(b, SAVE))) return up;
  }
  return button.parentElement ?? button;
}

// Insight chips ("Hybrid", "Full-time") are links with a check icon, wrapped once inside the chip row.
export function chips(root: ParentNode): Element | null {
  const a = root.querySelector('a svg[id="check-small"]')?.closest("a");
  return a?.parentElement?.parentElement ?? null;
}

// Apply row sits in a stacking wrapper, so climb past single-child wrappers before inserting.
export function lone(el: Element): Element {
  while (el.parentElement && el.parentElement.children.length === 1) el = el.parentElement;
  return el;
}

export function spot(doc: Document): Spot {
  const root = doc.querySelector("main") ?? doc.body;
  const c = chips(root);
  if (c) return { kind: "chips", ref: c };
  const b = apply(root);
  if (b) return { kind: "apply", ref: lone(bar(b)) };
  const h1 = root.querySelector("h1");
  if (h1) return { kind: "title", ref: h1 };
  return { kind: "fixed", ref: null };
}

export const better = (a: Kind, b: Kind) => RANK[a] < RANK[b];

const CSS: Record<Kind, string> = {
  chips: "display:contents",
  apply: "display:flex;flex-wrap:wrap;gap:8px;margin:4px 0",
  title: "display:flex;flex-wrap:wrap;gap:8px;margin:4px 0",
  fixed: "display:flex;gap:8px;position:fixed;top:72px;right:16px;z-index:2147483647",
};

// Chips spot joins the site chip row, other spots get an own row.
export function place(el: HTMLElement, s: Spot, doc: Document): void {
  el.style.cssText = CSS[s.kind];
  if (s.kind === "chips") s.ref!.append(el);
  else if (s.kind === "apply") s.ref!.before(el);
  else if (s.kind === "title") s.ref!.after(el);
  else doc.body.append(el);
}
