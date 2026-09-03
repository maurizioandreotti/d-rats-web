# Contributing to D-RATS Web

Thank you for considering a contribution. This project ports the legacy D-RATS Python application to a browser PWA — correctness on the wire matters more than feature velocity.

## Ground Rules (from `AGENTS.md`)

* **Clean-sheet rewrite only**: the Python codebase at `../d-rats/` is *reference/inspiration only*. **No file, snippet, or comment** from it may be committed (not even a translated comment). Implement from protocol understanding.
* **Private repo**: `github.com/maurizioandreotti/d-rats-web` — do not publish forks without permission.
* **No backend**: the app must remain 100% client-side and work offline after install.

## Development Setup

See [`docs/development.md`](docs/development.md) for full prerequisites and commands. Quick start:

```bash
npm install
npm run dev        # Vite HMR at http://localhost:5173
npm run typecheck  # must pass before PR
npm run test       # vitest run (unit tests without radios)
```

## Branch & Commit

* Create a feature branch from `main`: `feat/<short-topic>` or `fix/<short-topic>`.
* Conventional commits preferred: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
* Keep PRs small and focused; one protocol or one UI area per PR.

## Code Style

* TypeScript strict. Run `npm run format` (Prettier) and ensure `npm run typecheck` passes.
* No `any` without justification; prefer explicit `Uint8Array` over `Buffer`.
* File:line citations in docs are encouraged when touching protocol code (`src/engine/*`).
* Tests co-located as `*.test.ts` next to the module they cover (`vitest` + `jsdom`).

## Pull Request Checklist

- [ ] `npm run typecheck` and `npm run test` pass locally
- [ ] No Python-derived comments/snippets (`AGENTS.md:9`); cite `../d-rats/` only in prose, not in code
- [ ] For `src/engine/*` changes: add/extend a unit test (in-memory `SessionManager`/`Transport` pair — see `src/engine/file-transfer.test.ts:1` and `src/engine/rpc.test.ts:1`)
- [ ] For `src/store/*` or protocol-visible changes: update `docs/api-reference.md`, `docs/architecture.md`, or `docs/protocols.md`
- [ ] For UI changes: note the store(s) touched and whether persistence is needed
- [ ] Manual radio/ratflector verification noted if applicable (most reviewers lack radios)

## Reporting Issues

* Use the issue template (or plain issue) with: browser + version, radio model + baud, steps, expected vs actual, and `Event Log` / `Sniffer` excerpts (`src/store/event-store.ts:3`, `src/store/sniffer-store.ts:12`).
* For security issues, see [`SECURITY.md`](SECURITY.md) — do not file a public issue.

## License

By contributing you agree your contributions are licensed under **GPL-3.0-only** (`LICENSE`).
