/**
 * Shared game utilities used by both client and server.
 */

import type { Player } from "./types";

// ============================================================================
// Team Validation
// ============================================================================

/** Shuffle players array randomly */
export function shufflePlayers(players: Player[]): Player[] {
  return [...players].sort(() => Math.random() - 0.5);
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
  if (guesserCount <= 1) return 1;
  return Math.min(3, Math.ceil(guesserCount / 2));
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
