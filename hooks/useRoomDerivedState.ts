/**
 * Hook for computing derived state from room data.
 * Extracts and memoizes commonly needed computed values.
 */

import { useMemo } from "react";
import type { GameState, Player } from "@/shared/types";
import { getRequiredVotes } from "@/shared/game-utils";

export interface UseRoomDerivedStateReturn {
  /** True if current player is a guesser on the team whose turn it is */
  isMyTurn: boolean;
  /** True if current player is the room owner */
  isRoomOwner: boolean;
  /** True if current player can vote on cards (guesser, has clue, has guesses, not paused) */
  canVote: boolean;
  /** True if current player can give a clue (clue giver, their turn, no current clue) */
  canGiveClue: boolean;
  /** Number of guessers on the current team */
  guesserCount: number;
  /** Number of votes required to reveal a card */
  requiredVotes: number;
  /** CSS class for turn-based glow effect */
  turnGlowClass: string;
}

export function useRoomDerivedState(
  gameState: GameState | null,
  currentPlayer: Player | null,
  players: Player[]
): UseRoomDerivedStateReturn {
  const isMyTurn = useMemo(() => {
    return Boolean(
      gameState?.gameStarted &&
      !gameState?.gameOver &&
      currentPlayer?.team === gameState.currentTeam &&
      currentPlayer?.role === "guesser"
    );
  }, [gameState, currentPlayer]);

  const isRoomOwner = useMemo(() => {
    return Boolean(currentPlayer?.id && gameState?.ownerId === currentPlayer.id);
  }, [currentPlayer, gameState]);

  const canVote = useMemo(() => {
    return Boolean(
      isMyTurn &&
      gameState?.currentClue &&
      (gameState.remainingGuesses ?? 0) > 0 &&
      !gameState?.gameOver &&
      !gameState?.paused
    );
  }, [isMyTurn, gameState]);

  const canGiveClue = useMemo(() => {
    return Boolean(
      gameState?.gameStarted &&
      !gameState?.gameOver &&
      !gameState?.paused &&
      currentPlayer?.role === "clueGiver" &&
      currentPlayer?.team === gameState?.currentTeam &&
      !gameState?.currentClue
    );
  }, [gameState, currentPlayer]);

  const guesserCount = useMemo(() => {
    if (!gameState) return 0;
    return players.filter(
      (player) => player.team === gameState.currentTeam && player.role === "guesser"
    ).length;
  }, [gameState, players]);

  const requiredVotes = useMemo(() => getRequiredVotes(guesserCount), [guesserCount]);

  const turnGlowClass = useMemo(() => {
    return gameState?.currentTeam === "red"
      ? "shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
      : "shadow-[0_0_0_1px_rgba(59,130,246,0.25)]";
  }, [gameState?.currentTeam]);

  return {
    isMyTurn,
    isRoomOwner,
    canVote,
    canGiveClue,
    guesserCount,
    requiredVotes,
    turnGlowClass,
  };
}
