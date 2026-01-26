## Game State

Core state lives in `shared/types.ts` and is stored in Firebase Realtime Database.

### Realtime Database Data Model

```json
{
  "rooms": {
    "{roomCode}": {
      "ownerId": "...",
      "currentTeam": "red|blue",
      "startingTeam": "red|blue",
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
        { "word": "...", "team": "red", "revealed": false, "votes": {} }
      ],
      "players": {
        "{playerId}": {
          "name": "...",
          "team": "red|blue",
          "role": "spymaster|operative",
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
2. Spymaster gives clue → `currentClue` and `remainingGuesses` set
3. Operatives vote and confirm reveals
4. Wrong guess or out of guesses → switch teams
5. Assassin → game over, other team wins
6. All team cards revealed → team wins

### Pause Mechanism

At turn transitions, if the incoming team lacks players:
- `paused: true`, `pauseReason` set, `turnStartTime: null`
- Owner calls `resumeGame` when conditions resolve

### Real-time Subscriptions

3 listeners per client: room document, players collection, messages collection.
