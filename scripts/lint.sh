#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
require ruff
require mypy
require djlint
require deno

REALLY="${1:-}"
failed=0
run() {
    echo "==> $*"
    "$@" || failed=1
}

if [[ "$REALLY" == "--really" ]]; then
    run ruff check app --fix
    run ruff format app
    run mypy app
    run djlint --reformat app/templates
    run deno lint app/static
    run deno fmt app/static
else
    run ruff check app
    run ruff format --check app
    run mypy app
    run djlint app/templates
    run djlint --check app/templates
    run deno lint app/static
    run deno fmt --check app/static
fi

exit "$failed"
