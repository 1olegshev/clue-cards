import { useEffect, useState, useRef } from "react";
import type { GameState } from "@/shared/types";

export interface UseTransitionOverlaysReturn {
  showGameStart: boolean;
  showTurnChange: boolean;
  showGameOver: boolean;
  transitionTeam: "red" | "blue" | null;
  clueAnimating: boolean;
  dismissGameStart: () => void;
  dismissTurnChange: () => void;
  dismissGameOver: () => void;
}

export function useTransitionOverlays(
  gameState: GameState | null
): UseTransitionOverlaysReturn {
  const [showGameStart, setShowGameStart] = useState(false);
  const [showTurnChange, setShowTurnChange] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [transitionTeam, setTransitionTeam] = useState<"red" | "blue" | null>(null);
  const [clueAnimating, setClueAnimating] = useState(false);
  
  // Refs for tracking state changes
  const prevGameStartedRef = useRef<boolean>(false);
  const prevCurrentTeamRef = useRef<string | null>(null);
  const prevGameOverRef = useRef<boolean>(false);
  const prevClueRef = useRef<string | null>(null);
  const clueAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!gameState) return;
    
    // Game Start transition
    if (gameState.gameStarted && !prevGameStartedRef.current) {
      const team = gameState.startingTeam;
      if (team === "red" || team === "blue") {
        setTransitionTeam(team);
        setShowGameStart(true);
      }
    }
    
    // Turn Change transition (only after game has started, not on initial start)
    if (
      gameState.gameStarted && 
      prevGameStartedRef.current && 
      gameState.currentTeam !== prevCurrentTeamRef.current &&
      prevCurrentTeamRef.current !== null &&
      !gameState.gameOver
    ) {
      const team = gameState.currentTeam;
      if (team === "red" || team === "blue") {
        setTransitionTeam(team);
        setShowTurnChange(true);
      }
    }
    
    // Game Over transition
    if (gameState.gameOver && !prevGameOverRef.current) {
      const winner = gameState.winner;
      if (winner === "red" || winner === "blue") {
        setTransitionTeam(winner);
        setShowGameOver(true);
      }
    }
    
    // Clue announcement animation (with cleanup)
    const currentClueWord = gameState.currentClue?.word ?? null;
    if (currentClueWord && currentClueWord !== prevClueRef.current) {
      setClueAnimating(true);
      if (clueAnimationTimeoutRef.current) {
        clearTimeout(clueAnimationTimeoutRef.current);
      }
      clueAnimationTimeoutRef.current = setTimeout(() => setClueAnimating(false), 400);
    }
    
    // Update refs
    prevGameStartedRef.current = gameState.gameStarted;
    prevCurrentTeamRef.current = gameState.currentTeam;
    prevGameOverRef.current = gameState.gameOver;
    prevClueRef.current = currentClueWord;
  }, [gameState]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clueAnimationTimeoutRef.current) {
        clearTimeout(clueAnimationTimeoutRef.current);
      }
    };
  }, []);

  return {
    showGameStart,
    showTurnChange,
    showGameOver,
    transitionTeam,
    clueAnimating,
    dismissGameStart: () => setShowGameStart(false),
    dismissTurnChange: () => setShowTurnChange(false),
    dismissGameOver: () => setShowGameOver(false),
  };
}
