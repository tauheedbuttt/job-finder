import type { Level } from "./badge";

export type Item = { id: string; title: string; url: string; alt: string; host: string; deadline: string | null; created: string | null };

export type Filters = {
  trainee: boolean;
  unclear: boolean;
  deadline: boolean;
  closing: boolean;
  week: boolean;
  month: boolean;
  hosts: string[];
};

export const blank: Filters = { trainee: false, unclear: false, deadline: false, closing: false, week: false, month: false, hosts: [] };

export type Ctx = { today: string; verdict: (id: string) => Level | undefined; offline: boolean };

type Group = "role" | "deadline" | "added" | "source";

export const ROWS = "ul.space-y-px > li > [data-item-id]";

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function items(root: ParentNode): Item[] {
  const seen = new Set<string>();
  return [...root.querySelectorAll<HTMLElement>(ROWS)].flatMap((row) => {
    const id = row.dataset.itemId ?? "";
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const link = row.querySelector<HTMLAnchorElement>("a[href]");
    const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
    const date = (name: string) => row.querySelector(`span[title^="${name} "]`)?.getAttribute("title")?.slice(name.length + 1) ?? null;
    const url = link?.href ?? "";
    return [{ id, title: flat(row.querySelector("span.text-sm")?.textContent), url, alt: flat(link?.textContent), host: host(url), deadline: date("Deadline"), created: date("Created") }];
  });
}

// One rule per id keeps rows hidden across React remounts.
export function style(ids: Iterable<string>): string {
  const rules = [...ids].map((id) => `li:has(> [data-item-id="${id.replace(/["\\]/g, "\\$&")}"])`);
  return rules.length ? `${rules.join(",\n")} { display: none !important }` : "";
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function today(now = new Date()): string {
  return iso(now);
}

function shift(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return iso(new Date(y!, m! - 1, d! + days));
}

// Monday of the week that holds the day.
function monday(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return shift(day, -((new Date(y!, m! - 1, d!).getDay() + 6) % 7));
}

const OPTIONS = {
  deadline: (i: Item) => !!i.deadline,
  closing: (i: Item, c: Ctx) => !!i.deadline && i.deadline >= c.today && i.deadline <= shift(c.today, 7),
  week: (i: Item, c: Ctx) => !!i.created && i.created >= monday(c.today),
  month: (i: Item, c: Ctx) => !!i.created && i.created >= shift(c.today, -30),
};

function role(i: Item, f: Filters, c: Ctx): boolean {
  const v = c.verdict(i.id);
  return v === "yes" || (f.unclear && v === "unclear");
}

const GROUPS: Record<Group, (i: Item, f: Filters, c: Ctx) => boolean> = {
  // Unlabeled rows stay until Jev answers, offline hides nothing.
  role: (i, f, c) => !f.trainee || c.offline || c.verdict(i.id) === undefined || role(i, f, c),
  deadline: (i, f, c) => (!f.deadline && !f.closing) || (f.deadline && OPTIONS.deadline(i)) || (f.closing && OPTIONS.closing(i, c)),
  added: (i, f, c) => (!f.week && !f.month) || (f.week && OPTIONS.week(i, c)) || (f.month && OPTIONS.month(i, c)),
  source: (i, f) => !f.hosts.length || f.hosts.includes(i.host),
};

function passes(i: Item, f: Filters, c: Ctx, skip?: Group): boolean {
  return (Object.keys(GROUPS) as Group[]).every((g) => g === skip || GROUPS[g](i, f, c));
}

export function visible(list: Item[], f: Filters, c: Ctx): Item[] {
  return list.filter((i) => passes(i, f, c));
}

// Each option counts rows it would match with every other group applied.
export function counts(list: Item[], f: Filters, c: Ctx): Record<string, number> {
  const out: Record<string, number> = { trainee: 0, deadline: 0, closing: 0, week: 0, month: 0 };
  for (const i of list) out[`host:${i.host}`] ??= 0;
  for (const i of list) {
    if (passes(i, f, c, "role") && role(i, f, c)) out.trainee!++;
    if (passes(i, f, c, "deadline")) {
      if (OPTIONS.deadline(i)) out.deadline!++;
      if (OPTIONS.closing(i, c)) out.closing!++;
    }
    if (passes(i, f, c, "added")) {
      if (OPTIONS.week(i, c)) out.week!++;
      if (OPTIONS.month(i, c)) out.month!++;
    }
    if (passes(i, f, c, "source")) out[`host:${i.host}`]!++;
  }
  return out;
}

export function active(f: Filters): boolean {
  return f.trainee || f.deadline || f.closing || f.week || f.month || f.hosts.length > 0;
}

export type Key = "trainee" | "unclear" | "deadline" | "closing" | "week" | "month" | `host:${string}`;

export function flip(f: Filters, key: Key): Filters {
  if (!key.startsWith("host:")) return { ...f, [key]: !f[key as Exclude<Key, `host:${string}`>] };
  const h = key.slice(5);
  return { ...f, hosts: f.hosts.includes(h) ? f.hosts.filter((x) => x !== h) : [...f.hosts, h] };
}

// Hosts by row count, most common first.
export function sources(list: Item[]): string[] {
  const n = new Map<string, number>();
  for (const i of list) if (i.host) n.set(i.host, (n.get(i.host) ?? 0) + 1);
  return [...n.keys()].sort((a, b) => n.get(b)! - n.get(a)! || a.localeCompare(b));
}
