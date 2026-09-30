# Spec 03: packages/core

## Goal
Pure TS shared logic. No DOM dependence except where noted. No phrase lists.

## Decisions
- zod schemas for every Jev question set and result.
- `jev(state, questions)` client. Calls translator `/jev`. Base URL injectable. Typed answers.
- `splitSentences(text)`: Unicode-aware, handles bullets and newlines. Stable ids `s0..sN`.
- Finnish check: `checkFinnish({ sentences: {id, fi, en}[] })`.
  - Sends ONE request with state `{ sentences }`.
  - Questions: `requires_finnish` (noul, whole JD, "Does this job require or indicate Finnish language skill in any way?"), plus per sentence `fi_{id}` (noul: sentence says Finnish needed) and `en_{id}` (noul: sentence says Finnish not needed or English enough).
  - Result: `{ verdict: yes|no|unclear, score, spans: {id, kind: red|green, p}[] }`. Thresholds configurable, defaults: yes >= 0.7, no <= 0.3, else unclear. Span shown when p >= 0.6.
  - Both original and translated text always given to Jev.
  - Long JD: chunk sentences, 40 per request, run chunks in parallel. Ask `requires_finnish` in every chunk, merge by max p. Reason: keeps requests small and evidence at the end of a JD is never cut.
- `checkFinnishFast({ text })`: list mode. ONE request, ONE `requires_finnish` noul on raw JD text. No translate, no sentences, no spans. Same thresholds as `checkFinnish`. Result `{ verdict, score }`. Long text truncated to a fixed char cap. Question counts only explicit Finnish skill statements; ad written in Finnish is not evidence. Reason: 20 list items per page, translating each is too slow and a yes/no needs no evidence. Explicit-only because Langfuse showed a Finnish ad with no language line scoring 0.74 and being removed.
- `pickApply(candidates)`: candidates = `{ id, tag, text, href, aria, context }[]`. Jev `choice` over ids + `none`. Then confirm noul on winner. Returns `{ id | null, confidence }`.
- `pickDescription(blocks)`: `choice` over block ids + `none`. Blocks from JSON-LD JobPosting and large containers.
- Candidate builders live in extension (DOM). Core takes plain data.

## Tests
- Mock jev transport. Verify request shape, threshold logic, span mapping.
- Sentence split fixtures (Finnish text with abbreviations, bullets).
