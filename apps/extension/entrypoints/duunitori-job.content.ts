import { cached, judge, remember, suffix } from "@/lib/badge";
import { button } from "@/lib/button";
import { english, heading, root } from "@/lib/jd";
import { pill } from "@/lib/pill";
import { relayed } from "@/lib/relay";
import { load } from "@/lib/settings";
import { trace } from "@/lib/trace";
import { translate } from "@/lib/translate";

export default defineContentScript({
  matches: ["*://duunitori.fi/tyopaikat/tyo/*", "*://www.duunitori.fi/tyopaikat/tyo/*"],
  async main() {
    const settings = await load();
    // Canonical URL matches the list card href, so both share one verdict.
    const url = (document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href || location.href).split("#")[0]!;
    const html = document.documentElement.outerHTML;
    const offline = `Translator offline at ${settings.url}. Start it, then reload.`;
    const tr = (texts: string[]) => translate(texts, settings.url, relayed);
    const reason = (err: unknown) => (err instanceof TypeError ? offline : err instanceof Error ? err.message : String(err));

    const h1 = document.querySelector("h1");
    if (h1) {
      const p = pill();
      h1.after(p.el);
      const name = h1.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (name) void tr([name]).then(([en]) => suffix(h1, en ?? "")).catch(() => undefined);
      void (async () => {
        const hit = await cached(url);
        if (hit) return p.set(hit);
        try {
          const verdict = await judge(html, {
            base: settings.url,
            fetch: relayed,
            thresholds: settings,
            headers: trace("detail-card", crypto.randomUUID(), url),
          });
          await remember(url, verdict);
          p.set(verdict);
        } catch (err) {
          p.set("error", reason(err));
        }
      })();
    }

    const jd = root(document);
    const h2 = heading(document);
    if (!jd || !h2) return;
    let original: string | null = null;
    const b = button(async () => {
      if (original !== null) {
        jd.innerHTML = original;
        original = null;
        return b.set("Translate");
      }
      b.set("Translating…", true);
      try {
        original = await english(jd, tr);
        b.set("Show original");
      } catch (err) {
        b.set(err instanceof TypeError ? "Translator offline" : "Translate failed", false, reason(err));
      }
    });
    b.set("Translate");
    h2.append(b.el);
  },
});
