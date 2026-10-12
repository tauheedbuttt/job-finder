import { blank, counts, flip, items, sources, style, today, visible, type Filters, type Item } from "@/lib/agilefant";
import { cache, labels, run } from "@/lib/labels";
import { relayed } from "@/lib/relay";
import { CSS, decorate, KEY as GONE, kept, pick, toast, toolbar, type Removed } from "@/lib/removed";
import { load } from "@/lib/settings";
import { sidebar } from "@/lib/sidebar";

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
    return { filters: { ...blank, ...got }, folded };
  } catch {
    return { filters: { ...blank } };
  }
}

export default defineContentScript({
  matches: ["https://agilefant.org/p/*"],
  async main() {
    if (!(await ready())) return;
    const settings = await load();
    const session = crypto.randomUUID();
    const memo = cache();
    await memo.load();
    const { trainee } = labels;
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

    const veil = document.createElement("style");
    veil.dataset.jfAgilefant = "";
    const look = document.createElement("style");
    look.textContent = CSS;
    document.head.append(veil, look);

    const remember = (list: Item[]) => list.forEach((i) => known.set(i.id, i));
    remember(rows);

    const bar = sidebar(
      {
        toggle: (key) => change(flip(filters, key)),
        reset: () => change({ ...blank }),
        clear: async () => {
          epoch++;
          running = false;
          await memo.clear();
          update();
          void label();
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

    const ctx = () => ({
      today: today(),
      verdict: (id: string) => memo.get(id, trainee)?.verdict,
      offline,
    });

    function draw() {
      frame = 0;
      const c = ctx();
      const all = [...known.values()];
      const keep = new Set((trash ? pick(all, gone) : visible(kept(all, gone), filters, c)).map((i) => i.id));
      const live = kept(rows, gone);
      veil.textContent = style(all.filter((i) => !keep.has(i.id)).map((i) => i.id));
      const done = all.filter((i) => memo.get(i.id, trainee)).length;
      bar.render({
        filters,
        counts: counts(live, filters, c),
        sources: sources(live),
        shown: trash ? live.length : live.filter((i) => keep.has(i.id)).length,
        total: live.length,
        progress: running ? { done, total: all.length } : null,
        offline,
        cached: memo.size(),
        unlabeled: live.some((i) => !memo.get(i.id, trainee)),
      });
      decorate(document, trash);
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

    // Labels only run while a Jev filter is on, and only for cache misses.
    async function label() {
      if (!filters.trainee || offline) return;
      if (running) {
        again = true;
        return;
      }
      const list = kept([...known.values()], gone);
      if (list.every((i) => memo.get(i.id, trainee))) return;
      const mine = ++epoch;
      running = true;
      again = false;
      update();
      try {
        await run(list, {
          label: trainee,
          cache: memo,
          opts: { base: settings.url, fetch: relayed, thresholds: settings },
          page: relayed,
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

    let pending: ReturnType<typeof setTimeout> | undefined;
    const rescan = () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        const next = items(document);
        decorate(document, trash);
        tools.render(Object.keys(gone).length, trash);
        if (next.map((i) => i.id).join() === rows.map((i) => i.id).join()) return;
        const fresh = next.some((i) => !known.has(i.id));
        rows = next;
        remember(next);
        bar.place();
        update();
        if (fresh) void label();
      }, 300);
    };
    new MutationObserver(rescan).observe(document.body, {
      childList: true,
      subtree: true,
    });

    update();
    void label();
  },
});
