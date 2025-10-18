# Repository Guidelines

## Project Structure & Module Organization
Dendrite is a Go web server with embedded frontend assets. `main.go` wires configuration and HTTP bootstrap. 
Package code lives in `internal/...`: `server` exposes REST/UI handlers, `filesystem` encapsulates file IO,
`auth` handles JWT tokens, `config` loads TOML/env, `format` collects helpers, and `assets` embeds the compiled UI
under `internal/assets/web`. Browser-facing resources and docs sit in `docs/`, and `dendrite/` holds the packaged
binary used for smoke checks. End-to-end fixtures live under `tests/e2e`, while reusable scripts sit in `scripts/`.

## Build, Test, and Development Commands
- `go build -o dendrite .` builds the single-binary server.
- `go run . --dir .` launches a local instance against the current folder.
- `go test ./...` executes Go unit and integration tests.
- `npm run test:local` installs browsers, runs Playwright, and writes reports under `playwright-report/`.
- Running playwright tests from withing a codex sandbox requires the usage of `./codex-run-playwright-unattended.sh`
- All npm and npx commands must be run from the `timeout` command line utility with a timeout of 120 seconds to get notice
  of long-running node commands.
- `./test-ci-locally.sh` reproduces the CI recipe (Go race detector + Chromium e2e).
- `./test-golangci-lint.sh` runs the lint suite inside the Docker images used by GitHub Actions.

## Coding Style & Naming Conventions
Go code must be `gofmt`/`goimports` clean and pass `golangci-lint` (see `.golangci.yaml` for linters like
`staticcheck`, `revive`, and `gosec`). Favor short, descriptive package names and exported identifiers with
GoDoc-style comments. Configuration structs mirror TOML keys (`Listen`, `Quota`). JavaScript in E2E helpers follows
Playwright defaults; keep filenames lower-case-with-dashes and prefer async/await helpers over callbacks.

Any Markdown file must have a maximum line length of 120 characters.
After each change to a Markdown file run Use `npx markdownlint-cli` to catch formatting regressions before publishing.

After each change to frontend code, search for code duplication using `jscpd`. Fix obvious findings.

## Testing Guidelines
Place unit tests alongside implementation files and name them `Test<Component>` with table-driven cases for IO variations.
End-to-end specs belong in `tests/e2e` and should be named `<feature>.spec.ts`. Before running Playwright, ensure the server
listens on `127.0.0.1:3000`; `tests/e2e/check-port.js` prevents port conflicts, while `tests/e2e/cleanup-processes.js`
clears stale servers. Capture new UI baselines within `playwright-report/` and clean out leftovers in `tmp/` after large
runs.

Run frontend test with  `./codex-run-playwright-unattended.sh` or similar approaches outlined in the script to mitigate
timeout and other sandbox issues.

## Commit & Pull Request Guidelines
Commit messages here use concise, sentence-case summaries (e.g., `Improve token validation`). Group cohesive changes
into a single commit and keep the tree buildable. Pull requests should link the relevant issue, outline behavior changes,
and include screenshots or CLI output when UI or HTTP responses change. Run `go test ./...` and `npm run test:local`
before requesting review.

## Security & Configuration Tips
Use `dendrite.example.toml` as the starting point for `dendrite.toml`; never commit secrets.
JWT mode needs a 32+ character `--jwt-secret` paired with `--base-dir`. When exercising quota features, prefer
temporary directories under `tmp/` to avoid touching production paths.

## Definitions

**Context Menu**: Menu to access file and folder actions. Either accessed via the three-dots icon next to the checkbox
or via right-click anywhere in the row of the file or folder.

**Main Menu**: First menu at the very top to select one of file manager, command, console or monitoring

**File manager header**: Status bar and actions for file and folder operations beneath the main menu with display of
 the current folder and buttons to trigger "up", "refresh", "upload", "new folder", "download", and "zip".