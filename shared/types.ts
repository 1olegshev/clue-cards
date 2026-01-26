export type Team = "red" | "blue" | "neutral" | "assassin";

export type Role = "spymaster" | "operative";
export type LobbyTeam = "red" | "blue" | null;
export type LobbyRole = "spymaster" | "operative" | null;

export interface Card {
  word: string;
  team: Team;
  revealed: boolean;
  revealedBy?: string; // Player ID who revealed this card
}

export interface Player {
  id: string;
  name: string;
  team: Team | null;
  role: Role | null;
}

export type PauseReason = "teamDisconnected" | "spymasterDisconnected" | "noOperatives" | null;

export interface GameState {
  roomCode: string;
  players: Player[];
  board: Card[];
  ownerId: string | null;
  cardVotes: Record<number, string[]>;
  currentTeam: Team;
  startingTeam: Team;
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

export type WebSocketMessage =
  | { type: "join"; roomCode: string; playerName: string; playerId?: string }
  | { type: "startGame" }
  | { type: "setLobbyRole"; team: LobbyTeam; role: LobbyRole }
  | { type: "randomizeTeams" }
  | { type: "rematch" }
  | { type: "endGame" }
  | { type: "setTurnDuration"; duration: number }
  | { type: "voteCard"; cardIndex: number }
  | { type: "confirmReveal"; cardIndex: number }
  | { type: "giveClue"; word: string; count: number }
  | { type: "endTurn" }
  | { type: "sendMessage"; message: string; messageType: "clue" | "chat" }
  | { type: "stateUpdate"; state: GameState; messages: ChatMessage[]; selfPlayerId?: string }
  | { type: "roomClosed"; reason: RoomClosedReason }
  | { type: "playerCountUpdate"; connectedCount: number; totalPlayers: number };
