const cache = new Map<string, string>();
const BATCH = 50;
const TTL = 30 * 24 * 60 * 60 * 1000;
const key = (text: string) => `tr:${text}`;

type Entry = { en: string; at: number };

// Storage is shared by every extension page and content script; absent storage leaves the memory map only.
async function recall(texts: string[], now: number): Promise<void> {
  if (!texts.length) return;
  try {
    const got = (await browser.storage.local.get(texts.map(key))) as Record<string, Entry | undefined>;
    const stale: string[] = [];
    for (const t of texts) {
      const hit = got[key(t)];
      if (!hit) continue;
      if (now - hit.at < TTL) cache.set(t, hit.en);
      else stale.push(key(t));
    }
    if (stale.length) await browser.storage.local.remove(stale);
  } catch {
    return;
  }
}

async function keep(pairs: Array<[string, string]>, now: number): Promise<void> {
  try {
    await browser.storage.local.set(Object.fromEntries(pairs.map(([t, en]) => [key(t), { en, at: now } satisfies Entry])));
  } catch {
    return;
  }
}

export async function translate(texts: string[], base: string, send: typeof fetch = fetch, now = Date.now()): Promise<string[]> {
  await recall([...new Set(texts.filter((t) => !cache.has(t)))], now);
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const res = await send(`${base.replace(/\/+$/, "")}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts: batch }),
    });
    if (!res.ok) throw new Error(`Translator error ${res.status}`);
    const { translations } = (await res.json()) as { translations: string[] };
    const pairs = batch.map((t, j): [string, string] => [t, translations[j] ?? t]);
    pairs.forEach(([t, en]) => cache.set(t, en));
    await keep(pairs, now);
  }
  return texts.map((t) => cache.get(t) ?? t);
}
