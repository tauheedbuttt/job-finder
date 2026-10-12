import { CAP, jev, thresholds as limits, type FinnishOptions, type NoulQuestion } from "@job-finder/core";
import { host, type Item } from "./agilefant";
import { extract, type Level } from "./badge";
import { pool } from "./pool";
import { trace } from "./trace";

export type Label = { name: string; version: number; question?: NoulQuestion };
export type Asked = Label & { question: NoulQuestion };
export type Issue = { step: "fetch" | "render" | "tab" | "extract" | "jev" | (string & {}); message: string; at: number };
// Score is absent when the verdict came without one: duunitori badge cache or a failed row.
export type Entry = { v: number; verdict: Level; score?: number; src: "title" | "jd" | "page" | "tab" | "none"; issues?: Issue[] };
export type Verdict = Omit<Entry, "v">;

// Judged on criteria, not keywords: titles name trainee roles in many ways or not at all.
const trainee: Asked = {
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

// Judged by core checkFast in one call, so these carry no own question.
// v2: v1 rows judged by the removed render window on wrong text, rejudged from the JD cache.
const finnish: Label = { name: "finnish", version: 2 };
const experience: Label = { name: "experience", version: 2 };

// Criteria only, no signal word lists: lists make Jev keyword bound and too strict.
const yoe: Asked = {
  name: "yoe",
  version: 1,
  question: {
    type: "noul",
    instructions: {
      question: "Does this job demand five or more years of work experience?",
      input: "`title` is the job title. `text` is the job description in its original language, possibly cut.",
      note: "Judge the minimum the employer demands. Four years or less is not five. Experience named only as a plus does not count. A long list of skills or tools is not a years demand.",
    },
    criteria: {
      true: "The minimum demanded experience is five years or more.",
      false: "The demand is four years or less, or no years are demanded.",
    },
  },
};

const senior: Asked = {
  name: "senior",
  version: 1,
  question: {
    type: "noul",
    instructions: {
      question: "Is this a senior level role?",
      input: "`title` is the job title. `text` is the job description, possibly cut or empty.",
      note: "Judge the level the employer hires for, from the title and from what the job expects of the person. A long list of skills or tools alone does not make a role senior. Junior, mid level and entry roles are not senior.",
    },
    criteria: {
      true: "The employer hires an experienced senior person, by title or by demanding about five or more years or senior level expectations.",
      false: "The role is open to junior or mid level people.",
    },
  },
};

const staff: Asked = {
  name: "staff",
  version: 1,
  question: {
    type: "noul",
    instructions: {
      question: "Is this a staff or principal level role?",
      input: "`title` is the job title. `text` is the job description, possibly cut or empty.",
      note: "Judge the scope the role holds. Staff level means technical leadership beyond one team. A long list of skills alone does not make a role staff. Company staff or personnel used in another sense does not count.",
    },
    criteria: {
      true: "The role is staff or principal level, with technical leadership across teams.",
      false: "The role works inside one team at junior, mid or senior level.",
    },
  },
};

const manager: Asked = {
  name: "manager",
  version: 1,
  question: {
    type: "noul",
    instructions: {
      question: "Is this a manager, director or executive role?",
      input: "`title` is the job title. `text` is the job description, possibly cut or empty.",
      note: "Judge what the person is hired to do. A management role leads people, a function or a business, and is held to that rather than to hands-on work. Owning own tasks, mentoring or coordinating with others inside a team is not management. A long list of skills alone does not make a role managerial.",
    },
    criteria: {
      true: "The role is a people, function or business leadership role at manager level or above.",
      false: "The role is hands-on individual work, even if it involves some coordination or mentoring.",
    },
  },
};

export const labels = { trainee, finnish, experience, yoe, senior, staff, manager } satisfies Record<string, Label>;

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
    // Every current label of a row, same version rule as get.
    row(id: string): Record<string, Entry> {
      const all = memo.get(id) ?? {};
      return Object.fromEntries(Object.values(labels).flatMap((l) => (all[l.name]?.v === l.version ? [[l.name, all[l.name]!]] : [])));
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

export function level(score: number, opts: FinnishOptions): Level {
  const t = limits.parse(opts.thresholds ?? {});
  return score >= t.yes ? "yes" : score <= t.no ? "no" : "unclear";
}

// Points the shared question at one job of the batch.
function at(q: NoulQuestion, i: number): NoulQuestion {
  const base = typeof q.instructions === "object" && !Array.isArray(q.instructions) ? q.instructions : { question: q.instructions };
  return { ...q, instructions: { ...base, item: `Judge only \`jobs[${i}]\`.` } };
}

export async function titles(batch: Item[], label: Asked, opts: FinnishOptions): Promise<Verdict[]> {
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
export async function deep(item: Item, label: Asked, opts: FinnishOptions, page: typeof fetch): Promise<Verdict | null> {
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
  label: Asked;
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
