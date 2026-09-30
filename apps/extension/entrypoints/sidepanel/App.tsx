import { useCallback, useEffect, useRef, useState } from "react";
import { analyze, type Result } from "@/lib/analyze";
import type { Applied } from "@/lib/messages";
import { defaults, load, save, type Settings } from "@/lib/settings";
import { active, sender } from "@/lib/tab";

const LABEL = { yes: "Finnish required", no: "Finnish not required", unclear: "Unclear" } as const;

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [result, setResult] = useState<Result | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [open, setOpen] = useState(false);
  const tab = useRef<number | null>(null);

  const run = useCallback(async (s: Settings) => {
    setError(null);
    setResult(null);
    try {
      tab.current = await active();
      setResult(await analyze(sender(tab.current), s, setStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStep(null);
    }
  }, []);

  useEffect(() => {
    load().then((s) => {
      setSettings(s);
      void run(s);
    });
  }, [run]);

  const send = (msg: Parameters<ReturnType<typeof sender>>[0]) =>
    tab.current === null ? Promise.resolve(null) : sender(tab.current)(msg);

  const verdict = result?.finnish?.verdict;
  const spans = result?.finnish?.spans ?? [];
  const evidence = spans.filter((s) => result?.found.includes(s.id));
  const first = evidence.find((s) => s.kind === (verdict === "no" ? "green" : "red")) ?? evidence[0];
  const kinds = new Map(spans.map((s) => [s.id, s.kind]));

  async function apply() {
    const id = result?.apply?.id;
    if (!id) return;
    const got = (await send({ type: "apply", id })) as Applied | null;
    if (got?.href) await browser.tabs.create({ url: got.href });
  }

  async function store(next: Settings) {
    setSettings(next);
    await save(next);
  }

  return (
    <main>
      <header>
        <button
          className={`badge ${step ? "loading" : verdict ? `v-${verdict}` : "v-unclear"}`}
          disabled={!first}
          title={first ? "Jump to first evidence" : undefined}
          onClick={() => first && send({ type: "jump", id: first.id })}
        >
          {step ? `${step}…` : verdict ? LABEL[verdict] : "No verdict"}
          {!step && result?.finnish && <small>{Math.round(result.finnish.score * 100)}%</small>}
        </button>
        <button className="ghost" disabled={Boolean(step)} onClick={() => run(settings)}>
          Analyze page
        </button>
      </header>

      {error && <p className="error">{error}</p>}
      {result?.errors.map((e) => (
        <p className="error" key={e}>
          {e}
        </p>
      ))}

      {result && (
        <section className="apply">
          <button className="primary" disabled={!result.apply?.id} onClick={apply}>
            {result.apply?.candidate ? `Apply: ${result.apply.candidate.text || result.apply.candidate.aria}` : "No apply button found"}
          </button>
          {result.apply && <small>{Math.round(result.apply.confidence * 100)}% sure</small>}
        </section>
      )}

      {result?.block && (
        <section>
          <div className="row">
            <h2>{result.title || "Job description"}</h2>
            <button className="ghost" onClick={() => setOriginal(!original)} disabled={!result.translated}>
              {original ? "Show translated" : "Show original"}
            </button>
          </div>
          <p className="muted">
            {evidence.length}/{spans.length} evidence sentences found on page
          </p>
          <div className="jd">
            {result.sentences.map((s) => (
              <p
                key={s.id}
                className={kinds.get(s.id) ?? ""}
                onClick={() => kinds.has(s.id) && send({ type: "jump", id: s.id })}
              >
                {original ? s.fi : s.en}
              </p>
            ))}
          </div>
        </section>
      )}
      {result && !result.block && <p className="muted">No job description found on this page.</p>}

      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Settings</summary>
        <label>
          Translator URL
          <input value={settings.url} onChange={(e) => store({ ...settings, url: e.target.value })} />
        </label>
        {(["yes", "no", "span"] as const).map((key) => (
          <label key={key}>
            {key === "yes" ? "Required at score ≥" : key === "no" ? "Not required at score ≤" : "Highlight sentence at p ≥"}
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings[key]}
              onChange={(e) => store({ ...settings, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <button className="ghost" onClick={() => store(defaults)}>
          Reset
        </button>
      </details>
    </main>
  );
}
