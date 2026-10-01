import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { english, heading, leaves, root } from "../lib/jd";
import { suffix } from "../lib/badge";

const html = readFileSync(join(import.meta.dirname, "fixtures", "detail.html"), "utf8");

const fake = vi.fn(async (texts: string[]) => texts.map((t) => `EN(${t})`));

beforeEach(() => {
  fake.mockClear();
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
});

describe("detail page", () => {
  it("finds the description and its heading", () => {
    expect(root(document)!.classList.contains("description--jobentry")).toBe(true);
    expect(heading(document)!.textContent).toBe("Työpaikkakuvaus");
  });

  it("collects leaf blocks with text only", () => {
    const got = leaves(root(document)!).map((el) => el.textContent);
    expect(got).toEqual([
      "Tule Schindlerille. Hissimme liikuttavat maailmaa.",
      "Hissiasentaja uudiskohteille",
      "sujuva suomen kielen taito",
      "Tervetuloa osaksi tiimiä!",
      "Sisäkkäinen kappale.",
    ]);
  });

  it("translates per sentence in one call and restores the original", async () => {
    const el = root(document)!;
    const before = el.innerHTML;
    const original = await english(el, fake);
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0]![0]).toContain("Tule Schindlerille.");
    expect(el.querySelector("p")!.textContent).toBe("EN(Tule Schindlerille.) EN(Hissimme liikuttavat maailmaa.)");
    expect(el.querySelector("li")!.textContent).toBe("EN(sujuva suomen kielen taito)");
    expect(original).toBe(before);
    el.innerHTML = original;
    expect(el.innerHTML).toBe(before);
  });

  it("leaves the page untouched when translation fails", async () => {
    const el = root(document)!;
    const before = el.innerHTML;
    await expect(english(el, async () => Promise.reject(new TypeError("Failed to fetch")))).rejects.toBeInstanceOf(TypeError);
    expect(el.innerHTML).toBe(before);
  });

  it("adds the English title to h1 once", () => {
    const h1 = document.querySelector("h1")!;
    suffix(h1, "Elevator installer for new buildings, capital region");
    suffix(h1, "Elevator installer");
    expect(h1.textContent).toBe("Hissiasentaja uudiskohteille, Pääkaupunkiseutu - Elevator installer for new buildings, capital region");
  });
});
