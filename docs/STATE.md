## Game State

Core state lives in `shared/types.ts` and is stored in Firestore.

### Firestore Data Model

```
rooms/{roomCode}
  ├── ownerId, currentTeam, startingTeam, currentClue, remainingGuesses
  ├── turnStartTime, turnDuration, gameStarted, gameOver, winner
  ├── paused, pauseReason, pausedForTeam, createdAt, lastActivity
  │
  ├── players/{playerId}      (subcollection)
  │     └── name, team, role, connected, lastSeen
  │
  ├── board/{cardIndex}       (subcollection, 0-24)
  │     └── word, team, revealed, revealedBy, votes[]
  │
  └── messages/{messageId}    (subcollection)
        └── playerId, playerName, message, timestamp, type
```

### Key Fields

- **Room document**: Game settings and current turn state
- **players subcollection**: Each player's team assignment, role, and connection status
- **board subcollection**: 25 cards with votes stored per-card (not at room level)
- **messages subcollection**: Chat and clue history

## Turn Flow

1. `startGame` assigns teams/roles, sets `startingTeam` and `currentTeam`.
2. Spymaster gives a clue (`giveClue`), setting `currentClue` and `remainingGuesses`.
3. Operatives vote on cards (`voteCard`), then confirm reveal (`confirmReveal`) when threshold met.
4. Wrong reveal switches `currentTeam` immediately.
5. When guesses run out or `endTurn` is called, the turn passes and clue resets.
6. Assassin ends the game; all cards of a team revealed wins.
7. `rematch` resets board and reassigns teams while keeping players.

## Pause Mechanism

At each turn transition (`confirmReveal` or `endTurn`), the game checks if the incoming team can play:
- Needs at least one connected spymaster (to give clue)
- Needs at least one connected operative (to guess)

If conditions aren't met:
- `paused` → `true`
- `pauseReason` → `"spymasterDisconnected"` | `"noOperatives"` | `"teamDisconnected"`
- `pausedForTeam` → the team that's missing players
- `turnStartTime` → `null` (stops timer)

Owner calls `resumeGame` to unpause once conditions are resolved.

## Lifecycle

- Rooms are created on first join with a room code.
- Game starts when owner calls `startGame` with 4+ players.
- After game ends, owner can call `rematch` to start a new game.
- Owner can call `endGame` to cancel an active game and return to lobby.
- Player reconnection is supported via `playerId` stored in sessionStorage.
