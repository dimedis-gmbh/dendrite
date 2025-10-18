#!/usr/bin/env bash
set -euo pipefail

# Resolve repository root (directory containing this script)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RUN_STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_ROOT="$ROOT_DIR/tmp/codex-playwright"
RUN_DIR="$RUN_ROOT/$RUN_STAMP"
ARCHIVE_ROOT="$ROOT_DIR/test-results/codex"
ARCHIVE_DIR="$ARCHIVE_ROOT/$RUN_STAMP"

mkdir -p "$RUN_DIR" "$ARCHIVE_ROOT"

# Ensure Playwright reuses Chromium and produces artifacts in a predictable place
export CI=1
export FORCE_CLEANUP=true
export PLAYWRIGHT_HTML_REPORT="$RUN_DIR/playwright-report"

# Terminate any Playwright processes that might have survived a previous run.
kill_playwright_processes() {
  if ! command -v pgrep >/dev/null 2>&1; then
    echo "[codex] Skipping Playwright process cleanup (pgrep not available)"
    return
  fi

  local current_shell_pid=${BASHPID:-$$}
  local raw_pids
  raw_pids=$(pgrep -f "[p]laywright" || true)
  if [[ -z "$raw_pids" ]]; then
    echo "[codex] No existing Playwright processes detected"
    return
  fi

  local -a targets=()
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if [[ "$pid" == "$current_shell_pid" || "$pid" == "$PPID" ]]; then
      continue
    fi
    targets+=("$pid")
  done < <(printf '%s\n' "$raw_pids" | sort -u)

  if [[ ${#targets[@]} -eq 0 ]]; then
    echo "[codex] Playwright processes are limited to the current shell; nothing to kill"
    return
  fi

  echo "[codex] Terminating pre-existing Playwright processes: ${targets[*]}"
  kill "${targets[@]}" 2>/dev/null || true
  sleep 1

  local -a stubborn=()
  for pid in "${targets[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      stubborn+=("$pid")
    fi
  done

  if [[ ${#stubborn[@]} -gt 0 ]]; then
    echo "[codex] Force killing remaining Playwright processes: ${stubborn[*]}"
    kill -9 "${stubborn[@]}" 2>/dev/null || true
  fi
}

kill_playwright_processes

# Clean up any lingering Playwright-managed processes before the run
npm run --silent pretest

# Execute Chromium-only test pass. Additional args flow-through to Playwright.
echo "[codex] Starting Playwright Chromium suite at $RUN_STAMP"
set +e
npx playwright test --project=chromium "$@" | tee "$RUN_DIR/playwright.log"
STATUS=${PIPESTATUS[0]}
set -e

echo "[codex] Playwright exit code: $STATUS"

# Preserve JUnit output from CI-style runs when available
if [ -f "$ROOT_DIR/test-results/junit.xml" ]; then
  cp "$ROOT_DIR/test-results/junit.xml" "$RUN_DIR/junit.xml"
fi

# Snapshot artifacts into test-results for convenience
mkdir -p "$ARCHIVE_ROOT"
rm -rf "$ARCHIVE_DIR"
cp -R "$RUN_DIR" "$ARCHIVE_DIR"

echo "[codex] Artifacts stored under $RUN_DIR (mirrored to $ARCHIVE_DIR)"
exit "$STATUS"
