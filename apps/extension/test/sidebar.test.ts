import { describe, expect, it, vi } from "vitest";
import { blank } from "../lib/agilefant";
import { sidebar, type View } from "../lib/sidebar";

const view: View = { filters: blank, counts: { trainee: 3, "host:a.fi": 2 }, sources: ["a.fi"], shown: 5, total: 7, progress: { done: 1, total: 7 }, offline: false, cached: 12 };

describe("sidebar", () => {
  it("renders counts and sends toggles", () => {
    const toggle = vi.fn();
    const bar = sidebar({ toggle, reset: vi.fn(), clear: vi.fn() });
    bar.render(view);
    const root = bar.host.shadowRoot!;
    expect(root.textContent).toContain("Showing 5 of 7");
    expect(root.textContent).toContain("Labeling 1 / 7");
    root.querySelector<HTMLElement>('[data-key="host:a.fi"]')!.click();
    expect(toggle).toHaveBeenCalledWith("host:a.fi");
  });

  it("asks inline before clearing the cache", () => {
    const clear = vi.fn();
    const ask = vi.spyOn(window, "confirm");
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear });
    bar.render(view);
    const root = bar.host.shadowRoot!;
    root.querySelector<HTMLElement>('[data-act="clear"]')!.click();
    expect(root.textContent).toContain("Clear 12 labels?");
    expect(clear).not.toHaveBeenCalled();
    root.querySelector<HTMLElement>('[data-act="cancel"]')!.click();
    expect(root.textContent).toContain("12 labels cached");
    root.querySelector<HTMLElement>('[data-act="clear"]')!.click();
    root.querySelector<HTMLElement>('[data-act="confirm"]')!.click();
    expect(clear).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
  });
});
