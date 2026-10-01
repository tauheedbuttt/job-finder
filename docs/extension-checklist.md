# Extension manual checklist

Setup: `pnpm i`, key in `apps/translator/.env`, `pnpm dev`. Chrome: `chrome://extensions`, dev mode on, "Load unpacked" `apps/extension/.output/chrome-mv3-dev`. Dev build hot reloads.

- [ ] Click toolbar icon. Side panel opens on right.
- [ ] Panel auto-runs. Badge show steps, then verdict.
- [ ] Finnish-required job (duunitori, "sujuva suomen kieli"): badge red. Red highlights on page.
- [ ] English-ok job ("English is enough"): badge green. Green highlights.
- [ ] Job without language mention: badge grey or green. No crash.
- [ ] Click badge. Page scrolls to first evidence.
- [ ] Click red/green sentence in panel. Page scrolls to it.
- [ ] Toggle original/translated. Text switch.
- [ ] Apply button: link opens new tab. Non-link button gets focus and scroll.
- [ ] Non-job page (news site): "No job description" or no apply button. No crash.
- [ ] Re-run "Analyze page". Old highlights cleared first.
- [ ] Tab open before extension install: analyze still works (script injected).
- [ ] Stop translator. Re-run. Clear offline error shown.
- [ ] Remove `TYPESAFE_API_KEY`. Re-run. Translation shown, Jev 503 error shown.
- [ ] Change translator URL and thresholds in Settings. Reopen panel. Values kept.
- [ ] Duunitori list page: each visible card gets a pill. Loading, then verdict. Finnish-required cards vanish.
- [ ] Finnish card title shows `original - English`. English title unchanged.
- [ ] Scroll list. New cards get pills. Reload page. Cached pills show instantly.
- [ ] Card linking to external site: grey or verdict, no crash.
- [ ] Stop translator on list page. Pills show error, no retry storm.
- [ ] Duunitori detail page: h1 shows `original - English` and a pill under it. Same verdict as list card.
- [ ] Click "Translate" next to Työpaikkakuvaus. JD turns English, layout kept. "Show original" restores Finnish.
- [ ] Restore original before panel Analyze, else highlights miss.
- [ ] Stop translator on detail page. Button shows "Translator offline", pill shows error.
- [ ] List and detail page: second pill shows "Experience required" (amber), "No experience needed" (green) or "Experience unclear".
- [ ] Job with "kokemusta eduksi" only: not "Experience required".
