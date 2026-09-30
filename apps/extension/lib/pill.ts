import type { Badge } from "./badge";

const LABEL: Record<Badge, string> = {
  loading: "Checking Finnish…",
  yes: "Finnish required",
  no: "No Finnish",
  unclear: "Unclear",
  error: "Check failed",
};

const STYLE = `
:host{all:initial;display:block;margin:4px 0 2px}
span{display:inline-block;font:600 12px/18px system-ui,sans-serif;padding:1px 8px;border-radius:999px;border:1px solid transparent}
.loading{color:#555;background:#f1f1f1;border-color:#ddd}
.yes{color:#8a1111;background:#ffe0e0;border-color:#f5b5b5}
.no{color:#0f5c24;background:#dcf5e3;border-color:#a8e0b8}
.unclear{color:#444;background:#e9e9e9;border-color:#cfcfcf}
.error{color:#7a4a00;background:#fff3d6;border-color:#f0cf85}
`;

export type Pill = { el: HTMLElement; state: Badge; set: (state: Badge, detail?: string) => void };

export function pill(): Pill {
  const el = document.createElement("div");
  el.dataset.jfPill = "";
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
      label.className = state;
      label.textContent = LABEL[state];
      label.title = detail ?? "";
    },
  };
  self.set("loading");
  return self;
}
