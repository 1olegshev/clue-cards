/**
 * Server-specific types and constants for the WebSocket game server.
 */

import type { WebSocket } from "ws";
import type { GameState, ChatMessage } from "../shared/types";

/**
 * Represents an active game room on the server.
 */
export interface Room {
  /** Current game state */
  state: GameState;
  /** Chat and system messages */
  messages: ChatMessage[];
  /** Connected WebSocket clients mapped by playerId */
  clients: Map<string, WebSocket>;
  /** Timeout handle for room abandonment cleanup */
  abandonmentTimeout?: NodeJS.Timeout;
  /** Timestamp of last activity (for idle cleanup) */
  lastActivity: number;
}

// ============================================================================
// Server Constants
// ============================================================================

/** Valid turn duration options in seconds */
export const TURN_DURATIONS = [30, 60, 90];

/** Grace period for reconnection during active games (30 seconds) */
export const ABANDONMENT_GRACE_PERIOD = 30000;

/** Rooms idle beyond this are cleaned up (4 hours) */
export const IDLE_ROOM_TIMEOUT = 4 * 60 * 60 * 1000;

/** How often idle room cleanup runs (12 hours) */
export const CLEANUP_INTERVAL = 12 * 60 * 60 * 1000;
