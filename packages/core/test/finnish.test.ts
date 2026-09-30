import { describe, expect, it } from "vitest";
import { checkFinnish } from "../src/index";
import { noul, transport } from "./mock";

const sentences = [
  { id: "s0", fi: "Edellytämme sujuvaa suomen kielen taitoa.", en: "We require fluent Finnish." },
  { id: "s1", fi: "Englanti riittää.", en: "English is enough." },
  { id: "s2", fi: "Toimisto on Espoossa.", en: "The office is in Espoo." },
];

function reply(overall: number, per: Record<string, number>) {
  return (questions: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(questions).map((k) => [k, noul(k === "requires_finnish" ? overall : per[k] ?? 0.1)]));
}

describe("checkFinnish", () => {
  it("sends one request with sentences state, whole-JD and per-sentence nouls", async () => {
    const mock = transport(reply(0.9, {}));
    await checkFinnish({ sentences }, { fetch: mock.fetch });
    expect(mock.calls).toHaveLength(1);
    const { state, questions } = mock.calls[0]!.body;
    expect(state).toEqual({ sentences });
    expect(Object.keys(questions).sort()).toEqual(
      ["requires_finnish", "fi_s0", "en_s0", "fi_s1", "en_s1", "fi_s2", "en_s2"].sort(),
    );
    for (const q of Object.values(questions)) expect(q.type).toBe("noul");
    expect(JSON.stringify(questions.requires_finnish.instructions)).toContain("Does this job require or indicate Finnish language skill in any way?");
    expect(JSON.stringify(questions.fi_s1)).toContain("`sentences[1]`");
    expect(JSON.stringify(questions.en_s2)).toContain("`sentences[2]`");
  });

  it.each([
    [0.7, "yes"],
    [0.95, "yes"],
    [0.3, "no"],
    [0.05, "no"],
    [0.5, "unclear"],
    [0.69, "unclear"],
  ])("maps score %s to %s with default thresholds", async (p, verdict) => {
    const out = await checkFinnish({ sentences }, { fetch: transport(reply(p, {})).fetch });
    expect(out.verdict).toBe(verdict);
    expect(out.score).toBe(p);
  });

  it("honours custom thresholds", async () => {
    const out = await checkFinnish({ sentences }, { fetch: transport(reply(0.6, {})).fetch, thresholds: { yes: 0.55 } });
    expect(out.verdict).toBe("yes");
  });

  it("maps sentence nouls to red and green spans at p >= 0.6", async () => {
    const mock = transport(reply(0.8, { fi_s0: 0.92, en_s0: 0.05, fi_s1: 0.2, en_s1: 0.6, fi_s2: 0.59, en_s2: 0.3 }));
    const out = await checkFinnish({ sentences }, { fetch: mock.fetch });
    expect(out.spans).toEqual([
      { id: "s0", kind: "red", p: 0.92 },
      { id: "s1", kind: "green", p: 0.6 },
    ]);
  });

  it("keeps the stronger kind when both pass", async () => {
    const mock = transport(reply(0.5, { fi_s0: 0.7, en_s0: 0.8 }));
    const out = await checkFinnish({ sentences: sentences.slice(0, 1) }, { fetch: mock.fetch });
    expect(out.spans).toEqual([{ id: "s0", kind: "green", p: 0.8 }]);
  });
});

describe("checkFinnish chunking", () => {
  const many = Array.from({ length: 95 }, (_, i) => ({ id: `s${i}`, fi: `Lause ${i}.`, en: `Sentence ${i}.` }));

  it("splits into requests of 40 sentences, each asking requires_finnish", async () => {
    const mock = transport(reply(0.2, {}), reply(0.2, {}), reply(0.2, {}));
    await checkFinnish({ sentences: many }, { fetch: mock.fetch });
    expect(mock.calls).toHaveLength(3);
    const sizes = mock.calls.map((c) => (c.body.state as { sentences: unknown[] }).sentences.length);
    expect(sizes.sort((a, b) => b - a)).toEqual([40, 40, 15]);
    for (const c of mock.calls) {
      expect(c.body.questions.requires_finnish).toBeDefined();
      expect(Object.keys(c.body.questions)).toHaveLength(1 + 2 * (c.body.state as { sentences: unknown[] }).sentences.length);
    }
  });

  it("indexes sentences within their chunk", async () => {
    const mock = transport(reply(0.2, {}), reply(0.2, {}), reply(0.2, {}));
    await checkFinnish({ sentences: many }, { fetch: mock.fetch });
    const last = mock.calls.find((c) => "fi_s94" in c.body.questions)!;
    expect(JSON.stringify(last.body.questions.fi_s94)).toContain("`sentences[14]`");
    expect((last.body.state as { sentences: { id: string }[] }).sentences[14]!.id).toBe("s94");
  });

  it("runs chunks in parallel", async () => {
    let open = 0;
    let peak = 0;
    const fetch = (async (_url: string, init?: RequestInit) => {
      open++;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 10));
      open--;
      const { questions } = JSON.parse(String(init?.body));
      const answers = Object.fromEntries(Object.keys(questions).map((k) => [k, noul(0.1)]));
      return new Response(JSON.stringify({ model: "jev", answers }), { status: 200 });
    }) as typeof globalThis.fetch;
    await checkFinnish({ sentences: many }, { fetch });
    expect(peak).toBe(3);
  });

  it("merges score by max and keeps spans from every chunk", async () => {
    const answer = (questions: Record<string, unknown>) => {
      const late = "fi_s90" in questions;
      return Object.fromEntries(
        Object.keys(questions).map((k) => [k, noul(k === "requires_finnish" ? (late ? 0.85 : 0.1) : k === "fi_s90" || k === "en_s3" ? 0.9 : 0.05)]),
      );
    };
    const out = await checkFinnish({ sentences: many }, { fetch: transport(answer, answer, answer).fetch });
    expect(out.score).toBe(0.85);
    expect(out.verdict).toBe("yes");
    expect(out.spans).toEqual([
      { id: "s3", kind: "green", p: 0.9 },
      { id: "s90", kind: "red", p: 0.9 },
    ]);
  });
});
