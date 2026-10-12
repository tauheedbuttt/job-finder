import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { items, ROWS } from "../lib/agilefant";
import { decorate, kept, pick } from "../lib/removed";

const html = readFileSync(join(import.meta.dirname, "fixtures", "agilefant.html"), "utf8");

describe("removed", () => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const list = items(doc);
  const gone = { [list[0]!.id]: 1, [list[2]!.id]: 2 };

  it("drops removed rows from the normal list", () => {
    expect(kept(list, gone).map((i) => i.id)).not.toContain(list[0]!.id);
    expect(kept(list, gone)).toHaveLength(6);
  });

  it("shows only removed rows in the removed view", () => {
    expect(pick(list, gone).map((i) => i.id)).toEqual([list[0]!.id, list[2]!.id]);
  });

  it("adds one button per row and flips its label in the removed view", () => {
    decorate(doc, false);
    decorate(doc, false);
    const rows = [...doc.querySelectorAll(ROWS)];
    expect(rows.every((r) => r.querySelectorAll("[data-jf-remove]").length === 1)).toBe(true);
    expect(rows[0]!.querySelector("[data-jf-remove]")!.getAttribute("aria-label")).toBe("Remove job");
    decorate(doc, true);
    expect(rows[0]!.querySelector("[data-jf-remove]")!.getAttribute("aria-label")).toBe("Restore job");
  });
});
