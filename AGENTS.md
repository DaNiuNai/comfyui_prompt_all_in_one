# Repository Guidelines

## Project Structure & Module Organization

The Python entry point, `__init__.py`, registers the compiled frontend with ComfyUI. Project and registry metadata live in `pyproject.toml`. Frontend work belongs in `ui/`: React/TypeScript source is under `ui/src/`, shared helpers under `ui/src/utils/`, tests under `ui/src/__tests__/`, and translations under `ui/public/locales/{en,zh}/`. Vite writes generated assets to the root `dist/` directory; do not edit generated files by hand. GitHub publishing automation is in `.github/workflows/react-build.yml`.

## Build, Test, and Development Commands

Run frontend commands from `ui/`:

- `npm ci` installs the exact dependency versions from `package-lock.json`.
- `npm run dev` starts the Vite development server; ComfyUI is expected at `127.0.0.1:8188`.
- `npm run watch` continuously rebuilds the extension into `../dist/` for local ComfyUI testing.
- `npm run build` type-checks and creates a production bundle.
- `npm run lint`, `npm run typecheck`, and `npm test` run ESLint, TypeScript checks, and Jest respectively.

For Python tooling, run `uv sync --extra dev`, then use `uv run ruff check .`, `uv run mypy .`, and `uv run pytest`.

## Coding Style & Naming Conventions

Use UTF-8, LF line endings, trailing-newline files, and no trailing whitespace as defined by `.editorconfig`. Python uses four spaces, snake_case names, Ruff formatting, and strict mypy typing. For frontend files, let Prettier and ESLint define formatting; run `npm run format` and `npm run lint:fix` before submission. Name React components in PascalCase (`App.tsx`), utilities in camelCase or descriptive lowercase (`i18n.ts`), and tests with `.test.ts` or `.test.tsx` suffixes. Keep user-facing strings in both locale files rather than embedding them in components.

## Testing Guidelines

Jest and React Testing Library run in jsdom. Place component tests in `ui/src/__tests__/` and test observable behavior rather than implementation details. No coverage threshold is currently configured, but new behavior and regressions should include focused tests. Python test discovery targets `tests/`; create that directory with `test_*.py` files when adding backend logic.

## Commit & Pull Request Guidelines

The history currently contains only an initial commit, so no established message convention exists. Use short, imperative subjects with an optional scope, for example `ui: add prompt history panel`. Keep commits focused. Pull requests should explain motivation and user-visible behavior, link relevant issues, list validation commands, and include screenshots or recordings for UI changes. Never commit API keys or local environment files; store registry credentials in the `REGISTRY_ACCESS_TOKEN` GitHub secret.
