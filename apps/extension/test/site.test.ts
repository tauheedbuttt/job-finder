import { describe, expect, it, vi } from "vitest";
import { sidebar } from "../lib/sidebar";
import { PANEL, unset } from "../lib/site";

// Trimmed copy of the live site panel, 2026-10-12.
const PANEL_HTML = `<aside aria-label="Filters"><p role="status">25 of 787 jobs</p>
<div role="group"><button type="button" aria-pressed="true">No Finnish</button><button type="button" aria-pressed="false">Trainee</button></div>
<button type="button" aria-expanded="true" aria-controls="job-filter-sources">Source</button>
<div id="job-filter-sources"><label><input type="checkbox" checked><span>fi.indeed.com</span></label><label><input type="checkbox"><span>jobly.fi</span></label></div></aside>`;

const page = (html: string) => {
  document.body.innerHTML = html;
  return document.querySelector(PANEL);
};

describe("site panel", () => {
  it("clicks only active chips and checked sources off", () => {
    const panel = page(PANEL_HTML)!;
    const clicks: string[] = [];
    panel.addEventListener("click", (e) => clicks.push((e.target as HTMLElement).textContent || "box"), true);
    expect(unset(document)).toBe(2);
    expect(clicks).toEqual(["No Finnish", "box"]);
    expect(panel.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
  });

  it("opens a folded Source group while the site still filters", () => {
    const panel = page(PANEL_HTML.replace('aria-pressed="true"', 'aria-pressed="false"').replace(" checked", "").replace('aria-expanded="true"', 'aria-expanded="false"'))!;
    const fold = panel.querySelector<HTMLElement>("[aria-controls]")!;
    const click = vi.spyOn(fold, "click");
    expect(unset(document)).toBe(1);
    expect(click).toHaveBeenCalledOnce();
  });

  it("does nothing without the panel or with no filter on", () => {
    page("<main></main>");
    expect(unset(document)).toBe(0);
    page(PANEL_HTML.replace('aria-pressed="true"', 'aria-pressed="false"').replace(" checked", "").replace("25 of", "787 of"));
    expect(unset(document)).toBe(0);
  });

  it("sits on the site panel box and hides in theirs mode", () => {
    const panel = page(PANEL_HTML)!;
    panel.getBoundingClientRect = () => ({ left: 312, top: 144, width: 224, height: 390 }) as DOMRect;
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.place();
    expect(bar.host.style.getPropertyValue("--left")).toBe("304px");
    expect(bar.host.style.getPropertyValue("--top")).toBe("144px");
    expect(bar.host.style.getPropertyValue("--width")).toBe("240px");
    bar.show(false);
    expect(bar.host.style.display).toBe("none");
    bar.show(true);
    expect(bar.host.style.display).toBe("");
  });

  it("falls back to the gutter without the site panel", () => {
    page("<main></main>");
    const bar = sidebar({ toggle: vi.fn(), reset: vi.fn(), clear: vi.fn(), fold: vi.fn() });
    bar.place();
    expect(bar.host.style.getPropertyValue("--width")).toBe("");
  });
});
