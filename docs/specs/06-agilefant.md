# Spec 06: agilefant filters

## Goal
Left sidebar of filters on the Agilefant "Open jobs" board, like ecom sites. First Jev filter: trainee roles. Rows can be removed and restored. Labels cached per listing so filtering is instant and cheap.
Reason: board holds ~800 listings from many sites. Titles alone miss many trainee roles.

## Site facts (checked with playwright-cli, 2026-10-12)
- URL: `https://agilefant.org/p/<token>`. React SPA, Tailwind. Data from Supabase RPC `get_published_backlog`.
- RPC items have `title`, `links[{url, altText}]`, `deadline`, `createdOn`. `description` is null. So no JD on the board.
- List: `ul.space-y-px > li > div[data-item-id]`. All rows rendered, no virtualization (787 rows).
- Row: title in `span.text-sm`, link `a[href]` (text = altText), deadline in `span[title^="Deadline "]`, created in `span[title^="Created "]`.
- Key: `data-item-id`, stable per listing (`<board>::wi-<uuid>`).
- Page column: `div.mx-auto.max-w-5xl` centered. Left gutter is empty on wide screens. Sidebar goes there.
- Site search and Refresh unmount and remount `li` nodes. Attributes we set on rows get lost.
- Link hosts: duunitori ~200, linkedin ~200, jobly ~150, thehub ~50, tyomarkkinatori ~40, nordea ~35, indeed ~25, rest small.

## Decisions
- New content script `entrypoints/agilefant.content.ts`, match `https://agilefant.org/p/*`. Waits for first `[data-item-id]` (MutationObserver, 15 s cap), then runs.
- Items read from DOM, not the RPC. Reason: no Supabase key handling, DOM has all we need. Item = `{ id, title, url, alt, deadline, created }`.
- Hide rows with one injected `<style>`: `li:has(> [data-item-id="<id>"]) { display: none }` per hidden id. Rebuilt on every filter change. Reason: survives React remounts, no observer race, no flicker.
- Row numbers keep site values, so gaps show. Accepted.
- Our filters stack with site search (AND). We never touch site inputs.

## Sidebar UI
Reason for rewrite: first build read as a foreign widget. Washed-out text, invisible header, chips with no shape, native grey checkboxes, top not aligned with page. Sidebar must look like part of Agilefant.

### Placement
- Shadow DOM host, `position: fixed`, width 232 px. Left edge = column left minus 232 minus 32 px gap. Recompute on `resize`.
- Top aligns with the site search input top (measure `input` rect, fallback 173 px). Header sits on that line, so sidebar and list start together. Max height viewport minus top minus 24, own scroll, scrollbar hidden until hover.
- Gutter under 264 px: collapse to a "Filters" button fixed top-left, same style as site "Refresh" (icon + text, muted). Click opens same panel as drawer, `--background` fill, right border, soft shadow. Esc or outside click closes.

### Tokens
- Use the site's own CSS variables. They are on `:root` as HSL triples and inherit into shadow DOM: `--foreground`, `--muted-foreground`, `--primary`, `--accent`, `--border`, `--background`, `--radius`. Write `hsl(var(--primary))`. Fallback values in the same `var()` for safety. No own palette, no `prefers-color-scheme` block. Reason: matches site exactly, follows any site theme change.
- Font inherits (Inter). Sizes: header 14 px semibold, option 14 px regular, group title 12 px medium, meta 12 px. Same as site rows (14 px).
- Text colors: option label `--foreground`, count and meta `--muted-foreground`, group title `--muted-foreground`. Never lighter than muted. Reason: first build used faded greys, unreadable.

### Rhythm
- One left edge. Group titles, options, chips, footer all start at x = 0 inside the sidebar. Only "Include unclear" indents, 24 px, under its parent. No other indents.
- Option row 32 px high, 8 px horizontal padding, `calc(var(--radius) - 2px)` radius, whole row clickable. Hover: `hsl(var(--accent) / .6)` fill. Count right-aligned, tabular nums.
- 20 px between groups. 8 px between group title and first option. No divider lines.

### Controls
- Checkbox: 16 px custom square, 1.5 px `--border` stroke, 4 px radius. Checked: `--primary` fill, white check. Focus ring `--ring`. No native checkbox look.
- Quick chips: pill, 28 px high, 10 px padding, 1 px `--border` stroke, `--background` fill, `--foreground` text, wrap with 6 px gap. Hover `--accent` fill. On: `--accent` fill, `--primary` text and stroke. Reason: first build chips had no shape and read as plain text.
- Group title: sentence case ("Role type"), not uppercase. Chevron 12 px on the right, rotates on collapse. Reason: site uses uppercase only for its one page label, our many uppercase titles shouted.
- Counts before labeling: show a 12 px spinner or `-`, never `0`. Reason: `0` reads as "no trainee jobs".
- Selected option count turns `--foreground` weight 500, so active filters stand out.

### Content
- Header row: "Filters" left. Right side "Reset" (text button, `--primary`) only when any filter on. Under it, meta line "787 jobs" or "42 of 787 jobs" when filtered.
- Groups, top to bottom:
  - **Quick**: chips. "No Finnish", "Trainee", "New this week". "No Finnish" on by default. No group title, chips sit right under header. Trainee labeling progress (2 px `--primary` bar plus "Checking 120 of 787") sits right under the chips.
  - **Source**: one option per link host, `www.` stripped, sorted by count, top 6 then "Show 26 more" text button (`--muted-foreground`, hover `--foreground`). None checked = all sources.
- Removed: "Closing soon" chip and the Role type, Deadline, Added groups. Reason: user never uses them. Options with no UI (`unclear`, `deadline`, `closing`, `month`) are forced off on restore, so old saved state never hides rows.
- Footer, 24 px above, small meta style: "812 labels cached · Clear". "Clear" is a text button. Click swaps line to "Clear 812 labels? Clear / Cancel", Clear in `--primary`. No `window.confirm`. Reason: dialogs block page and extension tooling. Footer hidden when 0 labels cached.

### Behaviour
- After clear: labels gone from memory and storage, Jev counts show spinner again, labeling restarts only if a Jev filter is on.
- Filter state and collapsed groups saved in `browser.storage.local` key `agilefant:filters`. Restored on load.
- Counts per option = rows matching that option with all other groups applied. Reason: ecom facet behaviour, user sees what a click will give.
- Motion: 120 ms ease on hover fill, chevron, collapse height. Nothing else animates.

## Remove rows
Reason: user checks a job, dislikes it, wants it gone for good. Needs a way back.
- Each row gets a remove button at its right end, after the created date. Lucide `x` icon, 24 px hit area, `text-muted-foreground`, hover `text-foreground` plus `bg-accent`. Hidden until row hover or focus. Always shown on touch (`hover: none`). `aria-label` "Remove job".
- Buttons live in light DOM and use site Tailwind classes. One document `<style>` for hover reveal. Rows remount on search and Refresh, so the rescan re-adds missing buttons.
- Click: row hides at once through the same hide `<style>`. Toast bottom center for 5 s: "Job removed · Undo". Undo restores it.
- Removed ids saved in `browser.storage.local` key `agilefant:removed`, value `{ [itemId]: removedAt }`. No TTL. Label cache untouched.
- Removed rows leave the sidebar counts and the "N jobs" line.
- Toolbar: button "Removed N" inserted after the site "Any / All" group (`[role=radiogroup][aria-label="Rows must contain"]`). Same classes as the site "Show only jobs with deadline" button, so it reads as native. Not inside the radiogroup. Reason: that group sets search word matching, a third radio there would mean something else. Hidden while N is 0.
- Click "Removed N": removed view. List shows only removed rows, sidebar filters ignored, button gets `bg-accent text-foreground` and `aria-pressed`. Row button turns into Lucide `rotate-ccw` "Restore job", always visible. "Restore all" button appears next to toolbar button, same style. Click again or restoring the last row leaves the view.
- Restore all needs no confirm. Reason: nothing is lost, rows only come back.

## Label engine (generic, reused by later Jev filters)
- Registry in `lib/labels.ts`: `Label = { name, version, question: NoulQuestion }`. First entry `trainee`, version 1.
- Cache: one storage key `labels:agilefant`, value `{ [itemId]: { [labelName]: { v, verdict, score, src } } }`. `v` = label version. `src` = `"title"`, `"jd"`, `"page"` (Finnish run), `"tab"` (Try in tab) or `"none"` (failed). Read once at start into memory `Map`. Writes debounced 1 s, one `storage.set`.
- Miss = no entry, or entry `v` differs from registry version. Reason: changing a question bumps version and relabels, no manual clear needed.
- No TTL. Listings do not change meaning. Clear button is the escape hatch.
- Labeling runs only when a Jev filter is on. Reason: no Jev spend for users who only use date or source filters. Once labeled, toggling is pure memory.
- Only cache misses go to Jev. New listings on a later visit are the only new work.

## Trainee label
- Stage 1, titles. Batch 40 items per Jev call: state `{ jobs: [{ title, alt, host }] }`, one noul question per item `trainee_<i>`. Pool of 3 calls. Reason: ~20 calls for a cold board, small payloads.
- Verdict from score with existing `thresholds` (`yes`, `no`). `yes` and `no` are final, `src: "title"`.
- Stage 2, JD for `unclear` only. Relay fetch first link via background `relay` pool (5). Reuse `scanBlocks` and JSON-LD path from `badge.judge`, `pickDescription` when no JSON-LD. One item per call, state `{ title, text }`, text capped at `CAP`. Result final, `src: "jd"`.
- Skip stage 2 for hosts that need login or block fetch: `linkedin.com`, `indeed.com`. Those keep `unclear` from stage 1. Reason: fetch returns auth wall, wastes a call and gives wrong text.
- Fetch or parse failure: keep stage-1 `unclear` with `src: "title"` and cache it. Reason: retry on every visit costs more than one missed row. Clear cache retries.
- Translator offline: progress line shows "Translator offline", rows not hidden by Jev filter, no retry loop. Same rule as spec 04.
- Question, judged on criteria, not keywords. Reason: titles say trainee, harjoittelija, graduate, launchpad, academy, summer job, kesätyö, or nothing at all.

```ts
const trainee: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Is this a trainee or graduate entry role?",
    input: "Job title, link text and host. For JD stage, `text` is the job description, possibly cut.",
    note: "Judge the purpose of the role, not the words used. A trainee role hires students, fresh graduates or people about to graduate, trains them on the job, and aims to keep them in the company. Names vary: trainee, harjoittelija, graduate program, launchpad, academy, summer job, kesätyö, thesis worker, internship, junior program. Junior or entry-level roles that come with a structured training path count. A plain junior role with no training path does not. Roles that demand years of experience do not.",
  },
  criteria: {
    true: "The role is built to bring students or recent graduates in and train them.",
    false: "The role hires people who already do this work, or nothing points to a training entry role.",
  },
};
```
- Filter on: show rows with `yes`. "Include unclear" adds `unclear`. Rows still loading stay visible until labeled. Reason: no empty list while Jev runs.
- Trace headers on every Jev call. One session per page load, flow `agilefant-title` for stage 1, `agilefant-jd` for stage 2.

## Finnish label
Reason: user never wants Finnish-required jobs, same as duunitori. Board links point to unknown portals, so the extension must open each link and judge the page.
- Rows labeled and filterable. Chip "No Finnish" in Quick, pre-selected (`blank.finnish = true`). On: hides rows with Finnish `yes`. `unclear`, failed and unlabeled rows stay. Off: all rows show with tags. Reason: user wants Finnish rows gone by default but able to check them. Changed from label-only phase 1.
- Reset returns to defaults, so "No Finnish" stays on. Reset button shows only when filters differ from defaults.

### Judge
- Reuse `checkFast` from core, `requires_finnish` question as is. Explicit statement only. JD written in Finnish is not evidence. No new question.
- Same call returns `requires_experience`. Cache both as labels `finnish` and `experience`, version 1. Only `finnish` gets a row tag. `experience` shows in the info tooltip. Reason: free, avoids relabel when experience filter comes.
- `question` optional on `Label`. Finnish and experience have none, `checkFast` asks both in one call.
- JD only. No title stage. Reason: titles never state language demands.
- Text: `extract(html)` first (JSON-LD, else `pickDescription`). Extract null: fall back to whole page text, `body.innerText`, whitespace collapsed, nav/header/footer/script/style removed, cut at `CAP`. Reason: unknown portals, pick can miss, whole DOM still holds the language line.
- Duunitori links: use `badge:<url>` cache when present, no fetch, no Jev, `src: "page"`, no score. Result also written back to `badge:<url>`. `score` optional on `Entry` for this and failed rows; tooltip line drops the number.

### Page source
Changed: auto render window removed. Reason: popping a window on page load made the browser unusable. Tabs open only on user click now, see "Try in tab".
- Fetch only, like duunitori. Relay fetch (existing background pool 5). No auto tab, no worker window.
- Per-host adapters turn a board link into a fetchable URL. Map `host -> (url) => url | null` in `lib/finnish.ts`. Null or no adapter = plain link.
  - `linkedin.com`: job id from `/jobs/view/<id>` or `currentJobId=<id>`. Fetch `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<id>`. Guest endpoint, no login, returns JD HTML. Reason: ~200 rows, login wall blocks the plain link.
  - `tyomarkkinatori.fi`: SPA. Fetch `https://tyomarkkinatori.fi/api/jobposting-new/v1/public/jobpostings/<uuid>`, public, no auth. Text = `position.title` + `jobDescription` + `marketingDescription`, all languages. Reason: ~40 rows, plain fetch gives empty shell.
- 400 rule checked on whole page text first. Under 400 and no JSON-LD: fail before `pickDescription`. Picked description under 400 but page longer: judge whole page text. Reason: shells and short picks must not spend a call.
- Text 400 chars or more: judge. Under 400, fetch fails or non-2xx: no Jev call. Cache `unclear`, `src: "none"`, issue "Fetch · text too short" or "Fetch · HTTP 403" etc. Reason: judging a shell wastes a call and gives a false verdict.
- `indeed.com`: no adapter. Bot wall. Ends as failed row with issue. Accepted.

### Try in tab
Reason: lets user test failed portals by hand and see if a render path is worth building.
- Failed rows (`src: "none"`) show a "Try in tab" text button at the bottom of the info tooltip, `--primary`, 12 px.
- Click: background opens `tabs.create({ url, active: false, windowId: <board tab window> })` in the user's current window, next to the board tab. No new window.
- Tab: wait `status: "complete"`, 2 s settle, `scripting.executeScript` returns `outerHTML`, close tab. Cap 20 s. One at a time.
- Same text rule (400 chars) and same judge. Success replaces the cache entry, `src: "tab"`, keeps old issues plus "Tab · ok". Failure keeps `src: "none"`, adds "Tab · <error>". Reason: button stays, user can retry.
- Tooltip is hoverable so the button is clickable. Keyboard focus not reachable yet, tooltip sits at end of `body`. Accepted for now. Row tag and tooltip update live.
- While running: button text "Trying…", disabled. Done: tooltip shows result line.
- Message `{ type: "render", url }` stays. Background renderer drops the worker window and uses the sender tab's `windowId`. Manifest keeps `scripting`.
- Uses user cookies, so logged-in LinkedIn or Indeed may work here. Tooltip result tells user which portals render fixes.

### Run
- Starts on page load. Not gated by any filter. Reason: phase 2 removes rows always.
- Skips removed rows and cache hits. Visible rows first, then the rest, top to bottom.
- Jev pool 3. Trace flow `agilefant-finnish`, one session per page load.
- Translator offline: stop run, sidebar meta "Translator offline". No retry loop. Shared offline state, so trainee labeling also stops for that page load.
- Visible rows = rows on screen. Restoring a removed row runs the check for it if it has no Finnish entry.
- Progress: sidebar meta line "Checking Finnish 120 of 787" while running. Gone when done.

### Row tag
- Small tag after the row link, 12 px, pill, 20 px high. Light DOM, own class rules in the existing remove `<style>`.
- `yes`: "Finnish required", `--primary` text, 1 px `--primary` stroke.
- `no`: "No Finnish", `--muted-foreground` text, `--border` stroke.
- `unclear`: "Finnish unclear", same as `no`.
- Not labeled yet: no tag. Rescan re-adds tags after site remounts, same as remove button.

### Info icon
Reason: one place per row for everything we know about it. Labels now, Jev or LLM issues too, more later. Changed from issues-only: user wants labels shown here as well.
- Lucide `info` 16 px in the right gutter, right of the remove button (`right: -58px`, 24 px hit area). `--muted-foreground`, hover `--foreground`.
- Shown when the row has any cached label or any issue. Issue rows tint icon `--primary`. Not shown before anything is known.
- Hidden until row hover or focus, same as remove button. Always shown on touch. Reason: user wants it only with the cross, not on every row.
- Hover or focus: tooltip, own element in light DOM, left of icon, max width 320 px, `--background` fill, `--border` stroke, soft shadow, 12 px text. No `title` attribute. Reason: native tooltip slow and unstyled.
- Tooltip body, sections in order, each skipped when empty:
  - Labels: one line per cached label. "Finnish · required (0.91) · page", "Trainee · yes (0.88) · title". Verdict words per label, score 2 decimals, source.
  - Issues: one line per issue. step, message, time. Example: "Fetch · text too short · 14:02".
- Data from the label cache only. No new key. Cache hit = no Jev call, same `cache.get` version rule. Reason: user wants labeled rows never sent to Jev again.
- Issue shape `{ step: "fetch" | "render" | "extract" | "jev" | string, message, at }`. Step is open string so later labels add own steps.
- Issues stored on the cache entry: `Entry` gains `issues?: Issue[]`. Failed row caches `unclear` with `src: "none"` plus issues. Reason: icon survives reload, no repeat spend. Clear cache retries.
- Run finished with no Finnish entry on a row: memory-only issue "Finnish · not labeled".
- Issues show which portals fail, so we see if an auto render path (hidden iframe) is ever worth building.

## JD cache
Reason: Finnish run threw JD text away after judging. New labels would refetch ~800 pages. Cache text once, every later label reads it.
- Per-item key `jd:<itemId>`, value `{ text, src: "page" | "tab", at }`. Text is what was judged (after `read`, cut at `CAP`). Per-item keys, not one big object. Reason: ~800 x 6 KB, rewriting one blob per row is slow.
- Written on every successful fetch or Try in tab. Failed rows write nothing.
- Manifest adds `unlimitedStorage`. Reason: ~5 MB of text, near the 10 MB `storage.local` cap with labels.
- No TTL. Sidebar "Clear" also removes all `jd:*` keys.
- Rows already labeled Finnish before this change have no JD. The seniority run fetches them once, same `source` path and adapters, and caches the text. No Finnish relabel.

## Seniority labels
Reason: user wants roles open to people with up to 4 years of experience. Hide 5+ year roles, senior roles and staff roles by default.
Three separate labels, version 1 each: `yoe`, `senior`, `staff`. Each has its own chip.

### Judge
- One Jev call per row, state `{ title, text }`, text from JD cache or fetch. Ask only labels that miss in cache. Reason: one call per row, no repeat spend.
- Questions in `lib/labels.ts` as registry entries with `question`. Give Jev criteria, never a list of signal words. Reason: signal lists make Jev too strict and keyword bound. Criteria let it judge the whole JD.
- A long list of tech skills is not a seniority signal. Say so once in each note. Reason: user saw JDs with many skills that are still junior friendly.
- Failed rows (no text): `senior` and `staff` judged from title alone, `src: "title"`. `yoe` stays unlabeled. Reason: titles often say senior or staff, years need a JD.
- Failed row = Finnish entry `src: "none"`. Seniority run never refetches it. Reason: `yoe` always misses there, refetch every load wastes time.
- Fetch fails in seniority run on a non-failed row: judge from title, `yoe` empty, refetch next load. No extra Jev spend.
- Finnish check also reads JD cache before fetch. Reason: saves fetch on a Finnish version bump.
- Progress "N of M" counts rows processed this run, not fully labeled. Reason: rows with empty `yoe` would never reach M.
- Trace flow `agilefant-seniority`. Jev pool 3. Runs after the Finnish run on page load, same row order, same offline rule. Progress meta "Checking seniority N of M".

```ts
const yoe: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Does this job demand five or more years of work experience?",
    input: "`title` is the job title. `text` is the job description in its original language, possibly cut.",
    note: "Judge the minimum the employer demands. Four years or less is not five. Experience named only as a plus does not count. A long list of skills or tools is not a years demand.",
  },
  criteria: {
    true: "The minimum demanded experience is five years or more.",
    false: "The demand is four years or less, or no years are demanded.",
  },
};

const senior: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Is this a senior level role?",
    input: "`title` is the job title. `text` is the job description, possibly cut or empty.",
    note: "Judge the level the employer hires for, from the title and from what the job expects of the person. A long list of skills or tools alone does not make a role senior. Junior, mid level and entry roles are not senior.",
  },
  criteria: {
    true: "The employer hires an experienced senior person, by title or by demanding about five or more years or senior level expectations.",
    false: "The role is open to junior or mid level people.",
  },
};

const staff: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Is this a staff or principal level role?",
    input: "`title` is the job title. `text` is the job description, possibly cut or empty.",
    note: "Judge the scope the role holds. Staff level means technical leadership beyond one team. A long list of skills alone does not make a role staff. Company staff or personnel used in another sense does not count.",
  },
  criteria: {
    true: "The role is staff or principal level, with technical leadership across teams.",
    false: "The role works inside one team at junior, mid or senior level.",
  },
};
```

### Filters
- Quick chips, all pre-selected (`blank` true): "Max 4 yrs" hides `yoe` yes, "No senior" hides `senior` yes, "No staff" hides `staff` yes. Order after "No Finnish".
- Same rule as No Finnish. Only `yes` hides. `unclear`, failed and unlabeled rows stay.
- Each chip is its own filter group, so facet logic stays the same.
- Saved filters without these keys load them as on.

### Info icon
- Tooltip lists the three new labels like the others: "5+ yrs · no (0.12) · page", "Senior · yes (0.91) · title", "Staff · no (0.08) · page".

## Later filters
- Same shape: one `Label` entry, one sidebar option, one predicate. No new cache keys, no new UI plumbing.
- Candidates: "No experience required" from the `experience` label cached by the Finnish run.

## Tests
- Unit: `items` parses fixture HTML rows (title, url, alt, deadline, created, id).
- Unit: hide style. Ids in, `<style>` text out. Empty set gives empty style.
- Unit: cache. Version mismatch is a miss. Debounced write sends one `set`. Clear empties memory and storage.
- Unit: facet counts with other groups applied.
- Unit: trainee batch builds 40-item chunks and maps answers back by index.
- Unit: stage 2 skipped for linkedin and indeed hosts.
- Fixture: saved board HTML from `agilefant.org/p/<token>` in `test/fixtures/agilefant.html`.
- Unit: removed view shows only removed rows, normal view drops them. Row button added once, label flips in removed view.
- Unit: Finnish source. LinkedIn link maps to guest URL. Text under 400 gives failed row with issue and no Jev call. Try in tab result replaces entry with `src: "tab"`.
- Unit: JD cache. Fetch writes `jd:<id>`, second run reads it with no fetch. Clear removes `jd:*`.
- Unit: seniority run asks only missing labels in one call. Failed row judges senior and staff from title, leaves yoe unlabeled.
- Unit: Max 4 yrs, No senior, No staff chips on by default, each hides only its `yes` rows.
- Unit: info icon shown for rows with labels or issues. Tooltip lists label lines then issue lines.
- Unit: duunitori link uses `badge:<url>` hit, no Jev call.
- Manual checklist in `docs/extension-checklist.md`: Finnish tags on mixed portals, LinkedIn guest fetch gives verdict, no tab opens on load, Try in tab opens tab in current window and closes it, issues tooltip, remove, undo, removed view, restore all, sidebar placement wide and narrow, drawer, trainee filter with progress, site search plus our filter, Refresh keeps hide, clear cache inline confirm, Firefox build.
