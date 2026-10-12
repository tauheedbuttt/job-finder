# Spec 06: agilefant filters

## Goal
Left sidebar of filters on the Agilefant "Open jobs" board, like ecom sites. First Jev filter: trainee roles. Labels cached per listing so filtering is instant and cheap.
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
  - **Quick**: chips. "Trainee", "Closing soon", "New this week". Chip state mirrors matching option below. No group title, chips sit right under header. Reason: quick picks need no label.
  - **Role type** (Jev): "Trainee / graduate" with count. Sub-option "Include unclear", default off. While labeling: 2 px `--primary` bar under the option plus meta "Checking 120 of 787". Bar fades out when done.
  - **Deadline**: "Has deadline", "Closing in 7 days". Plain date math on `deadline`. Collapsed by default.
  - **Added**: "This week", "Last 30 days". On `created`. Collapsed by default.
  - **Source**: one option per link host, `www.` stripped, sorted by count, top 6 then "Show 26 more" text button (`--muted-foreground`, hover `--foreground`). None checked = all sources.
- Footer, 24 px above, small meta style: "812 labels cached · Clear". "Clear" is a text button. Click swaps line to "Clear 812 labels? Clear / Cancel", Clear in `--primary`. No `window.confirm`. Reason: dialogs block page and extension tooling. Footer hidden when 0 labels cached.

### Behaviour
- After clear: labels gone from memory and storage, Jev counts show spinner again, labeling restarts only if a Jev filter is on.
- Filter state and collapsed groups saved in `browser.storage.local` key `agilefant:filters`. Restored on load.
- Counts per option = rows matching that option with all other groups applied. Reason: ecom facet behaviour, user sees what a click will give.
- Motion: 120 ms ease on hover fill, chevron, collapse height. Nothing else animates.

## Label engine (generic, reused by later Jev filters)
- Registry in `lib/labels.ts`: `Label = { name, version, question: NoulQuestion }`. First entry `trainee`, version 1.
- Cache: one storage key `labels:agilefant`, value `{ [itemId]: { [labelName]: { v, verdict, score, src } } }`. `v` = label version. `src` = `"title"` or `"jd"`. Read once at start into memory `Map`. Writes debounced 1 s, one `storage.set`.
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

## Later filters
- Same shape: one `Label` entry, one sidebar option, one predicate. No new cache keys, no new UI plumbing.
- Candidates: "No experience required" and "No Finnish required" via existing `checkFast` on stage-2 JD. Reuse badge cache by URL for duunitori links when present.

## Tests
- Unit: `items` parses fixture HTML rows (title, url, alt, deadline, created, id).
- Unit: hide style. Ids in, `<style>` text out. Empty set gives empty style.
- Unit: cache. Version mismatch is a miss. Debounced write sends one `set`. Clear empties memory and storage.
- Unit: facet counts with other groups applied.
- Unit: trainee batch builds 40-item chunks and maps answers back by index.
- Unit: stage 2 skipped for linkedin and indeed hosts.
- Fixture: saved board HTML from `agilefant.org/p/<token>` in `test/fixtures/agilefant.html`.
- Manual checklist in `docs/extension-checklist.md`: sidebar placement wide and narrow, drawer, trainee filter with progress, site search plus our filter, Refresh keeps hide, clear cache inline confirm, Firefox build.
