# Catch The Google

[Русская версия](./README.md)

[![Frontend Deploy](https://img.shields.io/badge/frontend-GitHub%20Pages-222222?logo=github&logoColor=white)](https://alexander0yusov.github.io/catch-the-google/)
[![Backend Deploy](https://img.shields.io/badge/backend-Render-46E3B7?logo=render&logoColor=black)](https://catch-the-google-backend.onrender.com/health)
[![Status](https://img.shields.io/badge/status-active-success)](https://github.com/Alexander0Yusov/catch-the-google)
[![License](https://img.shields.io/badge/license-ISC-blue)](./package.json)
[![Node](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)](./.nvmrc)

A real-time multiplayer grid game where two players chase a Google unit that periodically jumps to a random valid cell.

## Live Demo

- Frontend (GitHub Pages): https://alexander0yusov.github.io/catch-the-google/
- Backend health (Render): https://catch-the-google-backend.onrender.com/health

If your backend URL is different, update [config.js](./config.js).

## 1) Game Logic, Business Rules, and Technology Rationale

### Core rules

- The board size is `columns x rows`.
- `Player 1`, `Player 2`, and `Google` are always on the board.
- A player cannot move outside board borders.
- Two players cannot occupy the same cell.
- Catching Google gives `+1` point.
- After catch, Google relocates to a new valid cell.
- If nobody catches Google for `googleJumpInterval`, it jumps automatically.
- Turn order: `Player 1` moves first, then `Player 2`, then alternates.
- Delay between turns is configurable via `turnDelayMs` (default `250ms`).
- The match ends when:
  - someone reaches `pointsToWin`, or
  - `gameDurationMs` expires.

### Why these technologies

- **WebSocket (`ws`)**: low-latency two-way communication for synchronized multiplayer updates.
- **Remote Proxy**: frontend keeps the same API shape while game state is managed remotely.
- **EventEmitter (Observer)**: decoupled domain events with reactive UI updates.
- **Node.js backend**: single source of truth for rules and state transitions.
- **PostgreSQL (Neon)**: persistent sessions, events, and scores.

### Data flow

```mermaid
sequenceDiagram
  participant U as User
  participant UI as UI/Controller (front.js)
  participant RP as GameRemoteProxy
  participant WS as WebSocket Server
  participant D as Game Domain
  participant DB as Neon PostgreSQL

  U->>UI: Keyboard input
  UI->>RP: movePlayer...
  RP->>WS: request {procedure, requestId}
  WS->>D: execute domain command
  D-->>WS: new state + domain events
  WS->>DB: persist events/scores (optional)
  WS-->>RP: response
  WS-->>RP: event(change)
  RP-->>UI: emit("change")
  UI-->>U: rerender board/score
```

## 2) Project Structure and Dependencies

```text
CatchTheGoogle/
  back/
    migrations/
      001_init_2.sql
    db.js
    server.js
  css/
  docs/
    screenshots/
  domain/
  observer/
  config.js
  front.js
  game-remote-proxy.js
  game.js
  index.html
  render.yaml
  README.md
  README.en.md
```

### Module dependency graph

```mermaid
graph TD
  UI[index.html + front.js] --> RP[game-remote-proxy.js]
  RP --> WS[back/server.js]
  WS --> GAME[game.js]
  GAME --> OBS[observer/EventEmitter.js]
  GAME --> DOMAIN[domain/*]
  WS --> DB[back/db.js]
```

### Database schema (`_2` suffix required)

- `players_2`
- `game_sessions_2`
- `game_events_2`
- `scores_2`

```mermaid
erDiagram
  players_2 ||--o{ game_sessions_2 : winner_player_id
  game_sessions_2 ||--o{ game_events_2 : session_token
  players_2 ||--o{ scores_2 : player_id
  game_sessions_2 ||--o{ scores_2 : session_token
```

## 3) Frontend ↔ Backend Flow Table

The game protocol is WebSocket-first. HTTP is used only for health-check.

### HTTP

| Step | Method/Path | Sender | Payload | Response |
|---|---|---|---|---|
| 1 | `GET /health` | Render health-check / browser | none | `{ ok: true, service: "catch-the-google-backend" }` |

### WebSocket

| Order | Channel | From -> To | Message | Server action | Response |
|---|---|---|---|---|---|
| 1 | WS connect | Front -> Back | handshake | register connection | `event(change)` with snapshot |
| 2 | request | Front -> Back | `procedure: joinGame` | assign role | `response { result: { playerId } }` |
| 3 | request | Front -> Back | `procedure: setSettings` | update match settings | `response { result: snapshot }` |
| 4 | request | Front -> Back | `procedure: start` | create units, start timers | `response { result: snapshot }` |
| 5 | request | Front -> Back | `procedure: movePlayer...` | validate + apply move | `response { result: snapshot }` |
| 6 | event | Back -> Front(all) | `eventName: change` | broadcast state | UI rerender |
| 7 | event | Back -> Front(all) | `eventName: googleCaught/finished` | domain event broadcast | score/modal update |
| 8 | request | Front -> Back | `procedure: stop` | stop match | `response { result: snapshot }` |

Protocol docs:
- HTTP/OpenAPI: [openapi.yaml](./docs/api/openapi.yaml)
- WebSocket/AsyncAPI: [asyncapi.yaml](./docs/api/asyncapi.yaml)

## 4) Technology Stack

- Frontend/Core language: TypeScript sources (`.ts`) + generated `.js` for deployment runtime
- Backend: Node.js runtime + TypeScript sources
- Realtime: WebSocket (`ws`)
- Patterns: MVC (lightweight), Observer, Remote Proxy
- Database: PostgreSQL (Neon), `pg`
- Code quality: ESLint (TS + JS)
- Testing: `Vitest` (unit/integration/e2e), `ws` (e2e client)
- Audio: `get-low.mp3` (low volume) + Web Audio fallback when file is unavailable
- Deployment: GitHub Pages + Render

## 5) Why GitHub Pages + Render + Deployment Guide

### Why this setup

- **GitHub Pages**: ideal for static frontend in portfolio projects.
- **Render**: stable Node process with WebSocket support and health checks.
- **Neon**: managed PostgreSQL for persistent game data.

### Quick deploy

1. Backend: Render `Blueprint` from this repo (`render.yaml`).
2. Add Neon connection:
   - either `DATABASE_URL`
   - or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`.
3. Keep `AUTO_RUN_MIGRATIONS=false` to avoid changing existing tables.
4. Frontend: set `window.GAME_WS_URL` in `config.js`.
5. Enable GitHub Pages from `main` branch root.

## Screenshots and GIF

Add your media files to `docs/screenshots/`:

- `gameplay-start.png`
- `gameplay-win.png`
- `gameplay.gif`

## Tests

### Run

```bash
npm run build
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Covered cases

- `Unit`:
  - `Position.clone/equal` behavior.
  - `EventEmitter` subscribe/emit/unsubscribe.
- `Integration`:
  - `Game.start` creates valid unique unit positions.
  - Turn order + `turnDelayMs` enforcement.
- `E2E`:
  - Start game via WebSocket request/response protocol.
  - Distinct role assignment for two clients.

## Linting Rules (Why)

### Commands

```bash
npm run lint
npm run lint:fix
npm run check:migrations
```

### Rule intent

| Rule | Why it matters |
|---|---|
| `eqeqeq` | prevents implicit coercion in game logic |
| `@typescript-eslint/no-unused-vars` | removes dead code paths and noisy parameters |
| `import/order` | stable imports = easier diff review and fewer merge conflicts |
| `@typescript-eslint/consistent-type-imports` | cleaner TS imports and better long-term maintainability |
| `no-console` = off (intentional) | production/runtime diagnostics are required for Render/WebSocket debugging |
