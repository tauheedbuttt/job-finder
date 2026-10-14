import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adapt } from "../lib/finnish";
import { better, jobId, keep, place, seen, spot } from "../lib/linkedin";
import { row } from "../lib/pill";

const TOP = `
<header><button>Easy Apply</button></header>
<main>
  <div class="card">
    <h1>IT-arkkitehti</h1>
    <div class="chips"><button>Hybrid</button></div>
    <div class="actions">
      <div><button aria-label="Apply to IT-arkkitehti on company website"><span>Apply</span></button></div>
      <button><span>Save</span></button>
    </div>
  </div>
</main>`;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("jobId", () => {
  it("reads view, slug view and split view URLs", () => {
    expect(jobId("https://www.linkedin.com/jobs/view/4478773878/?trackingId=x")).toBe("4478773878");
    expect(jobId("https://www.linkedin.com/jobs/view/it-arkkitehti-at-varma-4478773878")).toBe("4478773878");
    expect(jobId("https://www.linkedin.com/jobs/search/?currentJobId=123&keywords=dev")).toBe("123");
  });

  it("gives null for junk", () => {
    expect(jobId("https://www.linkedin.com/jobs/")).toBeNull();
    expect(jobId("https://www.linkedin.com/jobs/search/?currentJobId=abc")).toBeNull();
    expect(jobId("not a url")).toBeNull();
  });

  it("still drives the board adapter", () => {
    expect(adapt("https://www.linkedin.com/jobs/view/42/")).toBe("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/42");
  });
});

// Trimmed from a real logged-in job page, 2026-10-14.
const REAL = `
<main>
  <p>AI Developer - LLM Applications</p>
  <div class="col">
    <div class="chiprow">
      <div class="w"><a href="/jobs/view/1/"><span><svg id="check-small"></svg><span>Hybrid</span></span></a></div>
      <div class="w"><a href="/jobs/view/1/"><span><svg id="check-small"></svg><span>Full-time</span></span></a></div>
    </div>
    <div class="outer"><div class="mid"><div class="stack">
      <div class="actions">
        <div><a aria-label="Apply on company website"><span>Apply</span></a></div>
        <div><button aria-label="Save the job"><span>Save</span></button></div>
      </div>
    </div></div></div>
  </div>
  <button aria-label="Following, click to unfollow"><svg id="check-small"></svg></button>
</main>`;

describe("spot", () => {
  it("joins the insight chip row on a real page", () => {
    document.body.innerHTML = REAL;
    const s = spot(document);
    expect(s.kind).toBe("chips");
    const el = document.createElement("div");
    place(el, s, document);
    expect(el.parentElement!.classList.contains("chiprow")).toBe(true);
    expect(el.style.display).toBe("contents");
  });

  it("puts the row above the stacking Apply wrapper when no chips", () => {
    document.body.innerHTML = REAL;
    document.querySelector(".chiprow")!.remove();
    const s = spot(document);
    expect(s.kind).toBe("apply");
    expect(s.ref!.classList.contains("col")).toBe(true);
  });

  it("picks the Apply and Save row after the title", () => {
    document.body.innerHTML = TOP;
    const s = spot(document);
    expect(s.kind).toBe("apply");
    expect(s.ref!.classList.contains("actions")).toBe(true);
    const el = document.createElement("div");
    place(el, s, document);
    expect(el.nextElementSibling!.classList.contains("actions")).toBe(true);
    expect(el.style.display).toBe("flex");
  });

  it("falls back to the title, then to fixed", () => {
    document.body.innerHTML = "<main><h1>Dev</h1></main>";
    const s = spot(document);
    expect(s.kind).toBe("title");
    const el = document.createElement("div");
    place(el, s, document);
    expect(el.previousElementSibling!.tagName).toBe("H1");

    document.body.innerHTML = "<main><p>loading</p></main>";
    const f = spot(document);
    expect(f.kind).toBe("fixed");
    place(el, f, document);
    expect(el.parentElement).toBe(document.body);
    expect(el.style.position).toBe("fixed");
  });

  it("ranks chips over apply over title over fixed", () => {
    expect(better("chips", "apply")).toBe(true);
    expect(better("apply", "title")).toBe(true);
    expect(better("title", "fixed")).toBe(true);
    expect(better("fixed", "apply")).toBe(false);
  });
});

describe("language row", () => {
  const labels = (r: ReturnType<typeof row>) => [r.lead, r.experience].map((p) => p.el.shadowRoot!.querySelector("span")!.textContent);

  it("leads with the non-English language pill", () => {
    const r = row(true, "language");
    expect(labels(r)).toEqual(["Checking language…", "Checking experience…"]);
    r.show({ language: "yes", experience: "no" });
    expect(labels(r)).toEqual(["Non-English required", "No experience needed"]);
    r.show({ language: "no", experience: "no" });
    expect(labels(r)[0]).toBe("English only");
  });
});

describe("language cache", () => {
  let store: Record<string, unknown>;
  beforeEach(() => {
    store = { "badge:https://www.linkedin.com/jobs/view/7/": { finnish: "yes", experience: "no", at: 1000 } };
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
          set: async (v: Record<string, unknown>) => Object.assign(store, v),
          remove: async (k: string) => void delete store[k],
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ignores old Finnish verdicts and keeps its own per job id", async () => {
    expect(await seen("7", 2000)).toBeNull();
    await keep("7", { language: "yes", experience: "no" }, 1000);
    expect(await seen("7", 2000)).toEqual({ language: "yes", experience: "no" });
    expect(await seen("7", 1000 + 24 * 60 * 60 * 1000)).toBeNull();
  });
});
