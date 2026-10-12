import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../lib/agilefant";
import { check, MIN, order, plain, run, source, type Deps } from "../lib/finnish";
import { cache, labels } from "../lib/labels";
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
        get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
        set: async (v: Record<string, unknown>) => void Object.assign(store, structuredClone(v)),
        remove: async (k: string) => void delete store[k],
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

const item = (url: string, i = 0): Item => ({ id: `b::wi-${i}`, title: `Job ${i}`, url, alt: "", host: new URL(url).hostname, deadline: null, created: null });

function deps(page: string | Error | number, shown: Rendered = { ok: true, html: LONG }, p = 0.9) {
  const mock = jev(p);
  const d: Deps = {
    page: vi.fn(async () => {
      if (page instanceof Error) throw page;
      return typeof page === "number" ? new Response("", { status: page }) : new Response(page, { status: 200 });
    }) as unknown as typeof globalThis.fetch,
    render: vi.fn(async () => shown),
    opts: { fetch: mock.fetch },
  };
  return { d, mock };
}

describe("finnish source", () => {
  it("uses the fetch when the text is long enough", async () => {
    const { d } = deps(LONG);
    const got = await source("https://jobs.example.fi/1", d);
    expect(got.text!.length).toBeGreaterThanOrEqual(MIN);
    expect(got.issues).toEqual([]);
    expect(d.render).not.toHaveBeenCalled();
  });

  it("renders when the fetch gives a shell, and keeps the fetch issue", async () => {
    const { d } = deps(SHELL);
    const got = await source("https://jobs.example.fi/1", d);
    expect(d.render).toHaveBeenCalledWith("https://jobs.example.fi/1");
    expect(got.text).toContain("sujuva suomen kielen taito");
    expect(got.issues.map((i) => [i.step, i.message])).toEqual([["fetch", "text too short, rendered instead"]]);
  });

  it("renders walled hosts without a fetch", async () => {
    const { d } = deps(LONG);
    await source("https://www.linkedin.com/jobs/view/1", d);
    expect(d.page).not.toHaveBeenCalled();
    expect(d.render).toHaveBeenCalledOnce();
  });

  it("renders after a failed or non-2xx fetch", async () => {
    for (const page of [new TypeError("Failed to fetch"), 403]) {
      const { d } = deps(page);
      const got = await source("https://jobs.example.fi/1", d);
      expect(d.render).toHaveBeenCalledOnce();
      expect(got.issues[0]!.step).toBe("fetch");
    }
  });

  it("records a render error and fails the row", async () => {
    const { d, mock } = deps(SHELL, { ok: false, error: "timed out after 20 s" });
    const got = await check(item("https://jobs.example.fi/1"), d);
    expect(got.finnish).toMatchObject({ verdict: "unclear", src: "none" });
    expect(got.finnish.issues!.map((i) => [i.step, i.message])).toEqual([
      ["fetch", "text too short, rendered instead"],
      ["render", "timed out after 20 s"],
    ]);
    expect(mock.calls).toHaveLength(0);
  });

  it("falls back to whole page text without nav or scripts", () => {
    const text = plain("<body><nav>Menu</nav><main>  Kielitaito:\n suomi </main><script>x()</script><footer>Foot</footer></body>");
    expect(text).toBe("Kielitaito: suomi");
  });
});

describe("finnish check", () => {
  it("judges the page with checkFast and caches finnish plus experience", async () => {
    const { d, mock } = deps(LONG);
    const c = cache();
    await c.load();
    await run([item("https://jobs.example.fi/1")], { cache: c, deps: d, session: "s", mark: vi.fn(), stop: () => false });
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["requires_finnish", "requires_experience"]);
    expect(mock.calls[0]!.headers["x-jf-flow"]).toBe("agilefant-finnish");
    expect(c.get("b::wi-0", labels.finnish)).toEqual({ v: 1, verdict: "yes", score: 0.9, src: "page" });
    expect(c.get("b::wi-0", labels.experience)?.verdict).toBe("yes");
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
    const { d } = deps(LONG, undefined, 0.1);
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
