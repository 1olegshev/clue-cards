/**
 * Shared game utilities used by both client and server.
 */

import type { Player } from "./types";

// ============================================================================
// Shuffle Utilities
// ============================================================================

/**
 * Fisher-Yates shuffle algorithm - produces unbiased random permutation.
 * Creates a new array, does not mutate the original.
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Team Validation
// ============================================================================

/** Shuffle players array randomly using Fisher-Yates */
export function shufflePlayers(players: Player[]): Player[] {
  return shuffle(players);
}

/** Check if teams are properly configured to start game */
export function teamsAreReady(players: Player[]): boolean {
  // Only count players assigned to teams
  const assignedPlayers = players.filter((p) => p.team && p.role);
  if (assignedPlayers.length < 4) return false;

  const redTeam = assignedPlayers.filter((player) => player.team === "red");
  const blueTeam = assignedPlayers.filter((player) => player.team === "blue");

  // Each team needs exactly 1 clue giver (game mechanic requirement)
  const redClueGivers = redTeam.filter((player) => player.role === "clueGiver").length;
  const blueClueGivers = blueTeam.filter((player) => player.role === "clueGiver").length;

  return redClueGivers === 1 && blueClueGivers === 1;
}

/** Calculate required votes to reveal a card */
export function getRequiredVotes(guesserCount: number): number {
  return guesserCount >= 4 ? 2 : 1;
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

  // Check if clue is a prefix/suffix of any board word or vice versa.
  // This blocks meaningful derivations like "farm"/"farmer", but allows
  // coincidental substrings like "war" in "dwarf".
  // Note: This also handles plural variants (dog/dogs, bench/benches) since
  // adding/removing S or ES creates a prefix/suffix relationship.
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

  return true;
}
