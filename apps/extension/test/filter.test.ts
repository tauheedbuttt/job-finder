import { afterEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../lib/badge";
import { hides, sift } from "../lib/filter";
import { defaults, load } from "../lib/settings";

const result = (experience: Result["experience"]): Result => ({ finnish: "no", experience });

describe("hides", () => {
  it("hides only experience-required roles when the toggle is on", () => {
    const on = { hideExperienced: true };
    expect(hides(result("yes"), on)).toBe(true);
    expect(hides(result("unclear"), on)).toBe(false);
    expect(hides(result("no"), on)).toBe(false);
  });

  it("hides nothing when the toggle is off", () => {
    expect(hides(result("yes"), { hideExperienced: false })).toBe(false);
  });
});

describe("sift", () => {
  it("hides a card and brings it back without removing it", () => {
    const list = document.createElement("div");
    const card = document.createElement("div");
    list.append(card);
    sift(card, true);
    expect(card.style.display).toBe("none");
    expect(card.hasAttribute("data-jf-hidden")).toBe(true);
    expect(card.parentElement).toBe(list);
    sift(card, false);
    expect(card.style.display).toBe("");
    expect(card.hasAttribute("data-jf-hidden")).toBe(false);
  });

  it("leaves a card alone that it never hid", () => {
    const card = document.createElement("div");
    card.style.display = "flex";
    sift(card, false);
    expect(card.style.display).toBe("flex");
  });
});

describe("load", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fills hideExperienced as false for settings saved before the toggle", async () => {
    vi.stubGlobal("browser", { storage: { local: { get: async () => ({ settings: { url: "http://x" } }) } } });
    const got = await load();
    expect(got.hideExperienced).toBe(false);
    expect(got.url).toBe("http://x");
    expect(defaults.hideExperienced).toBe(false);
  });
});
