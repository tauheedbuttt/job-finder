import type { Span } from "@job-finder/core";

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

type Spot = { node: Text; offset: number };

// Flattens visible text without whitespace so matching ignores layout and markup.
function flatten(root: Node): { flat: string; spots: Spot[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && SKIP.has(n.parentElement.tagName.toUpperCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let flat = "";
  const spots: Spot[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.nodeValue ?? "";
    for (let i = 0; i < value.length; i++) {
      if (/\s/.test(value[i]!)) continue;
      flat += value[i];
      spots.push({ node, offset: i });
    }
  }
  return { flat, spots };
}

export function locate(root: Node, sentence: string): Range | null {
  const needle = sentence.replace(/\s+/g, "");
  if (!needle) return null;
  const { flat, spots } = flatten(root);
  const at = flat.indexOf(needle);
  if (at < 0) return null;
  const start = spots[at]!;
  const end = spots[at + needle.length - 1]!;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

const STYLE = "::highlight(jf-red){background:#ffb3b3;color:inherit}::highlight(jf-green){background:#b8f0c2;color:inherit}";

export type Kind = Span["kind"];

export function paint(ranges: Array<{ range: Range; kind: Kind }>): void {
  clear();
  if (!("highlights" in CSS)) return;
  if (!document.getElementById("jf-style")) {
    const style = document.createElement("style");
    style.id = "jf-style";
    style.textContent = STYLE;
    document.head.append(style);
  }
  for (const kind of ["red", "green"] as const) {
    const list = ranges.filter((r) => r.kind === kind).map((r) => r.range);
    if (list.length) CSS.highlights.set(`jf-${kind}`, new Highlight(...list));
  }
}

export function clear(): void {
  if ("highlights" in CSS) {
    CSS.highlights.delete("jf-red");
    CSS.highlights.delete("jf-green");
  }
}

export function reveal(range: Range): void {
  const el = range.startContainer.parentElement;
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}
