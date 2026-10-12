import { describe, expect, it } from "vitest";
import { bounds } from "../lib/settings";

describe("bounds", () => {
  it("keeps yes above no by one step", () => {
    expect(bounds({ yes: 0.7, no: 0.3 })).toEqual({ yes: { min: 0.35, max: 1 }, no: { min: 0, max: 0.65 } });
  });

  it("rounds away float noise", () => {
    expect(bounds({ yes: 0.15, no: 0.1 })).toEqual({ yes: { min: 0.15, max: 1 }, no: { min: 0, max: 0.1 } });
  });
});
