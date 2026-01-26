/**
 * WebSocket message handlers for all game actions.
 */

import { WebSocket } from "ws";
import type { Player, ChatMessage, LobbyTeam, LobbyRole } from "../shared/types";
import type { Room } from "./types";
import { TURN_DURATIONS, ABANDONMENT_GRACE_PERIOD } from "./types";
import {
  rooms,
  generatePlayerId,
  getOrCreateRoom,
  broadcastToRoom,
  broadcastPlayerCount,
  cancelAbandonmentTimeout,
  scheduleRoomCleanup,
} from "./room";
import {
  shufflePlayers,
  teamsAreReady,
  getRequiredVotes,
  clearVotes,
  resetGameState,
  checkAndUpdatePauseState,
  isValidClue,
} from "./game";

// ============================================================================
// Helper: Add system message with pause state check
// ============================================================================

function addPauseSystemMessage(room: Room) {
  const pauseResult = checkAndUpdatePauseState(room);
  if (pauseResult.changed && pauseResult.message) {
    room.messages.push({
      id: generatePlayerId(),
      playerName: "System",
      message: pauseResult.message,
      timestamp: Date.now(),
      type: "system",
    });
  }
}

// ============================================================================
// Connection Handlers
// ============================================================================

/** Handle player joining a room */
export function handleJoin(
  ws: WebSocket,
  roomCode: string,
  playerName: string,
  playerId?: string
) {
  const room = getOrCreateRoom(roomCode);

  // Cancel any pending abandonment timeout
  cancelAbandonmentTimeout(room);

  const existingPlayer = playerId
    ? room.state.players.find((player) => player.id === playerId)
    : null;

  const resolvedPlayerId = playerId ?? generatePlayerId();

  if (existingPlayer) {
    existingPlayer.name = playerName;
    room.clients.set(existingPlayer.id, ws);
  } else {
    const player: Player = {
      id: resolvedPlayerId,
      name: playerName,
      team: null,
      role: null,
    };

    room.state.players.push(player);
    room.clients.set(resolvedPlayerId, ws);
  }

  if (!room.state.ownerId) {
    room.state.ownerId = resolvedPlayerId;
  }

  // Store playerId on the WebSocket for later use
  (ws as any).playerId = resolvedPlayerId;
  (ws as any).roomCode = roomCode;

  // Send state immediately to the new player
  const message = {
    type: "stateUpdate" as const,
    state: room.state,
    messages: room.messages,
    selfPlayerId: resolvedPlayerId,
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    ws.once("open", () => {
      ws.send(JSON.stringify(message));
    });
  }

  // Broadcast to other players
  broadcastToRoom(roomCode, resolvedPlayerId);

  // Broadcast updated player count
  broadcastPlayerCount(roomCode);

  // Check if game should be resumed after player reconnects
  const pauseResult = checkAndUpdatePauseState(room);
  if (pauseResult.changed) {
    if (pauseResult.message) {
      room.messages.push({
        id: generatePlayerId(),
        playerName: "System",
        message: pauseResult.message,
        timestamp: Date.now(),
        type: "system",
      });
    }
    broadcastToRoom(roomCode);
  }
}

/** Handle player leaving/disconnecting from a room */
export function handleLeave(roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Only remove the WebSocket connection, NOT the player data
  room.clients.delete(playerId);

  // Clear any votes from this player
  Object.keys(room.state.cardVotes).forEach((key) => {
    const index = Number(key);
    const votes = room.state.cardVotes[index]?.filter((id) => id !== playerId) ?? [];
    if (votes.length === 0) {
      delete room.state.cardVotes[index];
    } else {
      room.state.cardVotes[index] = votes;
    }
  });

  // Broadcast updated player count
  broadcastPlayerCount(roomCode);

  // Handle room closure when all players leave
  if (room.clients.size === 0) {
    scheduleRoomCleanup(roomCode, room);
  } else {
    // Add system message if game is active
    if (room.state.gameStarted && !room.state.gameOver) {
      const player = room.state.players.find((p) => p.id === playerId);
      if (player) {
        room.messages.push({
          id: generatePlayerId(),
          playerName: "System",
          message: `${player.name} disconnected. They have ${ABANDONMENT_GRACE_PERIOD / 1000}s to reconnect.`,
          timestamp: Date.now(),
          type: "system",
        });
      }

      addPauseSystemMessage(room);
    }

    broadcastToRoom(roomCode);
  }
}

// ============================================================================
// Game Lifecycle Handlers
// ============================================================================

/** Start the game */
export function handleStartGame(roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.state.ownerId !== playerId) return;

  const players = room.state.players;
  if (!teamsAreReady(players)) return;

  room.state.gameStarted = true;
  room.state.currentTeam = room.state.startingTeam;
  room.state.turnStartTime = Date.now();
  room.state.currentClue = null;
  room.state.remainingGuesses = null;
  clearVotes(room);

  broadcastToRoom(roomCode);
}

/** Start a rematch with same players */
export function handleRematch(roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const players = room.state.players;
  if (!teamsAreReady(players)) return;
  if (room.state.ownerId !== playerId) return;
  if (!room.state.gameOver) return;

  resetGameState(room);

  room.state.gameStarted = true;
  room.state.currentTeam = room.state.startingTeam;
  room.state.turnStartTime = Date.now();
  room.state.currentClue = null;
  room.state.remainingGuesses = null;
  clearVotes(room);

  // Clear messages for fresh start
  room.messages = [];

  broadcastToRoom(roomCode);
}

/** End the active game and return to lobby */
export function handleEndGame(roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.state.ownerId !== playerId) return;
  if (!room.state.gameStarted || room.state.gameOver) return;

  room.state.gameStarted = false;
  room.state.gameOver = false;
  room.state.winner = null;
  room.state.currentClue = null;
  room.state.remainingGuesses = null;
  room.state.turnStartTime = null;
  clearVotes(room);

  resetGameState(room);

  // Clear team/role assignments
  room.state.players.forEach((player) => {
    player.team = null;
    player.role = null;
  });

  room.messages.push({
    id: generatePlayerId(),
    playerName: "System",
    message: "Game ended by room owner. Players can now re-select teams.",
    timestamp: Date.now(),
    type: "system",
  });

  broadcastToRoom(roomCode);
}

// ============================================================================
// Lobby Handlers
// ============================================================================

/** Set turn duration */
export function handleSetTurnDuration(roomCode: string, playerId: string, duration: number) {
  const room = rooms.get(roomCode);
  if (!room || room.state.gameStarted) return;

  if (room.state.ownerId !== playerId) return;
  if (!TURN_DURATIONS.includes(duration)) return;

  room.state.turnDuration = duration;
  broadcastToRoom(roomCode);
}

/** Set player's team and role in lobby */
export function handleSetLobbyRole(roomCode: string, playerId: string, team: LobbyTeam, role: LobbyRole) {
  const room = rooms.get(roomCode);
  if (!room || (room.state.gameStarted && !room.state.gameOver)) return;

  const player = room.state.players.find((p) => p.id === playerId);
  if (!player) return;

  if (!team || !role) {
    player.team = null;
    player.role = null;
    broadcastToRoom(roomCode);
    return;
  }

  if (role === "spymaster") {
    const existingSpymaster = room.state.players.find(
      (p) => p.team === team && p.role === "spymaster"
    );
    if (existingSpymaster && existingSpymaster.id !== playerId) return;
  }

  player.team = team;
  player.role = role;
  broadcastToRoom(roomCode);
}

/** Randomize team assignments */
export function handleRandomizeTeams(roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  if (!room || (room.state.gameStarted && !room.state.gameOver)) return;
  if (room.state.ownerId !== playerId) return;

  const players = room.state.players;
  if (players.length < 4 || players.length % 2 !== 0) return;

  const shuffled = shufflePlayers(players);
  const teamSize = players.length / 2;
  const redTeam = shuffled.slice(0, teamSize);
  const blueTeam = shuffled.slice(teamSize);

  redTeam.forEach((player, index) => {
    player.team = "red";
    player.role = index === 0 ? "spymaster" : "operative";
  });

  blueTeam.forEach((player, index) => {
    player.team = "blue";
    player.role = index === 0 ? "spymaster" : "operative";
  });

  broadcastToRoom(roomCode);
}

// ============================================================================
// Gameplay Handlers
// ============================================================================

/** Vote for a card */
export function handleVoteCard(roomCode: string, playerId: string, cardIndex: number) {
  const room = rooms.get(roomCode);
  if (!room || !room.state.gameStarted || room.state.gameOver) return;

  const player = room.state.players.find((p) => p.id === playerId);
  if (!player || player.role !== "operative" || player.team !== room.state.currentTeam) {
    return;
  }

  if (!room.state.currentClue || !room.state.remainingGuesses || room.state.remainingGuesses <= 0) {
    return;
  }

  const card = room.state.board[cardIndex];
  if (!card || card.revealed) return;

  const votes = room.state.cardVotes[cardIndex] ?? [];
  const existingIndex = votes.indexOf(playerId);
  if (existingIndex >= 0) {
    votes.splice(existingIndex, 1);
  } else {
    votes.push(playerId);
  }

  if (votes.length === 0) {
    delete room.state.cardVotes[cardIndex];
  } else {
    room.state.cardVotes[cardIndex] = votes;
  }

  broadcastToRoom(roomCode);
}

/** Confirm card reveal after enough votes */
export function handleConfirmReveal(roomCode: string, playerId: string, cardIndex: number) {
  const room = rooms.get(roomCode);
  if (!room || !room.state.gameStarted || room.state.gameOver) return;

  const votes = room.state.cardVotes[cardIndex] ?? [];
  const requiredVotes = getRequiredVotes(room);
  if (votes.length < requiredVotes || !votes.includes(playerId)) return;

  handleRevealCard(roomCode, playerId, cardIndex);
}

/** Reveal a card (internal helper, called after vote confirmation) */
function handleRevealCard(roomCode: string, playerId: string, cardIndex: number) {
  const room = rooms.get(roomCode);
  if (!room || !room.state.gameStarted || room.state.gameOver) return;

  const player = room.state.players.find((p) => p.id === playerId);
  if (!player || player.role !== "operative" || player.team !== room.state.currentTeam) {
    return;
  }

  if (!room.state.currentClue || !room.state.remainingGuesses || room.state.remainingGuesses <= 0) {
    return;
  }

  const card = room.state.board[cardIndex];
  if (!card || card.revealed) return;

  card.revealed = true;
  card.revealedBy = playerId; // Track who revealed this card
  const isCorrect = card.team === room.state.currentTeam;

  // Check for game over conditions
  if (card.team === "assassin") {
    room.state.gameOver = true;
    room.state.winner = room.state.currentTeam === "red" ? "blue" : "red";
  } else if (!isCorrect) {
    // Wrong team or neutral - end turn
    room.state.currentTeam = room.state.currentTeam === "red" ? "blue" : "red";
    room.state.turnStartTime = Date.now();
    room.state.currentClue = null;
    room.state.remainingGuesses = null;
  } else {
    room.state.remainingGuesses = Math.max(0, room.state.remainingGuesses - 1);
  }

  // Check if all cards of a team are revealed
  const currentTeamCards = room.state.board.filter(
    (c) => c.team === room.state.currentTeam && !c.revealed
  );
  if (currentTeamCards.length === 0) {
    room.state.gameOver = true;
    room.state.winner = room.state.currentTeam;
  }

  if (!room.state.gameOver && isCorrect && room.state.remainingGuesses === 0) {
    room.state.currentTeam = room.state.currentTeam === "red" ? "blue" : "red";
    room.state.turnStartTime = Date.now();
    room.state.currentClue = null;
    room.state.remainingGuesses = null;
  }

  clearVotes(room);
  addPauseSystemMessage(room);
  broadcastToRoom(roomCode);
}

/** Spymaster gives a clue */
export function handleGiveClue(roomCode: string, playerId: string, word: string, count: number) {
  const room = rooms.get(roomCode);
  if (!room || !room.state.gameStarted || room.state.gameOver) return;

  const player = room.state.players.find((p) => p.id === playerId);
  if (!player || player.role !== "spymaster" || player.team !== room.state.currentTeam) {
    return;
  }

  if (room.state.currentClue) return;

  const trimmed = word.trim();
  if (!trimmed || !Number.isFinite(count) || count < 0) return;
  if (/\s/.test(trimmed)) return;

  const boardWords = room.state.board.map((card) => card.word);
  if (!isValidClue(trimmed, boardWords)) return;

  room.state.currentClue = { word: trimmed.toUpperCase(), count };
  room.state.remainingGuesses = count + 1;
  room.state.turnStartTime = Date.now();
  clearVotes(room);

  const chatMessage: ChatMessage = {
    id: generatePlayerId(),
    playerId,
    playerName: player.name,
    message: `${trimmed} ${count}`,
    timestamp: Date.now(),
    type: "clue",
  };

  room.messages.push(chatMessage);
  addPauseSystemMessage(room);
  broadcastToRoom(roomCode);
}

/** End the current turn */
export function handleEndTurn(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room || !room.state.gameStarted || room.state.gameOver) return;

  room.state.currentTeam = room.state.currentTeam === "red" ? "blue" : "red";
  room.state.turnStartTime = Date.now();
  room.state.currentClue = null;
  room.state.remainingGuesses = null;
  clearVotes(room);

  addPauseSystemMessage(room);
  broadcastToRoom(roomCode);
}

// ============================================================================
// Chat Handler
// ============================================================================

/** Send a chat message */
export function handleSendMessage(
  roomCode: string,
  playerId: string,
  message: string,
  messageType: "clue" | "chat"
) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const player = room.state.players.find((p) => p.id === playerId);
  if (!player) return;

  const chatMessage: ChatMessage = {
    id: generatePlayerId(),
    playerId,
    playerName: player.name,
    message,
    timestamp: Date.now(),
    type: messageType,
  };

  room.messages.push(chatMessage);
  broadcastToRoom(roomCode);
}
