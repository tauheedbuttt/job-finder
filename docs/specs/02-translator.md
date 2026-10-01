# Spec 02: translator server

## Goal
Local server. Translate fi to en. Proxy Jev calls so key stays server-side.

## Source
Copy from `/Users/mac/Documents/code/kaanna/server/translate_server.py` and `requirements.txt`. Own copy. Do not import kaanna code.

## Decisions
- Own server. Port from `JOBFINDER_PORT`, default 8790. Never talk to kaanna server.
- Env via `.env` (python-dotenv). Ship `.env.example`. Real `.env` gitignored.
- Rename env vars `KAANNA_*` to `JOBFINDER_*`. Own sqlite cache file.
- Model discovery: `models.json` = list of folders. First item = `/Users/mac/Documents/code/kaanna/server/models/opus-fi-en-ct2`. Startup scans in order for `model.bin`. First hit wins. None found: download once to `apps/translator/models`, log it. Never download twice. Never write into the kaanna folder (read only). Reason: kaanna must stay untouched.
- CORS: allow extension origins and localhost only.
- Endpoints:
  - `GET /health` -> `{ ok, model, modelPath }`
  - `POST /translate { texts: string[] }` -> `{ translations: string[] }` (keep kaanna behaviour: protect urls/code/emoji, sentence cache)
  - `POST /jev { state, questions }` -> forwards to TypeSafe with model `jev-latest` and bearer from env. Returns TypeSafe body unchanged. Pass upstream error status through. Retry 429/529 with backoff, max 3.
- Missing `TYPESAFE_API_KEY`: `/jev` returns 503 with clear message. Server still starts.
- Langfuse (optional, `LANGFUSE_*` in `.env`): each `/jev` call = one generation with model, input, output, token usage. Named by question: `finnish-fast` (`requires_finnish` alone or with `requires_experience`), `finnish-sentences`, `pick-description`, `pick-apply`, `confirm-apply`. Headers `x-jf-session`, `x-jf-flow`, `x-jf-url` set session, trace name/tag, and one trace per session+url. Reason: see where Jev tokens go per feature.
- `run.sh` creates venv if missing, installs requirements, starts uvicorn.
- README: credit Opus-MT CC-BY 4.0 Helsinki-NLP.

## Tests
- Model discovery: temp dirs, order, none-found path (download mocked).
- `/jev`: mock upstream, check key header, retry, error passthrough.
- `/translate`: fake mode.
