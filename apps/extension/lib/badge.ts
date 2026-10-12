import { checkFast, pickDescription, type FinnishOptions, type Options, type Verdict } from "@job-finder/core";
import { scanBlocks } from "./dom";

export type Level = Verdict["verdict"];
export type Badge = Level | "loading" | "error";
export type Result = { finnish: Level; experience: Level };

const TTL = 24 * 60 * 60 * 1000;
const key = (url: string) => `badge:${url}`;

// JSON-LD is taken as is, Jev picks only when there is none.
export async function extract(html: string, opts: Options): Promise<string | null> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const { data } = scanBlocks(doc);
  const jsonld = data.find((b) => b.source === "jsonld");
  const id = jsonld ? jsonld.id : (await pickDescription(data, opts)).id;
  return data.find((b) => b.id === id)?.text ?? null;
}

// No description ends unclear.
export async function judge(html: string, opts: FinnishOptions): Promise<Result> {
  const text = await extract(html, opts);
  if (text === null) return { finnish: "unclear", experience: "unclear" };
  const { finnish, experience } = await checkFast({ text }, opts);
  return { finnish: finnish.verdict, experience: experience.verdict };
}

// Entries from before the experience pill lack it and count as a miss.
export async function cached(url: string, now = Date.now()): Promise<Result | null> {
  const got = (await browser.storage.local.get(key(url)))[key(url)] as (Partial<Result> & { at: number }) | undefined;
  if (!got) return null;
  if (now - got.at < TTL && got.finnish && got.experience) return { finnish: got.finnish, experience: got.experience };
  await browser.storage.local.remove(key(url));
  return null;
}

export async function remember(url: string, result: Result, now = Date.now()): Promise<void> {
  await browser.storage.local.set({ [key(url)]: { ...result, at: now } });
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
