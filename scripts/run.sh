#!/bin/bash

COMMAND=$1

if [ -z "$COMMAND" ]; then
    echo "Usage: $0 <command>"
    echo "Special commands (no support for flags): restart, psql"
    echo "Supports other docker compose commands (with flags): up, down, logs, ps, build, etc."
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "Error: git is not installed. Please install git first."
    exit 1
fi

dir=$(git rev-parse --git-dir 2>/dev/null)
if [ -z "$dir" ]; then
    echo "Error: This script must be run from a git repository."
    exit 1
fi

dir=$(git rev-parse --show-toplevel)
if [ "$(pwd)" != "$dir" ]; then
    echo "Error: This script must be run from the root of the git repository."
    exit 1
fi

if [ "$COMMAND" == "restart" ]; then
    GIT_COMMIT=$(git rev-parse --short HEAD)
    docker compose down
    docker compose build \
        --no-cache \
        --build-arg GIT_COMMIT=$GIT_COMMIT
    docker compose up --detach
elif [ "$COMMAND" == "psql" ]; then
    source .env
    docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
else
    docker compose ${@:1}
fi
