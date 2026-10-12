import { ROWS } from "./agilefant";
import type { Level } from "./badge";
import type { Entry, Issue } from "./labels";

export type Known = { entries: Record<string, Entry>; notes: Issue[]; trying?: boolean };

const INFO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

// Joins the remove <style>; info sits right of the remove button in the same gutter.
export const CSS = `
[data-jf-tag]{display:inline-flex;align-items:center;height:20px;margin-left:8px;padding:0 8px;border:1px solid hsl(var(--border));border-radius:999px;color:hsl(var(--muted-foreground));font-size:12px;line-height:1;white-space:nowrap;vertical-align:middle}
[data-jf-tag=yes]{border-color:hsl(var(--primary));color:hsl(var(--primary))}
[data-jf-info]{position:absolute;top:4px;right:-58px;display:grid;place-items:center;width:24px;height:24px;border-radius:calc(var(--radius, .5rem) - 2px);color:hsl(var(--muted-foreground));opacity:0;transition:opacity .12s ease,color .12s ease}
[data-jf-info][data-issue]{color:hsl(var(--primary))}
[data-jf-info]:hover,[data-jf-info]:focus-visible{color:hsl(var(--foreground))}
[data-item-id]:hover [data-jf-info],[data-jf-info]:focus-visible{opacity:1}
@media (hover: none){[data-jf-info]{opacity:1}}
[data-jf-info] svg{width:16px;height:16px}
[data-jf-tip]{position:fixed;z-index:60;max-width:320px;padding:8px 10px;border:1px solid hsl(var(--border));border-radius:calc(var(--radius, .5rem) - 2px);background:hsl(var(--background));color:hsl(var(--foreground));font-size:12px;line-height:1.5;box-shadow:0 8px 30px hsl(var(--foreground) / .12)}
[data-jf-tip] b{display:block;color:hsl(var(--muted-foreground));font-weight:500}
[data-jf-tip] b:not(:first-child){margin-top:6px}
[data-jf-try]{display:block;margin-top:6px;padding:0;border:0;background:none;color:hsl(var(--primary));font:inherit;font-size:12px;cursor:pointer}
[data-jf-try]:hover:not(:disabled){text-decoration:underline}
[data-jf-try]:disabled{cursor:default;opacity:.7}
`;

const TAGS: Record<Level, string> = { yes: "Finnish required", no: "No Finnish", unclear: "Finnish unclear" };
const DEMAND: Record<Level, string> = { yes: "required", no: "not required", unclear: "unclear" };
const WORDS: Record<string, Record<Level, string>> = { finnish: DEMAND, experience: DEMAND };
const NAMES: Record<string, string> = { yoe: "5+ yrs" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function issues(k: Known): Issue[] {
  return [...Object.values(k.entries).flatMap((e) => e.issues ?? []), ...k.notes];
}

export function lines(k: Known): { labels: string[]; issues: string[] } {
  return {
    labels: Object.entries(k.entries).map(([name, e]) =>
      [NAMES[name] ?? cap(name), `${WORDS[name]?.[e.verdict] ?? e.verdict}${e.score === undefined ? "" : ` (${e.score.toFixed(2)})`}`, e.src].join(" · "),
    ),
    issues: issues(k).map((i) => [cap(i.step), i.message, clock(i.at)].join(" · ")),
  };
}

export function tip(k: Known): string {
  const l = lines(k);
  const part = (title: string, list: string[]) => (list.length ? `<b>${title}</b>${list.map((s) => `<div>${esc(s)}</div>`).join("")}` : "");
  const failed = k.entries.finnish?.src === "none";
  const button = failed ? `<button type="button" data-jf-try${k.trying ? " disabled" : ""}>${k.trying ? "Trying…" : "Try in tab"}</button>` : "";
  return part("Labels", l.labels) + part("Issues", l.issues) + button;
}

// Adds or syncs the Finnish tag and info icon after site remounts; writes only on change.
export function mark(root: ParentNode, look: (id: string) => Known): void {
  for (const row of root.querySelectorAll<HTMLElement>(ROWS)) {
    const id = row.dataset.itemId ?? "";
    const k = look(id);
    const doc = row.ownerDocument;
    const verdict = k.entries.finnish?.verdict;
    let tag = row.querySelector<HTMLElement>("[data-jf-tag]");
    const link = row.querySelector("a[href]");
    if (!verdict || !link) tag?.remove();
    else {
      if (!tag) {
        tag = doc.createElement("span");
        link.after(tag);
      }
      if (tag.dataset.jfTag !== verdict) {
        tag.dataset.jfTag = verdict;
        tag.textContent = TAGS[verdict];
      }
    }
    let button = row.querySelector<HTMLButtonElement>(":scope > [data-jf-info]");
    if (!Object.keys(k.entries).length && !k.notes.length) {
      button?.remove();
      continue;
    }
    if (!button) {
      button = doc.createElement("button");
      button.type = "button";
      button.dataset.jfInfo = id;
      button.setAttribute("aria-label", "Job info");
      button.innerHTML = INFO;
      row.append(button);
    }
    const bad = issues(k).length > 0;
    if (button.hasAttribute("data-issue") !== bad) button.toggleAttribute("data-issue", bad);
  }
}

// One shared tooltip, filled on hover or focus of any info icon; stays open while hovered so its button is clickable.
export function tips(look: (id: string) => Known, attempt: (id: string) => void): () => void {
  const box = document.createElement("div");
  box.dataset.jfTip = "";
  box.id = "jf-tip";
  box.setAttribute("role", "tooltip");
  box.hidden = true;
  document.body.append(box);
  let id = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fill = () => {
    box.innerHTML = tip(look(id));
    box.hidden = !box.innerHTML;
  };
  const show = (e: Event) => {
    const button = (e.target as Element).closest?.<HTMLElement>("[data-jf-info]");
    if (!button) return;
    clearTimeout(timer);
    id = button.dataset.jfInfo ?? "";
    fill();
    button.setAttribute("aria-describedby", box.id);
    const r = button.getBoundingClientRect();
    box.style.top = `${r.top}px`;
    box.style.right = `${innerWidth - r.left + 8}px`;
  };
  const hide = (e: Event) => {
    const from = e.target as Element;
    const to = (e as MouseEvent | FocusEvent).relatedTarget as Node | null;
    if (!from.closest?.("[data-jf-info]") && !box.contains(from)) return;
    if (to && box.contains(to)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!box.matches(":hover")) box.hidden = true;
    }, 150);
  };
  box.addEventListener("mouseover", () => clearTimeout(timer));
  box.addEventListener("click", (e) => {
    if ((e.target as Element).closest("[data-jf-try]:not(:disabled)") && id) attempt(id);
  });
  document.addEventListener("mouseover", show);
  document.addEventListener("focusin", show);
  document.addEventListener("mouseout", hide);
  document.addEventListener("focusout", hide);
  return () => {
    if (!box.hidden && id) fill();
  };
}
