import { describe, expect, it, vi } from "vitest";
import { blank } from "../lib/agilefant";
import { hosts, sidebar, type View } from "../lib/sidebar";

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
  it("shows Process all in the failed view, Stop while running", () => {
    const fix = vi.fn();
    const halt = vi.fn();
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn(), fix, halt });
    const root = bar.host.shadowRoot!;
    const failed = { ...view, filters: { ...blank, failed: true }, counts: { ...view.counts, failed: 3 } };
    bar.render(view);
    expect(root.querySelector('[data-act="fix"]')).toBeNull();
    bar.render(failed);
    const button = root.querySelector<HTMLButtonElement>('[data-act="fix"]')!;
    expect(button.textContent).toBe("Process all 3");
    expect(button.type).toBe("button");
    expect(button.classList.contains("chip")).toBe(true);
    expect([...root.querySelectorAll("button")].every((b) => b.type === "button")).toBe(true);
    button.click();
    expect(fix).toHaveBeenCalledOnce();
    bar.render({ ...failed, offline: true });
    expect(root.querySelector<HTMLButtonElement>('[data-act="fix"]')!.disabled).toBe(true);
    bar.render({ ...failed, fixable: 0 });
    expect(root.querySelector<HTMLButtonElement>('[data-act="fix"]')!.disabled).toBe(true);
    bar.render({ ...failed, fixing: { done: 1, total: 3 } });
    expect(root.textContent).toContain("Trying 1 of 3 in tabs");
    expect(root.querySelector('[data-act="fix"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-act="halt"]')!.click();
    expect(halt).toHaveBeenCalledOnce();
  });

  it("sorts sources by shown count, hides zero unless checked, counts only hidden for more", () => {
    const names = ["a.fi", "b.fi", "c.fi", "d.fi", "e.fi", "f.fi", "g.fi", "h.fi", "z.fi", "y.fi"];
    const counts = Object.fromEntries(names.map((h, i) => [`host:${h}`, i < 8 ? i + 1 : 0]));
    counts["host:b.fi"] = 8;
    const got = hosts({ sources: names, counts, filters: { ...blank, hosts: ["z.fi", "a.fi"] } });
    expect(got.list).toEqual(["b.fi", "h.fi", "g.fi", "f.fi", "e.fi", "d.fi", "c.fi", "a.fi", "z.fi"]);
    expect(got.hidden).toBe(1);
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.render({ ...view, sources: names, counts, filters: { ...blank, hosts: ["z.fi", "a.fi"] } });
    const root = bar.host.shadowRoot!;
    const shown = [...root.querySelectorAll<HTMLElement>('[data-key^="host:"]')].map((el) => el.dataset.key);
    expect(shown).toEqual(["host:b.fi", "host:h.fi", "host:g.fi", "host:f.fi", "host:e.fi", "host:d.fi", "host:a.fi", "host:z.fi"]);
    expect(root.querySelector('[data-act="more"]')!.textContent).toBe("Show 1 more");
    expect(root.querySelector('[data-key="host:y.fi"]')).toBeNull();
  });

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
    expect([...root.querySelectorAll(".chip")].map((c) => c.textContent)).toEqual(["No Finnish", "Max 4 yrs", "No senior", "No staff", "No manager", "Trainee", "Developer", "New this week"]);
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
