import { z } from "zod";

export const APP = "job-finder";
export const VERSION = 1;

type Data = Record<string, unknown>;

export const schema = z.object({
  app: z.literal(APP),
  version: z.literal(VERSION),
  at: z.string(),
  local: z.record(z.string(), z.unknown()),
  sync: z.record(z.string(), z.unknown()).default({}),
});

export type Backup = z.infer<typeof schema>;
export type Count = { local: number; sync: number; fresh: number };

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function pack(local: Data, sync: Data, now = new Date()): Backup {
  return { app: APP, version: VERSION, at: now.toISOString(), local, sync };
}

export function name(now = new Date()): string {
  return `job-finder-backup-${day(now)}.json`;
}

// Throws a readable message on bad JSON or wrong shape.
export function parse(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a JSON file");
  }
  const got = schema.safeParse(raw);
  if (!got.success) throw new Error("Not a Job Finder backup");
  return got.data;
}

// Imported keys overwrite same keys; fresh counts keys new to this browser.
export function merge(now: { local: Data; sync: Data }, b: Backup): Count {
  const fresh = [...Object.keys(b.local).filter((k) => !(k in now.local)), ...Object.keys(b.sync).filter((k) => !(k in now.sync))].length;
  return { local: Object.keys(b.local).length, sync: Object.keys(b.sync).length, fresh };
}

const area = (a: "local" | "sync") => {
  try {
    return browser.storage[a];
  } catch {
    return undefined;
  }
};

// Missing sync area (Firefox temporary add-on) reads as empty.
async function all(a: "local" | "sync"): Promise<Data> {
  try {
    return (await area(a)?.get(null)) ?? {};
  } catch {
    return {};
  }
}

export async function dump(): Promise<Backup> {
  return pack(await all("local"), await all("sync"));
}

export async function restore(b: Backup): Promise<Count> {
  const count = merge({ local: await all("local"), sync: await all("sync") }, b);
  if (count.local) await browser.storage.local.set(b.local);
  if (count.sync) await area("sync")?.set(b.sync);
  return count;
}

export function download(b: Backup, doc = document): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: "application/json" }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = name(new Date(b.at));
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
