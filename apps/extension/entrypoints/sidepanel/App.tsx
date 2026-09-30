import { ArrowClockwise, ArrowUpRight, CaretRight, GearSix, Translate, WarningCircle, X } from "@phosphor-icons/react";
import dark from "@/assets/mark-dark.svg";
import light from "@/assets/mark-light.svg";
import { useCallback, useEffect, useRef, useState } from "react";
import { STEPS, analyze, type Result } from "@/lib/analyze";
import type { Applied, Message } from "@/lib/messages";
import { defaults, load, save, type Settings } from "@/lib/settings";
import { active, sender } from "@/lib/tab";

const VERDICT = {
  yes: { title: "Finnish required", note: "The posting asks for Finnish." },
  no: { title: "Finnish not required", note: "English looks enough for this job." },
  unclear: { title: "Unclear", note: "The posting does not say clearly." },
} as const;

const FIELDS = [
  { key: "yes", label: "Finnish required at score from" },
  { key: "no", label: "Not required at score up to" },
  { key: "span", label: "Highlight sentence at probability from" },
] as const;

const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [result, setResult] = useState<Result | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [panel, setPanel] = useState(false);
  const tab = useRef<number | null>(null);

  const run = useCallback(async (s: Settings) => {
    setError(null);
    setResult(null);
    setStep(STEPS[0]);
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

  const send = (msg: Message) => (tab.current === null ? Promise.resolve(null) : sender(tab.current)(msg));

  const verdict = result?.finnish?.verdict;
  const spans = result?.finnish?.spans ?? [];
  const found = spans.filter((s) => result?.found.includes(s.id));
  const first = found.find((s) => s.kind === (verdict === "no" ? "green" : "red")) ?? found[0];
  const kinds = new Map(spans.map((s) => [s.id, s.kind]));
  const target = result?.apply?.candidate;

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
    <div className="shell">
      <header className="bar">
        <span className="brand">
          <img className="mark on-dark" src={dark} alt="" width={16} height={16} />
          <img className="mark on-light" src={light} alt="" width={16} height={16} />
          Job Finder
        </span>
        <div className="tools">
          <button
            className="icon"
            aria-label={original ? "Show translation" : "Show original"}
            aria-pressed={original}
            disabled={!result?.block}
            onClick={() => setOriginal(!original)}
          >
            <Translate size={16} />
          </button>
          <button className="icon" aria-label="Analyze page" disabled={Boolean(step)} onClick={() => run(settings)}>
            <ArrowClockwise size={16} />
          </button>
          <button className="icon" aria-label={panel ? "Close settings" : "Settings"} aria-pressed={panel} onClick={() => setPanel(!panel)}>
            {panel ? <X size={16} /> : <GearSix size={16} />}
          </button>
        </div>
      </header>

      <main className="body">
        {panel ? (
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
                  onChange={(e) => store({ ...settings, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <p className="hint">Saved as you type. Done runs the analysis again.</p>
            <div className="row">
              <button className="ghost" onClick={() => store(defaults)}>
                Reset
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setPanel(false);
                  void run(settings);
                }}
              >
                Done
              </button>
            </div>
          </section>
        ) : step ? (
          <section className="progress" aria-live="polite">
            <div className="verdict skeleton" />
            <ol>
              {STEPS.map((s, i) => {
                const at = STEPS.indexOf(step as (typeof STEPS)[number]);
                return (
                  <li key={s} className={i < at ? "done" : i === at ? "now" : ""}>
                    {s}
                  </li>
                );
              })}
            </ol>
            <div className="lines">
              <span />
              <span />
              <span />
            </div>
          </section>
        ) : (
          <>
            {error && (
              <p className="alert">
                <WarningCircle size={16} />
                <span>{error}</span>
              </p>
            )}
            {result && (
              <>
                {result.finnish && verdict ? (
                  <button className={`verdict v-${verdict}`} disabled={!first} onClick={() => first && send({ type: "jump", id: first.id })}>
                    <span className="head">
                      <strong>{VERDICT[verdict].title}</strong>
                      <span className="score">{pct(result.finnish.score)}</span>
                    </span>
                    <span className="note">
                      {first ? "Jump to evidence on page" : VERDICT[verdict].note}
                      {first && <CaretRight size={14} />}
                    </span>
                  </button>
                ) : result.block ? (
                  <div className="verdict v-none">
                    <span className="head">
                      <strong>No verdict</strong>
                    </span>
                    <span className="note">Finnish check did not run.</span>
                  </div>
                ) : null}

                {result.block ? (
                  <article className="jd">
                    <h1>{result.title || "Job description"}</h1>
                    <p className="meta">
                      {original ? "Original" : "Translated"}
                      {spans.length > 0 && `, ${found.length} of ${spans.length} evidence sentences on page`}
                    </p>
                    {result.sentences.map((s) => {
                      const kind = kinds.get(s.id);
                      return kind ? (
                        <button key={s.id} className={`line ${kind}`} onClick={() => send({ type: "jump", id: s.id })}>
                          {original ? s.fi : s.en}
                        </button>
                      ) : (
                        <p key={s.id} className="line">
                          {original ? s.fi : s.en}
                        </p>
                      );
                    })}
                  </article>
                ) : (
                  <div className="empty">
                    <h2>No job description here</h2>
                    <p>Open a job posting and press analyze.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <footer className="dock">
        <button className="apply" disabled={!target || Boolean(step)} onClick={apply}>
          <span className="label">{step ? "Looking for apply button" : target ? `Apply: ${target.text || target.aria}` : "No apply button found"}</span>
          {target && !step && <ArrowUpRight size={16} />}
        </button>
        {target && result?.apply && !step && <span className="sure">{pct(result.apply.confidence)} sure</span>}
      </footer>
    </div>
  );
}
