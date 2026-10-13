import { blank, counts, flip, items, revive, ROWS, sources, style, today, visible, type Filters, type Item } from "@/lib/agilefant";
import { deep, grade, lacks, missing, order, redo, retry, run as scan, wipe } from "@/lib/finnish";
import { CSS as INFO, mark, tips, type Known } from "@/lib/info";
import { cache, labels, run, type Issue } from "@/lib/labels";
import type { Level } from "@/lib/badge";
import { trace } from "@/lib/trace";
import { relayed } from "@/lib/relay";
import { rendered, web } from "@/lib/render";
import { CSS, decorate, KEY as GONE, kept, pick, toast, toolbar, type Removed } from "@/lib/removed";
import { load, watch } from "@/lib/settings";
import { sidebar } from "@/lib/sidebar";
import { CSS as SITE, unset } from "@/lib/site";

const KEY = "agilefant:filters";
const WAIT = 15000;

// Resolves once the SPA renders its first row, false after the cap.
function ready(): Promise<boolean> {
  return new Promise((done) => {
    if (document.querySelector("[data-item-id]")) return done(true);
    const watch = new MutationObserver(() => {
      if (!document.querySelector("[data-item-id]")) return;
      watch.disconnect();
      clearTimeout(timer);
      done(true);
    });
    watch.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      watch.disconnect();
      done(false);
    }, WAIT);
  });
}

type Saved = Partial<Filters> & { folded?: string[] };

async function restore(): Promise<{ filters: Filters; folded?: string[] }> {
  try {
    const { folded, ...got } = ((await browser.storage.local.get(KEY))[KEY] ?? {}) as Saved;
    return { filters: revive(got), folded };
  } catch {
    return { filters: { ...blank } };
  }
}

export default defineContentScript({
  matches: ["https://agilefant.org/p/*"],
  async main() {
    if (!(await ready())) return;
    let settings = await load();
    const session = crypto.randomUUID();
    const memo = cache();
    await memo.load();
    const { trainee, finnish } = labels;
    // Memory-only issues, such as a row the Finnish run never labeled.
    const notes = new Map<string, Issue[]>();
    // Rows with a Try in tab click in flight.
    const trying = new Set<string>();
    // Every row ever seen, so rows hidden before a site search or Refresh stay hidden on remount.
    const known = new Map<string, Item>();
    let rows = items(document);
    const saved = await restore();
    let filters = saved.filters;
    let folded = saved.folded;
    const persist = () => void browser.storage.local.set({ [KEY]: { ...filters, folded } }).catch(() => undefined);
    let gone = (((await browser.storage.local.get(GONE).catch(() => ({}))) as Record<string, Removed | undefined>)[GONE] ?? {}) as Removed;
    let trash = false;
    const keepGone = () => void browser.storage.local.set({ [GONE]: gone }).catch(() => undefined);
    let offline = false;
    let running = false;
    let again = false;
    let epoch = 0;
    let frame = 0;
    let checking = false;
    let more = false;
    let turn = 0;
    let ranking = false;
    let extra = false;
    let round = 0;
    // Seniority progress: rows done and rows in the current run.
    let ranked = { done: 0, total: 0 };
    // Process all on the failed view: run id and progress.
    let pass = 0;
    let fixing: { done: number; total: number } | null = null;

    const veil = document.createElement("style");
    veil.dataset.jfAgilefant = "";
    const look = document.createElement("style");
    look.textContent = CSS + INFO;
    // Hides the site filter panel while our filters are in use.
    const mask = document.createElement("style");
    document.head.append(veil, look, mask);
    const mine = () => settings.agilefantOwn;

    const remember = (list: Item[]) => list.forEach((i) => known.set(i.id, i));
    remember(rows);

    const bar = sidebar(
      {
        toggle: (key) => change(flip(filters, key)),
        reset: () => change({ ...blank }),
        fix: () => void fix(),
        halt: () => {
          pass++;
          fixing = null;
          update();
        },
        clear: async () => {
          pass++;
          fixing = null;
          epoch++;
          turn++;
          round++;
          running = false;
          checking = false;
          ranking = false;
          notes.clear();
          await Promise.all([memo.clear(), wipe()]);
          update();
          void label();
          void judge();
        },
        fold: (keys) => {
          folded = keys;
          persist();
        },
      },
      folded,
    );
    document.body.append(bar.host);

    function drop(ids: string[], on: boolean) {
      gone = { ...gone };
      for (const id of ids) on ? (gone[id] = Date.now()) : delete gone[id];
      if (trash && !Object.keys(gone).length) trash = false;
      keepGone();
      update();
      // Restored rows may still lack a Finnish label.
      if (!on) void judge();
    }

    const tools = toolbar({
      view: () => {
        trash = !trash;
        update();
      },
      all: () => drop(Object.keys(gone), false),
    });

    // One delegated listener survives React remounting the rows.
    document.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-jf-info]")) return void e.stopPropagation();
      const button = (e.target as Element).closest<HTMLElement>("[data-jf-remove]");
      const id = button?.dataset.jfRemove;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      if (id in gone) return drop([id], false);
      drop([id], true);
      toast("Job removed", () => drop([id], false));
    });
    bar.place();

    const NOLINK: Issue = { step: "tab", message: "no link", at: Date.now() };
    // Failed rows with no web link get a "no link" note instead of Try in tab.
    const facts = (id: string): Known => {
      const link = web(known.get(id)?.url ?? "");
      const own = notes.get(id) ?? [];
      const note = !link && memo.get(id, finnish)?.src === "none" ? [...own, NOLINK] : own;
      return { entries: memo.row(id), notes: note, trying: trying.has(id), link };
    };
    const opts = () => ({ base: settings.url, fetch: relayed, thresholds: settings });

    // Try in tab: result replaces the Finnish entry, old issues kept. Process all calls this per row; live false drops a late answer.
    async function attempt(id: string, live = () => true) {
      const item = known.get(id);
      if (!item || trying.has(id) || !live()) return;
      const mine = turn;
      trying.add(id);
      update();
      try {
        const got = await retry(item, lacks(id, memo), memo.get(id, finnish)?.issues ?? [], rendered, { ...opts(), headers: trace("agilefant-finnish", session, item.url) });
        if (turn === mine && live()) {
          for (const [l, v] of got) memo.put(id, l, v);
          void assess();
        }
      } catch (err) {
        if (err instanceof TypeError) offline = true;
      }
      trying.delete(id);
      update();
    }
    // No Finnish filter on means every shown row is No Finnish, so that tag is noise.
    const quiet = (): Level[] => (mine() && filters.finnish && !trash ? ["no"] : []);
    const refresh = tips(facts, (id) => void attempt(id));

    const ctx = () => ({
      today: today(),
      verdict: (id: string) => memo.get(id, trainee)?.verdict,
      finnish: (id: string) => memo.get(id, finnish)?.verdict,
      failed: (id: string) => memo.get(id, finnish)?.src === "none",
      yoe: (id: string) => memo.get(id, labels.yoe)?.verdict,
      senior: (id: string) => memo.get(id, labels.senior)?.verdict,
      staff: (id: string) => memo.get(id, labels.staff)?.verdict,
      manager: (id: string) => memo.get(id, labels.manager)?.verdict,
      developer: (id: string) => memo.get(id, labels.developer)?.verdict,
      offline,
    });

    function draw() {
      frame = 0;
      const c = ctx();
      const all = [...known.values()];
      const keep = new Set((trash ? pick(all, gone) : mine() ? visible(kept(all, gone), filters, c) : kept(all, gone)).map((i) => i.id));
      const live = kept(rows, gone);
      veil.textContent = style(all.filter((i) => !keep.has(i.id)).map((i) => i.id));
      const done = all.filter((i) => memo.get(i.id, trainee)).length;
      const open = kept(all, gone);
      bar.render({
        filters,
        counts: counts(live, filters, c),
        sources: sources(live),
        shown: trash ? live.length : live.filter((i) => keep.has(i.id)).length,
        total: live.length,
        progress: running ? { done, total: all.length } : null,
        finnish: checking ? { done: open.filter((i) => memo.get(i.id, finnish)).length, total: open.length } : null,
        seniority: ranking ? ranked : null,
        fixing,
        fixable: filters.failed ? broken().length : 0,
        offline,
        cached: memo.size(),
        unlabeled: live.some((i) => !memo.get(i.id, trainee)),
      });
      decorate(document, trash);
      mark(document, facts, quiet());
      refresh();
      tools.render(Object.keys(gone).length, trash);
    }

    function update() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function change(next: Filters) {
      // Turning the Jev filter off stops spending on it.
      if (filters.trainee && !next.trainee) {
        epoch++;
        running = false;
      }
      filters = next;
      persist();
      update();
      void label();
    }

    // Title batch only while the trainee filter is on, for judged rows the merged JD call left without trainee.
    async function label() {
      if (!filters.trainee || offline) return;
      if (running) {
        again = true;
        return;
      }
      const list = kept([...known.values()], gone).filter((i) => memo.get(i.id, finnish) && !memo.get(i.id, trainee));
      if (!list.length) return;
      const mine = ++epoch;
      running = true;
      again = false;
      update();
      try {
        await run(list, {
          label: trainee,
          cache: memo,
          opts: opts(),
          deep: (item) => deep(item, { page: relayed, opts: { ...opts(), headers: trace("agilefant-jd", session, item.url) } }),
          session,
          url: location.href.split("#")[0]!,
          mark: update,
          stop: () => epoch !== mine || offline,
        });
      } catch (err) {
        if (err instanceof TypeError) offline = true;
      }
      if (epoch !== mine) return;
      running = false;
      update();
      if (again) void label();
    }

    // Rows inside the viewport, so the Finnish run starts where the user looks.
    function seen(): Set<string> {
      const out = new Set<string>();
      for (const row of document.querySelectorAll<HTMLElement>(ROWS)) {
        const r = row.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight && r.height) out.add(row.dataset.itemId ?? "");
      }
      return out;
    }

    // Finnish labels run on load for every kept row, no filter needed.
    async function judge() {
      if (offline) return;
      if (checking) {
        more = true;
        return;
      }
      const view = seen();
      const list = order(kept([...known.values()], gone), (id) => view.has(id)).filter((i) => !memo.get(i.id, finnish));
      if (!list.length) return void assess();
      const mine = ++turn;
      checking = true;
      more = false;
      update();
      try {
        await scan(list, {
          cache: memo,
          deps: { page: relayed, opts: opts() },
          session,
          mark: (id) => {
            notes.delete(id);
            update();
          },
          stop: () => turn !== mine || offline,
        });
      } catch (err) {
        if (err instanceof TypeError) offline = true;
      }
      if (turn !== mine) return;
      checking = false;
      for (const i of list) if (!memo.get(i.id, finnish)) notes.set(i.id, [{ step: "finnish", message: "not labeled", at: Date.now() }]);
      update();
      if (more) void judge();
      else {
        void assess();
        void label();
      }
    }

    // Seniority labels run after the Finnish run, same order and offline rule.
    async function assess() {
      if (offline || checking) return;
      if (ranking) {
        extra = true;
        return;
      }
      const view = seen();
      const list = order(kept([...known.values()], gone), (id) => view.has(id)).filter((i) => missing(i.id, memo).length);
      if (!list.length) return;
      const mine = ++round;
      ranking = true;
      extra = false;
      ranked = { done: 0, total: list.length };
      update();
      try {
        await grade(list, {
          cache: memo,
          deps: { page: relayed, opts: opts() },
          session,
          mark: () => {
            ranked = { ...ranked, done: ranked.done + 1 };
            update();
          },
          stop: () => round !== mine || offline,
        });
      } catch (err) {
        if (err instanceof TypeError) offline = true;
      }
      if (round !== mine) return;
      ranking = false;
      update();
      if (extra) void assess();
    }

    // Failed rows shown in the failed view, minus rows already in a tab.
    function broken(): Item[] {
      const c = ctx();
      return visible(kept([...known.values()], gone), { ...filters, failed: true }, c).filter((i) => c.failed(i.id) && !trying.has(i.id) && web(i.url));
    }

    // Process all: Try in tab for every shown failed row, 5 tabs at once.
    async function fix() {
      if (fixing || offline) return;
      const list = broken();
      if (!list.length) return;
      const mine = ++pass;
      fixing = { done: 0, total: list.length };
      update();
      const stop = () => pass !== mine || offline;
      await redo(
        list.map((i) => i.id),
        (id) => attempt(id, () => !stop()),
        stop,
        () => {
          if (fixing) fixing = { ...fixing, done: fixing.done + 1 };
          update();
        },
      );
      if (pass !== mine) return;
      fixing = null;
      update();
    }

    let pending: ReturnType<typeof setTimeout> | undefined;
    const rescan = () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (mine()) unset(document);
        bar.place();
        const next = items(document);
        decorate(document, trash);
        mark(document, facts, quiet());
        tools.render(Object.keys(gone).length, trash);
        if (next.map((i) => i.id).join() === rows.map((i) => i.id).join()) return;
        const fresh = next.some((i) => !known.has(i.id));
        rows = next;
        remember(next);
        update();
        if (!fresh) return;
        void label();
        void judge();
      }, 300);
    };
    new MutationObserver(rescan).observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Mine: site filters off, its panel hidden, our sidebar on its spot. Theirs: the reverse.
    function mode() {
      mask.textContent = mine() ? SITE : "";
      if (mine()) unset(document);
      bar.show(mine());
      update();
    }
    watch((next) => {
      const flipped = next.agilefantOwn !== settings.agilefantOwn;
      settings = next;
      if (flipped) mode();
    });

    mode();
    void label();
    void judge();
  },
});
