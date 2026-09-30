# Spec 01: monorepo

## Goal
One terminal dir starts everything.

## Decisions
- Nx + pnpm workspaces. Layout in `architecture.md`.
- Root scripts: `pnpm dev` runs translator and extension dev. `pnpm dev:translator`, `pnpm dev:extension`, `pnpm test`, `pnpm typecheck`.
- Translator has Nx project with `dev` target calling its own venv script. Python not managed by pnpm.
- Root `.gitignore`: node_modules, .venv, .env, dist, .output, *.sqlite3.
- Root `CLAUDE.md` and `docs/` already exist. Do not change.

## Done when
- Fresh clone: `pnpm i && pnpm dev` starts translator and extension dev build.
- `nx graph` shows extension depends on core.
