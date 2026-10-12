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
};

export type Actions = { toggle: (key: Key) => void; reset: () => void; clear: () => void };

const WIDTH = 220;
const GAP = 24;

const STYLE = `
:host{--bg:#fff;--fg:#1c1c1f;--muted:#6b6b73;--faint:#9a9aa2;--hover:rgb(0 0 0 / .045);--line:rgb(0 0 0 / .08);--accent:#5e6ad2;--shadow:0 8px 30px rgb(0 0 0 / .12);
  font-family:inherit;font-size:13px;line-height:1.4;color:var(--fg);-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme: dark){:host{--bg:#1b1b1f;--fg:#e8e8ec;--muted:#9a9aa4;--faint:#6e6e78;--hover:rgb(255 255 255 / .06);--line:rgb(255 255 255 / .08);--accent:#8b93f0;--shadow:0 8px 30px rgb(0 0 0 / .5)}}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;text-align:left}
:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:6px}
.panel{position:fixed;z-index:40;left:var(--left);top:96px;width:${WIDTH}px;max-height:calc(100vh - 120px);overflow-y:auto;overscroll-behavior:contain;padding:4px 2px 8px;scrollbar-width:thin}
.head{display:flex;align-items:center;justify-content:space-between;height:28px;padding:0 8px}
.title{font-weight:600}
.link{color:var(--muted);font-size:12px;padding:2px 6px;border-radius:6px}
.link:hover{background:var(--hover);color:var(--fg)}
.meta{margin:0 0 8px;padding:0 8px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.group{margin-top:6px}
.fold{display:flex;align-items:center;gap:4px;width:100%;height:24px;padding:0 8px;color:var(--faint);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;border-radius:6px}
.fold:hover{color:var(--muted)}
.fold svg{width:10px;height:10px;transition:transform .15s}
.fold[aria-expanded=false] svg{transform:rotate(-90deg)}
.chips{display:flex;flex-wrap:wrap;gap:4px;padding:2px 8px 4px}
.chip{height:24px;padding:0 9px;border-radius:6px;border:1px solid var(--line);color:var(--muted);font-size:12px}
.chip:hover{background:var(--hover);color:var(--fg)}
.chip[aria-pressed=true]{border-color:transparent;background:var(--accent);color:#fff}
.check{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 8px;border-radius:6px;color:var(--muted)}
.check:hover{background:var(--hover);color:var(--fg)}
.check[aria-checked=true]{color:var(--fg)}
.check.sub{padding-left:30px;font-size:12px}
.box{flex:none;display:grid;place-items:center;width:14px;height:14px;border-radius:4px;border:1px solid var(--faint)}
.box svg{width:10px;height:10px;opacity:0}
.check[aria-checked=true] .box{border-color:var(--accent);background:var(--accent);color:#fff}
.check[aria-checked=true] .box svg{opacity:1}
.label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.count{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.more{height:28px;padding:0 8px 0 30px;color:var(--faint);font-size:12px;border-radius:6px;width:100%}
.more:hover{color:var(--fg);background:var(--hover)}
.progress{padding:4px 8px 2px;color:var(--faint);font-size:11px;font-variant-numeric:tabular-nums}
.bar{height:2px;margin-bottom:4px;border-radius:2px;background:var(--line);overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent);transition:width .2s}
.foot{margin-top:12px;padding:8px 8px 0;border-top:1px solid var(--line);display:grid;gap:2px;font-size:12px;color:var(--faint)}
.foot .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.foot .link{padding:2px 0}
.foot .danger{color:#d4483b}
.open{display:none;position:fixed;z-index:40;top:12px;left:12px;height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);font-weight:500;box-shadow:0 1px 2px rgb(0 0 0 / .06)}
.open:hover{background:var(--hover)}
.narrow .open{display:block}
.narrow .panel{left:0;top:0;bottom:0;max-height:none;width:260px;padding:12px 4px;background:var(--bg);box-shadow:var(--shadow);transform:translateX(-105%);transition:transform .2s cubic-bezier(.16,1,.3,1)}
.narrow.drawer .panel{transform:none}
`;

const CHECK = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.2 4 7l4-4"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.8 5 6.3l2.5-2.5"/></svg>`;
const TOP_HOSTS = 8;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function sidebar(actions: Actions) {
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
  open.textContent = "Filters";
  open.dataset.act = "open";
  frame.append(open, panel);
  root.append(style, frame);

  const folded = new Set<string>();
  let all = false;
  let confirming = false;
  let last: View | null = null;

  const check = (key: Key, label: string, view: View, on: boolean, sub = false) =>
    `<button class="check${sub ? " sub" : ""}" role="checkbox" aria-checked="${on}" data-act="toggle" data-key="${esc(key)}"><span class="box">${CHECK}</span><span class="label">${esc(label)}</span>${sub ? "" : `<span class="count">${view.counts[key] ?? 0}</span>`}</button>`;

  const chip = (key: Key, label: string, on: boolean) => `<button class="chip" aria-pressed="${on}" data-act="toggle" data-key="${key}">${label}</button>`;

  const group = (key: string, title: string, body: string) => {
    const shut = folded.has(key);
    return `<section class="group"><button class="fold" aria-expanded="${!shut}" data-act="fold" data-key="${key}">${CHEVRON}${title}</button>${shut ? "" : body}</section>`;
  };

  const progress = (v: View) => {
    if (v.offline) return `<div class="progress">Translator offline</div>`;
    if (!v.progress) return "";
    const pct = v.progress.total ? Math.round((v.progress.done / v.progress.total) * 100) : 0;
    return `<div class="progress"><div class="bar"><i style="width:${pct}%"></i></div>Labeling ${v.progress.done} / ${v.progress.total}</div>`;
  };

  const foot = (v: View) =>
    confirming
      ? `<div class="row">Clear ${v.cached} labels? <button class="link danger" data-act="confirm">Clear</button><button class="link" data-act="cancel">Cancel</button></div>`
      : `<div class="row"><button class="link" data-act="clear">Clear label cache</button></div><div>${v.cached} labels cached</div>`;

  function render(v: View) {
    last = v;
    const f = v.filters;
    const top = all ? v.sources : v.sources.filter((h, i) => i < TOP_HOSTS || f.hosts.includes(h));
    const now = root.activeElement instanceof HTMLElement && panel.contains(root.activeElement) ? root.activeElement : null;
    const focus = now ? `[data-act="${now.dataset.act}"]${now.dataset.key === undefined ? "" : `[data-key="${now.dataset.key}"]`}` : null;
    panel.innerHTML = [
      `<div class="head"><span class="title">Filters</span>${active(f) ? `<button class="link" data-act="reset">Reset</button>` : ""}</div>`,
      `<p class="meta">Showing ${v.shown} of ${v.total}</p>`,
      group("quick", "Quick", `<div class="chips">${chip("trainee", "Trainee", f.trainee)}${chip("closing", "Closing in 7 days", f.closing)}${chip("week", "Added this week", f.week)}</div>`),
      group("role", "Role type", check("trainee", "Trainee / graduate", v, f.trainee) + check("unclear", "Include unclear", v, f.unclear, true) + progress(v)),
      group("deadline", "Deadline", check("deadline", "Has deadline", v, f.deadline) + check("closing", "Closing in 7 days", v, f.closing)),
      group("added", "Added", check("week", "This week", v, f.week) + check("month", "Last 30 days", v, f.month)),
      group(
        "source",
        "Source",
        top.map((h) => check(`host:${h}`, h, v, f.hosts.includes(h))).join("") +
          (v.sources.length > TOP_HOSTS ? `<button class="more" data-act="more">${all ? "Show less" : "Show all"}</button>` : ""),
      ),
      `<div class="foot">${foot(v)}</div>`,
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

  function place() {
    const column = document.querySelector("div.mx-auto.max-w-5xl");
    const gutter = column ? column.getBoundingClientRect().left : 0;
    const narrow = gutter < WIDTH + GAP;
    frame.classList.toggle("narrow", narrow);
    if (!narrow) frame.classList.remove("drawer");
    host.style.setProperty("--left", `${gutter - WIDTH - GAP}px`);
  }

  window.addEventListener("resize", place);
  return { host, render, place };
}
