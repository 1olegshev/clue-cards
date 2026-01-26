/**
 * Room management: creation, cleanup, broadcasting, and lifecycle.
 */

import { WebSocket } from "ws";
import type { GameState, Card, WebSocketMessage, RoomClosedReason } from "../shared/types";
import { generateBoard, assignTeams } from "../shared/words";
import type { Room } from "./types";
import { ABANDONMENT_GRACE_PERIOD, IDLE_ROOM_TIMEOUT } from "./types";

// ============================================================================
// Room Storage
// ============================================================================

/** In-memory storage for all active rooms */
export const rooms = new Map<string, Room>();

// ============================================================================
// ID Generation
// ============================================================================

/** Generate a random player ID */
export function generatePlayerId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// ============================================================================
// Room Creation
// ============================================================================

/** Create initial game state for a new room */
export function createInitialGameState(roomCode: string): GameState {
  const boardWords = generateBoard();
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const cards: Card[] = assignTeams(boardWords, startingTeam).map((item) => ({
    word: item.word,
    team: item.team,
    revealed: false,
  }));

  return {
    roomCode,
    players: [],
    board: cards,
    ownerId: null,
    cardVotes: {},
    currentTeam: startingTeam,
    startingTeam,
    currentClue: null,
    remainingGuesses: null,
    turnStartTime: null,
    turnDuration: 60,
    gameStarted: false,
    gameOver: false,
    winner: null,
    paused: false,
    pauseReason: null,
    pausedForTeam: null,
  };
}

/** Create a new room or get existing one */
export function getOrCreateRoom(roomCode: string): Room {
  let room = rooms.get(roomCode);
  if (!room) {
    const state = createInitialGameState(roomCode);
    room = {
      state,
      messages: [],
      clients: new Map(),
      lastActivity: Date.now(),
    };
    rooms.set(roomCode, room);
  }
  return room;
}

// ============================================================================
// Broadcasting
// ============================================================================

/** Broadcast game state to all clients in a room */
export function broadcastToRoom(roomCode: string, excludePlayerId?: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Update activity timestamp
  room.lastActivity = Date.now();

  const message: WebSocketMessage = {
    type: "stateUpdate",
    state: room.state,
    messages: room.messages,
  };

  const data = JSON.stringify(message);
  room.clients.forEach((ws, playerId) => {
    if (playerId !== excludePlayerId && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

/** Broadcast connected player count to all clients */
export function broadcastPlayerCount(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const message: WebSocketMessage = {
    type: "playerCountUpdate",
    connectedCount: room.clients.size,
    totalPlayers: room.state.players.length,
  };

  const data = JSON.stringify(message);
  room.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

/** Broadcast room closed notification to all clients */
export function broadcastRoomClosed(roomCode: string, reason: RoomClosedReason) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const message: WebSocketMessage = {
    type: "roomClosed",
    reason,
  };

  const data = JSON.stringify(message);
  room.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// ============================================================================
// Abandonment & Cleanup
// ============================================================================

/** Cancel any pending abandonment timeout for a room */
export function cancelAbandonmentTimeout(room: Room) {
  if (room.abandonmentTimeout) {
    clearTimeout(room.abandonmentTimeout);
    room.abandonmentTimeout = undefined;
  }
}

/** Schedule room cleanup after all players disconnect */
export function scheduleRoomCleanup(roomCode: string, room: Room) {
  const isActiveGame = room.state.gameStarted && !room.state.gameOver;
  const gracePeriod = isActiveGame ? ABANDONMENT_GRACE_PERIOD : 60000;

  // Cancel any existing timeout
  cancelAbandonmentTimeout(room);

  // Set a timeout to clean up the room if no one reconnects
  room.abandonmentTimeout = setTimeout(() => {
    const currentRoom = rooms.get(roomCode);
    if (currentRoom && currentRoom.clients.size === 0) {
      broadcastRoomClosed(roomCode, isActiveGame ? "abandoned" : "allPlayersLeft");
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted - ${isActiveGame ? "game abandoned" : "all players left"}`);
    }
  }, gracePeriod);

  console.log(`Room ${roomCode}: All players disconnected. Grace period: ${gracePeriod / 1000}s`);
}

/** Clean up orphaned and idle rooms */
export function cleanupIdleRooms() {
  const now = Date.now();
  let cleaned = 0;

  rooms.forEach((room, roomCode) => {
    const idleTime = now - room.lastActivity;

    // Delete rooms with no connected clients (orphaned)
    if (room.clients.size === 0) {
      cancelAbandonmentTimeout(room);
      rooms.delete(roomCode);
      cleaned++;
      console.log(`Cleanup: Deleted orphaned room ${roomCode}`);
      return;
    }

    // Delete rooms idle for more than 4 hours
    if (idleTime > IDLE_ROOM_TIMEOUT) {
      broadcastRoomClosed(roomCode, "timeout");
      cancelAbandonmentTimeout(room);
      rooms.delete(roomCode);
      cleaned++;
      console.log(`Cleanup: Deleted idle room ${roomCode} (idle for ${Math.round(idleTime / 60000)} minutes)`);
    }
  });

  if (cleaned > 0) {
    console.log(`Cleanup complete: Removed ${cleaned} room(s). Active rooms: ${rooms.size}`);
  }
}
