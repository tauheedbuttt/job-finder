export const PANEL = 'aside[aria-label="Filters"]';

// Wide: keep the site panel's box so our sidebar can sit on it. Narrow: drop it, our drawer takes over.
export const CSS = `@media (min-width:768px){${PANEL}{visibility:hidden}}@media (max-width:767px){${PANEL}{display:none}}`;

// Clicks every active site filter off. Returns how many controls it clicked.
export function unset(doc: Document): number {
  const panel = doc.querySelector(PANEL);
  if (!panel) return 0;
  const on = [...panel.querySelectorAll<HTMLElement>('button[aria-pressed="true"], input[type="checkbox"]:checked')];
  // A folded Source group can hide checked boxes, so open it while the site still filters.
  const fold = panel.querySelector<HTMLElement>('button[aria-controls="job-filter-sources"][aria-expanded="false"]');
  const [shown, total] = (panel.querySelector('[role="status"]')?.textContent?.match(/\d+/g) ?? []).map(Number);
  if (fold && !on.length && shown !== undefined && total !== undefined && shown < total) on.push(fold);
  for (const el of on) el.click();
  return on.length;
}
