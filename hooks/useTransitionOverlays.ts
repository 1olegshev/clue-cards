import { useEffect, useState, useRef } from "react";
import type { GameState } from "@/shared/types";
import { useSoundContextOptional, SoundName } from "@/contexts/SoundContext";

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
  const soundContext = useSoundContextOptional();
  
  // Helper to play sound if available
  const playSound = (name: SoundName) => {
    soundContext?.playSound(name);
  };
  const [showGameStart, setShowGameStart] = useState(false);
  const [showTurnChange, setShowTurnChange] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [transitionTeam, setTransitionTeam] = useState<"red" | "blue" | null>(null);
  const [clueAnimating, setClueAnimating] = useState(false);
  
  // Refs for tracking state changes
  const prevGameStartedRef = useRef<boolean | null>(null);
  const prevCurrentTeamRef = useRef<string | null>(null);
  const prevGameOverRef = useRef<boolean | null>(null);
  const prevClueRef = useRef<string | null>(null);
  const clueAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!gameState) return;
    
    // On first load, initialize refs without triggering transitions
    // This prevents splash screens on page refresh when game is already in progress
    const isFirstLoad = prevGameStartedRef.current === null;
    if (isFirstLoad) {
      prevGameStartedRef.current = gameState.gameStarted;
      prevCurrentTeamRef.current = gameState.currentTeam;
      prevGameOverRef.current = gameState.gameOver;
      prevClueRef.current = gameState.currentClue?.word ?? null;
      return;
    }
    
    // Game Start transition
    if (gameState.gameStarted && !prevGameStartedRef.current) {
      const team = gameState.startingTeam;
      if (team === "red" || team === "blue") {
        setTransitionTeam(team);
        setShowGameStart(true);
        playSound("gameStart");
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
        playSound("turnChange");
      }
    }
    
    // Game Over transition
    if (gameState.gameOver && !prevGameOverRef.current) {
      const winner = gameState.winner;
      if (winner === "red" || winner === "blue") {
        // Dismiss any other overlays first
        setShowTurnChange(false);
        setShowGameStart(false);
        // Show game over
        setTransitionTeam(winner);
        setShowGameOver(true);
        playSound("gameOver");
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
