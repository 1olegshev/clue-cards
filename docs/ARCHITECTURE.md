## Overview

This app is split into three layers:

- `app/`: Next.js UI and client-side logic.
- `components/`: Reusable React components including context providers.
- `hooks/`: Custom React hooks for WebSocket connection, timers, and state management.
- `server/`: WebSocket server that owns authoritative game state.
- `shared/`: Types and shared constants used by both client and server.

## Server Structure

The WebSocket server (`server/`) is organized into focused modules:

| File | Purpose |
|------|---------|
| `index.ts` | Entry point, WebSocket server setup, message routing |
| `types.ts` | Room interface and server constants |
| `room.ts` | Room CRUD, cleanup, abandonment, broadcasting |
| `game.ts` | Game logic: pause/resume, validation, state helpers |
| `handlers.ts` | Message handlers for all game actions |

## Shared Code

The `shared/` folder contains types and utilities used by both client and server:

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript types for game state, players, messages, WebSocket protocol |
| `constants.ts` | Shared constants (WebSocket port, storage keys) |
| `words.ts` | Word list and board generation functions |

## Data Flow

1. Client connects to WebSocket server and sends `join`.
2. Server creates or finds a room, then responds with `stateUpdate`.
3. Clients send intent messages (`startGame`, `revealCard`, `endTurn`, `sendMessage`).
4. Server updates state and broadcasts `stateUpdate` to the room.
5. Server sends `playerCountUpdate` when players join/leave.
6. Server sends `roomClosed` when a room is abandoned or closed.

## Frontend Architecture

### Room Page Structure

The room page (`app/room/[code]/page.tsx`) is organized using custom hooks and focused components:

**Custom Hooks** (`hooks/`):
- `useRoomConnection`: Manages WebSocket connection, game state, and all game action handlers
- `useGameTimer`: Handles turn countdown timer with pause support
- `useTransitionOverlays`: Detects and manages game state transitions (game start, turn change, game over)

**Room Components** (`components/room/`):
- `RoomHeader`: Room code display and share functionality
- `GameStatusPanel`: Score, timer, clue display, pause banner, and game over UI
- `ClueInput`: Spymaster clue form with validation
- `TeamLobby`: Team selection UI (used for both lobby and rematch)
- `CompactTeams`: Condensed team display during active game
- `RoomClosedModal`: Room abandonment/timeout modal
- `JoinRoomForm`: Name entry form
- `ConnectionStatus`: Loading and error states

**Other Components** (`components/`):
- `GameBoard`: 5x5 word grid with voting, reveal confirmation, and spymaster view
- `ChatLog`: Chat message display
- `ClueHistory`: Clue history sidebar
- `GameStats`: End-of-game statistics display
- `TransitionOverlay`: Animated overlays for game start, turn changes, and game over

The main page component (~260 lines) orchestrates these pieces, making it easy to understand and maintain.

### Context Providers

The app uses React contexts for cross-component state:

- **ThemeProvider**: Manages light/dark/system theme preferences.
- **GameProvider**: Shares game state (`isLastPlayer`, `isActiveGame`) between room page and navbar for leave confirmation logic.

## Single Source of Truth

All game rules live on the server. Clients only render state and send intents.

## Room Lifecycle & Disconnection Handling

### Grace Periods

When all players disconnect from a room:
- **Active games**: 30-second grace period before room is closed
- **Lobby/ended games**: 60-second grace period before room is deleted

If a player reconnects within the grace period, the room continues normally.

### Game Pause System

The game automatically pauses when critical players disconnect during an active game:

| Pause Reason | Condition |
|--------------|-----------|
| `teamDisconnected` | A team has no connected players |
| `spymasterDisconnected` | Current team's spymaster disconnects before giving clue |
| `noOperatives` | Current team has no connected operatives after clue is given |

When paused:
- Timer stops counting down
- Voting and clue-giving are disabled
- A pause banner is displayed to all players

The game automatically resumes when the missing player(s) reconnect, and the turn timer resets.

### Room Closure

When a room is closed (all players left, timeout, or abandonment), the server broadcasts a `roomClosed` message with a reason. The client displays an appropriate message and redirects to home.

## Persistence

Currently all rooms live in memory in `server/room.ts`. This is suitable
for local development and single-instance deployments, but not persistent.

### Room Cleanup

The server includes automatic cleanup to prevent memory leaks:

- **Orphaned rooms** (no connected clients) are cleaned up immediately
- **Idle rooms** (no activity for 4 hours) are closed with client notification
- **Cleanup interval**: Runs on server start and every 12 hours

### Firebase Integration (Scaffolding)

Firebase scaffolding is in place for future persistence:

- **Authentication**: Anonymous auth via `lib/firebase-auth.ts` (ready to use)
- **Room Snapshots**: `lib/firebase-rooms.ts` provides save/load functions for room state
- **Configuration**: Set Firebase env vars (`NEXT_PUBLIC_FIREBASE_*`) to enable

**Note**: The WebSocket server remains the authoritative source of truth for gameplay.
Firebase persistence is intended for:
- Room metadata and snapshots (optional, for reconnect/recovery)
- Future features like room history, player stats

The server can optionally call `saveRoomSnapshot()` on state changes, but gameplay
logic stays in `server/` modules for low latency and consistency.

## Testing

The project uses **Vitest** for unit and integration testing of server-side code.

### Test Structure

```
server/__tests__/
  game.test.ts       # Unit tests for game logic (pure functions)
  room.test.ts       # Unit tests for room management
  handlers.test.ts   # Integration tests for message handlers
shared/__tests__/
  words.test.ts      # Unit tests for word list and board generation
```

### Running Tests

```bash
npm run test          # Watch mode (re-runs on file changes)
npm run test:run      # Single run
npm run test:coverage # With coverage report
```

### Test Categories

| Category | File | Coverage |
|----------|------|----------|
| Game Logic | `game.test.ts` | Team validation, clue validation, voting, pause/resume |
| Room Management | `room.test.ts` | Room creation, cleanup, broadcasting |
| Message Handlers | `handlers.test.ts` | Full game flow, join/leave, turn flow |
| Board Generation | `words.test.ts` | Word list, card distribution (9/8/7/1) |

### Pre-commit Hooks

The project uses **Husky** + **lint-staged** to run checks automatically on commit:

| Staged Files | Check | Duration |
|--------------|-------|----------|
| `server/**/*.ts`, `shared/**/*.ts` | Server unit tests | ~200ms |
| `app/**`, `components/**`, `hooks/**`, `lib/**` | TypeScript typecheck | ~2s |

All checks must pass before the commit is allowed.

To skip hooks in emergencies: `git commit --no-verify` (use sparingly)

### E2E Tests

E2E tests use **Playwright** to test full user flows in a real browser.

```bash
npm run test:e2e       # Run E2E tests
npm run test:e2e:ui    # Run with Playwright UI
```

### Test ID Convention

Interactive elements use `data-testid` attributes for reliable E2E test selection.

**Format:** `{area}-{element}[-{modifier}]` (kebab-case)

| Area | Element Examples |
|------|------------------|
| `home-` | `home-name-input`, `home-create-btn`, `home-join-btn`, `home-code-input` |
| `lobby-` | `lobby-join-{team}-{role}`, `lobby-randomize-btn`, `lobby-start-btn` |
| `game-` | `game-clue-input`, `game-clue-count`, `game-clue-btn`, `game-end-turn-btn`, `game-over-panel`, `game-winner-text`, `game-rematch-btn` |
| `board-` | `board-card-{0-24}`, `board-reveal-{0-24}` |

**Rules:**
- Only add to interactive elements needed for E2E tests
- Don't add to purely visual/decorative elements
- Keep minimal - only what tests actually use

### Known Limitations

- **Clue validation**: Irregular plurals (e.g., CHERRY→CHERRIES) are not caught by the simple +S/+ES check. Only exact matches, substrings, and simple plural variants are blocked.
