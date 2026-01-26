/**
 * WebSocket Game Server
 * 
 * Entry point for the Clue Cards real-time game server.
 * Handles WebSocket connections and routes messages to handlers.
 * 
 * Architecture:
 * - types.ts     - Room interface and server constants
 * - room.ts      - Room management, cleanup, broadcasting
 * - game.ts      - Game logic (pause, validation, state helpers)
 * - handlers.ts  - Message handlers for all game actions
 * - index.ts     - This file: server setup and message routing
 */

import { WebSocketServer, WebSocket } from "ws";
import type { WebSocketMessage } from "../shared/types";
import { DEFAULT_WS_PORT } from "../shared/constants";
import { CLEANUP_INTERVAL, IDLE_ROOM_TIMEOUT } from "./types";
import { cleanupIdleRooms } from "./room";
import {
  handleJoin,
  handleLeave,
  handleStartGame,
  handleRematch,
  handleEndGame,
  handleSetTurnDuration,
  handleSetLobbyRole,
  handleRandomizeTeams,
  handleVoteCard,
  handleConfirmReveal,
  handleGiveClue,
  handleEndTurn,
  handleSendMessage,
} from "./handlers";

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = Number(process.env.WS_PORT ?? process.env.PORT ?? DEFAULT_WS_PORT);

// ============================================================================
// WebSocket Server
// ============================================================================

// Listen on all interfaces (0.0.0.0) to allow connections from other devices on the network
const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (data: Buffer) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      const playerId = (ws as any).playerId;
      const roomCode = (ws as any).roomCode;

      switch (message.type) {
        case "join":
          handleJoin(ws, message.roomCode, message.playerName, message.playerId);
          break;

        case "startGame":
          handleStartGame(roomCode, playerId);
          break;

        case "rematch":
          handleRematch(roomCode, playerId);
          break;

        case "endGame":
          handleEndGame(roomCode, playerId);
          break;

        case "setTurnDuration":
          handleSetTurnDuration(roomCode, playerId, message.duration);
          break;

        case "setLobbyRole":
          handleSetLobbyRole(roomCode, playerId, message.team, message.role);
          break;

        case "randomizeTeams":
          handleRandomizeTeams(roomCode, playerId);
          break;

        case "voteCard":
          handleVoteCard(roomCode, playerId, message.cardIndex);
          break;

        case "confirmReveal":
          handleConfirmReveal(roomCode, playerId, message.cardIndex);
          break;

        case "giveClue":
          handleGiveClue(roomCode, playerId, message.word, message.count);
          break;

        case "endTurn":
          handleEndTurn(roomCode);
          break;

        case "sendMessage":
          handleSendMessage(roomCode, playerId, message.message, message.messageType);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", () => {
    const playerId = (ws as any).playerId;
    const roomCode = (ws as any).roomCode;
    if (playerId && roomCode) {
      handleLeave(roomCode, playerId);
    }
  });
});

// ============================================================================
// Server Startup
// ============================================================================

console.log(`WebSocket server running on ws://0.0.0.0:${PORT} (accepting connections from any interface)`);

// Run cleanup on server start
cleanupIdleRooms();
console.log(
  `Room cleanup enabled: checking every ${CLEANUP_INTERVAL / 3600000} hours, ` +
  `idle timeout: ${IDLE_ROOM_TIMEOUT / 3600000} hours`
);

// Periodic cleanup of idle/orphaned rooms
setInterval(cleanupIdleRooms, CLEANUP_INTERVAL);
