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
  const currentModeRef = useRef<TickMode>("none");
  
  // Use ref to access soundContext in interval without it being a dependency
  const soundContextRef = useRef(soundContext);
  soundContextRef.current = soundContext;

  // Determine the tick mode based on time remaining
  const getTickMode = (time: number | null): TickMode => {
    if (time === null || time <= 0 || time > normalThreshold) return "none";
    if (time <= urgentThreshold) return "urgent";
    return "normal";
  };

  // Calculate current mode
  const shouldTick = 
    soundContext && 
    timeRemaining !== null && 
    !isPaused && 
    !isGameOver && 
    timeRemaining > 0 && 
    timeRemaining <= normalThreshold;
  
  const targetMode = shouldTick ? getTickMode(timeRemaining) : "none";

  // Single effect to handle all tick logic
  useEffect(() => {
    const prevMode = currentModeRef.current;
    
    // Helper to clear interval
    const clearTickInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // No change in mode - keep current interval running
    if (targetMode === prevMode) {
      return;
    }

    // Mode changed - clear old interval
    clearTickInterval();

    // If going to "none", stop sounds and exit
    if (targetMode === "none") {
      soundContextRef.current?.stopTickSounds();
      currentModeRef.current = "none";
      return;
    }

    const isUrgent = targetMode === "urgent";
    const interval = isUrgent ? urgentInterval : normalInterval;
    const soundName = isUrgent ? "tickUrgent" : "tick";

    // Stop previous tick sounds when switching modes
    if (prevMode !== "none") {
      soundContextRef.current?.stopTickSounds();
    }

    currentModeRef.current = targetMode;

    // Urgent tick sound is a long clip (20s). Play once and let it run.
    if (isUrgent) {
      if (soundContextRef.current?.soundEnabled) {
        soundContextRef.current.playSound(soundName);
      }
      return;
    }

    // Play first tick immediately (normal mode)
    if (soundContextRef.current?.soundEnabled) {
      soundContextRef.current.playSound(soundName);
    }

    // Set up interval for subsequent ticks (normal mode)
    intervalRef.current = setInterval(() => {
      if (soundContextRef.current?.soundEnabled) {
        soundContextRef.current.playSound(soundName);
      }
    }, interval);

    // Cleanup on unmount or before next effect run
    return clearTickInterval;
  }, [targetMode, normalInterval, urgentInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      soundContextRef.current?.stopTickSounds();
    };
  }, []);
}
