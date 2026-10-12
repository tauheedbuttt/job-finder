import { CAP, jev, thresholds as limits, type FinnishOptions, type NoulQuestion } from "@job-finder/core";
import { host, type Item } from "./agilefant";
import { extract, type Level } from "./badge";
import { pool } from "./pool";
import { trace } from "./trace";

export type Label = { name: string; version: number; question: NoulQuestion };
export type Entry = { v: number; verdict: Level; score: number; src: "title" | "jd" };
export type Verdict = Omit<Entry, "v">;

// Judged on criteria, not keywords: titles name trainee roles in many ways or not at all.
const trainee: Label = {
  name: "trainee",
  version: 1,
  question: {
    type: "noul",
    instructions: {
      question: "Is this a trainee or graduate entry role?",
      input: "Job title, link text and host. For JD stage, `text` is the job description, possibly cut.",
      note: "Judge the purpose of the role, not the words used. A trainee role hires students, fresh graduates or people about to graduate, trains them on the job, and aims to keep them in the company. Names vary: trainee, harjoittelija, graduate program, launchpad, academy, summer job, kesätyö, thesis worker, internship, junior program. Junior or entry-level roles that come with a structured training path count. A plain junior role with no training path does not. Roles that demand years of experience do not.",
    },
    criteria: {
      true: "The role is built to bring students or recent graduates in and train them.",
      false: "The role hires people who already do this work, or nothing points to a training entry role.",
    },
  },
};

export const labels = { trainee } satisfies Record<string, Label>;

export const KEY = "labels:agilefant";
export const BATCH = 40;

// Login walls return the wrong text, so these keep their title verdict.
const WALLED = ["linkedin.com", "indeed.com"];

type Store = Record<string, Record<string, Entry>>;

export type Cache = ReturnType<typeof cache>;

export function cache(key = KEY, wait = 1000) {
  let memo = new Map<string, Record<string, Entry>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = async () => {
    timer = undefined;
    try {
      await browser.storage.local.set({ [key]: Object.fromEntries(memo) satisfies Store });
    } catch {
      return;
    }
  };
  return {
    async load() {
      try {
        const got = (await browser.storage.local.get(key))[key] as Store | undefined;
        memo = new Map(Object.entries(got ?? {}));
      } catch {
        memo = new Map();
      }
    },
    // A version bump makes old entries a miss.
    get(id: string, label: Label): Entry | undefined {
      const hit = memo.get(id)?.[label.name];
      return hit?.v === label.version ? hit : undefined;
    },
    put(id: string, label: Label, verdict: Verdict) {
      memo.set(id, { ...memo.get(id), [label.name]: { v: label.version, ...verdict } });
      clearTimeout(timer);
      timer = setTimeout(() => void write(), wait);
    },
    size() {
      let n = 0;
      for (const entry of memo.values()) n += Object.keys(entry).length;
      return n;
    },
    async clear() {
      clearTimeout(timer);
      timer = undefined;
      memo = new Map();
      try {
        await browser.storage.local.remove(key);
      } catch {
        return;
      }
    },
  };
}

export function chunks<T>(list: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function level(score: number, opts: FinnishOptions): Level {
  const t = limits.parse(opts.thresholds ?? {});
  return score >= t.yes ? "yes" : score <= t.no ? "no" : "unclear";
}

// Points the shared question at one job of the batch.
function at(q: NoulQuestion, i: number): NoulQuestion {
  const base = typeof q.instructions === "object" && !Array.isArray(q.instructions) ? q.instructions : { question: q.instructions };
  return { ...q, instructions: { ...base, item: `Judge only \`jobs[${i}]\`.` } };
}

export async function titles(batch: Item[], label: Label, opts: FinnishOptions): Promise<Verdict[]> {
  const questions: Record<string, NoulQuestion> = Object.fromEntries(batch.map((_, i) => [`${label.name}_${i}`, at(label.question, i)]));
  const { answers } = await jev({ jobs: batch.map(({ title, alt, host }) => ({ title, alt, host })) }, questions, opts);
  return batch.map((_, i) => {
    const score = answers[`${label.name}_${i}`]!.noul;
    return { verdict: level(score, opts), score, src: "title" };
  });
}

export function skip(url: string): boolean {
  const h = host(url);
  return !h || WALLED.some((w) => h === w || h.endsWith(`.${w}`));
}

// Null when the page cannot be fetched or holds no description; Jev errors throw.
export async function deep(item: Item, label: Label, opts: FinnishOptions, page: typeof fetch): Promise<Verdict | null> {
  let html: string;
  try {
    const res = await page(item.url);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  const text = await extract(html, opts);
  if (text === null) return null;
  const questions: Record<string, NoulQuestion> = { [label.name]: label.question };
  const { answers } = await jev({ title: item.title, text: text.slice(0, CAP) }, questions, opts);
  const score = answers[label.name]!.noul;
  return { verdict: level(score, opts), score, src: "jd" };
}

export type Run = {
  label: Label;
  cache: Cache;
  opts: FinnishOptions;
  page: typeof fetch;
  session: string;
  url: string;
  mark: (id: string, verdict: Verdict) => void;
  stop: () => boolean;
};

// Only TypeError (translator offline) escapes; other Jev errors leave rows unlabeled.
function soft(err: unknown): void {
  if (err instanceof TypeError) throw err;
}

export async function run(list: Item[], r: Run): Promise<void> {
  const misses = list.filter((i) => !r.cache.get(i.id, r.label));
  const unclear: Array<{ item: Item; first: Verdict }> = [];
  // Late answers after a stop or cache clear are dropped.
  const keep = (item: Item, verdict: Verdict) => {
    if (r.stop()) return;
    r.cache.put(item.id, r.label, verdict);
    r.mark(item.id, verdict);
  };
  const one = pool(3);
  await Promise.all(
    chunks(misses).map((batch) =>
      one(async () => {
        if (r.stop()) return;
        try {
          const got = await titles(batch, r.label, { ...r.opts, headers: trace("agilefant-title", r.session, r.url) });
          batch.forEach((item, i) => {
            const first = got[i]!;
            if (first.verdict !== "unclear" || skip(item.url)) return keep(item, first);
            unclear.push({ item, first });
            r.mark(item.id, first);
          });
        } catch (err) {
          soft(err);
        }
      }),
    ),
  );
  const two = pool(5);
  await Promise.all(
    unclear.map(({ item, first }) =>
      two(async () => {
        if (r.stop()) return;
        try {
          keep(item, (await deep(item, r.label, { ...r.opts, headers: trace("agilefant-jd", r.session, item.url) }, r.page)) ?? first);
        } catch (err) {
          soft(err);
        }
      }),
    ),
  );
}
