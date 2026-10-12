import { afterEach, describe, expect, it, vi } from "vitest";
import { renderer, web } from "../lib/render";

afterEach(() => vi.unstubAllGlobals());

describe("render guard", () => {
  it("accepts only absolute http and https links", () => {
    expect(web("https://jobs.example.fi/1")).toBe(true);
    expect(web("http://jobs.example.fi/1")).toBe(true);
    for (const url of ["", "/p/x", "jobs.example.fi", "moz-extension://x/_generated_background_page.html", "javascript:void 0", "about:blank"]) expect(web(url)).toBe(false);
  });

  it("never opens a tab for a link Firefox would resolve against the background page", async () => {
    const create = vi.fn();
    vi.stubGlobal("browser", { tabs: { create } });
    const render = renderer();
    for (const url of ["", "/p/x"]) expect(await render({ type: "render", url }, { tab: { windowId: 1, index: 0 } })).toEqual({ ok: false, error: "no link" });
    expect(create).not.toHaveBeenCalled();
  });
});
