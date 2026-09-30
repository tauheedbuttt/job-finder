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
