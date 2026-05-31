# AGENTS.md

## Project Overview

This project is a simple, server-rendered mortgage and buy-vs-rent analysis web app.

Primary goals:
- deterministic financial calculations
- simple architecture
- minimal dependencies
- maintainable long-term
- fast iteration with LLM agents
- extensible for future financial tooling

This is NOT a SPA application.

---

## Stack

Backend:
- Python
- FastAPI
- Jinja2 templates

Frontend:
- HTMX for interactivity
- minimal vanilla JavaScript only when necessary
- DaisyUI allowed
- no frontend frameworks
- no npm packages if possible
- vendor CSS/JS libs manually into `app/static/` with version in the filename (e.g. `htmx-2.0.4.min.js`); just provide the download URL and let the user fetch it

Database:
- PostgreSQL
- raw psycopg only
- no ORM layers

Infra:
- single-instance containerized deployment
- Docker Compose
- minimal infrastructure

---

## User data persistence

User-created data (scenarios, form inputs, saved comparisons, and similar) lives entirely in the browser. Store it in client-side browser storage (for example `localStorage` or `sessionStorage`), not on the server or in PostgreSQL, unless a feature explicitly requires server persistence.

That data persists across page reloads and browser sessions on the same origin until the user clears site data for this app in their browser settings. Do not assume durability beyond that—there is no account sync, backup, or cross-device recovery unless added deliberately later.

When implementing features that read or write user data:
- prefer explicit, inspectable client-side storage over hidden in-memory-only state when persistence is intended
- avoid adding database tables or API endpoints for user scenario data by default
- document in UI copy or help text when data is local-only and will be lost if site data is cleared

---

## Engineering Philosophy

Prefer:
- simple solutions
- explicit code
- additive changes
- readability over abstraction
- deterministic behavior
- small functions
- small files
- direct data flow
- cleaning up dead code
- consolidate similar functionality
- incremental implementation over large rewrites

Avoid:
- premature abstraction
- dependency injection frameworks
- repository/service factory patterns
- excessive async complexity
- unnecessary third-party dependencies
- frontend build pipelines when avoidable
- magic abstractions
- hidden state
- over-engineered architectures

---

## UI Philosophy

The UI should feel:
- clean
- information-dense
- trustworthy
- fast
- utility-focused

Avoid:
- marketing-style UI
- excessive animations
- hidden calculations
- unnecessary modal-heavy UX

Financial calculations should be transparent and inspectable.

### Wireframes (`docs/wireframes/`)

PNG wireframes in `docs/wireframes/` define page structure: sections, grouping, hierarchy, and primary labels. They are a floor, not a ceiling, for information density.

Before writing or changing templates, partials, or page-specific CSS:
- read the relevant PNG(s) in `docs/wireframes/` (use the Read tool on image files)
- match section order, grouping, and hierarchy shown in the wireframe
- prefer the wireframe over generic patterns or assumptions when layout or structure conflict

It is acceptable—and often desirable—to be **more** information-dense than the wireframe when it improves transparency or utility, for example:
- extra table columns (breakdowns, subtotals, derived fields)
- longer forms with additional inputs, toggles, or advanced options
- inline help, units, or secondary metrics beside primary values

Do not strip detail to match a sparse sketch. Do not rearrange major sections or hide core controls without a clear reason. When adding density, keep the layout scannable: align columns, group related fields, and avoid marketing chrome.

When no wireframe exists for a screen, follow the UI philosophy above and keep changes minimal until a wireframe is added.

Excalidraw (`.excalidraw`) files in the same folder are design sources; exported PNGs are what agents should use for implementation.

---

## Code Organization

Preferred structure:

mortgage-calculator/
  app/
    internal/
    middleware/
    routers/
    static/
    templates/
  cronjobs/
  docs/
    wireframes/
  docker-compose.yaml
  Dockerfile
  requirements.txt
  scripts/
    lint.sh
    run.sh
    test.sh
  tailwind.config.js

Guidelines:
- routes should stay thin
- business logic belongs in services
- templates should remain simple
- database access should be explicit
- avoid mixing calculation logic into templates

---

## Financial Modeling Principles

Prioritize:
- correctness
- transparency
- explainability

Financial assumptions should be:
- explicit
- configurable
- easy to inspect

Do not hide assumptions in code.

Avoid misleading precision.

---

## Agent Workflow Expectations

### Focus on code changes only

Default behavior is to read and edit files in the project. Do not take any other action on the host system unless explicitly asked.

Do not:
- run `docker compose up`, `./scripts/run.sh`, uvicorn, or any dev server
- open or interact with the app in a browser
- run integration or end-to-end flows that require the stack to be running
- run shell commands speculatively (e.g. `ls`, `find`, `cat`, `grep` via shell) — use the provided file search and read tools instead
- install packages or libraries of any kind on the host system (see below)

Run focused non-runtime checks only when explicitly asked (for example: "run unit tests", "run ruff", "check JS"). If verification requires a running server, describe what you would run and wait for confirmation. To check or lint JavaScript files, use `deno check` or `deno lint` — not ad hoc bash commands.

### Do not install packages on the host system

This project is containerized and runs exclusively via Docker Compose. Never install packages or libraries on the host.

Do not run:
- `pip install`, `pip3 install`, or any variant
- `npm install`, `npx`, or any npm/node package manager command
- `apt install`, `apt-get install`, `brew install`, or any system package manager
- any other command that modifies the host environment

To add a Python dependency, edit `requirements.txt`. To add a system-level dependency, edit the `Dockerfile`. Changes take effect on the next `docker compose build`.

### Making changes

- prefer minimal diffs
- preserve existing patterns
- avoid large rewrites unless requested
- avoid introducing new frameworks or dependencies; justify any addition and prefer standard library solutions
- do NOT perform structural refactors (layering changes, folder reorganization, abstraction introduction) unless explicitly requested

---

## Future Planned Features

Potential future features include:
- amortization visualization
- buy vs rent comparison
- PDF ingestion for loan estimates
- OCR/document extraction
- historical scenario replay
- financial comparison tooling

Design changes should avoid making these future features harder to add.

---

## Starting State

This project is initialized from a minimal internal template. The template already includes:
- FastAPI app structure
- Jinja2 rendering setup
- PostgreSQL connection layer
- Dockerized deployment

Existing structure is intentional. Prefer extending existing patterns over redesigning. It is acceptable to temporarily comment out services in `docker-compose.yaml` to speed up local development, but this is considered a transient state.
