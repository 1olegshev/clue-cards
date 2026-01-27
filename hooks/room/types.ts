/**
 * Shared types for room hooks
 */

import type {
  GameState,
  Player,
  ChatMessage,
  RoomClosedReason,
  Card,
  WordPack,
  FirebaseBoardCard,
  FirebasePlayerData,
  FirebaseMessageData,
  FirebaseRoomData,
} from "@/shared/types";

// Re-export Firebase types for convenience
export type { FirebaseBoardCard, FirebasePlayerData, FirebaseMessageData, FirebaseRoomData };

// Alias for shorter names in this module
export type BoardCard = FirebaseBoardCard;
export type PlayerData = FirebasePlayerData;
export type MessageData = FirebaseMessageData;
export type RoomData = FirebaseRoomData;

// Transform functions

/**
 * Transform Firebase room data into client GameState.
 * Handles the conversion from Firebase's Record-based votes to array-based cardVotes.
 */
export function toGameState(
  roomCode: string,
  roomData: FirebaseRoomData | null,
  players: Player[]
): GameState | null {
  if (!roomData) return null;
  const boardData: FirebaseBoardCard[] = roomData.board || [];

  // Convert votes from Record<string, boolean> to string[] per card
  const cardVotes: Record<number, string[]> = {};
  boardData.forEach((c, i) => {
    const votes = c.votes ? Object.keys(c.votes).filter((id) => c.votes[id]) : [];
    if (votes.length) cardVotes[i] = votes;
  });

  return {
    roomCode,
    players,
    board: boardData.map((c) => ({
      word: c.word,
      team: c.team as Card["team"],
      revealed: c.revealed || false,
      revealedBy: c.revealedBy || undefined,
    })),
    ownerId: roomData.ownerId || null,
    cardVotes,
    currentTeam: roomData.currentTeam || "red",
    startingTeam: roomData.startingTeam || "red",
    wordPack: roomData.wordPack || "classic",
    currentClue: roomData.currentClue || null,
    remainingGuesses: roomData.remainingGuesses ?? null,
    turnStartTime: roomData.turnStartTime || null,
    turnDuration: roomData.turnDuration || 60,
    gameStarted: roomData.gameStarted || false,
    gameOver: roomData.gameOver || false,
    winner: roomData.winner || null,
    paused: roomData.paused || false,
    pauseReason: roomData.pauseReason || null,
    pausedForTeam: roomData.pausedForTeam || null,
  };
}

/**
 * Transform Firebase players data into client Player array.
 */
export function toPlayers(playersData: Record<string, FirebasePlayerData> | null): Player[] {
  if (!playersData) return [];
  return Object.entries(playersData).map(([id, p]) => ({
    id,
    name: p.name,
    avatar: p.avatar || "🐱",
    team: p.team || null,
    role: p.role || null,
  }));
}

/**
 * Transform Firebase messages data into client ChatMessage array.
 */
export function toMessages(messagesData: Record<string, FirebaseMessageData> | null): ChatMessage[] {
  if (!messagesData) return [];
  return Object.entries(messagesData)
    .map(([id, m]) => ({
      id,
      playerId: m.playerId || undefined,
      playerName: m.playerName,
      message: m.message,
      timestamp: m.timestamp || Date.now(),
      type: m.type,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Re-export client types for convenience
export type { GameState, Player, ChatMessage, RoomClosedReason, WordPack };
