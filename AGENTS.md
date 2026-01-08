# Repository Guidelines

## Project Structure & Modules
- Monorepo with workspaces in `apps/`, `packages/`, `plugins/`, `docs/`, and `ops/`.
- Core logic and persistence live in `packages/core`; shared client types in `packages/shared` and `packages/client`.
- Frontends: web UI in `apps/web`, TUI in `apps/tui`, CLI tools in `apps/admin-cli`, Discord bot in `apps/discord-bot`, and server entry in `apps/server`.
- Documentation builds from `docs`; scripts and utilities sit in `scripts/` and `ops/`.
- Tests reside alongside sources as `*.test.ts` (example: `packages/core/src/runtime/gameloop.test.ts`).

## Build, Test, and Development Commands
- Install deps: `bun install`.
- Run dev servers: `bun run dev:server` (core), `bun run dev:web`, `bun run dev:tui`, `bun run dev:cli`, `bun run dev:discord`. Run in separate terminals as needed.
- Lint/format: `bun lint` (oxlint) and `bun format` (oxfmt). Check-only: `bun format --check`.
- Type checks: `bun --filter '*' check:types` or scoped `bun --filter '@lotus/op-*' check`.
- Tests: `bun test` (use `bun test --only-failures` via `bun run check:test` for quick iteration).
- Docs: `bun run build:docs` to build docs and playground, `bun run dev:docs` for VitePress dev, `bun run preview:docs` to preview.
- Database reset (destructive): `bun run db:wipe` in `packages/core`.

## Coding Style & Naming
- TypeScript-first, strict config (`@tsconfig/strictest`); prefer 2-space indentation.
- Use ES modules and camelCase for variables/functions; PascalCase for types/classes; kebab-case for file and folder names.
- Keep imports sorted logically (built-ins, external, internal). Favor explicit type imports.
- Use `oxfmt` before commits; CI assumes formatted sources. Avoid unused symbols (oxlint enforces).

## Testing Guidelines
- Framework: `bun:test`. Place specs next to code with `.test.ts` suffix.
- Write deterministic tests; mock external effects (`bun:test` `mock`) where appropriate.
- Prioritize core behaviors (permissions, runtime, scripting). Add regression tests for bug fixes.
- Run `bun test` (or the targeted package via `bun --filter <pkg> test`) before opening PRs.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat(scope): ...`, `fix(scope): ...`) as seen in `git log` (e.g., `fix(core): inherit gas limit in nested verb calls`).
- Commits should stay focused; include tests and formatting changes.
- PRs: provide a short summary, linked issues, reproduction steps, and screenshots for UI-facing changes. Note any schema or migration impacts and how to migrate data.
- Ensure linters/tests pass locally; mention if any checks are intentionally skipped with rationale.

## Security & Data Notes
- Do not commit secrets or generated SQLite files (`world.sqlite*`). Use local env vars for tokens.
- Treat `db:wipe` as destructive; back up any local state in `backups/` before running.

## Agent Notes
- Keep commits scoped to one logical change; run `bun lint`, `bun format`, and `bun test` (or targeted package tests) before pushing.
- Record discovered issues or design decisions in `TODO.md` or docs so they’re not lost between sessions.
- Prefer the provided Bun scripts over ad-hoc commands to avoid diverging from expected workflows.
