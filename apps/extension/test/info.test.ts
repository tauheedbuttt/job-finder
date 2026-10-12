import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { items, ROWS } from "../lib/agilefant";
import { lines, mark, tip, type Known } from "../lib/info";

const html = readFileSync(join(import.meta.dirname, "fixtures", "agilefant.html"), "utf8");
const at = new Date(2026, 9, 12, 14, 2).getTime();

describe("info", () => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const list = items(doc);
  const facts: Record<string, Known> = {
    [list[0]!.id]: {
      entries: {
        finnish: { v: 1, verdict: "yes", score: 0.91, src: "page", issues: [{ step: "fetch", message: "text too short, rendered instead", at }] },
        trainee: { v: 1, verdict: "yes", score: 0.88, src: "title" },
      },
      notes: [],
    },
    [list[1]!.id]: { entries: {}, notes: [{ step: "finnish", message: "not labeled", at }] },
    [list[2]!.id]: { entries: { trainee: { v: 1, verdict: "no", score: 0.1, src: "title" } }, notes: [] },
  };
  const look = (id: string): Known => facts[id] ?? { entries: {}, notes: [] };

  it("shows the icon only for rows with labels or issues, tinted on issues", () => {
    mark(doc, look);
    mark(doc, look);
    const rows = [...doc.querySelectorAll<HTMLElement>(ROWS)];
    const icons = rows.map((r) => r.querySelectorAll("[data-jf-info]").length);
    expect(icons).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
    expect(rows[0]!.querySelector("[data-jf-info]")!.hasAttribute("data-issue")).toBe(true);
    expect(rows[1]!.querySelector("[data-jf-info]")!.hasAttribute("data-issue")).toBe(true);
    expect(rows[2]!.querySelector("[data-jf-info]")!.hasAttribute("data-issue")).toBe(false);
  });

  it("tags Finnish rows after the link, once", () => {
    const rows = [...doc.querySelectorAll<HTMLElement>(ROWS)];
    const tag = rows[0]!.querySelectorAll("[data-jf-tag]");
    expect(tag).toHaveLength(1);
    expect(tag[0]!.textContent).toBe("Finnish required");
    expect(tag[0]!.previousElementSibling!.matches("a[href]")).toBe(true);
    expect(rows[2]!.querySelector("[data-jf-tag]")).toBeNull();
  });

  it("lists label lines then issue lines", () => {
    expect(lines(facts[list[0]!.id]!)).toEqual({
      labels: ["Finnish · required (0.91) · page", "Trainee · yes (0.88) · title"],
      issues: ["Fetch · text too short, rendered instead · 14:02"],
    });
    const out = tip(facts[list[0]!.id]!);
    expect(out.indexOf("Labels")).toBeLessThan(out.indexOf("Issues"));
    expect(tip(facts[list[1]!.id]!)).not.toContain("Labels");
    expect(lines(facts[list[1]!.id]!).issues).toEqual(["Finnish · not labeled · 14:02"]);
  });
});
