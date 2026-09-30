import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { scanBlocks, scanCandidates, text } from "../lib/dom";

function load(name: string) {
  const html = readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
  document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*<html[^>]*>|<\/html>\s*$/gi, "");
}

describe("text", () => {
  it("skips scripts and styles and breaks lines on blocks", () => {
    document.body.innerHTML = "<div><p>Yksi <b>kaksi</b></p><script>x()</script><ul><li>A</li><li>B</li></ul></div>";
    expect(text(document.body).split("\n").filter(Boolean)).toEqual(["Yksi kaksi", "A", "B"]);
  });
});

describe("scanBlocks", () => {
  beforeEach(() => load("jsonld.html"));

  it("puts JSON-LD JobPosting first, as plain text", () => {
    const { data } = scanBlocks(document);
    expect(data[0]).toMatchObject({ id: "b0", source: "jsonld" });
    expect(data[0]!.text).toContain("Haemme kehittäjää tiimiimme.");
    expect(data[0]!.text).not.toContain("<p>");
    expect(data[0]!.text.split("\n")).toContain("TypeScript");
  });

  it("adds the tight DOM container of the description and maps ids to elements", () => {
    const { data, elements } = scanBlocks(document);
    const dom = data.filter((b) => b.source === "dom");
    const body = dom.find((b) => b.text.includes("Haemme kokenutta"));
    expect(body).toBeDefined();
    expect(elements.get(body!.id)?.className).toBe("body");
    expect(body!.text).not.toContain("tracking");
    expect(data.map((b) => b.id)).toEqual(data.map((_, i) => `b${i}`));
  });

  it("skips small DOM containers", () => {
    const { data } = scanBlocks(document);
    expect(data.filter((b) => b.source === "dom").every((b) => b.text.length >= 200)).toBe(true);
  });
});

describe("scanCandidates", () => {
  beforeEach(() => load("jsonld.html"));

  it("collects visible clickables with tag, text, href, aria and context", () => {
    const { data, elements } = scanCandidates(document);
    const apply = data.find((c) => c.text === "Hae paikkaa");
    expect(apply).toMatchObject({ tag: "button", href: "", aria: "", context: "article: Ohjelmistokehittäjä" });
    expect(elements.get(apply!.id)?.className).toBe("apply");
    const share = data.find((c) => c.aria === "Jaa");
    expect(share?.href).toBe("");
    expect(data.some((c) => c.text === "Piilotettu")).toBe(false);
  });

  it("dedupes identical links and puts nav and footer last", () => {
    const { data } = scanCandidates(document);
    expect(data.filter((c) => c.text === "Etusivu")).toHaveLength(1);
    expect(data[0]!.text).toBe("Hae paikkaa");
    expect(data.at(-1)!.context).toMatch(/^(nav|footer|header)/);
    expect(data.map((c) => c.id)).toEqual(data.map((_, i) => `c${i}`));
    expect(data.find((c) => c.text === "Kirjaudu")?.href).toMatch(/\/kirjaudu$/);
  });

  it("caps at 254", () => {
    document.body.innerHTML = Array.from({ length: 300 }, (_, i) => `<a href="/j/${i}">Job ${i}</a>`).join("");
    expect(scanCandidates(document).data).toHaveLength(254);
  });
});

describe("DOM-only posting", () => {
  beforeEach(() => load("plain.html"));

  it("finds the description container without JSON-LD", () => {
    const { data, elements } = scanBlocks(document);
    expect(data.every((b) => b.source === "dom")).toBe(true);
    const desc = data.find((b) => b.text.includes("backend developer"));
    expect(elements.get(desc!.id)?.className).toBe("desc");
  });

  it("keeps link href, title as aria, and submit input value", () => {
    const { data } = scanCandidates(document);
    expect(data.find((c) => c.text === "Apply")).toMatchObject({
      tag: "a",
      href: "https://apply.example.com/acme/123",
      aria: "Apply now",
      context: "section: Backend Developer",
    });
    expect(data.find((c) => c.tag === "input")?.text).toBe("Save job");
  });
});

describe("non-job page", () => {
  beforeEach(() => load("nonjob.html"));

  it("yields no blocks and skips disabled buttons", () => {
    expect(scanBlocks(document).data).toEqual([]);
    const { data } = scanCandidates(document);
    expect(data.map((c) => c.text)).toEqual(["More"]);
  });
});
