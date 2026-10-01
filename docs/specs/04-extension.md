# Spec 04: extension

## Goal
Duunitori helper. Pills, titles and JD translate on list and detail pages. Toolbar popup for settings and filters.
Reason for change: side panel unused, user wants a popup with toggles instead.

## Decisions
- WXT + React + TS. Manifest v3.
- No side panel. Delete `entrypoints/sidepanel`, any-site `entrypoints/content.ts`, `lib/analyze.ts`, `lib/highlight.ts`, `lib/tab.ts`, panel message types in `lib/messages.ts` (keep `Relay`). Drop `sidePanel` and `scripting` permissions. Background keeps only relay pool. Core `pickApply`, `checkFinnish` and extension `scanCandidates` stay. Reason: crawler may reuse, cheap to keep.
- Toolbar icon opens popup (`entrypoints/popup`, `action.default_popup`). Popup sections:
  - Filters: toggle "Hide experienced roles". Default off.
  - Settings: translator URL (default `http://localhost:8790`), thresholds `yes` and `no`. `span` dropped from UI. Reason: highlights gone.
- All values in `chrome.storage.local` key `settings`. `Settings` gains `hideExperienced: boolean`. Popup saves on change, no save button.
- List script reads settings at start and listens `storage.onChanged`. Toggle applies live, no reload. URL and thresholds apply on page reload. Detail script reads once, no toggle there.
- Translate cache: memory `Map` plus `chrome.storage.local`, key `tr:<text>`, TTL 30 days. Shared by list and detail scripts. Missing storage falls back to memory.
- Tracing headers on every Jev call. List: one session per page load, one trace per card, flow `list-card`. Detail: flow `detail-card`.
- Host permissions: keep `<all_urls>`. Reason: relay fetches external employer pages and translator URL is user-set.

## Experience filter
- Toggle on: list card with experience `yes` gets hidden (`display: none`, marker `data-jf-hidden`). Not removed. Reason: toggle off must bring card back without refetch.
- Toggle off: unhide all cards hidden by this filter.
- Only `yes` hides. `unclear` and `error` stay visible. Reason: filter throws out only roles that state experience is required.
- Finnish `yes` still removes card from DOM, always. Not tied to toggle.
- Detail page: never hidden. Pill only.
- Later toggles follow same shape: one boolean in `Settings`, one predicate on `Result`, same hide/unhide.

## List badges (duunitori list pages)
- Content script on `duunitori.fi/tyopaikat/*` list pages only. Detail pages get own script, see "Detail page" below.
- Per job card, inject a pill under the title row. Shadow DOM, so site CSS does not leak.
- Only cards in view (`IntersectionObserver`). Scroll loads more.
- Background worker `fetch(url)` per card, pool of 5. Host permission gives no CORS. No Playwright, no tab opened.
- Worker returns HTML string. Content script parses with `DOMParser`. JSON-LD JobPosting block used directly, `pickDescription` only when none. Then `checkFast`. No translate. Reason: Langfuse showed pick on a lone JSON-LD block always b0 at 1.0, ~40% of list tokens wasted.
- Two pills in one row: Finnish and experience. Finnish states: loading, green "No Finnish", grey "Unclear", error "Check failed". Experience states: loading, amber "Experience required", green "No experience needed", grey "Experience unclear", error. Finnish yes removes the card from the DOM. Reason: user never wants Finnish-required jobs in the list. Experience removes nothing by default. With "Hide experienced roles" on, see "Experience filter". External employer pages without JSON-LD end grey.
- Card title: batch-translate titles of cards in view via `/translate`. Show `original - English` when translation differs. English titles untouched. Reason: user reads Finnish titles at a glance, original kept for search.
- Both verdicts cached per job URL in `chrome.storage.local` with TTL. Entry without `experience` counts as miss. Reason: entries from before experience pill.
- Translator offline: one error state on pills, no retry loop.
- Reason: list mode favours speed. Yes/no only, no highlights.

## Detail page (duunitori)
Reason: user wants list-level info on detail page, plus in-place English JD.
- Separate content script on `duunitori.fi/tyopaikat/tyo/*`. List script stays excluded there.
- Title: translate `h1` text via `/translate`. Append ` - English` span, same rule as list `retitle` (skip when same, no duplicate). Reuse helper, pass element not card.
- Pills: same pill row under `h1`, Finnish and experience. Run `judge` on current `document.documentElement.outerHTML`, no fetch. Same `cached`/`remember` key per URL, so list and detail share verdict. Finnish yes shows red "Finnish required" pill. Page never removed. Trace flow `detail-card`, one session per page load.
- Verdict and title reuse list work via shared storage. Detail page calls Jev only on a cache miss.
- Translate button: shadow DOM button right of `Työpaikkakuvaus` `h2` (first `h2` before `.description-box`). Label "Translate".
- Click: target `.description--jobentry` (fallback: `.description-box`). Save original `innerHTML`. Collect leaf blocks (`p, li, h1-h6, td, dd`, plus `div` with no block children) that have text. Per block: `splitSentences`, translate all sentences in one batched `translate` call, join per block, set block `textContent`. Inline bold/links inside a block are lost. Reason: sentence-level translate keeps model input short, block-level replace keeps layout.
- Button states: "Translate" -> "Translating…" (disabled) -> "Show original". "Show original" restores saved `innerHTML`, label back to "Translate". Second translate hits translate cache, instant.
- Translator offline: button shows "Translator offline", title holds URL hint. Pill error state same as list. No retry loop.

## Tests
- Unit: experience filter. `yes` card hidden, toggle off unhides, `unclear` stays. Finnish `yes` removal checked by manual checklist.
- Unit: settings load fills `hideExperienced` false when missing.
- Unit: detail page fixture. Leaf block collection, translate replace, restore original. Title span added once.
- Manual checklist in `docs/`.
