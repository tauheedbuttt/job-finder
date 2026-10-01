# Architecture

```
apps/extension   WXT + React popup, duunitori content scripts
apps/translator  Python FastAPI, own server, port 8790
apps/crawler     later
packages/core    TS: Jev client, zod schemas, text utils
```

## Rules
- No phrase lists anywhere. Semantics = Jev only.
- No LLM. Jev = TypeSafe System One (noul/choice/score). Skill: typesafe-ai.
- Translation local. Opus-MT fi-en via CTranslate2.
- Jev API key server-side only. Extension calls translator `/jev` proxy.
- Translator never reuses kaanna server. Own process, own port, own env. Kaanna does not depend on job-finder.
- Only model files come from kaanna dir.

## Env (apps/translator/.env, gitignored)
- `TYPESAFE_API_KEY` Jev key.
- `JOBFINDER_PORT` default 8790.
- `JOBFINDER_MODEL_CONFIG` default `models.json`.

## Data flow
Duunitori page -> content script -> relay fetch -> translator `/translate` (local) and `/jev` (proxy to api.typesafe.ai) -> pills, titles, filters. Popup writes settings to storage.

## Jev
- `POST https://api.typesafe.ai/v1/systemone`, Bearer, model `jev-latest`.
- Body: `{ state, model, questions }`. Question types: noul, choice, score.
- Answers: noul 0..1, choice + probabilities, score.
- Live docs: https://docs.typesafe.ai/llms.txt
