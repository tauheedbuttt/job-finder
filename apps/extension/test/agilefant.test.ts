import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { active, blank, counts, flip, items, sources, style, visible, type Ctx, type Item } from "../lib/agilefant";

const html = readFileSync(join(import.meta.dirname, "fixtures", "agilefant.html"), "utf8");

describe("items", () => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const list = items(doc);

  it("reads every row with its fields", () => {
    expect(list).toHaveLength(8);
    expect(list[0]).toEqual({
      id: "227ff1d1-36df-4f46-b97e-483ada92ccfb::wi-1b6f8fe6-3785-4753-a6fc-caaad3fec445",
      title: "coeo Perintä Oy - Asiakasneuvoja / Advisor (Helsinki)",
      url: "https://duunitori.fi/tyopaikat/tyo/coeo-perinta-oy-asiakasneuvoja-advisor-sdsuu-20615109",
      alt: "coeo Perintä Oy \u2014 Asiakasneuvoja / Advisor",
      host: "duunitori.fi",
      deadline: "2026-10-12",
      created: "2026-10-01",
    });
  });

  it("leaves a missing deadline null and strips www from hosts", () => {
    expect(list[6]!.deadline).toBeNull();
    expect(list[1]!.host).toBe("jobly.fi");
    expect(list.map((i) => i.host)).toContain("linkedin.com");
  });
});

describe("style", () => {
  it("hides each id through its li", () => {
    expect(style(["a::wi-1", "b::wi-2"])).toBe('li:has(> [data-item-id="a::wi-1"]),\nli:has(> [data-item-id="b::wi-2"]) { display: none !important }');
  });

  it("gives empty text for no ids", () => {
    expect(style([])).toBe("");
  });
});

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  title: id,
  url: `https://duunitori.fi/${id}`,
  alt: id,
  host: "duunitori.fi",
  deadline: null,
  created: "2026-09-01",
  ...over,
});

const ctx = (verdicts: Record<string, "yes" | "no" | "unclear"> = {}, offline = false): Ctx => ({
  today: "2026-10-12",
  verdict: (id) => verdicts[id],
  offline,
});

describe("facets", () => {
  const list = [
    item("a", { deadline: "2026-10-14", created: "2026-10-12" }),
    item("b", { deadline: "2026-12-01", host: "linkedin.com" }),
    item("c", { host: "linkedin.com", created: "2026-10-01" }),
    item("d", { deadline: "2026-10-13", host: "jobly.fi" }),
  ];

  it("shows all rows with no filter on", () => {
    expect(visible(list, blank, ctx())).toHaveLength(4);
  });

  it("counts each option with the other groups applied", () => {
    const f = { ...blank, hosts: ["linkedin.com"] };
    const got = counts(list, f, ctx());
    expect(got.deadline).toBe(1);
    expect(got.closing).toBe(0);
    expect(got["host:linkedin.com"]).toBe(2);
    expect(got["host:jobly.fi"]).toBe(1);
    const closing = counts(list, { ...blank, closing: true }, ctx());
    expect(closing["host:duunitori.fi"]).toBe(1);
    expect(closing["host:jobly.fi"]).toBe(1);
    expect(closing["host:linkedin.com"]).toBe(0);
  });

  it("dates follow the calendar", () => {
    const got = counts(list, blank, ctx());
    expect(got.week).toBe(1);
    expect(got.month).toBe(2);
    expect(got.closing).toBe(2);
  });

  it("keeps loading rows visible under the trainee filter", () => {
    const f = { ...blank, trainee: true };
    const c = ctx({ a: "yes", b: "no", c: "unclear" });
    expect(visible(list, f, c).map((i) => i.id)).toEqual(["a", "d"]);
    expect(visible(list, { ...f, unclear: true }, c).map((i) => i.id)).toEqual(["a", "c", "d"]);
    expect(counts(list, f, c).trainee).toBe(1);
  });

  it("hides nothing by role when the translator is offline", () => {
    expect(visible(list, { ...blank, trainee: true }, ctx({ b: "no" }, true))).toHaveLength(4);
  });

  it("shows only fetch-failed rows in failed view, ignoring hide chips", () => {
    const c = { ...ctx(), finnish: () => "yes" as const, failed: (id: string) => id === "a" || id === "c" };
    expect(visible(list, blank, c)).toHaveLength(0);
    expect(visible(list, { ...blank, failed: true }, c).map((i) => i.id)).toEqual(["a", "c"]);
    expect(counts(list, blank, c).failed).toBe(2);
  });

  it("hides Finnish-required rows by default and keeps unclear or unlabeled ones", () => {
    const c = { ...ctx(), finnish: (id: string) => ({ a: "yes", b: "unclear", c: "no" })[id] as "yes" | "no" | "unclear" | undefined };
    expect(visible(list, blank, c).map((i) => i.id)).toEqual(["b", "c", "d"]);
    expect(counts(list, blank, c).finnish).toBe(3);
    expect(visible(list, { ...blank, finnish: false }, c)).toHaveLength(4);
  });
});

describe("seniority chips", () => {
  const list = ["a", "b", "c", "d"].map((id) => item(id));
  const tags = { a: "yes", b: "no", c: "unclear" } as Record<string, "yes" | "no" | "unclear">;

  it("are on by default", () => {
    expect([blank.yoe, blank.senior, blank.staff]).toEqual([true, true, true]);
  });

  for (const key of ["yoe", "senior", "staff"] as const) {
    it(`${key} hides only its yes rows`, () => {
      const c = { ...ctx(), [key]: (id: string) => tags[id] };
      expect(visible(list, blank, c).map((i) => i.id)).toEqual(["b", "c", "d"]);
      expect(counts(list, blank, c)[key]).toBe(3);
      expect(visible(list, { ...blank, [key]: false }, c)).toHaveLength(4);
      expect(active({ ...blank, [key]: false })).toBe(true);
    });
  }

  it("leaves reset hidden on defaults", () => {
    expect(active(blank)).toBe(false);
  });
});

describe("flip", () => {
  it("toggles a flag or a host", () => {
    expect(flip(blank, "closing").closing).toBe(true);
    const f = flip(flip(blank, "host:a.fi"), "host:b.fi");
    expect(f.hosts).toEqual(["a.fi", "b.fi"]);
    expect(flip(f, "host:a.fi").hosts).toEqual(["b.fi"]);
  });

  it("orders sources by row count", () => {
    expect(sources([item("a", { host: "x.fi" }), item("b", { host: "y.fi" }), item("c", { host: "y.fi" })])).toEqual(["y.fi", "x.fi"]);
  });
});
