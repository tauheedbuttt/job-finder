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
- Translate cache: memory `Map` plus `chrome.storage.local`, key `tr:<text>`, TTL 30 days. Shared by panel, list and detail scripts. Missing storage falls back to memory. Reason: detail page reuses list title and earlier JD translations, no second translator call.
- Settings: translator URL (default `http://localhost:8790`), thresholds. Stored in `chrome.storage.local`.
- Offline translator: `/jev` is also down, so show one clear error and stop. No partial run. Reason: Jev is proxied by the translator.
- Host permissions: all urls, needed for any-site panel.
- Tracing headers on every Jev call. Panel: one session per Analyze run, flow `panel-analyze`. List: one session per page load, one trace per card, flow `list-card`. Reason: Langfuse token spend per feature.

## List badges (duunitori list pages)
- Content script on `duunitori.fi/tyopaikat/*` list pages only. Detail pages get own script, see "Detail page" below.
- Per job card, inject a pill under the title row. Shadow DOM, so site CSS does not leak.
- Only cards in view (`IntersectionObserver`). Scroll loads more.
- Background worker `fetch(url)` per card, pool of 5. Host permission gives no CORS. No Playwright, no tab opened.
- Worker returns HTML string. Content script parses with `DOMParser`. JSON-LD JobPosting block used directly, `pickDescription` only when none. Then `checkFast`. No translate. Reason: Langfuse showed pick on a lone JSON-LD block always b0 at 1.0, ~40% of list tokens wasted.
- Two pills in one row: Finnish and experience. Finnish states: loading, green "No Finnish", grey "Unclear", error "Check failed". Experience states: loading, amber "Experience required", green "No experience needed", grey "Experience unclear", error. Finnish yes removes the card from the DOM. Reason: user never wants Finnish-required jobs in the list. Experience never removes, info only. Reason: user wants to see which roles take no prior experience. External employer pages without JSON-LD end grey.
- Card title: batch-translate titles of cards in view via `/translate`. Show `original - English` when translation differs. English titles untouched. Reason: user reads Finnish titles at a glance, original kept for search.
- Both verdicts cached per job URL in `chrome.storage.local` with TTL. Entry without `experience` counts as miss. Reason: entries from before experience pill.
- Translator offline: one error state on pills, no retry loop.
- Reason: list mode favours speed. Yes/no only, no highlights.

## Detail page (duunitori)
Reason: user wants list-level info on detail page without opening side panel, plus in-place English JD.
- Separate content script on `duunitori.fi/tyopaikat/tyo/*`. List script stays excluded there.
- Title: translate `h1` text via `/translate`. Append ` - English` span, same rule as list `retitle` (skip when same, no duplicate). Reuse helper, pass element not card.
- Pills: same pill row under `h1`, Finnish and experience. Run `judge` on current `document.documentElement.outerHTML`, no fetch. Same `cached`/`remember` key per URL, so list and detail share verdict. Finnish yes shows red "Finnish required" pill. Page never removed. Trace flow `detail-card`, one session per page load.
- Verdict and title reuse list work via shared storage. Detail page calls Jev only on a cache miss.
- Translate button: shadow DOM button right of `Työpaikkakuvaus` `h2` (first `h2` before `.description-box`). Label "Translate".
- Click: target `.description--jobentry` (fallback: `.description-box`). Save original `innerHTML`. Collect leaf blocks (`p, li, h1-h6, td, dd`, plus `div` with no block children) that have text. Per block: `splitSentences`, translate all sentences in one batched `translate` call, join per block, set block `textContent`. Inline bold/links inside a block are lost. Reason: sentence-level translate keeps model input short, block-level replace keeps layout.
- Button states: "Translate" -> "Translating…" (disabled) -> "Show original". "Show original" restores saved `innerHTML`, label back to "Translate". Second translate hits translate cache, instant.
- Translator offline: button shows "Translator offline", title holds URL hint. Pill error state same as list. No retry loop.
- Side panel unaffected. Panel highlights match original text, so user restores original before Analyze. Note in checklist.

## Tests
- Unit: candidate builders on saved HTML fixtures. Highlight range mapping.
- Unit: detail page fixture. Leaf block collection, translate replace, restore original. Title span added once.
- Manual checklist in `docs/`.
