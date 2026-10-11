const SIZES = [16, 32, 48, 128];

// Chrome service worker cannot read the theme, so the popup sets the icon. Firefox uses theme_icons.
export function syncIcon(): void {
  if (import.meta.env.FIREFOX) return;
  const query = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const dir = query.matches ? "icon" : "icon-light";
    const path = Object.fromEntries(SIZES.map((s) => [s, `/${dir}/${s}.png`]));
    browser.action.setIcon({ path }).catch(() => undefined);
  };
  apply();
  query.addEventListener("change", apply);
}
