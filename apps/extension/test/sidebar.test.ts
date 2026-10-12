import { describe, expect, it, vi } from "vitest";
import { blank } from "../lib/agilefant";
import { sidebar, type View } from "../lib/sidebar";

const view: View = {
  filters: blank,
  counts: { trainee: 3, "host:a.fi": 2 },
  sources: ["a.fi"],
  shown: 5,
  total: 7,
  progress: { done: 1, total: 7 },
  finnish: null,
  seniority: null,
  offline: false,
  cached: 12,
  unlabeled: false,
};

describe("sidebar", () => {
  it("renders counts and sends toggles", () => {
    const toggle = vi.fn();
    const bar = sidebar({ toggle, reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.render(view);
    const root = bar.host.shadowRoot!;
    expect(root.textContent).toContain("5 of 7 jobs");
    expect(root.textContent).toContain("Checking 1 of 7");
    root.querySelector<HTMLElement>('[data-key="host:a.fi"]')!.click();
    expect(toggle).toHaveBeenCalledWith("host:a.fi");
  });

  it("asks inline before clearing the cache", () => {
    const clear = vi.fn();
    const ask = vi.spyOn(window, "confirm");
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear, fold: vi.fn() });
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

  it("shows Quick chips with seniority after No Finnish, no role, deadline or added groups", () => {
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.render(view);
    const root = bar.host.shadowRoot!;
    expect([...root.querySelectorAll(".chip")].map((c) => c.textContent)).toEqual(["No Finnish", "Max 4 yrs", "No senior", "No staff", "Trainee", "New this week"]);
    expect([...root.querySelectorAll(".fold")].map((f) => f.textContent)).toEqual(["Source"]);
  });

  it("shows Finnish progress and offline in the meta line", () => {
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.render({ ...view, finnish: { done: 120, total: 787 } });
    expect(bar.host.shadowRoot!.textContent).toContain("Checking Finnish 120 of 787");
    bar.render({ ...view, finnish: null, seniority: { done: 3, total: 9 } });
    expect(bar.host.shadowRoot!.textContent).toContain("Checking seniority 3 of 9");
    bar.render({ ...view, finnish: null, offline: true });
    expect(bar.host.shadowRoot!.querySelector(".meta + .meta")!.textContent).toBe("Translator offline");
  });

  it("hides the cache footer when empty", () => {
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.render({ ...view, cached: 0 });
    expect(bar.host.shadowRoot!.textContent).not.toContain("labels cached");
  });
});
