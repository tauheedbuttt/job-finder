import { cached, cards, judge, place, remember, retitle, title } from "@/lib/badge";
import { pill, type Pill } from "@/lib/pill";
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
    const pills = new Set<Pill>();
    const urls = new WeakMap<Element, string>();
    let offline: string | null = null;

    const down = () => {
      offline = `Translator offline at ${settings.url}. Start it, then reload.`;
      for (const p of pills) if (p.state === "loading") p.set("error", offline);
    };

    const check = async (card: Element, url: string) => {
      const p = pill();
      pills.add(p);
      place(card, p.el);
      const done = (verdict: Awaited<ReturnType<typeof judge>>) => {
        // Finnish-required jobs leave the list entirely.
        if (verdict === "yes") {
          pills.delete(p);
          card.remove();
        } else p.set(verdict);
      };
      const hit = await cached(url);
      if (hit) return done(hit);
      if (offline) return p.set("error", offline);
      let html: string;
      try {
        const res = await relayed(url);
        if (!res.ok) throw new Error(`Page ${res.status}`);
        html = await res.text();
      } catch (err) {
        return p.set("error", err instanceof Error ? err.message : String(err));
      }
      if (offline) return p.set("error", offline);
      try {
        const verdict = await judge(html, { ...opts, headers: trace("list-card", session, url) });
        await remember(url, verdict);
        done(verdict);
      } catch (err) {
        // Relay turns an unreachable translator into a TypeError.
        if (err instanceof TypeError) down();
        p.set("error", offline ?? (err instanceof Error ? err.message : String(err)));
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
