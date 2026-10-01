import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let store: Record<string, unknown>;

const server = () =>
  vi.fn(async (_url: string, init?: RequestInit) => {
    const { texts } = JSON.parse(String(init?.body)) as { texts: string[] };
    return new Response(JSON.stringify({ translations: texts.map((t) => `EN(${t})`) }), { status: 200 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

// Fresh module per test, so the memory map starts empty like a new page.
const fresh = async () => {
  vi.resetModules();
  return (await import("../lib/translate")).translate;
};

describe("translate cache", () => {
  beforeEach(() => {
    store = {};
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
          set: async (v: Record<string, unknown>) => Object.assign(store, v),
          remove: async (keys: string[]) => keys.forEach((k) => delete store[k]),
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reuses a translation stored by another page", async () => {
    const first = server();
    expect(await (await fresh())(["Myyjä"], "http://t", first)).toEqual(["EN(Myyjä)"]);
    const second = server();
    expect(await (await fresh())(["Myyjä", "Kokki"], "http://t", second)).toEqual(["EN(Myyjä)", "EN(Kokki)"]);
    expect(JSON.parse(String(second.mock.calls[0]![1]!.body)).texts).toEqual(["Kokki"]);
  });

  it("drops entries older than 30 days", async () => {
    store["tr:Myyjä"] = { en: "old", at: Date.now() - 31 * 24 * 60 * 60 * 1000 };
    const send = server();
    expect(await (await fresh())(["Myyjä"], "http://t", send)).toEqual(["EN(Myyjä)"]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("works from memory when storage is missing", async () => {
    vi.stubGlobal("browser", undefined);
    const send = server();
    const translate = await fresh();
    await translate(["Myyjä"], "http://t", send);
    expect(await translate(["Myyjä"], "http://t", send)).toEqual(["EN(Myyjä)"]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
