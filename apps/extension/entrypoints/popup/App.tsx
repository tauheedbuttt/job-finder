import { useEffect, useState } from "react";
import { grant, granted } from "@/lib/access";
import { defaults, load, save, type Settings } from "@/lib/settings";

const FIELDS = [
  { key: "yes", label: "Finnish required at score from" },
  { key: "no", label: "Not required at score up to" },
] as const;

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [access, setAccess] = useState(true);

  useEffect(() => {
    void load().then(setSettings);
    void granted().then(setAccess);
  }, []);

  async function store(next: Settings) {
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
      <section>
        <h2>Filters</h2>
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
      </section>

      <section className="settings">
        <h2>Settings</h2>
        <label>
          <span>Translator URL</span>
          <input value={settings.url} spellCheck={false} onChange={(e) => store({ ...settings, url: e.target.value })} />
        </label>
        {FIELDS.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings[key]}
              onChange={(e) => e.target.value !== "" && store({ ...settings, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <p className="hint">Saved as you type. URL and thresholds apply on page reload.</p>
        <div className="row">
          <button className="ghost" onClick={() => store({ ...defaults, hideExperienced: settings.hideExperienced })}>
            Reset
          </button>
        </div>
      </section>
    </main>
  );
}
