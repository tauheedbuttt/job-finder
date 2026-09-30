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
- `pickApply(candidates)`: candidates = `{ id, tag, text, href, aria, context }[]`. Jev `choice` over ids + `none`. Then confirm noul on winner. Returns `{ id | null, confidence }`.
- `pickDescription(blocks)`: `choice` over block ids + `none`. Blocks from JSON-LD JobPosting and large containers.
- Candidate builders live in extension (DOM). Core takes plain data.

## Tests
- Mock jev transport. Verify request shape, threshold logic, span mapping.
- Sentence split fixtures (Finnish text with abbreviations, bullets).
