/**
 * Game logic: pause/resume, validation, and game state utilities.
 */

import type { Player, Card } from "../shared/types";
import { generateBoard, assignTeams } from "../shared/words";
import type { Room } from "./types";

// ============================================================================
// Team Validation
// ============================================================================

/** Shuffle players array randomly */
export function shufflePlayers(players: Player[]): Player[] {
  return [...players].sort(() => Math.random() - 0.5);
}

/** Check if teams are properly configured to start game */
export function teamsAreReady(players: Player[]): boolean {
  if (players.length < 4 || players.length % 2 !== 0) return false;

  const redTeam = players.filter((player) => player.team === "red");
  const blueTeam = players.filter((player) => player.team === "blue");

  if (redTeam.length !== blueTeam.length) return false;
  if (redTeam.length + blueTeam.length !== players.length) return false;

  const redSpymasters = redTeam.filter((player) => player.role === "spymaster").length;
  const blueSpymasters = blueTeam.filter((player) => player.role === "spymaster").length;

  return redSpymasters === 1 && blueSpymasters === 1;
}

// ============================================================================
// Voting
// ============================================================================

/** Calculate required votes to reveal a card */
export function getRequiredVotes(room: Room): number {
  const operatives = room.state.players.filter(
    (player) => player.team === room.state.currentTeam && player.role === "operative"
  ).length;
  if (operatives <= 1) return 1;
  return Math.min(3, Math.ceil(operatives / 2));
}

/** Clear all card votes */
export function clearVotes(room: Room) {
  room.state.cardVotes = {};
}

// ============================================================================
// Game State Reset
// ============================================================================

/** Reset game state for new game (keeps players) */
export function resetGameState(room: Room) {
  const boardWords = generateBoard();
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const cards: Card[] = assignTeams(boardWords, startingTeam).map((item) => ({
    word: item.word,
    team: item.team,
    revealed: false,
  }));

  room.state.board = cards;
  room.state.startingTeam = startingTeam;
  room.state.currentTeam = startingTeam;
  room.state.currentClue = null;
  room.state.remainingGuesses = null;
  room.state.turnStartTime = null;
  room.state.gameStarted = false;
  room.state.gameOver = false;
  room.state.winner = null;
  room.state.paused = false;
  room.state.pauseReason = null;
  room.state.pausedForTeam = null;
  clearVotes(room);
}

// ============================================================================
// Pause/Resume Logic
// ============================================================================

export interface PauseCheckResult {
  changed: boolean;
  message?: string;
}

/**
 * Check and update game pause state based on connected players.
 * 
 * Pauses when:
 * - A team has no connected players (teamDisconnected)
 * - Current team's spymaster disconnects before giving clue (spymasterDisconnected)
 * - Current team has no operatives after clue is given (noOperatives)
 * 
 * Resumes when the missing player(s) reconnect.
 */
export function checkAndUpdatePauseState(room: Room): PauseCheckResult {
  // Only check pause state during active games
  if (!room.state.gameStarted || room.state.gameOver) {
    if (room.state.paused) {
      room.state.paused = false;
      room.state.pauseReason = null;
      room.state.pausedForTeam = null;
      return { changed: true };
    }
    return { changed: false };
  }

  const connectedPlayerIds = new Set(room.clients.keys());

  // Check each team's connected status
  for (const team of ["red", "blue"] as const) {
    const teamPlayers = room.state.players.filter((p) => p.team === team);
    const connectedTeamPlayers = teamPlayers.filter((p) => connectedPlayerIds.has(p.id));

    const hasSpymaster = connectedTeamPlayers.some((p) => p.role === "spymaster");
    const operativeCount = connectedTeamPlayers.filter((p) => p.role === "operative").length;

    // If this team has no connected players at all
    if (connectedTeamPlayers.length === 0) {
      if (!room.state.paused || room.state.pausedForTeam !== team) {
        room.state.paused = true;
        room.state.pauseReason = "teamDisconnected";
        room.state.pausedForTeam = team;
        return {
          changed: true,
          message: `Game paused: ${team.toUpperCase()} team has no connected players. Waiting for reconnection...`,
        };
      }
      return { changed: false };
    }

    // If current team is missing spymaster and it's their turn to give clue
    if (team === room.state.currentTeam && !hasSpymaster && !room.state.currentClue) {
      if (!room.state.paused || room.state.pauseReason !== "spymasterDisconnected") {
        room.state.paused = true;
        room.state.pauseReason = "spymasterDisconnected";
        room.state.pausedForTeam = team;
        return {
          changed: true,
          message: `Game paused: ${team.toUpperCase()} team spymaster disconnected. Waiting for reconnection...`,
        };
      }
      return { changed: false };
    }

    // If current team has no operatives and clue has been given
    if (team === room.state.currentTeam && operativeCount === 0 && room.state.currentClue) {
      if (!room.state.paused || room.state.pauseReason !== "noOperatives") {
        room.state.paused = true;
        room.state.pauseReason = "noOperatives";
        room.state.pausedForTeam = team;
        return {
          changed: true,
          message: `Game paused: ${team.toUpperCase()} team has no connected operatives. Waiting for reconnection...`,
        };
      }
      return { changed: false };
    }
  }

  // If we get here and game was paused, check if we can resume
  if (room.state.paused) {
    const pausedTeam = room.state.pausedForTeam;
    if (pausedTeam) {
      const teamPlayers = room.state.players.filter((p) => p.team === pausedTeam);
      const connectedTeamPlayers = teamPlayers.filter((p) => connectedPlayerIds.has(p.id));

      const hasSpymaster = connectedTeamPlayers.some((p) => p.role === "spymaster");
      const operativeCount = connectedTeamPlayers.filter((p) => p.role === "operative").length;

      let canResume = false;

      switch (room.state.pauseReason) {
        case "teamDisconnected":
          canResume = connectedTeamPlayers.length > 0;
          break;
        case "spymasterDisconnected":
          canResume = hasSpymaster;
          break;
        case "noOperatives":
          canResume = operativeCount > 0;
          break;
      }

      if (canResume) {
        room.state.paused = false;
        room.state.pauseReason = null;
        room.state.pausedForTeam = null;
        // Reset turn timer when resuming
        room.state.turnStartTime = Date.now();
        return {
          changed: true,
          message: `Game resumed! ${pausedTeam.toUpperCase()} team player reconnected.`,
        };
      }
    }
  }

  return { changed: false };
}

// ============================================================================
// Clue Validation
// ============================================================================

/**
 * Validate a clue word against the board.
 * Returns true if valid, false if invalid.
 */
export function isValidClue(word: string, boardWords: string[]): boolean {
  const normalized = word.toUpperCase();
  const boardWordsSet = new Set(boardWords.map((w) => w.toUpperCase()));

  // Exact match check
  if (boardWordsSet.has(normalized)) return false;

  // Check if clue is a prefix/suffix of any board word or vice versa
  // (Only blocks meaningful derivations like "farm"/"farmer", not coincidental
  // substrings like "war" in "dwarf")
  for (const boardWord of boardWordsSet) {
    // Clue is prefix or suffix of board word
    if (boardWord.startsWith(normalized) || boardWord.endsWith(normalized)) {
      return false;
    }
    // Board word is prefix or suffix of clue
    if (normalized.startsWith(boardWord) || normalized.endsWith(boardWord)) {
      return false;
    }
  }

  // Check for common word variants (simple pluralization)
  const pluralVariants = [
    normalized + "S",
    normalized + "ES",
    normalized.slice(0, -1), // Remove trailing S
    normalized.slice(0, -2), // Remove trailing ES
  ];

  for (const variant of pluralVariants) {
    if (boardWordsSet.has(variant)) {
      return false;
    }
  }

  return true;
}
