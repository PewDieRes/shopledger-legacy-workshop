# Repository Guidelines

## Project Structure & Module Organization

ShopLedger is an internal retail/wholesale billing, inventory, and customer khata application. `server.js` configures Express, serves `public/`, mounts routes under `/api`, and exposes printable invoices. `routes/` handles HTTP requests; `lib/` contains inventory, orders, pricing, coupons, tax, ledger, invoice, reporting, date, and persistence logic. Keep business rules in these modules rather than duplicating them in routes or browser code.

`public/index.html`, `public/js/app.js`, and `public/css/style.css` provide the browser interface. `config.js` holds shop settings and business configuration. `data/db.json` stores application records. Tests live in `test/`.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from the lockfile.
- `npm start`: start the Express server at `http://localhost:3000`.
- `PORT=3001 npm start`: use a different port.
- `npm test`: run all tests with Node's built-in test runner.
- `node --test test/inventory.characterization.test.js`: run stock characterization tests only.
- `git diff --check`: detect whitespace errors before review.

There is no frontend build step, configured linter, or formatter. No Node version is pinned; use a version supporting `node:test` and `structuredClone`.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single-quoted strings, and CommonJS `require`/exports. Follow surrounding legacy style when editing existing modules. Use camelCase for variables and functions, lowercase module filenames, and descriptive test names. Avoid unrelated modernization or formatting changes.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; do not add dependencies for basic tests. Name tests `test/*.test.js`; characterization suites use `*.characterization.test.js`. No coverage threshold is configured.

Give each persistence test a temporary copy of `data/db.json` and set `SHOPLEDGER_DB_PATH` to that copy. Restore the environment and remove temporary files afterward. Never write test results into the real database. Characterization tests intentionally record current bugs; label them `CURRENT BEHAVIOUR (bug #2): ...` and preserve their assertions unless the task explicitly changes that behavior.

## Commit & Pull Request Guidelines

History uses short, descriptive, lowercase subjects without a mandatory prefix. Follow that style and keep commits focused. PRs should explain the problem, resulting behavior, linked issue, and validation commands/results. Include screenshots for UI changes and call out persistence or financial-calculation changes.

## Security & Configuration

Keep credentials out of commits. The existing admin key is hardcoded in `config.js`; avoid exposing it in documentation or logs. Review stock, tax, invoice, and khata effects together when changing order behavior.
