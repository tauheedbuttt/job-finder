# Spec 04: extension

## Goal
Side panel on right, works on any site. Manual job exploration.

## Decisions
- WXT + React + TS. Chrome side panel API. Manifest v3.
- Content script: builds description blocks and apply candidates from DOM, applies highlights, scrolls to elements. Panel does network via core.
- Flow on open or "Analyze page" click:
  1. Blocks -> `pickDescription` -> JD text.
  2. Split sentences. Translate all via `/translate` (batched, cached).
  3. `checkFinnish` with fi + en per sentence.
  4. Candidates -> `pickApply`.
- Panel top: badge. Red = Finnish required. Green = not required. Grey = unclear. Loading state.
- Panel: apply button (opens href, or focuses element if not link), translated JD, toggle original/translated.
- Page highlights: red for `fi_` spans, green for `en_` spans. Match sentence text in DOM via Range. Clear on re-run. Click panel badge to jump to first evidence.
- Settings: translator URL (default `http://localhost:8790`), thresholds. Stored in `chrome.storage.local`.
- Offline translator: `/jev` is also down, so show one clear error and stop. No partial run. Reason: Jev is proxied by the translator.
- Host permissions: all urls, needed for any-site panel.
- Tracing headers on every Jev call. Panel: one session per Analyze run, flow `panel-analyze`. List: one session per page load, one trace per card, flow `list-card`. Reason: Langfuse token spend per feature.

## List badges (duunitori list pages)
- Content script on `duunitori.fi/tyopaikat/*` list pages only. Not on detail pages.
- Per job card, inject a pill under the title row. Shadow DOM, so site CSS does not leak.
- Only cards in view (`IntersectionObserver`). Scroll loads more.
- Background worker `fetch(url)` per card, pool of 5. Host permission gives no CORS. No Playwright, no tab opened.
- Worker returns HTML string. Content script parses with `DOMParser`. JSON-LD JobPosting block used directly, `pickDescription` only when none. Then `checkFinnishFast`. No translate. Reason: Langfuse showed pick on a lone JSON-LD block always b0 at 1.0, ~40% of list tokens wasted.
- Pill states: loading, green "No Finnish", grey "Unclear", error "Check failed". Verdict yes removes the card from the DOM. Reason: user never wants Finnish-required jobs in the list. External employer pages without JSON-LD end grey.
- Card title: batch-translate titles of cards in view via `/translate`. Show `original - English` when translation differs. English titles untouched. Reason: user reads Finnish titles at a glance, original kept for search.
- Verdict cached per job URL in `chrome.storage.local` with TTL.
- Translator offline: one error state on pills, no retry loop.
- Reason: list mode favours speed. Yes/no only, no highlights.

## Tests
- Unit: candidate builders on saved HTML fixtures. Highlight range mapping.
- Manual checklist in `docs/`.
