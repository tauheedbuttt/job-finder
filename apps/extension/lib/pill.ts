import type { Badge, Level } from "./badge";

// Lead pill: Finnish on duunitori and Agilefant, any non-English language on LinkedIn.
export type Lead = "finnish" | "language";
type Kind = Lead | "experience";

const LABEL: Record<Kind, Record<Badge, string>> = {
  language: {
    loading: "Checking language…",
    yes: "Non-English required",
    no: "English only",
    unclear: "Language unclear",
    error: "Check failed",
  },
  finnish: {
    loading: "Checking Finnish…",
    yes: "Finnish required",
    no: "No Finnish",
    unclear: "Unclear",
    error: "Check failed",
  },
  experience: {
    loading: "Checking experience…",
    yes: "Experience required",
    no: "No experience needed",
    unclear: "Experience unclear",
    error: "Check failed",
  },
};

const STYLE = `
:host{all:initial;display:inline-block;margin:4px 6px 2px 0}
span{display:inline-block;font:600 12px/18px system-ui,sans-serif;padding:1px 8px;border-radius:999px;border:1px solid transparent}
.loading{color:#555;background:#f1f1f1;border-color:#ddd}
.yes{color:#8a1111;background:#ffe0e0;border-color:#f5b5b5}
.no{color:#0f5c24;background:#dcf5e3;border-color:#a8e0b8}
.unclear{color:#444;background:#e9e9e9;border-color:#cfcfcf}
.error{color:#7a4a00;background:#fff3d6;border-color:#f0cf85}
.experience.yes{color:#7a4a00;background:#ffecc7;border-color:#f0c66e}
:host(.chip){margin:0}
.chip{font:600 16px/20px system-ui,sans-serif;padding:6px 16px}
`;

export type Pill = { el: HTMLElement; state: Badge; set: (state: Badge, detail?: string) => void };

// Chip size matches big site chips like LinkedIn job insights.
export function pill(kind: Kind = "finnish", chip = false): Pill {
  const el = document.createElement("div");
  el.dataset.jfPill = kind;
  if (chip) el.classList.add("chip");
  const root = el.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const label = document.createElement("span");
  root.append(style, label);
  const self: Pill = {
    el,
    state: "loading",
    set(state, detail) {
      self.state = state;
      label.className = `${kind} ${state}${chip ? " chip" : ""}`;
      label.textContent = LABEL[kind][state];
      label.title = detail ?? "";
    },
  };
  self.set("loading");
  return self;
}

export type Shown = Partial<Record<Lead, Level>> & { experience: Level };

export type Row = {
  el: HTMLElement;
  lead: Pill;
  experience: Pill;
  show: (result: Shown) => void;
  fail: (detail: string) => void;
  busy: () => boolean;
};

export function row(chip = false, kind: Lead = "finnish"): Row {
  const el = document.createElement("div");
  el.dataset.jfRow = "";
  const lead = pill(kind, chip);
  const experience = pill("experience", chip);
  el.append(lead.el, experience.el);
  return {
    el,
    lead,
    experience,
    show(result) {
      lead.set(result[kind] ?? "unclear");
      experience.set(result.experience);
    },
    fail(detail) {
      lead.set("error", detail);
      experience.set("error", detail);
    },
    busy: () => lead.state === "loading",
  };
}
