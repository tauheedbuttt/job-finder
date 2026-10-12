import { active, type Filters, type Key } from "./agilefant";

export type View = {
  filters: Filters;
  counts: Record<string, number>;
  sources: string[];
  shown: number;
  total: number;
  progress: { done: number; total: number } | null;
  offline: boolean;
  cached: number;
  unlabeled: boolean;
};

export type Actions = {
  toggle: (key: Key) => void;
  reset: () => void;
  clear: () => void;
  fold: (keys: string[]) => void;
};

const WIDTH = 232;
const GAP = 32;
const TOP = 173;

// Site colors live on :root as HSL triples and inherit into the shadow root.
const c = (name: string, fallback: string) =>
  `hsl(var(--${name}, ${fallback}))`;
const FG = c("foreground", "340 25% 12%");
const MUTED = c("muted-foreground", "340 10% 48%");
const PRIMARY = c("primary", "340 65% 47%");
const ACCENT = c("accent", "340 50% 93%");
const BORDER = c("border", "340 18% 87%");
const BG = c("background", "340 30% 98%");
const RING = c("ring", "340 65% 47%");

const STYLE = `
:host{font-family:inherit;font-size:14px;line-height:1.4;color:${FG};-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;text-align:left}
:focus-visible{outline:2px solid ${RING};outline-offset:1px;border-radius:calc(var(--radius, .5rem) - 2px)}
.panel{position:fixed;z-index:40;left:var(--left);top:var(--top);width:${WIDTH}px;max-height:calc(100vh - var(--top) - 24px);overflow-y:auto;overscroll-behavior:contain;padding:0 0 16px;scrollbar-width:none}
.panel:hover{scrollbar-width:thin}
.head{display:flex;align-items:center;justify-content:space-between;height:28px;padding:0 8px}
.title{font-weight:600}
.link{color:${MUTED};font-size:12px;transition:color .12s ease}
.link:hover{color:${FG}}
.reset{color:${PRIMARY};font-size:13px;font-weight:500}
.reset:hover{color:${PRIMARY};text-decoration:underline;text-underline-offset:3px}
.meta{margin:2px 0 0;padding:0 8px;color:${MUTED};font-size:12px;font-variant-numeric:tabular-nums}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:12px 8px 0}
.chip{height:28px;padding:0 10px;border-radius:999px;border:1px solid ${BORDER};background:${BG};color:${FG};font-size:13px;transition:background .12s ease,color .12s ease,border-color .12s ease}
.chip:hover{background:${ACCENT}}
.chip[aria-pressed=true]{background:${ACCENT};border-color:${PRIMARY};color:${PRIMARY}}
.group{margin-top:20px}
.fold{display:flex;align-items:center;justify-content:space-between;width:100%;height:24px;margin-bottom:8px;padding:0 8px;color:${MUTED};font-size:12px;font-weight:500;transition:color .12s ease}
.fold:hover{color:${FG}}
.fold svg{width:12px;height:12px;transition:transform .12s ease}
.fold[aria-expanded=false]{margin-bottom:0}
.fold[aria-expanded=false] svg{transform:rotate(-90deg)}
.check{display:flex;align-items:center;gap:10px;width:100%;height:32px;padding:0 8px;border-radius:calc(var(--radius, .5rem) - 2px);color:${FG};transition:background .12s ease}
.check:hover{background:hsl(var(--accent, 340 50% 93%) / .6)}
.check.sub{padding-left:32px;font-size:13px;color:${MUTED}}
.check.sub[aria-checked=true]{color:${FG}}
.box{flex:none;display:grid;place-items:center;width:16px;height:16px;border-radius:4px;border:1.5px solid ${BORDER};background:${BG};color:#fff;transition:background .12s ease,border-color .12s ease}
.box svg{width:10px;height:10px;opacity:0}
.check:hover .box{border-color:${MUTED}}
.check[aria-checked=true] .box{border-color:${PRIMARY};background:${PRIMARY}}
.check[aria-checked=true] .box svg{opacity:1}
.label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.count{color:${MUTED};font-size:12px;font-variant-numeric:tabular-nums}
.check[aria-checked=true] .count{color:${FG};font-weight:500}
.spin{width:12px;height:12px;border-radius:50%;border:1.5px solid ${BORDER};border-top-color:${PRIMARY};animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.more{height:28px;margin-top:2px;padding:0 8px;color:${MUTED};font-size:13px;transition:color .12s ease}
.more:hover{color:${FG}}
.progress{padding:6px 8px 0 32px;color:${MUTED};font-size:12px;font-variant-numeric:tabular-nums}
.bar{height:2px;margin-bottom:6px;border-radius:2px;background:${BORDER};overflow:hidden}
.bar i{display:block;height:100%;background:${PRIMARY};transition:width .2s ease}
.foot{margin-top:24px;padding:0 8px;font-size:12px;color:${MUTED};display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.foot .danger{color:${PRIMARY};font-weight:500}
.open{display:none;position:fixed;z-index:40;top:16px;left:16px;height:32px;padding:0 12px;align-items:center;gap:6px;border-radius:calc(var(--radius, .5rem) - 2px);color:${MUTED};font-size:14px;transition:color .12s ease,background .12s ease}
.open:hover{color:${FG};background:${ACCENT}}
.open svg{width:16px;height:16px}
.narrow .open{display:inline-flex}
.narrow .panel{left:0;top:0;bottom:0;max-height:none;width:280px;padding:24px 16px;background:${BG};border-right:1px solid ${BORDER};box-shadow:0 12px 40px hsl(var(--foreground, 340 25% 12%) / .12);transform:translateX(-105%);transition:transform .2s cubic-bezier(.16,1,.3,1)}
.narrow.drawer .panel{transform:none}
`;

const CHECK = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.2 4 7l4-4"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 6 7.5l3-3"/></svg>`;
const FUNNEL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M7 12h10M10 18h4"/></svg>`;
const TOP_HOSTS = 6;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function sidebar(
  actions: Actions,
  shut: string[] = ["deadline", "added"],
) {
  const host = document.createElement("div");
  host.dataset.jfSidebar = "";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const frame = document.createElement("div");
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-label", "Filters");
  const open = document.createElement("button");
  open.className = "open";
  open.innerHTML = `${FUNNEL}Filters`;
  open.dataset.act = "open";
  frame.append(open, panel);
  root.append(style, frame);

  const folded = new Set<string>(shut);
  let all = false;
  let confirming = false;
  let last: View | null = null;

  const count = (key: Key, view: View) =>
    key === "trainee" && view.unlabeled
      ? view.progress
        ? `<span class="spin" aria-label="Checking"></span>`
        : `<span class="count">-</span>`
      : `<span class="count">${view.counts[key] ?? 0}</span>`;

  const check = (
    key: Key,
    label: string,
    view: View,
    on: boolean,
    sub = false,
  ) =>
    `<button class="check${sub ? " sub" : ""}" role="checkbox" aria-checked="${on}" data-act="toggle" data-key="${esc(key)}"><span class="box">${CHECK}</span><span class="label">${esc(label)}</span>${sub ? "" : count(key, view)}</button>`;

  const chip = (key: Key, label: string, on: boolean) =>
    `<button class="chip" aria-pressed="${on}" data-act="toggle" data-key="${key}">${label}</button>`;

  const group = (key: string, title: string, body: string) => {
    const closed = folded.has(key);
    return `<section class="group"><button class="fold" aria-expanded="${!closed}" data-act="fold" data-key="${key}">${title}${CHEVRON}</button>${closed ? "" : body}</section>`;
  };

  const progress = (v: View) => {
    if (v.offline) return `<div class="progress">Translator offline</div>`;
    if (!v.progress) return "";
    const pct = v.progress.total
      ? Math.round((v.progress.done / v.progress.total) * 100)
      : 0;
    return `<div class="progress"><div class="bar"><i style="width:${pct}%"></i></div>Checking ${v.progress.done} of ${v.progress.total}</div>`;
  };

  const foot = (v: View) => {
    if (!v.cached && !confirming) return "";
    const body = confirming
      ? `Clear ${v.cached} labels? <button class="link danger" data-act="confirm">Clear</button><button class="link" data-act="cancel">Cancel</button>`
      : `${v.cached} labels cached · <button class="link" data-act="clear">Clear</button>`;
    return `<div class="foot">${body}</div>`;
  };

  function render(v: View) {
    last = v;
    const f = v.filters;
    const top = all
      ? v.sources
      : v.sources.filter((h, i) => i < TOP_HOSTS || f.hosts.includes(h));
    const rest = v.sources.length - TOP_HOSTS;
    const now =
      root.activeElement instanceof HTMLElement &&
      panel.contains(root.activeElement)
        ? root.activeElement
        : null;
    const focus = now
      ? `[data-act="${now.dataset.act}"]${now.dataset.key === undefined ? "" : `[data-key="${now.dataset.key}"]`}`
      : null;
    panel.innerHTML = [
      `<div class="head"><span class="title">Filters</span>${active(f) ? `<button class="reset" data-act="reset">Reset</button>` : ""}</div>`,
      `<p class="meta">${v.shown === v.total ? `${v.total} jobs` : `${v.shown} of ${v.total} jobs`}</p>`,
      `<div class="chips">${chip("trainee", "Trainee", f.trainee)}${chip("closing", "Closing soon", f.closing)}${chip("week", "New this week", f.week)}</div>`,
      group(
        "role",
        "Role type",
        check("trainee", "Trainee / graduate", v, f.trainee) +
          check("unclear", "Include unclear", v, f.unclear, true) +
          progress(v),
      ),
      group(
        "deadline",
        "Deadline",
        check("deadline", "Has deadline", v, f.deadline) +
          check("closing", "Closing in 7 days", v, f.closing),
      ),
      group(
        "added",
        "Added",
        check("week", "This week", v, f.week) +
          check("month", "Last 30 days", v, f.month),
      ),
      group(
        "source",
        "Source",
        top
          .map((h) =>
            check(`host:${h}`, h.replace(/^www\./, ""), v, f.hosts.includes(h)),
          )
          .join("") +
          (rest > 0
            ? `<button class="more" data-act="more">${all ? "Show less" : `Show ${rest} more`}</button>`
            : ""),
      ),
      foot(v),
    ].join("");
    if (focus) panel.querySelector<HTMLElement>(focus)?.focus();
  }

  const redraw = () => last && render(last);

  root.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (!el) return;
    const key = el.dataset.key ?? "";
    switch (el.dataset.act) {
      case "open":
        return void frame.classList.toggle("drawer");
      case "toggle":
        return actions.toggle(key as Key);
      case "reset":
        return actions.reset();
      case "fold":
        folded.has(key) ? folded.delete(key) : folded.add(key);
        actions.fold([...folded]);
        return redraw();
      case "more":
        all = !all;
        return redraw();
      case "clear":
        confirming = true;
        return redraw();
      case "cancel":
        confirming = false;
        return redraw();
      case "confirm":
        confirming = false;
        return actions.clear();
    }
  });

  // Drawer closes on Esc or a click outside the sidebar.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") frame.classList.remove("drawer");
  });
  document.addEventListener("click", (e) => {
    if (!e.composedPath().includes(host)) frame.classList.remove("drawer");
  });

  // Starts level with the site search, then sticks near the top on scroll.
  function place() {
    const column = document.querySelector("div.mx-auto.max-w-5xl");
    const gutter = column ? column.getBoundingClientRect().left : 0;
    const narrow = gutter < WIDTH + GAP;
    frame.classList.toggle("narrow", narrow);
    if (!narrow) frame.classList.remove("drawer");
    const search = column?.querySelector("input");
    const top = search ? search.getBoundingClientRect().top : TOP - scrollY;
    host.style.setProperty("--left", `${gutter - WIDTH - GAP}px`);
    host.style.setProperty("--top", `${Math.max(24, top)}px`);
  }

  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  return { host, render, place };
}
