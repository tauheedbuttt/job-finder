import { checkFinnish, pickApply, pickDescription, splitSentences, type Block, type Candidate, type Finnish, type Pick, type Sentence } from "@job-finder/core";
import type { Marked, Scanned, Send } from "./messages";
import type { Settings } from "./settings";
import { translate } from "./translate";

export const STEPS = ["Reading page", "Finding job description", "Translating", "Checking Finnish", "Finding apply button"] as const;

export type Result = {
  url: string;
  title: string;
  block: Block | null;
  sentences: Sentence[];
  finnish: Finnish | null;
  apply: (Pick & { candidate: Candidate | null }) | null;
  found: string[];
};

export class OfflineError extends Error {
  constructor(base: string) {
    super(`Translator offline at ${base}. Start it with pnpm dev:translator, then analyze again.`);
    this.name = "OfflineError";
  }
}

async function ping(base: string): Promise<void> {
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/health`);
    if (res.ok) return;
  } catch {
    // Network failure falls through to the offline error.
  }
  throw new OfflineError(base);
}

export async function analyze(send: Send, settings: Settings, step: (label: (typeof STEPS)[number]) => void): Promise<Result> {
  try {
    return await run(send, settings, step);
  } catch (err) {
    // fetch rejects with TypeError only when the server cannot be reached.
    throw err instanceof TypeError ? new OfflineError(settings.url) : err;
  }
}

async function run(send: Send, settings: Settings, step: (label: (typeof STEPS)[number]) => void): Promise<Result> {
  const opts = { base: settings.url };
  step("Reading page");
  await ping(settings.url);
  await send({ type: "clear" });
  const scan = await send<Scanned>({ type: "scan" });
  const applying = pickApply(scan.candidates, opts);
  applying.catch(() => undefined);

  step("Finding job description");
  const pick = await pickDescription(scan.blocks, opts);
  const block = scan.blocks.find((b) => b.id === pick.id) ?? null;
  const pieces = block ? splitSentences(block.text) : [];

  step("Translating");
  const en = await translate(
    pieces.map((p) => p.text),
    settings.url,
  );
  const sentences = pieces.map((p, i) => ({ id: p.id, fi: p.text, en: en[i] ?? p.text }));

  step("Checking Finnish");
  const finnish = sentences.length ? await checkFinnish({ sentences }, { ...opts, thresholds: settings }) : null;

  let found: string[] = [];
  if (finnish?.spans.length) {
    const byId = new Map(sentences.map((s) => [s.id, s.fi]));
    const marks = finnish.spans.map((s) => ({ id: s.id, text: byId.get(s.id) ?? "", kind: s.kind }));
    found = (await send<Marked>({ type: "mark", block: block?.source === "dom" ? block.id : null, marks })).found;
  }

  step("Finding apply button");
  const apply = await applying;
  return {
    url: scan.url,
    title: scan.title,
    block,
    sentences,
    finnish,
    apply: { ...apply, candidate: scan.candidates.find((c) => c.id === apply.id) ?? null },
    found,
  };
}
