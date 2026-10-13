import { BASE, thresholds } from "@job-finder/core";

export type Settings = { url: string; yes: number; no: number; span: number; hideExperienced: boolean; agilefantOwn: boolean };

export const defaults: Settings = { url: BASE, ...thresholds.parse({}), hideExperienced: false, agilefantOwn: true };

export async function load(): Promise<Settings> {
  const got = await browser.storage.local.get("settings");
  return { ...defaults, ...(got.settings as Partial<Settings> | undefined) };
}

export async function save(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export function watch(fn: (settings: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) fn({ ...defaults, ...(changes.settings.newValue as Partial<Settings> | undefined) });
  });
}

export const STEP = 0.05;

const round = (n: number) => Math.round(n * 100) / 100;

// Slider limits that keep yes at least one step above no.
export function bounds(t: Pick<Settings, "yes" | "no">) {
  return { yes: { min: round(t.no + STEP), max: 1 }, no: { min: 0, max: round(t.yes - STEP) } };
}
