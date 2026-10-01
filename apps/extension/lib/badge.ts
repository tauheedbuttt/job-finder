import { checkFinnishFast, pickDescription, type FinnishOptions, type Verdict } from "@job-finder/core";
import { scanBlocks } from "./dom";

export type Badge = Verdict["verdict"] | "loading" | "error";

const TTL = 24 * 60 * 60 * 1000;
const key = (url: string) => `badge:${url}`;

// JSON-LD is taken as is, Jev picks only when there is none; no description ends unclear.
export async function judge(html: string, opts: FinnishOptions): Promise<Verdict["verdict"]> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const { data } = scanBlocks(doc);
  const jsonld = data.find((b) => b.source === "jsonld");
  const id = jsonld ? jsonld.id : (await pickDescription(data, opts)).id;
  const block = data.find((b) => b.id === id);
  if (!block) return "unclear";
  return (await checkFinnishFast({ text: block.text }, opts)).verdict;
}

export async function cached(url: string, now = Date.now()): Promise<Verdict["verdict"] | null> {
  const got = (await browser.storage.local.get(key(url)))[key(url)] as { verdict: Verdict["verdict"]; at: number } | undefined;
  if (!got) return null;
  if (now - got.at < TTL) return got.verdict;
  await browser.storage.local.remove(key(url));
  return null;
}

export async function remember(url: string, verdict: Verdict["verdict"], now = Date.now()): Promise<void> {
  await browser.storage.local.set({ [key(url)]: { verdict, at: now } });
}

export function cards(root: ParentNode): Array<{ card: Element; url: string }> {
  return [...root.querySelectorAll(".job-box")].flatMap((card) => {
    const link = card.querySelector<HTMLAnchorElement>("a.job-box__hover") ?? card.querySelector<HTMLAnchorElement>("a[href]");
    return link && /^https?:/i.test(link.href) ? [{ card, url: link.href.split("#")[0]! }] : [];
  });
}

export function title(card: Element): string {
  return card.querySelector(".job-box__title")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function retitle(card: Element, en: string): void {
  const el = card.querySelector(".job-box__title");
  if (el) suffix(el, en);
}

// Adds the English title after the original, only when translation changed it.
export function suffix(el: Element, en: string): void {
  if (el.querySelector("[data-jf-en]")) return;
  const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  if (!en.trim() || flat(en) === flat(el.textContent ?? "")) return;
  const span = document.createElement("span");
  span.dataset.jfEn = "";
  span.textContent = ` - ${en.trim()}`;
  el.append(span);
}

export function place(card: Element, el: Element): void {
  const title = card.querySelector(".job-box__title");
  if (title) title.after(el);
  else (card.querySelector(".job-box__content") ?? card).append(el);
}
