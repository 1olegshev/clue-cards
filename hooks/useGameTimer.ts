import { useEffect, useState, useRef } from "react";
import type { GameState } from "@/shared/types";

export interface UseGameTimerReturn {
  timeRemaining: number | null;
}

export function useGameTimer(
  gameState: GameState | null,
  onTimeout: () => void
): UseGameTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutCalledForTurnRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    // Don't run timer when game is paused
    if (gameState?.gameStarted && gameState.turnStartTime && !gameState.gameOver && !gameState.paused) {
      // Reset the timeout flag when a new turn starts
      if (timeoutCalledForTurnRef.current !== gameState.turnStartTime) {
        timeoutCalledForTurnRef.current = null;
      }

      const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - gameState.turnStartTime!) / 1000);
        const remaining = Math.max(0, gameState.turnDuration - elapsed);
        setTimeRemaining(remaining);
        
        // Only call onTimeout once per turn
        if (remaining === 0 && timeoutCalledForTurnRef.current !== gameState.turnStartTime) {
          timeoutCalledForTurnRef.current = gameState.turnStartTime;
          onTimeout();
        }
      };

      updateTimer();
      timerIntervalRef.current = setInterval(updateTimer, 1000);
    } else if (gameState?.paused) {
      // Keep showing current time when paused (don't reset to null)
    } else {
      setTimeRemaining(null);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [gameState?.turnStartTime, gameState?.turnDuration, gameState?.gameStarted, gameState?.gameOver, gameState?.paused, onTimeout]);

  return { timeRemaining };
}
