#!/usr/bin/env bash
# Run regression tests (pytest + deno). Same venv bootstrap as lint.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
VENV="$ROOT/.venv"

ensure_dev_env() {
    command -v python3 >/dev/null || {
        echo "missing: python3 (needed to create .venv)"
        exit 1
    }

    if [[ ! -d "$VENV" ]]; then
        echo "==> Creating .venv"
        python3 -m venv "$VENV"
    fi

    if [[ "${VIRTUAL_ENV:-}" != "$VENV" ]]; then
        # shellcheck disable=SC1091
        source "$VENV/bin/activate"
    fi

    echo "==> Syncing dependencies"
    python -m pip install -q -r "$ROOT/requirements.txt" -r "$ROOT/requirements-dev.txt"
}

ensure_dev_env

require() {
    command -v "$1" >/dev/null || {
        echo "missing: $1 (pip install -r requirements-dev.txt)"
        exit 1
    }
}
require pytest
require deno

failed=0
run() {
    echo "==> $*"
    "$@" || failed=1
}

run pytest
run deno test --allow-read tests/js

exit "$failed"
