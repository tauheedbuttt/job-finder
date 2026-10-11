# Extension manual checklist

Setup: `pnpm i`, key in `apps/translator/.env`, `pnpm dev`. Chrome: `chrome://extensions`, dev mode on, "Load unpacked" `apps/extension/.output/chrome-mv3-dev`. Dev build hot reloads.

- [ ] Click toolbar icon. Popup opens with "Hide experienced roles" toggle and Settings.
- [ ] Change translator URL and thresholds. Reopen popup. Values kept.
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
Setup: `pnpm dev:extension:firefox`. Zen: `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", pick `apps/extension/.output/firefox-mv3-dev/manifest.json`. Gone on restart.

- [ ] Popup opens. If site access missing, red banner with "Grant access". Click, approve. Reopen popup, banner gone.
- [ ] Toolbar icon matches Zen theme, light and dark, without opening popup.
- [ ] Duunitori list page: pills and title translate work, same as Chrome.
- [ ] Detail page: "Translate" JD works, "Show original" restores.
- [ ] Toggle "Hide experienced roles". Cards hide and come back live.
- [ ] Signed build: export AMO keys from `apps/extension/.env`, run `pnpm --filter extension sign:firefox`. Drag `.xpi` into Zen. Survives restart.
