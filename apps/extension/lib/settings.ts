import { BASE, thresholds } from "@job-finder/core";

export type Settings = { url: string; yes: number; no: number; span: number };

export const defaults: Settings = { url: BASE, ...thresholds.parse({}) };

export async function load(): Promise<Settings> {
  const got = await browser.storage.local.get("settings");
  return { ...defaults, ...(got.settings as Partial<Settings> | undefined) };
}

export async function save(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
