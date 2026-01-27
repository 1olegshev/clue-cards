import { useEffect, useRef } from "react";
import { useSoundContextOptional } from "@/contexts/SoundContext";

interface UseTimerSoundOptions {
  /** Time remaining in seconds (null if timer not active) */
  timeRemaining: number | null;
  /** Whether the game is paused */
  isPaused?: boolean;
  /** Whether the game is over (stops all ticks immediately) */
  isGameOver?: boolean;
  /** Threshold below which normal ticking starts (default: 30 seconds) */
  normalThreshold?: number;
  /** Threshold below which urgent ticking starts (default: 10 seconds) */
  urgentThreshold?: number;
  /** Interval between normal ticks in ms (default: 2000ms) */
  normalInterval?: number;
  /** Interval between urgent ticks in ms (default: 500ms) */
  urgentInterval?: number;
}

type TickMode = "none" | "normal" | "urgent";

/**
 * Hook to play timer tick sounds based on remaining time.
 * - Normal tick: every 2s when time is between 10-30 seconds
 * - Urgent tick: every 0.5s when time is 10 seconds or less
 * - Sounds are stopped immediately on turn end, game over, or pause
 */
export function useTimerSound({
  timeRemaining,
  isPaused = false,
  isGameOver = false,
  normalThreshold = 30,
  urgentThreshold = 10,
  normalInterval = 2000,
  urgentInterval = 500,
}: UseTimerSoundOptions) {
  const soundContext = useSoundContextOptional();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevTimeRef = useRef<number | null>(null);
  const currentModeRef = useRef<TickMode>("none");

  // Determine the tick mode based on time remaining
  const getTickMode = (time: number | null): TickMode => {
    if (time === null || time <= 0 || time > normalThreshold) return "none";
    if (time <= urgentThreshold) return "urgent";
    return "normal";
  };

  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Check if time jumped up significantly (turn changed)
    if (timeRemaining !== null && prevTimeRef.current !== null) {
      if (timeRemaining > prevTimeRef.current + 5) {
        // Timer reset (new turn) - stop any playing tick sounds
        soundContext?.stopTickSounds();
        currentModeRef.current = "none";
      }
    }
    prevTimeRef.current = timeRemaining;

    // Determine if we should be ticking
    const shouldTick = 
      soundContext && 
      timeRemaining !== null && 
      !isPaused && 
      !isGameOver && 
      timeRemaining > 0 && 
      timeRemaining <= normalThreshold;

    const newMode = shouldTick ? getTickMode(timeRemaining) : "none";
    const prevMode = currentModeRef.current;

    // If mode changed to "none", stop sounds
    if (newMode === "none" && prevMode !== "none") {
      soundContext?.stopTickSounds();
      currentModeRef.current = "none";
      return;
    }

    if (newMode === "none") {
      return;
    }

    const isUrgent = newMode === "urgent";
    const interval = isUrgent ? urgentInterval : normalInterval;
    const soundName = isUrgent ? "tickUrgent" : "tick";

    // Only play immediately if we're transitioning INTO this mode
    // (prevents double-play when timeRemaining updates within the same mode)
    const isTransitioningIn = prevMode !== newMode;
    if (isTransitioningIn && soundContext) {
      soundContext.playSound(soundName);
    }

    currentModeRef.current = newMode;

    // Set up interval for subsequent ticks
    intervalRef.current = setInterval(() => {
      if (soundContext?.soundEnabled) {
        soundContext.playSound(soundName);
      }
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    timeRemaining,
    isPaused,
    isGameOver,
    normalThreshold,
    urgentThreshold,
    normalInterval,
    urgentInterval,
    soundContext,
  ]);

  // Stop tick sounds on unmount
  useEffect(() => {
    return () => {
      soundContext?.stopTickSounds();
    };
  }, [soundContext]);
}
