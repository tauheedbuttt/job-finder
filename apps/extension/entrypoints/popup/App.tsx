import { useEffect, useState } from "react";
import { grant, granted } from "@/lib/access";
import { defaults, load, save, type Settings as Values } from "@/lib/settings";
import Settings from "./Settings";

export default function App() {
  const [settings, setSettings] = useState<Values>(defaults);
  const [access, setAccess] = useState(true);
  // A backup tab opens straight on settings.
  const [view, setView] = useState<"filters" | "settings">(location.hash === "#tab" ? "settings" : "filters");

  useEffect(() => {
    void load().then(setSettings);
    void granted().then(setAccess);
  }, []);

  async function store(next: Values) {
    setSettings(next);
    await save(next);
  }

  return (
    <main className="popup">
      {!access && (
        <section className="banner">
          <p>Job Finder needs access to all sites to check job pages.</p>
          <div className="row">
            <button className="ghost" onClick={() => void grant().then(setAccess).catch(() => undefined)}>
              Grant access
            </button>
          </div>
        </section>
      )}
      {view === "settings" ? (
        <Settings settings={settings} store={(next) => void store(next)} back={() => setView("filters")} reload={() => void load().then(setSettings)} />
      ) : (
        <section>
          <header className="head">
            <h2>Filters</h2>
            <button className="icon end" aria-label="Settings" onClick={() => setView("settings")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </header>
          <label className="toggle">
            <span>Hide experienced roles</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.hideExperienced}
              onChange={(e) => store({ ...settings, hideExperienced: e.target.checked })}
            />
          </label>
          <p className="hint">Hides duunitori cards that require prior experience.</p>
          <label className="toggle">
            <span>Use my Agilefant filters</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.agilefantOwn}
              onChange={(e) => store({ ...settings, agilefantOwn: e.target.checked })}
            />
          </label>
          <p className="hint">Off uses Agilefant's own filters.</p>
        </section>
      )}
    </main>
  );
}
