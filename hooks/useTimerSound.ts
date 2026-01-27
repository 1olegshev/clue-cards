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

/**
 * Hook to play timer tick sounds based on remaining time.
 * - Normal tick: every 2s when time is between 10-30 seconds
 * - Urgent tick: every 0.5s when time is 10 seconds or less
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
  const lastTickTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't tick if no sound context, timer not active, paused, or game over
    if (!soundContext || timeRemaining === null || isPaused || isGameOver) {
      return;
    }

    // Don't tick if time is above normal threshold
    if (timeRemaining > normalThreshold) {
      return;
    }

    // Don't tick if time is 0 or negative
    if (timeRemaining <= 0) {
      return;
    }

    const isUrgent = timeRemaining <= urgentThreshold;
    const interval = isUrgent ? urgentInterval : normalInterval;
    const soundName = isUrgent ? "tickUrgent" : "tick";

    // Play immediately if we haven't ticked recently
    const now = Date.now();
    if (now - lastTickTimeRef.current >= interval) {
      soundContext.playSound(soundName);
      lastTickTimeRef.current = now;
    }

    // Set up interval for subsequent ticks
    intervalRef.current = setInterval(() => {
      // Re-check if sound is still enabled (could change mid-interval)
      if (soundContext.soundEnabled) {
        soundContext.playSound(soundName);
        lastTickTimeRef.current = Date.now();
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

  // Reset last tick time when timer resets (goes from null to a value, or increases significantly)
  const prevTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (timeRemaining !== null && prevTimeRef.current !== null) {
      // If time increased by more than 5 seconds, timer probably reset
      if (timeRemaining > prevTimeRef.current + 5) {
        lastTickTimeRef.current = 0;
      }
    }
    prevTimeRef.current = timeRemaining;
  }, [timeRemaining]);
}
