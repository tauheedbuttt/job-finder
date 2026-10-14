# Spec 07: linkedin job detail

## Goal
Open a LinkedIn job, see language and experience pills. Spots "Non-English required" without reading the JD.
Reason for language over Finnish: LinkedIn roles ask for Swedish, German and others too. User wants any non-English language flagged there.
Reason: user browses LinkedIn jobs directly, not only via Agilefant board.

## Site facts (2026-10-14)
- Detail URL: `/jobs/view/<id>/` (slug form `/jobs/view/<slug>-<id>` too). Split view: `/jobs/search/?currentJobId=<id>`, `/jobs/collections/...?currentJobId=<id>`.
- SPA. Clicking another job in split view changes URL, no page load.
- Logged-in DOM (user pasted HTML, 2026-10-14): no `h1`, title is a `p`. Classes obfuscated (`hcb...`). Insight chips ("Hybrid", "Full-time") are `a` links holding `svg#check-small`, each in one wrapper `div`, inside a flex chip row. Apply is `a[aria-label="Apply on company website"]`, Save is `button[aria-label="Save the job"]`. Apply/Save row sits in a stacking wrapper: a node inserted next to it overlaps the buttons. "Following" button also has `svg#check-small`, but it is a `button`, not an `a`.
- Guest endpoint `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<id>` returns JD HTML with no login. Already used by spec 06 adapter in `lib/finnish.ts`.

## Decisions
- New content script `entrypoints/linkedin-job.content.ts`, matches `*://www.linkedin.com/jobs/*`.
- Job id: `jobId(url)` in `lib/linkedin.ts`, with `guest(id)` and `canonical(id)`. Spec 06 adapter in `lib/finnish.ts` calls them. No id = do nothing. Reason: moved out of `finnish.ts` so the LinkedIn script owns its URL logic.
- Text source: guest endpoint via `relayed` fetch, then `read` (same as spec 06 `source`). Not the live DOM. Reason: logged-in classes obfuscated and change often. Guest HTML is stable and already proven on ~200 board rows.
- Verdict: core `checkLanguage({ text })`, `language` and `experience` in one call. `language` yes = any spoken language other than English named as required, preferred or advantage. Programming languages and ad language do not count. Text under `MIN` = pills grey "unclear" with detail "text too short". Fetch fail = error pills with reason.
- Cache: `seen`/`keep` in `lib/linkedin.ts`, key `lang:<id>`, TTL 24 h. Reason: one key for detail and split view. Own prefix so old `badge:` Finnish verdicts never show as language verdicts.
- Pills: `row(true, "language")` from `lib/pill.ts`. Lead pill kind `language`: "Checking language…", red "Non-English required", green "English only", grey "Language unclear". Experience pill same as duunitori. `Row.finnish` renamed `Row.lead`. Page never hidden.
- Anchor, first hit wins:
  0. Insight chip row. First `a` holding `svg#check-small`, its grandparent. Pills join the row as chips (row node `display: contents`). Reason: user wants labels as colored chips next to "Hybrid". Old Apply spot overlapped Apply and Save.
  1. Apply row. Find `button, a` in `main` whose trimmed text or `aria-label` starts with "Apply" or "Easy Apply", first one after `h1` when there is one. Climb up to 6 parents to the first one that also holds a "Save" control. Then climb past single-child wrappers. Insert own flex row before that. Reason: stacking wrapper.
  2. After the first `h1` in `main`.
  3. Fixed pill row top-right of viewport, `z-index` high. Reason: never silently show nothing.
- Pills chip size on LinkedIn: `row(true)`, 16 px semibold, 6 px 16 px padding. Same colors as duunitori.
- SPA nav: poll `location.href` every 500 ms. New job id = drop old row, run again. Same id = keep.
- Re-render: LinkedIn may remount top card and drop our node. `MutationObserver` on `body`, one check per frame. Row not `isConnected`, or a better spot now exists (chips > apply > title > fixed), re-anchor same row. No new Jev call. Reason: SPA loads top card late, first spot may be fixed.
- Stale result guard: run tags result with job id. Ignore result if current id changed.
- Trace flow `linkedin-detail`, one session per page load, one trace per job id.
- Translator offline: error pills, detail holds start hint, same text as duunitori. No retry loop.
- No title translate, no JD translate button. Reason: user asked only for the label. Add later if wanted.

## Tests
- Unit: language row labels. `lang:` cache ignores old `badge:` entry, expires after 24 h.
- Unit: `jobId` for view, slug view, `currentJobId`, junk URL.
- Unit: anchor picks chip row on real-page fixture, then Apply row past stacking wrapper, then `h1`, then fixed.
- Stale guard and SPA switch: manual checklist only. Reason: needs live relay and timers, logic is small.
- Manual checklist in `docs/extension-checklist.md`: LinkedIn view page pills as colored chips next to "Hybrid", no overlap with Apply, split view switch updates pills, cached second open is instant, Firefox build.
