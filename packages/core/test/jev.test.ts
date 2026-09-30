import { describe, expect, it } from "vitest";
import { JevError, jev } from "../src/index";
import { choice, noul, transport } from "./mock";

describe("jev", () => {
  it("posts state and questions to translator /jev and types answers", async () => {
    const mock = transport(() => ({ a: noul(0.8), b: choice("x", { x: 0.9, y: 0.1 }) }));
    const out = await jev(
      { text: "hei" },
      {
        a: { type: "noul", instructions: "Is it a greeting?" },
        b: { type: "choice", instructions: "Pick", criteria: { x: null, y: "why" } },
      },
      { base: "http://localhost:9999/", fetch: mock.fetch },
    );
    expect(mock.calls[0]?.url).toBe("http://localhost:9999/jev");
    expect(mock.calls[0]?.body.state).toEqual({ text: "hei" });
    expect(out.answers.a.noul).toBe(0.8);
    expect(out.answers.b.probabilities.y).toBe(0.1);
  });

  it("defaults base to localhost 8790", async () => {
    const mock = transport(() => ({ a: noul(1) }));
    await jev("s", { a: { type: "noul", instructions: "?" } }, { fetch: mock.fetch });
    expect(mock.calls[0]?.url).toBe("http://localhost:8790/jev");
  });

  it("throws JevError with status and detail on failure", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ detail: "TYPESAFE_API_KEY is not set" }), { status: 503 })) as typeof globalThis.fetch;
    const err = await jev("s", { a: { type: "noul", instructions: "?" } }, { fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(JevError);
    expect(err.status).toBe(503);
    expect(err.message).toContain("TYPESAFE_API_KEY");
  });

  it("rejects answers that do not match the question type", async () => {
    const mock = transport(() => ({ a: choice("x", { x: 1 }) }));
    await expect(jev("s", { a: { type: "noul", instructions: "?" } }, { fetch: mock.fetch })).rejects.toThrow(JevError);
  });

  it("rejects missing answers", async () => {
    const mock = transport(() => ({}));
    await expect(jev("s", { a: { type: "noul", instructions: "?" } }, { fetch: mock.fetch })).rejects.toThrow(/a/);
  });
});
