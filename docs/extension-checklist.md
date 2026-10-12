# Extension manual checklist

Setup: `pnpm i`, key in `apps/translator/.env`, `pnpm dev`. Chrome: `chrome://extensions`, dev mode on, "Load unpacked" `apps/extension/.output/chrome-mv3-dev`. Dev build hot reloads.

- [ ] Click toolbar icon. Popup opens on Filters with "Hide experienced roles" toggle and gear top-right.
- [ ] Click gear. Settings view with back arrow. Change translator URL and both sliders. Value shows right of label.
- [ ] Drag `no` up to `yes`. It stops one step below. Drag `yes` down. It stops one step above `no`.
- [ ] Reset restores defaults, toggle untouched. Reopen popup. Opens on Filters, values kept.
- [ ] Duunitori list page: each visible card gets a pill. Loading, then verdict. Finnish-required cards vanish.
- [ ] Finnish card title shows `original - English`. English title unchanged.
- [ ] Scroll list. New cards get pills. Reload page. Cached pills show instantly.
- [ ] Card linking to external site: grey or verdict, no crash.
- [ ] Stop translator on list page. Pills show error, no retry storm.
- [ ] Duunitori detail page: h1 shows `original - English` and a pill under it. Same verdict as list card.
- [ ] Click "Translate" next to Työpaikkakuvaus. JD turns English, layout kept. "Show original" restores Finnish.
- [ ] Stop translator on detail page. Button shows "Translator offline", pill shows error.
- [ ] List and detail page: second pill shows "Experience required" (amber), "No experience needed" (green) or "Experience unclear".
- [ ] Job with "kokemusta eduksi" only: not "Experience required".

- [ ] Toggle "Hide experienced roles" on. "Experience required" cards hide live. Unclear cards stay.
- [ ] Toggle off. Hidden cards come back, no refetch.

## Firefox / Zen
Setup: `pnpm dev:firefox` (translator plus Firefox build). Zen: `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", pick `apps/extension/.output/firefox-mv3-dev/manifest.json`. Gone on restart.

- [ ] Popup opens. If site access missing, red banner with "Grant access". Click, approve. Reopen popup, banner gone.
- [ ] Toolbar icon matches Zen theme, light and dark, without opening popup.
- [ ] Duunitori list page: pills and title translate work, same as Chrome.
- [ ] Detail page: "Translate" JD works, "Show original" restores.
- [ ] Toggle "Hide experienced roles". Cards hide and come back live.
- [ ] Signed build: export AMO keys from `apps/extension/.env`, run `pnpm --filter extension sign:firefox`. Drag `.xpi` into Zen. Survives restart.

## Agilefant board
Open `https://agilefant.org/p/<token>` with the extension loaded and translator running.

- [ ] Wide window: sidebar sits left of the job column, header level with site search, sticks near top on scroll. "N jobs" or "N of M jobs" matches rows. Colors match site pink.
- [ ] Narrow window (gutter under 264 px): "Filters" button top-left. Click opens drawer. Esc and outside click close it.
- [ ] Tick "Trainee / graduate". Count spinner, progress bar and "Checking X of Y" show. Before any labeling count shows `-`, never `0`. Unlabeled rows stay until labeled. Non-trainee rows hide.
- [ ] "Include unclear" adds unclear rows back. Reload page. Filter restored, labels instant, no new Jev calls.
- [ ] Type in site search with our filter on. Both apply (AND). Clear search, our hides stay.
- [ ] Click site Refresh. Hidden rows stay hidden.
- [ ] Deadline, Added and Source options filter rows. Counts change with other groups. Quick chips mirror checkboxes.
- [ ] Stop translator, clear cache, tick trainee. Progress line shows "Translator offline", no rows hidden by it.
- [ ] Footer "N labels cached · Clear" hidden when 0. "Clear" turns into inline "Clear N labels? Clear / Cancel". Cancel restores. Clear empties count, labeling restarts only when trainee is on.
- [ ] Hover a row: × shows in the right gutter, columns do not shift. Click: row hides, toast "Job removed · Undo" for 5 s. Undo brings it back.
- [ ] Toolbar shows "Removed N" after Any / All, hidden at 0. Click: only removed rows, restore icon per row, "Restore all" next to it. Restoring last row leaves the view.
- [ ] Reload: removed rows stay removed. Site search and Refresh keep × buttons on rows.
- [ ] Firefox build (Zen): sidebar, trainee filter, clear cache, remove and restore work same as Chrome.
