import { CAP, checkFast, jev, type FinnishOptions, type NoulQuestion } from "@job-finder/core";
import { host, type Item } from "./agilefant";
import { cached, extract, remember } from "./badge";
import { labels, level, type Asked, type Cache, type Entry, type Issue, type Verdict } from "./labels";
import type { Rendered } from "./messages";
import { pool } from "./pool";
import { trace } from "./trace";

export const MIN = 400;
const DROP = "nav,header,footer,script,style,noscript,template,svg";
const LD = /application\/ld\+json/i;

export type Deps = { page: typeof fetch; opts: FinnishOptions };
export type Text = { text: string | null; issues: Issue[] };
export type Pair = { finnish: Verdict; experience: Verdict };
export type Jd = { text: string; src: "page" | "tab"; at: number };

export const JD = "jd:";

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));
const issue = (step: Issue["step"], message: string): Issue => ({ step, message, at: Date.now() });
const within = (h: string, base: string) => h === base || h.endsWith(`.${base}`);

// Turn a board link into a fetchable URL; null keeps the plain link.
export const adapters: Record<string, (url: string) => string | null> = {
  "linkedin.com": (url) => {
    const u = new URL(url);
    const id = u.searchParams.get("currentJobId") ?? u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1];
    return id && /^\d+$/.test(id) ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}` : null;
  },
  "tyomarkkinatori.fi": (url) => {
    const id = new URL(url).pathname.match(/\/avoimet-tyopaikat\/([0-9a-f-]{36})/i)?.[1];
    return id ? `https://tyomarkkinatori.fi/api/jobposting-new/v1/public/jobpostings/${id}` : null;
  },
};

export function adapt(url: string): string {
  const h = host(url);
  const key = Object.keys(adapters).find((base) => within(h, base));
  try {
    return (key && adapters[key]!(url)) || url;
  } catch {
    return url;
  }
}

// Whole page text for portals where no description block is found.
export function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(DROP).forEach((el) => el.remove());
  return (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, CAP);
}

type Lang = Record<string, string> | undefined;
type Posting = { position?: { title?: Lang; jobDescription?: Lang; marketingDescription?: Lang } };

// Tyomarkkinatori JSON: title plus description fields in every language.
export function posting(json: Posting): string {
  const p = json.position ?? {};
  return [p.title, p.jobDescription, p.marketingDescription]
    .flatMap((l) => Object.values(l ?? {}))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CAP);
}

// Shells with no JSON-LD stay under MIN, so no description pick is spent on them.
export async function read(body: string, opts: FinnishOptions): Promise<string> {
  if (body.trimStart().startsWith("{")) {
    try {
      return posting(JSON.parse(body) as Posting);
    } catch {
      return "";
    }
  }
  const all = plain(body);
  if (all.length < MIN && !LD.test(body)) return all;
  const got = (await extract(body, opts)) ?? "";
  return got.length >= MIN || got.length >= all.length ? got : all;
}

// Fetch only; null text means the row fails with its issue and skips Jev.
export async function source(url: string, d: Deps): Promise<Text> {
  let res: Response;
  try {
    res = await d.page(adapt(url));
  } catch (err) {
    return { text: null, issues: [issue("fetch", reason(err))] };
  }
  if (!res.ok) return { text: null, issues: [issue("fetch", `HTTP ${res.status}`)] };
  const text = await read(await res.text(), d.opts);
  return text.length >= MIN ? { text, issues: [] } : { text: null, issues: [issue("fetch", "text too short")] };
}

export async function jd(id: string): Promise<Jd | null> {
  try {
    return ((await browser.storage.local.get(JD + id))[JD + id] as Jd | undefined) ?? null;
  } catch {
    return null;
  }
}

// One key per row, so a write never rewrites the whole cache.
export async function keep(id: string, text: string, src: Jd["src"]): Promise<void> {
  await browser.storage.local.set({ [JD + id]: { text, src, at: Date.now() } satisfies Jd }).catch(() => undefined);
}

export async function wipe(): Promise<void> {
  try {
    const keys = Object.keys(await browser.storage.local.get(null)).filter((k) => k.startsWith(JD));
    if (keys.length) await browser.storage.local.remove(keys);
  } catch {
    return;
  }
}

const duunitori = (url: string) => /(^|\.)duunitori\.fi$/.test(host(url));
const clean = (url: string) => url.split("#")[0]!;

type Found = Text & { src: Jd["src"] };

// JD cache first; a fetch success is cached for every later label.
export async function text(item: Item, d: Deps): Promise<Found> {
  const hit = await jd(item.id);
  if (hit) return { text: hit.text, src: hit.src, issues: [] };
  const got = await source(clean(item.url), d);
  if (got.text) await keep(item.id, got.text, "page");
  return { ...got, src: "page" };
}
const fail = (issues: Issue[]): Pair => ({ finnish: { verdict: "unclear", src: "none", issues }, experience: { verdict: "unclear", src: "none" } });

// Jev errors become an issue; only TypeError (translator offline) escapes.
async function judge(url: string, text: string, opts: FinnishOptions, src: Entry["src"], issues: Issue[]): Promise<Pair> {
  try {
    const { finnish, experience } = await checkFast({ text }, opts);
    if (duunitori(url)) await remember(url, { finnish: finnish.verdict, experience: experience.verdict }).catch(() => undefined);
    const some = issues.length ? { issues } : {};
    return { finnish: { ...finnish, src, ...some }, experience: { ...experience, src } };
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return fail([...issues, issue("jev", reason(err))]);
  }
}

export async function check(item: Item, d: Deps): Promise<Pair> {
  const url = clean(item.url);
  const hit = duunitori(url) ? await cached(url).catch(() => null) : null;
  if (hit) return { finnish: { verdict: hit.finnish, src: "page" }, experience: { verdict: hit.experience, src: "page" } };
  let got: Found;
  try {
    got = await text(item, d);
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return fail([issue("extract", reason(err))]);
  }
  return got.text ? judge(url, got.text, d.opts, got.src, got.issues) : fail(got.issues);
}

// Try in tab: success gives src "tab"; a failure keeps src "none" so the button stays for another try.
export async function retry(item: Item, old: Issue[], render: (url: string) => Promise<Rendered>, opts: FinnishOptions): Promise<Pair> {
  const url = clean(item.url);
  const got = await render(url);
  if (!got.ok) return fail([...old, issue("tab", got.error)]);
  let text: string;
  try {
    text = await read(got.html, opts);
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return fail([...old, issue("tab", reason(err))]);
  }
  if (text.length < MIN) return fail([...old, issue("tab", "text too short")]);
  await keep(item.id, text, "tab");
  return judge(url, text, opts, "tab", [...old, issue("tab", "ok")]);
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

export const SENIORITY: Asked[] = [labels.yoe, labels.senior, labels.staff, labels.manager];

const failed = (id: string, c: Cache) => c.get(id, labels.finnish)?.src === "none";

// Labels a row still lacks; failed rows have no text, so years stay unasked.
export function missing(id: string, c: Cache): Asked[] {
  const want = SENIORITY.filter((l) => !c.get(id, l));
  return failed(id, c) ? want.filter((l) => l !== labels.yoe) : want;
}

// One Jev call per row; no text means title only and no years question.
export async function rank(item: Item, want: Asked[], d: Deps, bare = false): Promise<Array<[Asked, Verdict]>> {
  let got: Found | null = null;
  if (!bare) {
    try {
      got = await text(item, d);
    } catch (err) {
      if (err instanceof TypeError) throw err;
    }
  }
  const body = got?.text ?? null;
  const ask = body ? want : want.filter((l) => l !== labels.yoe);
  if (!ask.length) return [];
  const questions: Record<string, NoulQuestion> = Object.fromEntries(ask.map((l) => [l.name, l.question]));
  const { answers } = await jev({ title: item.title, text: body ?? "" }, questions, d.opts);
  const src = body ? got!.src : "title";
  return ask.map((l) => {
    const score = answers[l.name]!.noul;
    return [l, { verdict: level(score, d.opts), score, src }];
  });
}

export async function grade(list: Item[], r: Run): Promise<void> {
  const one = pool(3);
  await Promise.all(
    list.map((item) =>
      one(async () => {
        if (r.stop()) return;
        const want = missing(item.id, r.cache);
        if (want.length) {
          try {
            const got = await rank(item, want, { ...r.deps, opts: { ...r.deps.opts, headers: trace("agilefant-seniority", r.session, item.url) } }, failed(item.id, r.cache));
            // Late answers after a stop or cache clear are dropped.
            if (r.stop()) return;
            for (const [l, v] of got) r.cache.put(item.id, l, v);
          } catch (err) {
            if (err instanceof TypeError) throw err;
          }
        }
        r.mark(item.id);
      }),
    ),
  );
}
