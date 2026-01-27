## Game State

Core state lives in `shared/types.ts` and is stored in Firebase Realtime Database.

**Type Structure:**
- Client types: `Card`, `Player`, `GameState`, `ChatMessage` — Used in React components
- Firebase types: `FirebaseBoardCard`, `FirebasePlayerData`, `FirebaseRoomData` — Match RTDB schema exactly
- Transform functions in `hooks/room/types.ts` convert between Firebase and client types

### Realtime Database Data Model

```json
{
  "rooms": {
    "{roomCode}": {
      "ownerId": "...",
      "currentTeam": "red|blue",
      "startingTeam": "red|blue",
      "wordPack": "classic|kahoot",
      "currentClue": { "word": "...", "count": 3 },
      "remainingGuesses": 3,
      "turnStartTime": 1234567890,
      "turnDuration": 60,
      "gameStarted": false,
      "gameOver": false,
      "winner": null,
      "paused": false,
      "pauseReason": null,
      "pausedForTeam": null,
      "createdAt": 1234567890,
      "board": [
        { "word": "...", "team": "red", "revealed": false, "revealedBy": null, "votes": {} }
      ],
      "players": {
        "{playerId}": {
          "name": "...",
          "avatar": "🐱",
          "team": "red|blue|null",
          "role": "clueGiver|guesser|null",
          "connected": true,
          "lastSeen": 1234567890
        }
      },
      "messages": {
        "{messageId}": {
          "playerId": "...",
          "playerName": "...",
          "message": "...",
          "timestamp": 1234567890,
          "type": "clue|chat|system"
        }
      }
    }
  }
}
```

### Room Cleanup

**Automatic via onDisconnect**:
- When a player joins, `onDisconnect()` is set to mark them as disconnected
- Firebase server detects connection loss (tab close, network drop, etc.)
- When last player leaves/disconnects, room is deleted

This is **reliable** because it's server-side — no client cooperation needed.

**Backup manual cleanup**:
Run `npm run cleanup:rooms -- --hours 24` to delete rooms older than 24 hours.
Requires Firebase Admin credentials (`gcloud auth application-default login`).

### Turn Flow

1. `startGame` generates board, sets starting team
2. Clue giver gives clue → `currentClue` and `remainingGuesses` set
3. Guessers vote and confirm reveals
4. Wrong guess or out of guesses → switch teams
5. Trap → game over, other team wins
6. All team cards revealed → team wins

### Pause Mechanism

At turn transitions, if the incoming team lacks players:
- `paused: true`, `pauseReason` set, `turnStartTime: null`
- Owner calls `resumeGame` when conditions resolve

### Real-time Subscriptions

3 listeners per client: room document, players collection, messages collection.

## Client-Side State

Some state is stored locally on the client (not synced to Firebase).

### Player Identity

Player identity uses **Firebase Anonymous Authentication**. Each browser session gets a unique `uid` from Firebase Auth, which serves as the player ID. This is more reliable than localStorage-based IDs because Firebase handles session persistence automatically.

### localStorage Keys

| Key | Description | Default |
|-----|-------------|---------|
| `cluecards_avatar` | Player's selected emoji avatar | Random from preset list |
| `cluecards_sound_volume` | Sound effects volume (0-1) | `0.5` |
| `cluecards_sound_muted` | Whether sounds are muted | `false` |
| `cluecards-theme` | UI theme preference | `system` |

**Note:** Keys are defined in `shared/constants.ts` (except theme which is in `ThemeProvider.tsx`).

### Game Configuration Constants

Defined in `shared/constants.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| `TURN_DURATIONS` | `[30, 60, 90]` | Allowed turn durations in seconds |
| `DEFAULT_TURN_DURATION` | `60` | Default turn duration |
| `WORD_PACKS` | `["classic", "kahoot"]` | Available word packs |
| `DEFAULT_WORD_PACK` | `"classic"` | Default word pack |
| `MAX_PLAYER_NAME_LENGTH` | `20` | Maximum player name length |
| `MAX_CLUE_LENGTH` | `30` | Maximum clue word length |
| `MAX_CHAT_MESSAGE_LENGTH` | `200` | Maximum chat message length |
| `MIN_PLAYERS_TO_START` | `4` | Minimum players to start game |

### Input Validation

Input validation utilities in `shared/validation.ts`:

| Function | Description |
|----------|-------------|
| `sanitizePlayerName(name)` | Trim and truncate player name |
| `sanitizeClue(clue)` | Trim and truncate clue word |
| `sanitizeChatMessage(msg)` | Trim and truncate chat message |
| `isValidPlayerName(name)` | Check if name is non-empty and within limit |
| `isValidClueFormat(clue)` | Check if clue is single word within limit |
| `isValidChatMessage(msg)` | Check if message is non-empty and within limit |

### Sound System

All sounds use audio files via `use-sound`/Howler.js for realistic, high-quality playback.

**Audio Files** (`/public/sounds/`):
- `game-start.mp3` — Fantasy success notification when game begins
- `turn-change.mp3` — Quick software tone when turn switches teams
- `game-over.mp3` — Crowd applause celebration when a team wins
- `tick.mp3` — Soft click sound every 2s in the last 30 seconds
- `tick-urgent.mp3` — Fast mechanical alarm clock tic-tac every 0.5s in the last 10 seconds

**Sound Sources:**
Audio files sourced from [Mixkit](https://mixkit.co/free-sound-effects/) under the Mixkit License (free for commercial use).

**Accessibility:**
- Respects `prefers-reduced-motion` OS setting (disables all sounds when set)
- Volume and mute settings persist across sessions via localStorage

**Sound Architecture:**
- `SoundContext` (`contexts/SoundContext.tsx`) — Global provider for sound state and playback
- `useTimerSound` hook — Handles timer tick logic based on time remaining
- `usePrefersReducedMotion` hook — Detects OS accessibility preference
- `use-sound` package — Wrapper around Howler.js for audio file playback

## Application Architecture

### Context Providers (in `app/layout.tsx` order)

| Provider | Location | Purpose |
|----------|----------|---------|
| `ThemeProvider` | `components/ThemeProvider.tsx` | Light/dark theme with system preference support |
| `AuthProvider` | `contexts/AuthContext.tsx` | Firebase Anonymous Auth, provides `uid` |
| `ErrorProvider` | `contexts/ErrorContext.tsx` | Global error toast notifications |
| `SoundProvider` | `contexts/SoundContext.tsx` | Sound effects and volume control |
| `GameProvider` | `components/GameContext.tsx` | Room-level state flags for Navbar warnings |

### Custom Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `useRtdbRoom` | `hooks/useRtdbRoom.ts` | Main room hook, composes connection + actions |
| `useRoomConnection` | `hooks/room/useRoomConnection.ts` | Firebase listeners, presence, player state |
| `useGameActions` | `hooks/room/useGameActions.ts` | Game action handlers (vote, reveal, clue) |
| `useChatActions` | `hooks/room/useChatActions.ts` | Chat message handling |
| `useRoomDerivedState` | `hooks/useRoomDerivedState.ts` | Computed state (isMyTurn, canVote, etc.) |
| `useGameTimer` | `hooks/useGameTimer.ts` | Turn countdown timer with timeout callback |
| `useTransitionOverlays` | `hooks/useTransitionOverlays.ts` | Game start/turn change/game over animations |
| `useTimerSound` | `hooks/useTimerSound.ts` | Timer tick sounds based on time remaining |
| `usePrefersReducedMotion` | `hooks/usePrefersReducedMotion.ts` | Detects OS reduced motion preference |

### Components

**Error Handling:**
- `ErrorBoundary` (`components/ErrorBoundary.tsx`) — Catches React errors, prevents full app crash

**Room Views:**
- `GameView` (`components/room/GameView.tsx`) — Active game UI (board, chat, status)
- `LobbyView` (`components/room/LobbyView.tsx`) — Pre-game lobby UI (team selection)

### Key Files

| File | Purpose |
|------|---------|
| `lib/firebase.ts` | Firebase app/auth/database initialization |
| `lib/firebase-auth.ts` | Anonymous sign-in helper |
| `lib/rtdb-actions.ts` | All Firebase Realtime Database operations |
| `lib/retry.ts` | Retry utility with exponential backoff for network operations |
| `shared/types.ts` | TypeScript types for game state and Firebase data structures |
| `shared/game-utils.ts` | Pure game logic (vote threshold, clue validation) |
| `shared/validation.ts` | Input sanitization and validation utilities |
| `shared/words.ts` | Word lists and board generation |
| `shared/constants.ts` | Game config, localStorage keys, avatars |
| `database.rules.json` | Firebase security rules (with server-side validation) |

### Utilities

**Retry Logic** (`lib/retry.ts`):
- `withRetry(fn, options)` — Wraps async functions with exponential backoff retry
- `isRetryableError(error)` — Distinguishes network errors (retry) from validation errors (don't retry)
- Applied to critical operations: chat messages, game actions

**Connection Indicator** (`components/ConnectionIndicator.tsx`):
- Shows "Offline" badge in Navbar when Firebase connection is lost
- Uses Firebase `.info/connected` for real-time status monitoring

## Security

### Firebase Security Rules

The `database.rules.json` file enforces server-side validation:

**Write Permissions:**
- Room creation: Any authenticated user
- Room deletion: Owner only
- Owner reassignment: Current owner, or any player if owner is disconnected
- Game state (`gameStarted`): Owner only
- Turn state (`currentTeam`, `gameOver`, `winner`, etc.): Owner or guessers
- Board modifications: Owner, clue giver, or guesser
- Vote modifications: Only the voting player can modify their own vote
- Player data: Self or owner
- Messages: Any authenticated player can send; owner can delete all

**Validation Rules:**
- Turn duration: Must be 30, 60, or 90 seconds; only settable before game starts
- Word pack: Must be "classic" or "kahoot"; only settable before game starts
- Clue format: Word 1-30 chars, count >= 0
- Player name: 1-20 characters
- Chat message: 1-200 characters

**Limitations** (validated client-side only):
- Clue word not matching board words
- Duplicate clue giver prevention
- Vote threshold logic
- Teams ready validation

## Testing

### E2E Testing with Playwright

E2E tests live in `tests/` and use Playwright. Run with:
- `npm run test:e2e` — Run against local dev server
- `npm run test:e2e:deployed` — Run against production (https://clue-cards.web.app)

### Test ID Conventions

**All interactive elements should have `data-testid` attributes for Playwright selectors.**

Use these prefixes by component area:

| Prefix | Area | Examples |
|--------|------|----------|
| `home-` | Home page | `home-name-input`, `home-create-btn`, `home-join-btn` |
| `lobby-` | Lobby/team selection | `lobby-start-btn`, `lobby-randomize-btn`, `lobby-join-red-clueGiver` |
| `game-` | Active game UI | `game-clue-input`, `game-clue-btn`, `game-end-turn-btn` |
| `board-` | Game board | `board-card-0`, `board-reveal-12` |

**Naming pattern:** `{area}-{element}-{identifier?}`

Examples:
```tsx
// Button
data-testid="lobby-start-btn"

// Input
data-testid="game-clue-input"

// Dynamic element (with index or ID)
data-testid={`board-card-${index}`}
data-testid={`lobby-join-${team}-${role}`}
```

**When to add test IDs:**
- All buttons that trigger actions
- All form inputs
- Key status displays (game over panel, winner text)
- Dynamic elements that tests need to interact with

**Do NOT use:**
- Loose text selectors like `getByText('Player2')` — use exact match or test IDs
- CSS class selectors — they change with styling
