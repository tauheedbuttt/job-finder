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
- Offline translator: show clear error, still run Jev if possible.
- Host permissions: all urls, needed for any-site panel.

## Tests
- Unit: candidate builders on saved HTML fixtures. Highlight range mapping.
- Manual checklist in `docs/`.
