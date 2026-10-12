import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dump, merge, name, pack, parse, restore } from "../lib/backup";

let local: Record<string, unknown>;

beforeEach(() => {
  local = { "labels:agilefant": { a: { finnish: { v: 2, verdict: "no", src: "page" } } }, keep: 1 };
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: async () => structuredClone(local),
        set: async (v: Record<string, unknown>) => void Object.assign(local, structuredClone(v)),
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("backup", () => {
  it("packs a versioned file with a dated name", () => {
    const at = new Date(2026, 9, 12, 9);
    const b = pack({ x: 1 }, {}, at);
    expect(b).toEqual({ app: "job-finder", version: 1, at: at.toISOString(), local: { x: 1 }, sync: {} });
    expect(name(at)).toBe("job-finder-backup-2026-10-12.json");
  });

  it("round trips through JSON and fills a missing sync", () => {
    const b = pack({ "jd:a": { text: "x", src: "page", at: 1 } }, {});
    expect(parse(JSON.stringify(b))).toEqual(b);
    const { sync: _, ...old } = b;
    expect(parse(JSON.stringify(old)).sync).toEqual({});
  });

  it("rejects bad JSON, other apps and unknown versions", () => {
    expect(() => parse("{")).toThrow("Not a JSON file");
    expect(() => parse(JSON.stringify({ ...pack({}, {}), app: "other" }))).toThrow("Not a Job Finder backup");
    expect(() => parse(JSON.stringify({ ...pack({}, {}), version: 2 }))).toThrow("Not a Job Finder backup");
    expect(() => parse(JSON.stringify({ ...pack({}, {}), local: [] }))).toThrow("Not a Job Finder backup");
  });

  it("counts imported and new keys", () => {
    expect(merge({ local: { a: 1 }, sync: {} }, pack({ a: 2, b: 3 }, { s: 1 }))).toEqual({ local: 2, sync: 1, fresh: 2 });
  });

  it("dumps storage with a missing sync area and restores over same keys only", async () => {
    const b = await dump();
    expect(b.local).toEqual(local);
    expect(b.sync).toEqual({});
    const got = await restore(pack({ keep: 2, "agilefant:removed": { x: 1 } }, {}));
    expect(got).toEqual({ local: 2, sync: 0, fresh: 1 });
    expect(local.keep).toBe(2);
    expect(local["labels:agilefant"]).toBeDefined();
    expect(local["agilefant:removed"]).toEqual({ x: 1 });
  });
});
