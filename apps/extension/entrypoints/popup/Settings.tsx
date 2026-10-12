import { bounds, defaults, STEP, type Settings as Values } from "@/lib/settings";

const FIELDS = [
  { key: "yes", label: "Finnish required at score from" },
  { key: "no", label: "Not required at score up to" },
] as const;

type Props = { settings: Values; store: (next: Values) => void; back: () => void };

export default function Settings({ settings, store, back }: Props) {
  const limits = bounds(settings);
  return (
    <section className="settings">
      <header className="head">
        <button className="icon" aria-label="Back" onClick={back}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <h2>Settings</h2>
      </header>
      <label>
        <span>Translator URL</span>
        <input type="text" value={settings.url} spellCheck={false} onChange={(e) => store({ ...settings, url: e.target.value })} />
      </label>
      {FIELDS.map(({ key, label }) => (
        <label key={key} className="slider">
          <span className="line">
            <span>{label}</span>
            <output>{settings[key].toFixed(2)}</output>
          </span>
          <input
            type="range"
            min={limits[key].min}
            max={limits[key].max}
            step={STEP}
            value={settings[key]}
            onChange={(e) => store({ ...settings, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <p className="hint">Saved as you change. URL and thresholds apply on page reload.</p>
      <div className="row">
        <button className="ghost" onClick={() => store({ ...defaults, hideExperienced: settings.hideExperienced })}>
          Reset
        </button>
      </div>
    </section>
  );
}
