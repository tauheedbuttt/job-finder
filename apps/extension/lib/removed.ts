import { ROWS, type Item } from "./agilefant";

export type Removed = Record<string, number>;

export const KEY = "agilefant:removed";

const X = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const TRASH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
const UNDO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

// Own rules, since the site Tailwind build lacks classes it never used; button sits in the right gutter so columns never shift.
export const CSS = `
${ROWS}{position:relative}
[data-jf-remove]{position:absolute;top:4px;right:-30px;display:grid;place-items:center;width:24px;height:24px;border-radius:calc(var(--radius, .5rem) - 2px);color:hsl(var(--muted-foreground));opacity:0;transition:opacity .12s ease,background-color .12s ease,color .12s ease}
[data-jf-remove]:hover{background:hsl(var(--accent));color:hsl(var(--foreground))}
[data-item-id]:hover [data-jf-remove],[data-jf-remove]:focus-visible,[data-jf-remove][data-restore]{opacity:1}
@media (hover: none){[data-jf-remove]{opacity:1}}
[data-jf-toast]{position:fixed;left:50%;bottom:24px;z-index:50;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid hsl(var(--border));border-radius:var(--radius, .5rem);background:hsl(var(--background));color:hsl(var(--foreground));font-size:14px;box-shadow:0 8px 30px hsl(var(--foreground) / .12);animation:jf-in .16s ease}
[data-jf-toast] button{color:hsl(var(--primary));font-weight:500}
[data-jf-toast] button:hover{text-decoration:underline;text-underline-offset:4px}
@keyframes jf-in{from{opacity:0;transform:translate(-50%,6px)}}
`;

export function kept(list: Item[], gone: Removed): Item[] {
  return list.filter((i) => !(i.id in gone));
}

export function pick(list: Item[], gone: Removed): Item[] {
  return list.filter((i) => i.id in gone);
}

// Adds missing buttons after site remounts and syncs their mode.
export function decorate(root: ParentNode, restore: boolean): void {
  const label = restore ? "Restore job" : "Remove job";
  for (const row of root.querySelectorAll<HTMLElement>(ROWS)) {
    let button = row.querySelector<HTMLButtonElement>(":scope > [data-jf-remove]");
    if (!button) {
      button = row.ownerDocument.createElement("button");
      button.type = "button";
      button.dataset.jfRemove = row.dataset.itemId ?? "";
      row.append(button);
    }
    if (button.getAttribute("aria-label") === label) continue;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = restore ? UNDO : X;
    button.toggleAttribute("data-restore", restore);
  }
}

const SITE = "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors";
const GROUP = '[role="radiogroup"][aria-label="Rows must contain"]';

// Lives next to the site Any / All group, re-inserted when React drops it.
export function toolbar(actions: { view: () => void; all: () => void }) {
  const doc = document;
  const view = doc.createElement("button");
  view.type = "button";
  view.dataset.jfRemoved = "";
  view.addEventListener("click", actions.view);
  const all = doc.createElement("button");
  all.type = "button";
  all.dataset.jfRemoved = "";
  all.className = `${SITE} text-muted-foreground hover:text-foreground`;
  all.innerHTML = `${UNDO}Restore all`;
  all.addEventListener("click", actions.all);

  function render(count: number, on: boolean) {
    const anchor = doc.querySelector(GROUP);
    if (!anchor) return;
    // Writes only on change, so our own mutations do not retrigger the rescan.
    const state = `${count}:${on}`;
    if (view.dataset.state !== state) {
      view.dataset.state = state;
      view.style.display = !count && !on ? "none" : "";
      all.style.display = !on || !count ? "none" : "";
      view.setAttribute("aria-pressed", String(on));
      view.className = `${SITE} ${on ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`;
      view.innerHTML = `${TRASH}Removed <span class="tabular-nums">${count}</span>`;
    }
    if (anchor.nextElementSibling !== view) anchor.after(view);
    if (view.nextElementSibling !== all) view.after(all);
  }

  return { render };
}

// Bottom-center toast with one undo action, replaced by the next one.
export function toast(text: string, undo: () => void): void {
  document.querySelector("[data-jf-toast]")?.remove();
  const box = document.createElement("div");
  box.dataset.jfToast = "";
  box.setAttribute("role", "status");
  box.innerHTML = `<span>${text}</span>`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Undo";
  button.addEventListener("click", () => {
    box.remove();
    undo();
  });
  box.append(button);
  document.body.append(box);
  setTimeout(() => box.remove(), 5000);
}
