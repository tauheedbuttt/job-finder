import { CAP, jev, type FinnishOptions, type NoulQuestion } from "@job-finder/core";
import { host, type Item } from "./agilefant";
import { cached, extract, remember } from "./badge";
import { labels, level, type Asked, type Cache, type Entry, type Issue, type Verdict } from "./labels";
import type { Rendered } from "./messages";
import { web } from "./render";
import { pool } from "./pool";
import { trace, type Flow } from "./trace";

export const MIN = 400;
const DROP = "nav,header,footer,script,style,noscript,template,svg";
const LD = /application\/ld\+json/i;

export type Deps = { page: typeof fetch; opts: FinnishOptions };
export type Text = { text: string | null; issues: Issue[] };
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
  if (!web(url)) return { text: null, issues: [issue("fetch", "no link")] };
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

export type Got = Array<[Asked, Verdict]>;

const { finnish, experience, yoe, trainee, developer } = labels;
// Labels that need a JD; a row with no text never asks them.
const DEEP: Asked[] = [finnish, experience, yoe, developer];
const fail = (issues: Issue[]): Got => [
  [finnish, { verdict: "unclear", src: "none", issues }],
  [experience, { verdict: "unclear", src: "none" }],
];

// One Jev call with every wanted label; no text means title only. Jev errors fail the Finnish entry; only TypeError (translator offline) escapes.
async function pose(item: Item, want: Asked[], body: string | null, src: Entry["src"], issues: Issue[], opts: FinnishOptions): Promise<Got> {
  const out: Got = body || !want.includes(finnish) ? [] : fail(issues);
  const ask = body ? want : want.filter((l) => !DEEP.includes(l));
  if (!ask.length) return out;
  try {
    const questions: Record<string, NoulQuestion> = Object.fromEntries(ask.map((l) => [l.name, l.question]));
    const { answers } = await jev({ title: item.title, text: (body ?? "").slice(0, CAP) }, questions, opts);
    const got: Got = ask.map((l) => {
      const score = answers[l.name]!.noul;
      const some = l === finnish && issues.length ? { issues } : {};
      return [l, { verdict: level(score, opts), score, src: body ? src : "title", ...some }];
    });
    const v = (l: Asked) => got.find(([x]) => x === l)?.[1].verdict;
    const [fi, ex] = [v(finnish), v(experience)];
    if (fi && ex && duunitori(item.url)) await remember(clean(item.url), { finnish: fi, experience: ex }).catch(() => undefined);
    return [...out, ...got];
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return body && want.includes(finnish) ? fail([...issues, issue("jev", reason(err))]) : out;
  }
}

// One Jev call per row for every wanted label. Duunitori badge hits skip Jev for Finnish and experience.
export async function answer(item: Item, want: Asked[], d: Deps, bare = false): Promise<Got> {
  const url = clean(item.url);
  const out: Got = [];
  let rest = want;
  const hit = want.includes(finnish) && duunitori(url) ? await cached(url).catch(() => null) : null;
  if (hit) {
    out.push([finnish, { verdict: hit.finnish, src: "page" }], [experience, { verdict: hit.experience, src: "page" }]);
    rest = rest.filter((l) => l !== finnish && l !== experience);
  }
  if (!rest.length) return out;
  let got: Found = { text: null, src: "page", issues: [] };
  if (!bare) {
    try {
      got = await text(item, d);
    } catch (err) {
      if (err instanceof TypeError) throw err;
      got = { text: null, src: "page", issues: [issue("extract", reason(err))] };
    }
  }
  return [...out, ...(await pose(item, rest, got.text, got.src, got.issues, d.opts))];
}

// Try in tab: success gives src "tab"; a failure keeps src "none" so the button stays for another try.
export async function retry(item: Item, want: Asked[], old: Issue[], render: (url: string) => Promise<Rendered>, opts: FinnishOptions): Promise<Got> {
  const url = clean(item.url);
  const ask = [...new Set([finnish, experience, ...want])];
  if (!web(url)) return fail([...old, issue("tab", "no link")]);
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
  return pose(item, ask, text, "tab", [...old, issue("tab", "ok")], opts);
}

// Trainee from the JD for a title-unclear row; null when there is no text.
export async function deep(item: Item, d: Deps): Promise<Verdict | null> {
  let got: Found;
  try {
    got = await text(item, d);
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return null;
  }
  if (!got.text) return null;
  return (await pose(item, [trainee], got.text, got.src, [], d.opts))[0]?.[1] ?? null;
}

// Rows on screen first, the rest keep board order.
export function order(list: Item[], seen: (id: string) => boolean): Item[] {
  return [...list.filter((i) => seen(i.id)), ...list.filter((i) => !seen(i.id))];
}

export type Run = { cache: Cache; deps: Deps; session: string; mark: (id: string) => void; stop: () => boolean };

export const SENIORITY: Asked[] = [labels.yoe, labels.senior, labels.staff, labels.manager];
export const JUDGED: Asked[] = [finnish, experience, ...SENIORITY, developer];

const failed = (id: string, c: Cache) => c.get(id, finnish)?.src === "none";

// Labels a row still lacks; failed rows have no text, so JD-only labels stay unasked.
export function missing(id: string, c: Cache): Asked[] {
  const want = JUDGED.filter((l) => !c.get(id, l));
  return failed(id, c) ? want.filter((l) => !DEEP.includes(l)) : want;
}

// Try in tab asks every label the row lacks, so its JD goes out once.
export function lacks(id: string, c: Cache): Asked[] {
  return [yoe, developer, ...missing(id, c), trainee].filter((l) => !c.get(id, l));
}

// Trainee rides along free when a row gets a call anyway.
export function wanted(id: string, c: Cache): Asked[] {
  const want = missing(id, c);
  return want.length && !c.get(id, trainee) ? [...want, trainee] : want;
}

async function sweep(list: Item[], r: Run, flow: Flow): Promise<void> {
  const one = pool(3);
  await Promise.all(
    list.map((item) =>
      one(async () => {
        if (r.stop()) return;
        const want = wanted(item.id, r.cache);
        if (want.length) {
          const got = await answer(item, want, { ...r.deps, opts: { ...r.deps.opts, headers: trace(flow, r.session, item.url) } }, failed(item.id, r.cache));
          // Late answers after a stop or cache clear are dropped.
          if (r.stop()) return;
          for (const [l, v] of got) r.cache.put(item.id, l, v);
        }
        r.mark(item.id);
      }),
    ),
  );
}

// Finnish run: rows with no Finnish entry, every missing label in the same call.
export async function run(list: Item[], r: Run): Promise<void> {
  await sweep(
    list.filter((i) => !r.cache.get(i.id, finnish)),
    r,
    "agilefant-finnish",
  );
}

// Seniority run: rows that still miss a label after the Finnish run.
export async function grade(list: Item[], r: Run): Promise<void> {
  await sweep(list, r, "agilefant-seniority");
}

export const TABS = 5;

// Process all: runs the single-row Try in tab for each row, 5 tabs at once; a stop starts no new row.
export async function redo(ids: string[], attempt: (id: string) => Promise<void>, stop: () => boolean, mark: (id: string) => void): Promise<void> {
  const one = pool(TABS);
  await Promise.all(
    ids.map((id) =>
      one(async () => {
        if (stop()) return;
        await attempt(id);
        if (!stop()) mark(id);
      }),
    ),
  );
}
