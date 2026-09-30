# translator

Local FastAPI server for job-finder. Finnish to English with Opus-MT via CTranslate2, plus a `/jev` proxy so the TypeSafe key stays server-side.

Own process, own port (8790), own `.env`, own sqlite cache. It never calls the kaanna server. Only the model files are shared, through `models.json`.

## Run

```sh
cp .env.example .env   # add TYPESAFE_API_KEY
./run.sh               # creates .venv, installs requirements, serves on 127.0.0.1:8790
./run.sh test          # pytest
```

From the repo root: `pnpm dev:translator`.

## Endpoints

- `GET /health` returns `{ ok, model, modelPath }`.
- `POST /translate { texts }` returns `{ translations }`. URLs, code and emoji pass through. Sentences are cached in `cache.sqlite3`.
- `POST /jev { state, questions }` forwards to `https://api.typesafe.ai/v1/systemone` with model `jev-latest`. The upstream body and status come back unchanged. 429 and 529 are retried up to 3 times with backoff. Without `TYPESAFE_API_KEY` it returns 503.

## Model discovery

`models.json` is a list of folders, relative paths resolve against the file. At startup the first folder with `model.bin` wins. If none has one, the model is converted once into the first writable folder and logged. After that the folder has `model.bin`, so it is never downloaded again.

`JOBFINDER_FAKE=1` skips the model and returns `[en] ...` for UI testing.

## Licence

Translation model: [Opus-MT](https://github.com/Helsinki-NLP/Opus-MT) `opus-mt-tc-big-fi-en` by Helsinki-NLP, licensed CC-BY 4.0.
