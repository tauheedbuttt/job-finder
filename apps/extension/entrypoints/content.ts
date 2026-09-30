import { scanBlocks, scanCandidates } from "@/lib/dom";
import { clear, locate, paint, reveal } from "@/lib/highlight";
import type { Applied, Marked, Message, Scanned } from "@/lib/messages";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Guard against double registration when the panel injects the script again.
    const flag = window as unknown as { __jobFinder?: boolean };
    if (flag.__jobFinder) return;
    flag.__jobFinder = true;

    let blocks = new Map<string, Element>();
    let candidates = new Map<string, Element>();
    let marks = new Map<string, Range>();

    browser.runtime.onMessage.addListener((raw: unknown, _sender, reply: (value: unknown) => void) => {
      const msg = raw as Message;
      if (msg.type === "scan") {
        const b = scanBlocks(document);
        const c = scanCandidates(document);
        blocks = b.elements;
        candidates = c.elements;
        reply({ url: location.href, title: document.title, blocks: b.data, candidates: c.data } satisfies Scanned);
      } else if (msg.type === "mark") {
        clear();
        marks = new Map();
        const root = (msg.block && blocks.get(msg.block)) || document.body;
        for (const m of msg.marks) {
          const range = locate(root, m.text) ?? (root === document.body ? null : locate(document.body, m.text));
          if (range) marks.set(m.id, range);
        }
        paint(msg.marks.flatMap((m) => (marks.has(m.id) ? [{ range: marks.get(m.id)!, kind: m.kind }] : [])));
        reply({ found: [...marks.keys()] } satisfies Marked);
      } else if (msg.type === "clear") {
        clear();
        marks = new Map();
        reply(true);
      } else if (msg.type === "jump") {
        const range = marks.get(msg.id);
        if (range) reveal(range);
        reply(Boolean(range));
      } else if (msg.type === "apply") {
        const el = candidates.get(msg.id);
        const href = el instanceof HTMLAnchorElement && /^https?:/i.test(el.href) ? el.href : null;
        if (el && !href && el instanceof HTMLElement) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          el.focus();
        }
        reply({ href, focused: Boolean(el && !href) } satisfies Applied);
      }
      return false;
    });
  },
});
