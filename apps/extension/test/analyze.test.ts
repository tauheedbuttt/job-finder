import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../lib/messages";
import { defaults } from "../lib/settings";

vi.stubGlobal("browser", { storage: { local: { get: async () => ({}), set: async () => {} } } });

const scan = {
  url: "https://x.fi/job",
  title: "Job",
  blocks: [{ id: "b0", text: "Edellytämme suomea. Englanti riittää myös.", source: "jsonld" }],
  candidates: [{ id: "c0", tag: "a", text: "Hae", href: "https://x.fi/hae", aria: "", context: "article" }],
};

function tab() {
  const sent: Message[] = [];
  const send = async <T,>(msg: Message): Promise<T> => {
    sent.push(msg);
    return (msg.type === "scan" ? scan : msg.type === "mark" ? { found: msg.marks.map((m) => m.id) } : true) as T;
  };
  return { sent, send };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function server(overrides: { health?: () => Response; translate?: () => Response } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/health")) return overrides.health?.() ?? json({ ok: true });
    if (url.endsWith("/translate")) {
      if (overrides.translate) return overrides.translate();
      const { texts } = JSON.parse(String(init?.body));
      return json({ translations: texts.map((t: string) => `[en] ${t}`) });
    }
    const { questions } = JSON.parse(String(init?.body));
    const answers = Object.fromEntries(
      Object.entries(questions as Record<string, { type: string; criteria: Record<string, unknown> }>).map(([k, q]) =>
        q.type === "choice"
          ? [k, { type: "choice", choice: Object.keys(q.criteria)[0], probabilities: { [Object.keys(q.criteria)[0]!]: 1 }, confidence: 1 }]
          : [k, { type: "noul", noul: k === "fi_s0" || k === "requires_finnish" || k === "confirm" ? 0.9 : 0.1 }],
      ),
    );
    return json({ model: "jev", answers });
  });
}

afterEach(() => vi.unstubAllGlobals());

// Fresh modules per test so the translation cache never leaks between cases.
async function analyze(...args: Parameters<typeof import("../lib/analyze").analyze>) {
  vi.resetModules();
  return (await import("../lib/analyze")).analyze(...args);
}

describe("analyze", () => {
  it("runs the full flow and marks evidence", async () => {
    vi.stubGlobal("fetch", server());
    const { sent, send } = tab();
    const out = await analyze(send, defaults, () => {});
    expect(out.finnish?.verdict).toBe("yes");
    expect(out.sentences[0]).toEqual({ id: "s0", fi: "Edellytämme suomea.", en: "[en] Edellytämme suomea." });
    expect(out.apply?.id).toBe("c0");
    expect(sent.find((m) => m.type === "mark")).toMatchObject({ marks: [{ id: "s0", kind: "red" }] });
  });

  it("stops with one clear error when the translator is offline", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    const { sent, send } = tab();
    await expect(analyze(send, defaults, () => {})).rejects.toThrow(/Translator offline at http:\/\/localhost:8790/);
    expect(sent).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops without a partial run when translation fails", async () => {
    vi.stubGlobal("fetch", server({ translate: () => json({ detail: "boom" }, 500) }));
    const { sent, send } = tab();
    await expect(analyze(send, defaults, () => {})).rejects.toThrow(/Translator error 500/);
    expect(sent.some((m) => m.type === "mark")).toBe(false);
  });

  it("treats a network failure mid-run as offline", async () => {
    let calls = 0;
    const base = server();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (++calls > 1) throw new TypeError("Failed to fetch");
        return base(url, init);
      }),
    );
    const { send } = tab();
    await expect(analyze(send, defaults, () => {})).rejects.toThrow(/Translator offline/);
  });

  it("stops on a Jev error instead of guessing", async () => {
    const base = server();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        url.endsWith("/jev") ? json({ detail: "TYPESAFE_API_KEY is not set" }, 503) : base(url, init),
      ),
    );
    const { sent, send } = tab();
    await expect(analyze(send, defaults, () => {})).rejects.toThrow(/TYPESAFE_API_KEY/);
    expect(sent.some((m) => m.type === "mark")).toBe(false);
  });
});
