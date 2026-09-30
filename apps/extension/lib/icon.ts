const SIZES = [16, 32, 48, 128];

// The service worker cannot read the browser theme, so the panel sets the toolbar icon.
export function syncIcon(): void {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const dir = query.matches ? "icon" : "icon-light";
    const path = Object.fromEntries(SIZES.map((s) => [s, `/${dir}/${s}.png`]));
    browser.action.setIcon({ path }).catch(() => undefined);
  };
  apply();
  query.addEventListener("change", apply);
}
