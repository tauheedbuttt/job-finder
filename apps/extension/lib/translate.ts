const cache = new Map<string, string>();
const BATCH = 50;

export class TranslateError extends Error {}

export async function translate(texts: string[], base: string): Promise<string[]> {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/+$/, "")}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: batch }),
      });
    } catch {
      throw new TranslateError(`Translator offline at ${base}. Start it with pnpm dev:translator.`);
    }
    if (!res.ok) throw new TranslateError(`Translator error ${res.status}`);
    const { translations } = (await res.json()) as { translations: string[] };
    batch.forEach((t, j) => cache.set(t, translations[j] ?? t));
  }
  return texts.map((t) => cache.get(t) ?? t);
}
