export type Piece = { id: string; text: string };

const marker = /^\s*(?:[•·▪◦‣∙●○■□►▸➢✓✔*>\-\u2013\u2014]|\d{1,2}[.)])\s+/u;
const abbreviation = /(?:^|\s)\p{Ll}{1,4}\.$/u;
const continuation = /^[\p{Ll}\p{N}]/u;
const ellipsis = /(?<=\u2026)\s+(?=[\p{Lu}\p{N}])/u;

const segmenter = new Intl.Segmenter("fi", { granularity: "sentence" });

function sentences(line: string): string[] {
  const out: string[] = [];
  const parts = [...segmenter.segment(line)].flatMap(({ segment }) => segment.split(ellipsis));
  for (const segment of parts) {
    const part = segment.trim();
    if (!part) continue;
    const last = out.length - 1;
    // A short lowercase word with a period before a number or lowercase word is an abbreviation.
    if (last >= 0 && abbreviation.test(out[last]!) && continuation.test(part)) out[last] += ` ${part}`;
    else out.push(part);
  }
  return out;
}

export function splitSentences(text: string): Piece[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n|\u2028|\u2029/u)) {
    const line = raw.replace(marker, "").replace(/\s+/gu, " ").trim();
    if (line) out.push(...sentences(line));
  }
  return out.map((t, i) => ({ id: `s${i}`, text: t }));
}
