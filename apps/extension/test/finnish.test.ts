import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAP } from "@job-finder/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../lib/agilefant";
import { adapt, answer, deep, lacks, redo, TABS, grade, MIN, order, plain, retry, run, source, wipe, type Deps, type Got } from "../lib/finnish";
import { cache, labels, type Issue, type Verdict } from "../lib/labels";
import type { Rendered } from "../lib/messages";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const SHELL = "<html><body><div id=root></div></body></html>";
// Fixture JD padded past the 400 char fetch minimum.
const LONG = fixture("duunitori.html").replace("Tarjoamme joustavan", `${"Työ sisältää asiakasprojekteja ja yhteistyötä. ".repeat(8)}Tarjoamme joustavan`);

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: async (k: string | null) => (k === null ? { ...store } : k in store ? { [k]: store[k] } : {}),
        set: async (v: Record<string, unknown>) => void Object.assign(store, structuredClone(v)),
        remove: async (k: string | string[]) => [k].flat().forEach((x) => delete store[x]),
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

function jev(p: number) {
  const calls: Array<{ state: any; questions: Record<string, any>; headers: Record<string, string> }> = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ ...body, headers: init?.headers as Record<string, string> });
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { type: string }>).map(([k, q]) =>
        q.type === "choice" ? [k, { type: "choice", choice: "b0", probabilities: { b0: 0.9 }, confidence: 0.9 }] : [k, { type: "noul", noul: p }],
      ),
    );
    return json({ model: "jev", answers });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

const item = (url: string, i = 0, link = url): Item => ({ id: `b::wi-${i}`, title: `Job ${i}`, url: link, alt: "", host: new URL(url).hostname, deadline: null, created: null });

function deps(page: string | Error | number, p = 0.9) {
  const mock = jev(p);
  const d: Deps = {
    page: vi.fn(async () => {
      if (page instanceof Error) throw page;
      return typeof page === "number" ? new Response("", { status: page }) : new Response(page, { status: 200 });
    }) as unknown as typeof globalThis.fetch,
    opts: { fetch: mock.fetch },
  };
  return { d, mock };
}

const steps = (list: Issue[] | undefined) => list!.map((i) => [i.step, i.message]);
const pair = (got: Got) => Object.fromEntries(got.map(([l, v]) => [l.name, v])) as { finnish: Verdict; experience: Verdict };
const check = async (i: Item, d: Deps) => pair(await answer(i, [labels.finnish, labels.experience], d));

describe("finnish source", () => {
  it("uses the fetch when the text is long enough", async () => {
    const { d } = deps(LONG);
    const got = await source("https://jobs.example.fi/1", d);
    expect(got.text!.length).toBeGreaterThanOrEqual(MIN);
    expect(got.issues).toEqual([]);
  });

  it("maps linkedin links to the guest posting URL", () => {
    const guest = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4470303874";
    expect(adapt("https://www.linkedin.com/jobs/view/4470303874")).toBe(guest);
    expect(adapt("https://fi.linkedin.com/jobs/view/frontend-developer-at-wolt-4470303874?trk=x")).toBe(guest);
    expect(adapt("https://www.linkedin.com/jobs/search/?currentJobId=4470303874&keywords=dev")).toBe(guest);
    expect(adapt("https://www.linkedin.com/company/wolt")).toBe("https://www.linkedin.com/company/wolt");
    expect(adapt("https://jobs.example.fi/1")).toBe("https://jobs.example.fi/1");
  });

  it("maps tyomarkkinatori links to the public JSON and reads its description", async () => {
    const id = "b9364785-57ba-48d9-a522-3320045360f3";
    expect(adapt(`https://tyomarkkinatori.fi/henkiloasiakkaat/avoimet-tyopaikat/${id}`)).toBe(`https://tyomarkkinatori.fi/api/jobposting-new/v1/public/jobpostings/${id}`);
    const body = JSON.stringify({ position: { title: { en: "Consultant" }, jobDescription: { en: "Fluent Finnish required. ".repeat(20) }, marketingDescription: { en: "" } } });
    const { d, mock } = deps(body);
    const got = await source(`https://tyomarkkinatori.fi/henkiloasiakkaat/avoimet-tyopaikat/${id}`, d);
    expect(got.text).toMatch(/^Consultant Fluent Finnish required/);
    expect(mock.calls).toHaveLength(0);
  });

  it("fails the row with an issue and no Jev call on short text, fetch error or non-2xx", async () => {
    const cases: Array<[string | Error | number, string]> = [
      [SHELL, "text too short"],
      [new TypeError("Failed to fetch"), "Failed to fetch"],
      [403, "HTTP 403"],
    ];
    for (const [page, message] of cases) {
      const { d, mock } = deps(page);
      const got = await check(item("https://jobs.example.fi/1"), d);
      expect(got.finnish).toMatchObject({ verdict: "unclear", src: "none" });
      expect(steps(got.finnish.issues)).toEqual([["fetch", message]]);
      expect(mock.calls).toHaveLength(0);
    }
  });

  it("falls back to whole page text without nav or scripts", () => {
    const text = plain("<body><nav>Menu</nav><main>  Kielitaito:\n suomi </main><script>x()</script><footer>Foot</footer></body>");
    expect(text).toBe("Kielitaito: suomi");
  });
});

describe("try in tab", () => {
  const old: Issue[] = [{ step: "fetch", message: "text too short", at: 1 }];

  it("replaces the entry with src tab and keeps old issues", async () => {
    const { mock } = deps(LONG);
    const render = vi.fn(async (): Promise<Rendered> => ({ ok: true, html: LONG }));
    const got = pair(await retry(item("https://jobs.example.fi/1#x"), [], old, render, { fetch: mock.fetch }));
    expect(render).toHaveBeenCalledWith("https://jobs.example.fi/1");
    expect(got.finnish).toMatchObject({ verdict: "yes", score: 0.9, src: "tab" });
    expect(got.experience.src).toBe("tab");
    expect(steps(got.finnish.issues)).toEqual([
      ["fetch", "text too short"],
      ["tab", "ok"],
    ]);
    const c = cache();
    await c.load();
    c.put("b::wi-0", labels.finnish, { verdict: "unclear", src: "none", issues: old });
    c.put("b::wi-0", labels.finnish, got.finnish);
    expect(c.get("b::wi-0", labels.finnish)?.src).toBe("tab");
    expect(store["jd:b::wi-0"]).toMatchObject({ src: "tab" });
  });

  it("fails a row with no link without a render, a fetch or a Jev call", async () => {
    const { d, mock } = deps(LONG);
    const render = vi.fn();
    const got = pair(await retry(item("https://x.fi/1", 0, ""), [], old, render, { fetch: mock.fetch }));
    expect(render).not.toHaveBeenCalled();
    expect(got.finnish).toMatchObject({ verdict: "unclear", src: "none" });
    expect(steps(got.finnish.issues)).toEqual([
      ["fetch", "text too short"],
      ["tab", "no link"],
    ]);
    expect(steps((await source("", d)).issues)).toEqual([["fetch", "no link"]]);
    expect(d.page).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("records a tab error and stays failed with no Jev call", async () => {
    const { mock } = deps(LONG);
    for (const shown of [{ ok: false, error: "timed out after 20 s" }, { ok: true, html: SHELL }] as Rendered[]) {
      const got = pair(await retry(item("https://jobs.example.fi/1"), [], old, async () => shown, { fetch: mock.fetch }));
      expect(got.finnish).toMatchObject({ verdict: "unclear", src: "none" });
      expect(steps(got.finnish.issues)[1]![0]).toBe("tab");
    }
    expect(mock.calls).toHaveLength(0);
  });
});

describe("finnish check", () => {
  it("sends the JD once per job with every missing label in one call", async () => {
    const { d, mock } = deps(LONG);
    const c = cache();
    await c.load();
    const list = [item("https://jobs.example.fi/1"), item("https://jobs.example.fi/2", 1)];
    c.put("b::wi-1", labels.senior, { verdict: "no", score: 0.1, src: "page" });
    await run(list, { cache: c, deps: d, session: "s", mark: vi.fn(), stop: () => false });
    expect(mock.calls).toHaveLength(2);
    const [one, two] = [0, 1].map((i) => mock.calls.find((x) => x.state.title === `Job ${i}`)!);
    expect(Object.keys(one!.questions)).toEqual(["finnish", "experience", "yoe", "senior", "staff", "manager", "developer", "trainee"]);
    expect(Object.keys(two!.questions)).toEqual(["finnish", "experience", "yoe", "staff", "manager", "developer", "trainee"]);
    expect(JSON.stringify(one!.questions.finnish.instructions)).toContain("explicitly ask for Finnish");
    expect(one!.state).toEqual({ title: "Job 0", text: (store["jd:b::wi-0"] as { text: string }).text });
    expect(one!.headers["x-jf-flow"]).toBe("agilefant-finnish");
    expect(c.get("b::wi-0", labels.finnish)).toEqual({ v: labels.finnish.version, verdict: "yes", score: 0.9, src: "page" });
    for (const l of Object.values(labels)) expect(c.get("b::wi-0", l)?.verdict).toBe("yes");
    await grade(list, { cache: c, deps: d, session: "s", mark: vi.fn(), stop: () => false });
    expect(mock.calls).toHaveLength(2);
  });

  it("caps the JD text sent to Jev", async () => {
    store["jd:b::wi-0"] = { text: "x".repeat(9000), src: "page", at: 1 };
    const { d, mock } = deps(LONG);
    await answer(item("https://jobs.example.fi/1"), [labels.finnish], d);
    expect(mock.calls[0]!.state.text).toHaveLength(CAP);
  });

  it("uses the duunitori badge cache with no fetch and no Jev call", async () => {
    const url = "https://duunitori.fi/tyopaikat/tyo/a-1";
    store[`badge:${url}`] = { finnish: "no", experience: "yes", at: Date.now() };
    const { d, mock } = deps(LONG);
    const got = await check(item(url), d);
    expect(got.finnish).toEqual({ verdict: "no", src: "page" });
    expect(got.experience).toEqual({ verdict: "yes", src: "page" });
    expect(d.page).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("writes a duunitori verdict back to the badge cache", async () => {
    const url = "https://duunitori.fi/tyopaikat/tyo/a-2";
    const { d } = deps(LONG, 0.1);
    await check(item(url), d);
    expect(store[`badge:${url}`]).toMatchObject({ finnish: "no", experience: "no" });
  });

  it("never sends cache hits to Jev", async () => {
    const { d, mock } = deps(LONG);
    const c = cache();
    await c.load();
    c.put("b::wi-0", labels.finnish, { verdict: "unclear", src: "none" });
    await run([item("https://jobs.example.fi/1")], { cache: c, deps: d, session: "s", mark: vi.fn(), stop: () => false });
    expect(d.page).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("throws TypeError when the translator is offline", async () => {
    const { d } = deps(LONG);
    d.opts = {
      fetch: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof globalThis.fetch,
    };
    await expect(check(item("https://jobs.example.fi/1"), d)).rejects.toBeInstanceOf(TypeError);
  });

  it("orders rows on screen first, then board order", () => {
    const list = [0, 1, 2, 3].map((i) => item("https://a.fi/x", i));
    expect(order(list, (id) => id.endsWith("2")).map((i) => i.id)).toEqual(["b::wi-2", "b::wi-0", "b::wi-1", "b::wi-3"]);
  });
});

describe("jd cache", () => {
  it("fetch writes jd:<id>, a later run reads it with no fetch, clear removes it", async () => {
    const { d } = deps(LONG);
    const c = cache();
    await c.load();
    await run([item("https://jobs.example.fi/1")], { cache: c, deps: d, session: "s", mark: vi.fn(), stop: () => false });
    expect(store["jd:b::wi-0"]).toMatchObject({ src: "page" });
    expect((store["jd:b::wi-0"] as { text: string }).text.length).toBeGreaterThanOrEqual(MIN);
    expect(d.page).toHaveBeenCalledOnce();
    await grade([item("https://jobs.example.fi/1")], { cache: c, deps: d, session: "s", mark: vi.fn(), stop: () => false });
    expect(d.page).toHaveBeenCalledOnce();
    store.other = 1;
    await wipe();
    expect(Object.keys(store)).toEqual(["other"]);
  });

  it("writes nothing for failed rows", async () => {
    const { d } = deps(SHELL);
    await check(item("https://jobs.example.fi/1"), d);
    expect(store["jd:b::wi-0"]).toBeUndefined();
  });
});

describe("process all", () => {
  it("runs at most 5 rows at once and marks each", async () => {
    let now = 0;
    let peak = 0;
    const mark = vi.fn();
    const ids = Array.from({ length: 12 }, (_, i) => `r${i}`);
    await redo(
      ids,
      async () => {
        peak = Math.max(peak, ++now);
        await new Promise((go) => setTimeout(go, 5));
        now--;
      },
      () => false,
      mark,
    );
    expect(TABS).toBe(5);
    expect(peak).toBe(5);
    expect(mark).toHaveBeenCalledTimes(12);
  });

  it("starts no new row after stop and marks none late", async () => {
    let halted = false;
    const started: string[] = [];
    const mark = vi.fn();
    const ids = Array.from({ length: 12 }, (_, i) => `r${i}`);
    await redo(
      ids,
      async (id) => {
        started.push(id);
        await new Promise((go) => setTimeout(go, 5));
        halted = true;
      },
      () => halted,
      mark,
    );
    expect(started).toHaveLength(5);
    expect(mark).not.toHaveBeenCalled();
  });

  it("success leaves the failed state, a failure keeps its issues", async () => {
    const { mock } = deps(LONG);
    const c = cache();
    await c.load();
    const old: Issue[] = [{ step: "fetch", message: "HTTP 429", at: 1 }];
    const rows = [item("https://jobs.example.fi/1", 0), item("https://jobs.example.fi/2", 1)];
    for (const r of rows) c.put(r.id, labels.finnish, { verdict: "unclear", src: "none", issues: old });
    const render = async (url: string): Promise<Rendered> => (url.endsWith("/1") ? { ok: true, html: LONG } : { ok: false, error: "timed out after 20 s" });
    const attempt = async (id: string) => {
      const r = rows.find((x) => x.id === id)!;
      for (const [l, v] of await retry(r, lacks(id, c), c.get(id, labels.finnish)!.issues!, render, { fetch: mock.fetch })) c.put(id, l, v);
    };
    await redo(rows.map((r) => r.id), attempt, () => false, vi.fn());
    expect(c.get("b::wi-0", labels.finnish)).toMatchObject({ src: "tab", verdict: "yes" });
    expect(c.get("b::wi-0", labels.yoe)?.src).toBe("tab");
    expect(c.get("b::wi-1", labels.finnish)).toMatchObject({ src: "none" });
    expect(steps(c.get("b::wi-1", labels.finnish)!.issues)).toEqual([
      ["fetch", "HTTP 429"],
      ["tab", "timed out after 20 s"],
    ]);
    expect(mock.calls).toHaveLength(1);
  });
});

describe("trainee jd", () => {
  it("reads the JD cache with no fetch and asks trainee only", async () => {
    store["jd:b::wi-0"] = { text: "x".repeat(500), src: "tab", at: 1 };
    const { d, mock } = deps(LONG, 0.95);
    expect(await deep(item("https://jobs.example.fi/1"), d)).toEqual({ verdict: "yes", score: 0.95, src: "tab" });
    expect(d.page).not.toHaveBeenCalled();
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["trainee"]);
  });

  it("gives null and no Jev call without text", async () => {
    const { d, mock } = deps(403);
    expect(await deep(item("https://jobs.example.fi/1"), d)).toBeNull();
    expect(mock.calls).toHaveLength(0);
  });
});

describe("seniority", () => {
  const go = (c: ReturnType<typeof cache>, d: Deps, mark = vi.fn()) => grade([item("https://jobs.example.fi/1")], { cache: c, deps: d, session: "s", mark, stop: () => false });

  it("asks only missing labels in one call with title and text", async () => {
    store["jd:b::wi-0"] = { text: "x".repeat(500), src: "page", at: 1 };
    const { d, mock } = deps(LONG, 0.95);
    const c = cache();
    await c.load();
    c.put("b::wi-0", labels.finnish, { verdict: "no", score: 0.1, src: "page" });
    c.put("b::wi-0", labels.experience, { verdict: "no", score: 0.1, src: "page" });
    c.put("b::wi-0", labels.senior, { verdict: "no", score: 0.1, src: "page" });
    const mark = vi.fn();
    await go(c, d, mark);
    expect(mock.calls).toHaveLength(1);
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["yoe", "staff", "manager", "developer", "trainee"]);
    expect(mock.calls[0]!.state).toEqual({ title: "Job 0", text: "x".repeat(500) });
    expect(mock.calls[0]!.headers["x-jf-flow"]).toBe("agilefant-seniority");
    expect(c.get("b::wi-0", labels.yoe)).toEqual({ v: 1, verdict: "yes", score: 0.95, src: "page" });
    expect(c.get("b::wi-0", labels.senior)?.score).toBe(0.1);
    expect(mark).toHaveBeenCalledWith("b::wi-0");
    expect(d.page).not.toHaveBeenCalled();
    await go(c, d);
    expect(mock.calls).toHaveLength(1);
  });

  it("backfills a new label with exactly one question on the cached JD, no page fetch", async () => {
    store["jd:b::wi-0"] = { text: "y".repeat(500), src: "page", at: 1 };
    const { d, mock } = deps(LONG, 0.95);
    const c = cache();
    await c.load();
    for (const l of Object.values(labels)) if (l !== labels.developer) c.put("b::wi-0", l, { verdict: "no", score: 0.1, src: "page" });
    await go(c, d);
    expect(d.page).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(1);
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["developer"]);
    expect(mock.calls[0]!.state).toEqual({ title: "Job 0", text: "y".repeat(500) });
    expect(c.get("b::wi-0", labels.developer)).toEqual({ v: 1, verdict: "yes", score: 0.95, src: "page" });
  });

  it("judges senior and staff from the title on failed rows and leaves yoe unlabeled", async () => {
    const { d, mock } = deps(LONG, 0.95);
    const c = cache();
    await c.load();
    c.put("b::wi-0", labels.finnish, { verdict: "unclear", src: "none", issues: [] });
    await go(c, d);
    expect(d.page).not.toHaveBeenCalled();
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["senior", "staff", "manager", "trainee"]);
    expect(mock.calls[0]!.state).toEqual({ title: "Job 0", text: "" });
    expect(c.get("b::wi-0", labels.senior)).toMatchObject({ verdict: "yes", src: "title" });
    expect(c.get("b::wi-0", labels.staff)?.src).toBe("title");
    expect(c.get("b::wi-0", labels.yoe)).toBeUndefined();
    await go(c, d);
    expect(mock.calls).toHaveLength(1);
  });

  it("falls back to the title when the fetch gives no text", async () => {
    const { d, mock } = deps(403);
    const c = cache();
    await c.load();
    await go(c, d);
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["senior", "staff", "manager", "trainee"]);
    expect(c.get("b::wi-0", labels.yoe)).toBeUndefined();
    expect(c.get("b::wi-0", labels.finnish)).toMatchObject({ src: "none" });
  });
});
