import {
  checkFinnish,
  pickApply,
  pickDescription,
  splitSentences,
  type Block,
  type Candidate,
  type Finnish,
  type Pick,
  type Sentence,
} from "@job-finder/core";
import type { Marked, Message, Scanned } from "./messages";
import type { Settings } from "./settings";
import { translate } from "./translate";

export type Send = <T>(msg: Message) => Promise<T>;

export type Result = {
  url: string;
  title: string;
  block: Block | null;
  sentences: Sentence[];
  translated: boolean;
  finnish: Finnish | null;
  apply: (Pick & { candidate: Candidate | null }) | null;
  found: string[];
  errors: string[];
};

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Fallback when Jev is unreachable: JSON-LD first, else the longest block.
function fallback(blocks: Block[]): Block | null {
  return blocks.find((b) => b.source === "jsonld") ?? [...blocks].sort((a, b) => b.text.length - a.text.length)[0] ?? null;
}

export async function analyze(send: Send, settings: Settings, step: (label: string) => void): Promise<Result> {
  const errors: string[] = [];
  const opts = { base: settings.url };
  step("Reading page");
  await send({ type: "clear" });
  const scan = await send<Scanned>({ type: "scan" });

  const applying = pickApply(scan.candidates, opts).then(
    (p) => ({ ...p, candidate: scan.candidates.find((c) => c.id === p.id) ?? null }),
    (err) => {
      errors.push(`Apply button: ${reason(err)}`);
      return null;
    },
  );

  step("Finding job description");
  let block: Block | null = null;
  try {
    const pick = await pickDescription(scan.blocks, opts);
    block = scan.blocks.find((b) => b.id === pick.id) ?? null;
  } catch (err) {
    errors.push(`Description: ${reason(err)}`);
    block = fallback(scan.blocks);
  }
  const pieces = block ? splitSentences(block.text) : [];

  step("Translating");
  let translated = false;
  let en = pieces.map((p) => p.text);
  try {
    en = await translate(en, settings.url);
    translated = true;
  } catch (err) {
    errors.push(reason(err));
  }
  const sentences = pieces.map((p, i) => ({ id: p.id, fi: p.text, en: en[i] ?? p.text }));

  step("Checking Finnish");
  let finnish: Finnish | null = null;
  if (sentences.length) {
    try {
      finnish = await checkFinnish({ sentences }, { ...opts, thresholds: settings });
    } catch (err) {
      errors.push(`Finnish check: ${reason(err)}`);
    }
  }

  let found: string[] = [];
  if (finnish?.spans.length) {
    const byId = new Map(sentences.map((s) => [s.id, s.fi]));
    const marks = finnish.spans.map((s) => ({ id: s.id, text: byId.get(s.id) ?? "", kind: s.kind }));
    const blockId = block?.source === "dom" ? block.id : null;
    found = (await send<Marked>({ type: "mark", block: blockId, marks })).found;
  }

  step("Finding apply button");
  const apply = await applying;
  return { url: scan.url, title: scan.title, block, sentences, translated, finnish, apply, found, errors };
}
