export type Team = "red" | "blue" | "neutral" | "trap";

export type WordPack = "classic" | "kahoot";

export type Role = "clueGiver" | "guesser";
export type LobbyTeam = "red" | "blue" | null;
export type LobbyRole = "clueGiver" | "guesser" | null;

export interface Card {
  word: string;
  team: Team;
  revealed: boolean;
  revealedBy?: string; // Player ID who revealed this card
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  team: Team | null;
  role: Role | null;
}

export type PauseReason = "teamDisconnected" | "clueGiverDisconnected" | "noGuessers" | null;

export interface GameState {
  roomCode: string;
  players: Player[];
  board: Card[];
  ownerId: string | null;
  cardVotes: Record<number, string[]>;
  currentTeam: Team;
  startingTeam: Team;
  wordPack: WordPack; // Selected word pack for this game
  currentClue: { word: string; count: number } | null;
  remainingGuesses: number | null;
  turnStartTime: number | null;
  turnDuration: number; // in seconds
  gameStarted: boolean;
  gameOver: boolean;
  winner: Team | null;
  paused: boolean;
  pauseReason: PauseReason;
  pausedForTeam: Team | null;
}

export interface ChatMessage {
  id: string;
  playerId?: string;
  playerName: string;
  message: string;
  timestamp: number;
  type: "clue" | "chat" | "system";
}

export type RoomClosedReason = "abandoned" | "allPlayersLeft" | "timeout";

// ============================================================================
// Firebase Data Structures (matches RTDB schema exactly)
// ============================================================================

/**
 * Board card as stored in Firebase.
 * Note: votes use Record<string, boolean> for RTDB efficiency (vs array).
 */
export interface FirebaseBoardCard {
  word: string;
  team: Team;
  revealed: boolean;
  revealedBy: string | null;
  votes: Record<string, boolean>;
}

/**
 * Player data as stored in Firebase.
 * Note: id is NOT included here - it's the Record key in players collection.
 */
export interface FirebasePlayerData {
  name: string;
  avatar: string;
  team: Team | null;
  role: Role | null;
  connected: boolean;
  lastSeen: number;
}

/**
 * Message data as stored in Firebase.
 * Note: id is NOT included here - it's the Record key in messages collection.
 */
export interface FirebaseMessageData {
  playerId: string | null;
  playerName: string;
  message: string;
  timestamp: number;
  type: "clue" | "chat" | "system";
}

/**
 * Room data as stored in Firebase (excluding players and messages collections).
 */
export interface FirebaseRoomData {
  ownerId: string;
  currentTeam: Team;
  startingTeam: Team;
  wordPack: WordPack;
  currentClue: { word: string; count: number } | null;
  remainingGuesses: number | null;
  turnStartTime: number | null;
  turnDuration: number;
  gameStarted: boolean;
  gameOver: boolean;
  winner: Team | null;
  paused: boolean;
  pauseReason: PauseReason;
  pausedForTeam: Team | null;
  createdAt: number;
  board: FirebaseBoardCard[];
  players?: Record<string, FirebasePlayerData>;
  messages?: Record<string, FirebaseMessageData>;
}
