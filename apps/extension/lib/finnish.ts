import { CAP, checkFast, type FinnishOptions } from "@job-finder/core";
import { host, type Item } from "./agilefant";
import { cached, extract, remember } from "./badge";
import { labels, skip, type Cache, type Issue, type Verdict } from "./labels";
import type { Rendered } from "./messages";
import { pool } from "./pool";
import { trace } from "./trace";

export const MIN = 400;
const DROP = "nav,header,footer,script,style,noscript,template,svg";

export type Deps = { page: typeof fetch; render: (url: string) => Promise<Rendered>; opts: FinnishOptions };
export type Text = { text: string | null; issues: Issue[] };
export type Pair = { finnish: Verdict; experience: Verdict };

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));
const issue = (step: Issue["step"], message: string): Issue => ({ step, message, at: Date.now() });

// Whole page text for portals where no description block is found.
export function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(DROP).forEach((el) => el.remove());
  return (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, CAP);
}

export async function read(html: string, opts: FinnishOptions): Promise<string> {
  return (await extract(html, opts)) ?? plain(html);
}

// Relay fetch first, rendered tab when it fails, is a shell or the host is walled.
export async function source(url: string, d: Deps): Promise<Text> {
  const issues: Issue[] = [];
  let html: string | null = null;
  let text = "";
  if (!skip(url)) {
    try {
      const res = await d.page(url);
      if (res.ok) html = await res.text();
      else issues.push(issue("fetch", `HTTP ${res.status}, rendered instead`));
    } catch (err) {
      issues.push(issue("fetch", `${reason(err)}, rendered instead`));
    }
  }
  if (html !== null) {
    text = await read(html, d.opts);
    if (text.length >= MIN) return { text, issues };
    issues.push(issue("fetch", "text too short, rendered instead"));
  }
  const got = await d.render(url);
  if (!got.ok) {
    issues.push(issue("render", got.error));
    return { text: text || null, issues };
  }
  const full = await read(got.html, d.opts);
  if (full) return { text: full, issues };
  issues.push(issue("extract", "no text on page"));
  return { text: text || null, issues };
}

const duunitori = (url: string) => /(^|\.)duunitori\.fi$/.test(host(url));

// Failed rows end unclear with their issues; only TypeError (translator offline) escapes.
export async function check(item: Item, d: Deps): Promise<Pair> {
  const url = item.url.split("#")[0]!;
  const local = duunitori(url);
  const hit = local ? await cached(url).catch(() => null) : null;
  if (hit) return { finnish: { verdict: hit.finnish, src: "page" }, experience: { verdict: hit.experience, src: "page" } };
  const fail = (issues: Issue[]): Pair => ({ finnish: { verdict: "unclear", src: "none", issues }, experience: { verdict: "unclear", src: "none" } });
  let text: Text;
  try {
    text = await source(url, d);
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return fail([issue("extract", reason(err))]);
  }
  if (!text.text) return fail(text.issues);
  try {
    const { finnish, experience } = await checkFast({ text: text.text }, d.opts);
    if (local) await remember(url, { finnish: finnish.verdict, experience: experience.verdict }).catch(() => undefined);
    const some = text.issues.length ? { issues: text.issues } : {};
    return { finnish: { ...finnish, src: "page", ...some }, experience: { ...experience, src: "page" } };
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return fail([...text.issues, issue("jev", reason(err))]);
  }
}

// Rows on screen first, the rest keep board order.
export function order(list: Item[], seen: (id: string) => boolean): Item[] {
  return [...list.filter((i) => seen(i.id)), ...list.filter((i) => !seen(i.id))];
}

export type Run = { cache: Cache; deps: Deps; session: string; mark: (id: string) => void; stop: () => boolean };

export async function run(list: Item[], r: Run): Promise<void> {
  const one = pool(3);
  await Promise.all(
    list
      .filter((i) => !r.cache.get(i.id, labels.finnish))
      .map((item) =>
        one(async () => {
          if (r.stop()) return;
          const got = await check(item, { ...r.deps, opts: { ...r.deps.opts, headers: trace("agilefant-finnish", r.session, item.url) } });
          // Late answers after a stop or cache clear are dropped.
          if (r.stop()) return;
          r.cache.put(item.id, labels.finnish, got.finnish);
          r.cache.put(item.id, labels.experience, got.experience);
          r.mark(item.id);
        }),
      ),
  );
}
