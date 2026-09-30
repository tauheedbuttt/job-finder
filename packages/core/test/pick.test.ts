import { describe, expect, it } from "vitest";
import { pickApply, pickDescription, type Block } from "../src/index";
import { choice, noul, transport } from "./mock";

const candidates = [
  { id: "c0", tag: "a", text: "Etusivu", href: "https://x.fi/", aria: "", context: "nav" },
  { id: "c1", tag: "button", text: "Hae paikkaa", href: "", aria: "", context: "Ohjelmistokehittäjä" },
];

const blocks: Block[] = [
  { id: "b0", text: "Evästeet", source: "dom" },
  { id: "b1", text: "Haemme kehittäjää tiimiimme.", source: "jsonld" },
];

describe("pickApply", () => {
  it("chooses over ids plus none, then confirms the winner", async () => {
    const mock = transport(
      () => ({ apply: choice("c1", { c0: 0.05, c1: 0.9, none: 0.05 }) }),
      () => ({ confirm: noul(0.85) }),
    );
    const out = await pickApply(candidates, { fetch: mock.fetch });
    expect(out).toEqual({ id: "c1", confidence: 0.85 });
    const [first, second] = mock.calls;
    expect(Object.keys(first!.body.questions.apply.criteria)).toEqual(["c0", "c1", "none"]);
    expect(first!.body.questions.apply.type).toBe("choice");
    expect(first!.body.state).toEqual({ candidates });
    expect(second!.body.state).toEqual({ candidate: candidates[1] });
    expect(second!.body.questions.confirm.type).toBe("noul");
  });

  it("returns null when confirmation fails", async () => {
    const mock = transport(
      () => ({ apply: choice("c0", { c0: 0.6, c1: 0.3, none: 0.1 }) }),
      () => ({ confirm: noul(0.2) }),
    );
    expect(await pickApply(candidates, { fetch: mock.fetch })).toEqual({ id: null, confidence: 0.8 });
  });

  it("returns null without a second call when none wins", async () => {
    const mock = transport(() => ({ apply: choice("none", { c0: 0.1, c1: 0.1, none: 0.8 }) }));
    expect(await pickApply(candidates, { fetch: mock.fetch })).toEqual({ id: null, confidence: 0.8 });
    expect(mock.calls).toHaveLength(1);
  });

  it("skips the network for no candidates", async () => {
    const mock = transport();
    expect(await pickApply([], { fetch: mock.fetch })).toEqual({ id: null, confidence: 1 });
  });

  it("caps options at the choice limit", async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ ...candidates[0]!, id: `c${i}` }));
    const mock = transport((q: any) => ({ apply: choice("none", { none: 1 }) }));
    await pickApply(many, { fetch: mock.fetch });
    expect(Object.keys(mock.calls[0]!.body.questions.apply.criteria)).toHaveLength(255);
  });
});

describe("pickDescription", () => {
  it("chooses over block ids plus none", async () => {
    const mock = transport(() => ({ description: choice("b1", { b0: 0.1, b1: 0.85, none: 0.05 }) }));
    expect(await pickDescription(blocks, { fetch: mock.fetch })).toEqual({ id: "b1", confidence: 0.85 });
    expect(Object.keys(mock.calls[0]!.body.questions.description.criteria)).toEqual(["b0", "b1", "none"]);
  });

  it("returns null for none", async () => {
    const mock = transport(() => ({ description: choice("none", { b0: 0.1, b1: 0.1, none: 0.8 }) }));
    expect(await pickDescription(blocks, { fetch: mock.fetch })).toEqual({ id: null, confidence: 0.8 });
  });

  it("trims long blocks in state", async () => {
    const mock = transport(() => ({ description: choice("b0", { b0: 1 }) }));
    await pickDescription([{ id: "b0", text: "x".repeat(10000), source: "dom" }], { fetch: mock.fetch });
    const state = mock.calls[0]!.body.state as { blocks: { text: string }[] };
    expect(state.blocks[0]!.text.length).toBeLessThanOrEqual(1500);
  });
});
