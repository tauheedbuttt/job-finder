import { describe, expect, it } from "vitest";
import { owner, panel } from "../lib/tab";

describe("per-tab panel", () => {
  it("builds a panel path bound to one tab", () => {
    expect(panel(42)).toBe("sidepanel.html?tab=42");
  });

  it("reads the owning tab back from the query", () => {
    expect(owner("?tab=42")).toBe(42);
    expect(owner(new URL(`chrome-extension://x/${panel(7)}`).search)).toBe(7);
  });

  it("returns null without a valid tab", () => {
    expect(owner("")).toBeNull();
    expect(owner("?tab=abc")).toBeNull();
  });
});
