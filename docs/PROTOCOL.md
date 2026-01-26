## WebSocket Protocol

Messages are JSON. All client-to-server messages are intents. All server-to-client
messages are `stateUpdate`.

### Client -> Server

- `join`: join or create a room.
  ```json
  { "type": "join", "roomCode": "ABC123", "playerName": "Alex", "playerId": "abc123" }
  ```
- `startGame`: start if enough players.
  ```json
  { "type": "startGame" }
  ```
- `setLobbyRole`: player chooses a lobby team and role (before start).
  ```json
  { "type": "setLobbyRole", "team": "red", "role": "spymaster" }
  ```
- `randomizeTeams`: owner randomizes team choices (before start).
  ```json
  { "type": "randomizeTeams" }
  ```
- `rematch`: room owner starts a new game with same players.
  ```json
  { "type": "rematch" }
  ```
- `setTurnDuration`: room owner sets turn duration before game start.
  ```json
  { "type": "setTurnDuration", "duration": 60 }
  ```
- `voteCard`: operative votes for a card (toggle).
  ```json
  { "type": "voteCard", "cardIndex": 12 }
  ```
- `confirmReveal`: operative confirms reveal after enough votes.
  ```json
  { "type": "confirmReveal", "cardIndex": 12 }
  ```
- `giveClue`: spymaster clue (word + number).
  ```json
  { "type": "giveClue", "word": "BIRD", "count": 2 }
  ```
- `endTurn`: end the current team's turn.
  ```json
  { "type": "endTurn" }
  ```
- `endGame`: room owner ends the active game and returns to lobby.
  ```json
  { "type": "endGame" }
  ```
- `sendMessage`: chat or clue message.
  ```json
  { "type": "sendMessage", "message": "Bird 2", "messageType": "clue" }
  ```

### Server -> Client

- `stateUpdate`: authoritative game state and chat log. On initial join, the
  server also sends `selfPlayerId` to the joining client.
  ```json
  {
    "type": "stateUpdate",
    "state": { "...": "GameState" },
    "messages": [],
    "selfPlayerId": "abc123"
  }
  ```

- `playerCountUpdate`: sent when players connect/disconnect. Used by client to
  track if user is the last player for leave confirmation.
  ```json
  {
    "type": "playerCountUpdate",
    "connectedCount": 3,
    "totalPlayers": 4
  }
  ```

- `roomClosed`: sent when a room is closed due to abandonment or timeout.
  Client should display a message and redirect to home.
  ```json
  {
    "type": "roomClosed",
    "reason": "abandoned"
  }
  ```
  Possible reasons:
  - `abandoned`: All players left during an active game
  - `allPlayersLeft`: All players left during lobby/ended game
  - `timeout`: Room expired due to inactivity
