## Game State

Core state lives in `shared/types.ts` and is maintained by the server.

### Core Fields

- `roomCode`: identifier for the room.
- `players`: list of players with `team`/`role` assigned in lobby before start.
- `board`: 25 cards with `word`, `team`, and `revealed`.
- `ownerId`: room creator who can change settings before start.
- `cardVotes`: map of card index to playerId list for votes.
- `currentTeam`: team whose turn it is.
- `startingTeam`: team that starts (has 9 cards).
- `currentClue`: the active clue for the turn.
- `remainingGuesses`: guesses left this turn (`count + 1`).
- `turnStartTime` and `turnDuration`: used to compute timer.
- `gameStarted`, `gameOver`, `winner`: game lifecycle flags.

### Pause Fields

- `paused`: boolean indicating if game is currently paused.
- `pauseReason`: why the game is paused (`teamDisconnected`, `spymasterDisconnected`, `noOperatives`, or `null`).
- `pausedForTeam`: which team caused the pause (`red`, `blue`, or `null`).

## Turn Flow

1. `startGame` assigns teams/roles, sets `startingTeam` and `currentTeam`.
2. Spymaster gives a clue (`giveClue`), setting `currentClue` and `remainingGuesses`.
3. Operatives vote on cards (`voteCard`), then confirm reveal (`confirmReveal`) when threshold met.
4. Wrong reveal switches `currentTeam` immediately.
5. When guesses run out or `endTurn` is called, the turn passes and clue resets.
6. Assassin ends the game; all cards of a team revealed wins.
7. `rematch` resets board and reassigns teams while keeping players.

## Lifecycle

- Rooms are created on first `join` with a room code.
- Game starts when owner calls `startGame` with 4+ players.
- After game ends, owner can call `rematch` to start a new game.
- Owner can call `endGame` to cancel an active game and return to lobby.
- Player reconnection is supported via `playerId` stored in sessionStorage.

## Pause/Resume Flow

1. When a player disconnects during an active game, `checkAndUpdatePauseState()` runs.
2. If the current team lacks a spymaster (before clue) or operatives (after clue), the game pauses.
3. Server sets `paused: true`, `pauseReason`, and `pausedForTeam`.
4. A system message is broadcast explaining the pause.
5. Clients stop the timer and disable voting/clue actions.
6. When a player reconnects, `checkAndUpdatePauseState()` runs again.
7. If the missing role is restored, the game resumes with a fresh turn timer.
8. A system message announces the resumption.

## Room Closure Flow

1. When all clients disconnect, a grace period timer starts.
2. If no one reconnects within the grace period:
   - Server broadcasts `roomClosed` with reason.
   - Room is deleted from memory.
3. Any remaining connected clients display a "Room Closed" modal and redirect to home.
