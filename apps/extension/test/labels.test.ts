import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../lib/agilefant";
import { cache, chunks, KEY, labels, run, skip, titles, type Cache } from "../lib/labels";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const { trainee } = labels;

let store: Record<string, unknown>;
let sets: number;

beforeEach(() => {
  store = {};
  sets = 0;
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
        set: async (v: Record<string, unknown>) => {
          sets++;
          Object.assign(store, structuredClone(v));
        },
        remove: async (k: string) => void delete store[k],
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const item = (i: number, url = `https://duunitori.fi/tyo/${i}`): Item => ({
  id: `b::wi-${i}`,
  title: `Job ${i}`,
  url,
  alt: `Alt ${i}`,
  host: new URL(url).hostname.replace(/^www\./, ""),
  deadline: null,
  created: null,
});

// Answers each noul with a score from the job title number, or a fixed one.
function jev(score: (state: any, key: string) => number) {
  const calls: Array<{ state: any; questions: Record<string, any>; headers: Record<string, string> }> = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ ...body, headers: init?.headers as Record<string, string> });
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { type: string }>).map(([k, q]) =>
        q.type === "choice" ? [k, { type: "choice", choice: "b0", probabilities: { b0: 0.9 }, confidence: 0.9 }] : [k, { type: "noul", noul: score(body.state, k) }],
      ),
    );
    return json({ model: "jev", answers });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

describe("cache", () => {
  it("treats a version mismatch as a miss", async () => {
    store[KEY] = { a: { trainee: { v: trainee.version + 1, verdict: "yes", score: 0.9, src: "title" } } };
    const c = cache();
    await c.load();
    expect(c.get("a", trainee)).toBeUndefined();
    store[KEY] = { a: { trainee: { v: trainee.version, verdict: "yes", score: 0.9, src: "title" } } };
    await c.load();
    expect(c.get("a", trainee)?.verdict).toBe("yes");
  });

  it("debounces writes into one set", async () => {
    vi.useFakeTimers();
    const c = cache();
    await c.load();
    c.put("a", trainee, { verdict: "yes", score: 0.9, src: "title" });
    c.put("b", trainee, { verdict: "no", score: 0.1, src: "jd" });
    expect(sets).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sets).toBe(1);
    expect(store[KEY]).toEqual({
      a: { trainee: { v: 1, verdict: "yes", score: 0.9, src: "title" } },
      b: { trainee: { v: 1, verdict: "no", score: 0.1, src: "jd" } },
    });
    expect(c.size()).toBe(2);
  });

  it("clear empties memory and storage", async () => {
    vi.useFakeTimers();
    const c = cache();
    await c.load();
    c.put("a", trainee, { verdict: "yes", score: 0.9, src: "title" });
    await vi.advanceTimersByTimeAsync(1000);
    c.put("b", trainee, { verdict: "yes", score: 0.9, src: "title" });
    await c.clear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.size()).toBe(0);
    expect(c.get("a", trainee)).toBeUndefined();
    expect(store[KEY]).toBeUndefined();
  });
});

describe("trainee batch", () => {
  it("splits into chunks of 40", () => {
    expect(chunks(Array.from({ length: 85 }, (_, i) => i)).map((c) => c.length)).toEqual([40, 40, 5]);
  });

  it("asks one question per job and maps answers back by index", async () => {
    const mock = jev((state, key) => (state.jobs[Number(key.split("_")[1])].title === "Job 1" ? 0.9 : 0.1));
    const got = await titles([item(0), item(1), item(2)], trainee, { fetch: mock.fetch });
    expect(got.map((e) => e.verdict)).toEqual(["no", "yes", "no"]);
    expect(got[1]).toEqual({ verdict: "yes", score: 0.9, src: "title" });
    const [call] = mock.calls;
    expect(Object.keys(call!.questions)).toEqual(["trainee_0", "trainee_1", "trainee_2"]);
    expect(call!.state.jobs[0]).toEqual({ title: "Job 0", alt: "Alt 0", host: "duunitori.fi" });
    expect(JSON.stringify(call!.questions.trainee_2)).toContain("jobs[2]");
  });
});

describe("run", () => {
  let c: Cache;
  beforeEach(async () => {
    c = cache();
    await c.load();
  });

  const deps = (fetch: typeof globalThis.fetch, page: typeof globalThis.fetch) => ({
    label: trainee,
    cache: c,
    opts: { fetch },
    page,
    session: "s",
    url: "https://agilefant.org/p/x",
    mark: vi.fn(),
    stop: () => false,
  });

  it("labels only misses, in batches of 40 with trace headers", async () => {
    c.put("b::wi-0", trainee, { verdict: "yes", score: 0.9, src: "title" });
    const mock = jev(() => 0.1);
    const list = Array.from({ length: 82 }, (_, i) => item(i));
    await run(list, deps(mock.fetch, vi.fn()));
    expect(mock.calls.map((x) => x.state.jobs.length)).toEqual([40, 40, 1]);
    expect(mock.calls[0]!.headers["x-jf-flow"]).toBe("agilefant-title");
    expect(c.get("b::wi-81", trainee)?.verdict).toBe("no");
  });

  it("skips stage 2 for linkedin and indeed, keeps unclear from titles", async () => {
    expect(skip("https://www.linkedin.com/jobs/view/1")).toBe(true);
    expect(skip("https://fi.indeed.com/viewjob?jk=1")).toBe(true);
    expect(skip("https://duunitori.fi/tyopaikat/tyo/a")).toBe(false);
    const mock = jev(() => 0.5);
    const page = vi.fn() as unknown as typeof globalThis.fetch;
    await run([item(0, "https://www.linkedin.com/jobs/view/1"), item(1, "https://fi.indeed.com/viewjob?jk=1")], deps(mock.fetch, page));
    expect(page).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(1);
    expect(c.get("b::wi-0", trainee)).toEqual({ v: 1, verdict: "unclear", score: 0.5, src: "title" });
  });

  it("judges unclear rows on their JD through the page fetch", async () => {
    const mock = jev((state) => (state.jobs ? 0.5 : 0.95));
    const page = vi.fn(async () => new Response(fixture("duunitori.html"), { status: 200 })) as unknown as typeof globalThis.fetch;
    await run([item(0)], deps(mock.fetch, page));
    expect(page).toHaveBeenCalledWith("https://duunitori.fi/tyo/0");
    const jd = mock.calls[1]!;
    expect(jd.headers["x-jf-flow"]).toBe("agilefant-jd");
    expect(jd.state.title).toBe("Job 0");
    expect(jd.state.text.length).toBeGreaterThan(100);
    expect(c.get("b::wi-0", trainee)).toEqual({ v: 1, verdict: "yes", score: 0.95, src: "jd" });
  });

  it("keeps and caches stage-1 unclear when the page fetch fails", async () => {
    const mock = jev(() => 0.5);
    const page = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof globalThis.fetch;
    await run([item(0)], deps(mock.fetch, page));
    expect(c.get("b::wi-0", trainee)).toEqual({ v: 1, verdict: "unclear", score: 0.5, src: "title" });
  });

  it("throws TypeError when the translator is offline", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof globalThis.fetch;
    await expect(run([item(0)], deps(fetch, vi.fn()))).rejects.toBeInstanceOf(TypeError);
  });
});
