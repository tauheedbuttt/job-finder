import { useRef, useState } from "react";
import { download, dump, parse, restore } from "@/lib/backup";
import { bounds, defaults, STEP, type Settings as Values } from "@/lib/settings";

const FIELDS = [
  { key: "yes", label: "Finnish required at score from" },
  { key: "no", label: "Not required at score up to" },
] as const;

type Props = { settings: Values; store: (next: Values) => void; back: () => void; reload: () => void };

// Firefox closes the popup when a file picker opens, so backup runs in a tab there.
const away = import.meta.env.FIREFOX && location.hash !== "#tab";

export default function Settings({ settings, store, back, reload }: Props) {
  const limits = bounds(settings);
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const tab = () => void browser.tabs.create({ url: browser.runtime.getURL("/popup.html#tab") }).then(() => window.close());

  async function save() {
    try {
      download(await dump());
      setNote("Backup saved.");
    } catch (err) {
      setNote(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function load(f: File | undefined) {
    if (!f) return;
    try {
      const got = await restore(parse(await f.text()));
      setNote(`Imported ${got.local + got.sync} keys, ${got.fresh} new. Reload open boards to see them.`);
      reload();
    } catch (err) {
      setNote(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (file.current) file.current.value = "";
  }

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
      <div className="group">
        <h3>Data</h3>
        <p className="hint">Labels, job texts, removed jobs, filters and settings. Export before removing the extension.</p>
        <div className="row">
          <button className="ghost" onClick={() => (away ? tab() : void save())}>
            Export
          </button>
          <button className="ghost" onClick={() => (away ? tab() : file.current?.click())}>
            Import
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void load(e.target.files?.[0])} />
        </div>
        {note && (
          <p className="hint" role="status">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
