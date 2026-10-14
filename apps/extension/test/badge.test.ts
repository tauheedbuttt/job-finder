import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, cards, judge, place, remember, retitle, title } from "../lib/badge";
import { pill, row } from "../lib/pill";
import { pool } from "../lib/pool";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function jev(p: number) {
  const calls: Array<{ state: any; questions: Record<string, any> }> = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { type: string; criteria: Record<string, unknown> }>).map(([k, q]) =>
        q.type === "choice" ? [k, { type: "choice", choice: "b0", probabilities: { b0: 0.95 }, confidence: 0.95 }] : [k, { type: "noul", noul: p }],
      ),
    );
    return json({ model: "jev", answers });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

describe("judge", () => {
  it("uses the JSON-LD description directly and runs one fast check", async () => {
    const mock = jev(0.92);
    const out = await judge(fixture("duunitori.html"), { fetch: mock.fetch });
    expect(out).toEqual({ finnish: "yes", experience: "yes" });
    expect(mock.calls).toHaveLength(1);
    const [check] = mock.calls;
    expect(Object.keys(check!.questions)).toEqual(["requires_finnish", "requires_experience"]);
    expect(check!.state.text).toContain("sujuva suomen kielen taito suullisesti ja kirjallisesti");
    expect(check!.state.text).not.toContain("Duunitori Oy");
  });

  it("asks Jev to pick when the page has no JSON-LD", async () => {
    const mock = jev(0.1);
    expect(await judge(fixture("plain.html"), { fetch: mock.fetch })).toEqual({ finnish: "no", experience: "no" });
    expect(mock.calls).toHaveLength(2);
    expect(Object.keys(mock.calls[0]!.questions)).toEqual(["description"]);
  });

  it("maps a low score to no", async () => {
    expect(await judge(fixture("duunitori.html"), { fetch: jev(0.1).fetch })).toEqual({ finnish: "no", experience: "no" });
  });

  it("ends unclear without any Jev call when the page has no description", async () => {
    const mock = jev(0.9);
    expect(await judge(fixture("nonjob.html"), { fetch: mock.fetch })).toEqual({ finnish: "unclear", experience: "unclear" });
    expect(mock.calls).toHaveLength(0);
  });

  it("surfaces a network failure as TypeError", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof globalThis.fetch;
    await expect(judge(fixture("duunitori.html"), { fetch })).rejects.toBeInstanceOf(TypeError);
  });
});

describe("cache", () => {
  let store: Record<string, unknown>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
          set: async (v: Record<string, unknown>) => Object.assign(store, v),
          remove: async (k: string) => void delete store[k],
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns a fresh verdict per job URL", async () => {
    await remember("https://duunitori.fi/tyopaikat/tyo/a", { finnish: "no", experience: "yes" }, 1000);
    expect(await cached("https://duunitori.fi/tyopaikat/tyo/a", 2000)).toEqual({ finnish: "no", experience: "yes" });
    expect(await cached("https://duunitori.fi/tyopaikat/tyo/b", 2000)).toBeNull();
  });

  it("treats an entry without experience as a miss", async () => {
    store["badge:https://duunitori.fi/tyopaikat/tyo/a"] = { verdict: "no", at: 1000 };
    expect(await cached("https://duunitori.fi/tyopaikat/tyo/a", 2000)).toBeNull();
  });

  it("drops a verdict older than a day", async () => {
    await remember("https://duunitori.fi/tyopaikat/tyo/a", { finnish: "yes", experience: "no" }, 0);
    expect(await cached("https://duunitori.fi/tyopaikat/tyo/a", 24 * 60 * 60 * 1000)).toBeNull();
    expect(store).toEqual({});
  });
});

describe("cards", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="job-box"><a class="job-box__hover" href="/tyopaikat/tyo/a-1#x">A</a>
        <div class="job-box__content"><h3 class="job-box__title">A</h3><span class="tag">Katso</span></div>
        <a class="job-box__icon" href="/tyopaikat/tyo/a-1/lisaa_suosikkeihin">fav</a></div>
      <div class="job-box"><a href="https://employer.example/jobs/2">B</a></div>
      <div class="job-box"><span>no link</span></div>`;
  });

  it("finds each card and its job link without hash", () => {
    const found = cards(document);
    expect(found.map((c) => new URL(c.url).pathname)).toEqual(["/tyopaikat/tyo/a-1", "/jobs/2"]);
    expect(found[0]!.url).not.toContain("#");
  });

  it("puts the pill right under the title", () => {
    const [first, second] = cards(document);
    const a = pill();
    place(first!.card, a.el);
    expect(first!.card.querySelector(".job-box__title")!.nextElementSibling).toBe(a.el);
    const b = pill();
    place(second!.card, b.el);
    expect(second!.card.lastElementChild).toBe(b.el);
  });
});

describe("retitle", () => {
  const card = (name: string) => {
    document.body.innerHTML = `<div class="job-box"><div class="job-box__content"><h3 class="job-box__title">
      ${name}</h3></div></div>`;
    return document.querySelector(".job-box")!;
  };

  it("appends the English title after the original", () => {
    const c = card("Sähköasentajia Etelä-Suomen datakeskushankkeisiin");
    retitle(c, "Electricians for data center projects in Southern Finland");
    expect(title(c)).toBe("Sähköasentajia Etelä-Suomen datakeskushankkeisiin - Electricians for data center projects in Southern Finland");
  });

  it("skips English titles, empty translations and repeats", () => {
    const c = card("Senior Software Developer");
    retitle(c, " senior software  developer ");
    retitle(c, "");
    expect(title(c)).toBe("Senior Software Developer");
    const f = card("Myyjä");
    retitle(f, "Salesperson");
    retitle(f, "Seller");
    expect(title(f)).toBe("Myyjä - Salesperson");
  });
});

describe("pill", () => {
  it("renders each state inside a shadow root", () => {
    const p = pill();
    const label = () => p.el.shadowRoot!.querySelector("span")!;
    expect(label().textContent).toBe("Checking Finnish…");
    p.set("yes");
    expect(label().textContent).toBe("Finnish required");
    p.set("no");
    expect(label().textContent).toBe("No Finnish");
    p.set("unclear");
    expect(label().textContent).toBe("Unclear");
    p.set("error", "Translator offline");
    expect([label().textContent, label().title, p.state]).toEqual(["Check failed", "Translator offline", "error"]);
  });
});

describe("row", () => {
  const labels = (r: ReturnType<typeof row>) => [r.lead, r.experience].map((p) => p.el.shadowRoot!.querySelector("span")!.textContent);

  it("shows Finnish and experience side by side", () => {
    const r = row();
    expect(labels(r)).toEqual(["Checking Finnish…", "Checking experience…"]);
    expect(r.busy()).toBe(true);
    r.show({ finnish: "no", experience: "yes" });
    expect(labels(r)).toEqual(["No Finnish", "Experience required"]);
    r.show({ finnish: "unclear", experience: "no" });
    expect(labels(r)).toEqual(["Unclear", "No experience needed"]);
    r.show({ finnish: "no", experience: "unclear" });
    expect(labels(r)[1]).toBe("Experience unclear");
    expect(r.busy()).toBe(false);
  });

  it("fails both pills with one detail", () => {
    const r = row();
    r.fail("Translator offline");
    expect(labels(r)).toEqual(["Check failed", "Check failed"]);
    expect(r.experience.el.shadowRoot!.querySelector("span")!.title).toBe("Translator offline");
  });
});

describe("pool", () => {
  it("runs at most 5 tasks at once and finishes all", async () => {
    const limit = pool(5);
    let open = 0;
    let peak = 0;
    const task = async (i: number) => {
      open++;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return i;
    };
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => limit(() => task(i))));
    expect(peak).toBe(5);
    expect(out).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});
