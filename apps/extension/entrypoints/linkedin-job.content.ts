import { checkLanguage } from "@job-finder/core";
import { MIN, read } from "@/lib/finnish";
import { better, canonical, guest, jobId, keep, place, seen, spot, type Kind } from "@/lib/linkedin";
import { row, type Row } from "@/lib/pill";
import { relayed } from "@/lib/relay";
import { load } from "@/lib/settings";
import { trace } from "@/lib/trace";

export default defineContentScript({
  matches: ["*://www.linkedin.com/jobs/*"],
  async main() {
    const settings = await load();
    const session = crypto.randomUUID();
    const offline = `Translator offline at ${settings.url}. Start it, then reload.`;
    const reason = (err: unknown) => (err instanceof TypeError ? offline : err instanceof Error ? err.message : String(err));
    let now: { id: string; r: Row; kind: Kind } | null = null;

    const settle = () => {
      if (!now) return;
      const s = spot(document);
      if (now.r.el.isConnected && !better(s.kind, now.kind)) return;
      place(now.r.el, s, document);
      now.kind = s.kind;
    };

    const check = async (id: string, r: Row) => {
      const url = canonical(id);
      const hit = await seen(id);
      if (now?.id !== id) return;
      if (hit) return r.show(hit);
      const opts = { base: settings.url, fetch: relayed, thresholds: settings, headers: trace("linkedin-detail", session, url) };
      try {
        const res = await relayed(guest(id));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await read(await res.text(), opts);
        if (now?.id !== id) return;
        if (text.length < MIN) {
          r.lead.set("unclear", "text too short");
          return r.experience.set("unclear", "text too short");
        }
        const { language, experience } = await checkLanguage({ text }, opts);
        const result = { language: language.verdict, experience: experience.verdict };
        await keep(id, result);
        if (now?.id === id) r.show(result);
      } catch (err) {
        if (now?.id === id) r.fail(reason(err));
      }
    };

    const tick = () => {
      const id = jobId(location.href);
      if (id === (now?.id ?? null)) return;
      now?.r.el.remove();
      now = null;
      if (!id) return;
      const r = row(true, "language");
      const s = spot(document);
      place(r.el, s, document);
      now = { id, r, kind: s.kind };
      void check(id, r);
    };

    // LinkedIn remounts the top card, so the row is put back or moved to a better spot.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        settle();
      });
    }).observe(document.body, { childList: true, subtree: true });

    tick();
    setInterval(tick, 500);
  },
});
