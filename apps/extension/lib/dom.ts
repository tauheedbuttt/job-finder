import { LIMIT, type Block, type Candidate } from "@job-finder/core";

export type Scan<T> = { data: T[]; elements: Map<string, Element> };

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME", "CANVAS"]);
const BREAK = new Set([
  "P", "DIV", "LI", "UL", "OL", "BR", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "TD", "TH", "SECTION",
  "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE", "BLOCKQUOTE", "PRE", "DT", "DD", "TABLE", "FORM",
]);
const BLOCKS = 30;
const MIN = 200;

export function hidden(el: Element): boolean {
  if (el.closest("[hidden], [aria-hidden='true']")) return true;
  if (el instanceof HTMLElement && el.style.display === "none") return true;
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  return check ? !check.call(el) : false;
}

export function text(root: Node): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      return;
    }
    if (!(node instanceof Element) || SKIP.has(node.tagName.toUpperCase())) return;
    const brk = BREAK.has(node.tagName.toUpperCase());
    if (brk) out += "\n";
    node.childNodes.forEach(walk);
    if (brk) out += "\n";
  };
  if (root instanceof Element || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) root.childNodes.forEach(walk);
  else walk(root);
  return out
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function postings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(postings);
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  const type = node["@type"];
  const own = (Array.isArray(type) ? type : [type]).includes("JobPosting") && typeof node.description === "string" ? [node.description] : [];
  return [...own, ...postings(node["@graph"])];
}

function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return text(doc.body);
}

function size(el: Element): number {
  return (el.textContent ?? "").replace(/\s+/g, "").length;
}

export function scanBlocks(doc: Document): Scan<Block> {
  const data: Block[] = [];
  const elements = new Map<string, Element>();
  const seen = new Set<string>();
  const add = (body: string, source: Block["source"], el?: Element) => {
    if (body.length < MIN || seen.has(body) || data.length >= BLOCKS) return;
    seen.add(body);
    const id = `b${data.length}`;
    data.push({ id, text: body, source });
    if (el) elements.set(id, el);
  };
  for (const script of doc.querySelectorAll("script[type='application/ld+json']")) {
    try {
      for (const html of postings(JSON.parse(script.textContent ?? ""))) {
        const body = plain(html);
        // JSON-LD is kept even when short, it is the most direct source.
        if (body && !seen.has(body)) {
          seen.add(body);
          data.push({ id: `b${data.length}`, text: body, source: "jsonld" });
        }
      }
    } catch {
      continue;
    }
  }
  const tight: Array<{ el: Element; body: string }> = [];
  for (const el of doc.body.querySelectorAll("*")) {
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    const total = size(el);
    if (total < MIN) continue;
    if ([...el.children].some((c) => size(c) >= total * 0.8)) continue;
    if (hidden(el)) continue;
    tight.push({ el, body: text(el) });
  }
  tight.sort((a, b) => b.body.length - a.body.length);
  for (const { el, body } of tight) add(body, "dom", el);
  return { data, elements };
}

const CLICKABLE = "a[href], button, input[type='submit'], input[type='button'], [role='button'], [role='link']";
const LANDMARK = "form, article, section, main, nav, header, footer, aside, dialog";
const EDGE = new Set(["nav", "header", "footer", "aside"]);

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function context(el: Element): string {
  const mark = el.closest(LANDMARK);
  if (!mark) return "";
  const name = mark.tagName.toLowerCase();
  const heading = mark.querySelector("h1, h2, h3, legend");
  const title = heading ? clip(heading.textContent ?? "", 100) : "";
  return title ? `${name}: ${title}` : name;
}

function href(el: Element): string {
  if (!(el instanceof HTMLAnchorElement)) return "";
  return /^https?:/i.test(el.href) ? el.href : "";
}

export function scanCandidates(doc: Document): Scan<Candidate> {
  const found: Array<{ el: Element; item: Omit<Candidate, "id">; edge: boolean }> = [];
  const seen = new Set<string>();
  for (const el of doc.querySelectorAll(CLICKABLE)) {
    if (hidden(el) || (el as HTMLButtonElement).disabled) continue;
    const label = el instanceof HTMLInputElement ? el.value : el.textContent ?? "";
    const item = {
      tag: el.tagName.toLowerCase(),
      text: clip(label, 80),
      href: href(el),
      aria: clip(el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "", 80),
      context: context(el),
    };
    if (!item.text && !item.aria) continue;
    const key = `${item.tag}|${item.text}|${item.aria}|${item.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ el, item, edge: EDGE.has(item.context.split(":")[0]!) });
  }
  const ordered = [...found.filter((f) => !f.edge), ...found.filter((f) => f.edge)].slice(0, LIMIT);
  const elements = new Map<string, Element>();
  const data = ordered.map(({ el, item }, i) => {
    elements.set(`c${i}`, el);
    return { id: `c${i}`, ...item };
  });
  return { data, elements };
}
