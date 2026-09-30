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
