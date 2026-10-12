# Spec 04: extension

## Goal
Duunitori helper. Pills, titles and JD translate on list and detail pages. Toolbar popup for settings and filters.
Reason for change: side panel unused, user wants a popup with toggles instead.

## Decisions
- WXT + React + TS. Manifest v3.
- No side panel. Delete `entrypoints/sidepanel`, any-site `entrypoints/content.ts`, `lib/analyze.ts`, `lib/highlight.ts`, `lib/tab.ts`, panel message types in `lib/messages.ts` (keep `Relay`). Drop `sidePanel` permission. `scripting` returns for spec 06 render tabs (reason: only way to read rendered cross-origin pages). Background keeps only relay pool. Core `pickApply`, `checkFinnish` and extension `scanCandidates` stay. Reason: crawler may reuse, cheap to keep.
- Toolbar icon opens popup (`entrypoints/popup`, `action.default_popup`). Two views, one shown at a time:
  - Filters view (default): header "Filters" with gear icon button top-right. Toggle "Hide experienced roles". Default off.
  - Settings view: own component `Settings.tsx`. Gear click opens it, header gets back arrow plus "Settings". Translator URL (default `http://localhost:8790`) as text input. Thresholds `yes` and `no` as sliders 0 to 1, step 0.05, value shown right of label. `yes` slider min clamps to `no` + 0.05, `no` max to `yes` - 0.05. Reset button. `span` dropped from UI. Reason: highlights gone.
  - Reason for views: user wants settings out of the filter screen, sliders over number inputs.
  - Popup reopens on Filters view. No view memory.
  - Settings view, "Data" group under Reset: Export and Import buttons. Reason: labels, JD texts, removed rows and settings must survive extension removal.
    - Export: whole `storage.local` and `storage.sync` as `job-finder-backup-YYYY-MM-DD.json`, shape `{ app: "job-finder", version: 1, at, local, sync }`.
    - Import: zod checks shape, then `storage.set` per area. Imported keys overwrite same keys, others kept. Status line "Imported N keys, M new. Reload open boards to see them." Bad file: "Import failed: <reason>". Open boards pick it up on reload.
    - Logic in `lib/backup.ts` (`pack`, `parse`, `merge`, `dump`, `restore`). UI only wires buttons.
    - Firefox: popup closes when a file picker opens. Both buttons open `popup.html#tab` in a tab, which starts on Settings. Chrome works in the popup.
- Dev server port fixed, strict: 3100 chrome, 3101 firefox. Reason: popup came up as an empty blob. Dev `popup.html` loaded scripts from `localhost:3003` while manifest CSP allowed `localhost:3002` (port drifted across dev restarts), so no script and no CSS ran. A dev build also needs the dev server running. `popup.html` holds a fallback line, shown after 1 s if the app never mounts.
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

## Firefox build (Zen)
Reason: user wants same extension in Zen browser. Zen is Firefox-based, so one Firefox MV3 build covers it.
- One codebase. WXT builds both: `wxt build -b firefox --mv3`. No fork, no per-browser entrypoints.
- Code already uses `browser.*` from WXT. Keep it. No raw `chrome.*` anywhere. Reason: WXT polyfill is what makes Firefox work.
- Package scripts: `dev:firefox` (`wxt -b firefox --mv3`), `build:firefox`, `zip:firefox` (`wxt zip -b firefox --mv3`). Root gets `pnpm dev:firefox` (translator plus Firefox build, via `BROWSER=firefox` read by extension `dev`) and `pnpm dev:extension:firefox`. Reason: extension-only dev left translator off, every Jev call failed. Chrome scripts unchanged.
- Manifest, Firefox only (WXT per-browser manifest function):
  - `browser_specific_settings.gecko.id`: `job-finder@tauheed.dev`. Fixed id. Reason: storage survives reinstall, signing needs it.
  - `gecko.strict_min_version`: `128.0`. Reason: MV3 host permissions granted at install from 127 onward.
  - `gecko.data_collection_permissions`: `{ required: ["none"] }`. Reason: AMO signing now requires the field. Nothing leaves the machine except to user-set translator URL.
- Background: Firefox MV3 runs event page, not service worker. WXT handles it. `relay` pool and `runtime.onMessage` return-true reply already work there.
- Host permissions: Firefox may still show `<all_urls>` as optional. On every popup open, if `permissions.contains({ origins: ["<all_urls>"] })` false, show one banner with "Grant access" button calling `permissions.request`. Reason: without it relay fetch fails with CORS and every pill errors.
- Toolbar icon: Firefox only, add `action.theme_icons` (light/dark pairs from `public/icon` and `public/icon-light`). `syncIcon` stays for Chrome. Reason: Firefox picks icon from theme itself, no popup open needed.
- `web-ext.config.ts` stays `disabled: true`. Dev in Zen: load `.output/firefox-mv3-dev/manifest.json` via `about:debugging#/runtime/this-firefox` > "Load Temporary Add-on". Gone on browser restart.
- Permanent install in Zen: sign unlisted on AMO. `pnpm sign:firefox` runs `web-ext sign --channel=unlisted` with AMO key and secret from env (`WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET`, template in `apps/extension/.env.example`). Version starts `0.1.0`, bump before each sign. Reason: AMO rejects a version it already signed. Output `.xpi`, drag into Zen. Reason: release Firefox builds reject unsigned add-ons. Unlisted = not public, auto signed.
- Checklist in `docs/extension-checklist.md` gets Firefox section: list pills, detail translate, popup toggle live, grant banner.

## Tests
- Unit: experience filter. `yes` card hidden, toggle off unhides, `unclear` stays. Finnish `yes` removal checked by manual checklist.
- Unit: host access. `granted` false when missing, `grant` requests `<all_urls>`.
- Unit: settings load fills `hideExperienced` false when missing.
- Unit: backup. Pack name and shape, parse rejects bad JSON, other app, other version. Restore overwrites same keys, keeps others, counts new.
- Unit: detail page fixture. Leaf block collection, translate replace, restore original. Title span added once.
- Manual checklist in `docs/`.
