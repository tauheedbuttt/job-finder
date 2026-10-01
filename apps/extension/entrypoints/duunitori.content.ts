import { cached, cards, judge, place, remember, retitle, title, type Result } from "@/lib/badge";
import { row, type Row } from "@/lib/pill";
import { relayed } from "@/lib/relay";
import { load } from "@/lib/settings";
import { trace } from "@/lib/trace";
import { translate } from "@/lib/translate";

export default defineContentScript({
  matches: ["*://duunitori.fi/tyopaikat*", "*://www.duunitori.fi/tyopaikat*"],
  excludeMatches: ["*://duunitori.fi/tyopaikat/tyo/*", "*://www.duunitori.fi/tyopaikat/tyo/*"],
  async main() {
    const settings = await load();
    const opts = { base: settings.url, fetch: relayed, thresholds: settings };
    const session = crypto.randomUUID();
    const seen = new WeakSet<Element>();
    const rows = new Set<Row>();
    const urls = new WeakMap<Element, string>();
    let offline: string | null = null;

    const down = () => {
      offline = `Translator offline at ${settings.url}. Start it, then reload.`;
      for (const r of rows) if (r.busy()) r.fail(offline);
    };

    const check = async (card: Element, url: string) => {
      const r = row();
      rows.add(r);
      place(card, r.el);
      const done = (result: Result) => {
        // Finnish-required jobs leave the list entirely.
        if (result.finnish === "yes") {
          rows.delete(r);
          card.remove();
        } else r.show(result);
      };
      const hit = await cached(url);
      if (hit) return done(hit);
      if (offline) return r.fail(offline);
      let html: string;
      try {
        const res = await relayed(url);
        if (!res.ok) throw new Error(`Page ${res.status}`);
        html = await res.text();
      } catch (err) {
        return r.fail(err instanceof Error ? err.message : String(err));
      }
      if (offline) return r.fail(offline);
      try {
        const result = await judge(html, { ...opts, headers: trace("list-card", session, url) });
        await remember(url, result);
        done(result);
      } catch (err) {
        // Relay turns an unreachable translator into a TypeError.
        if (err instanceof TypeError) down();
        r.fail(offline ?? (err instanceof Error ? err.message : String(err)));
      }
    };

    // One translate call per batch of cards that came into view together.
    const english = async (list: Element[]) => {
      const titles = list.map(title);
      if (offline || !titles.some(Boolean)) return;
      try {
        const en = await translate(titles, settings.url, relayed);
        list.forEach((card, i) => retitle(card, en[i] ?? ""));
      } catch {
        return;
      }
    };

    const view = new IntersectionObserver((entries) => {
      const shown: Element[] = [];
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        view.unobserve(e.target);
        shown.push(e.target);
        const url = urls.get(e.target);
        if (url) void check(e.target, url);
      }
      if (shown.length) void english(shown);
    });

    const scan = () => {
      for (const { card, url } of cards(document)) {
        if (seen.has(card)) continue;
        seen.add(card);
        urls.set(card, url);
        view.observe(card);
      }
    };

    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  },
});
