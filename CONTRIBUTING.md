# Contributing

Thanks for helping! Issues and pull requests are welcome in English or Bahasa Indonesia.

## Setup

```bash
git clone https://github.com/andiahmadnurmadani/kroombox-monitoring.git
cd kroombox-monitoring
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3400
```

On the first start a random login password is printed in the terminal (or set
`ADMIN_PASSWORD` in `.env.local`). Runtime data goes to `./data` (git-ignored).

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same checks.

## Guidelines

- Keep the "no agent on the monitored machine" approach: metrics come from read-only
  commands over SSH (`src/lib/proc-metrics.ts`). New metrics should stay cheap enough to
  run every second over an open connection.
- Never send stored secrets to the browser — API responses use `toView()` from
  `src/lib/host-store.ts`.
- New settings belong in the UI (stored under `DATA_DIR`), not in environment variables,
  unless they are needed before the app starts (port, bind address, data directory).
- The UI text is in Bahasa Indonesia; keep new strings consistent with it.
- Add or update tests in `tests/` for logic changes (`node:test` via `tsx`).

## Reporting security issues

Please don't open a public issue for vulnerabilities — contact the maintainer privately
(see the GitHub profile) and allow time for a fix.
