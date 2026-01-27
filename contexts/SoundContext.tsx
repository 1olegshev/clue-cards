"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import useSound from "use-sound";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { LOCAL_STORAGE_SOUND_MUTED_KEY, LOCAL_STORAGE_SOUND_VOLUME_KEY } from "@/shared/constants";

export type SoundName = "gameStart" | "turnChange" | "gameOver" | "tick" | "tickUrgent";

interface SoundContextValue {
  volume: number;
  setVolume: (volume: number) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  toggleMute: () => void;
  soundEnabled: boolean;
  playSound: (name: SoundName) => void;
}

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

// Ref to store play functions (shared between components)
const playFunctionsRef: { current: {
  playGameStart: () => void;
  playTurnChange: () => void;
  playGameOver: () => void;
  playTick: () => void;
  playTickUrgent: () => void;
} | null } = { current: null };

/**
 * Stable inner component that captures use-sound hooks.
 * Defined outside SoundProvider to maintain component identity when props change.
 * This prevents remounting children when volume/soundEnabled changes.
 */
function PlayFunctionCapture({ 
  children, 
  volume, 
  soundEnabled 
}: { 
  children: ReactNode; 
  volume: number; 
  soundEnabled: boolean;
}) {
  // use-sound hooks for audio files
  const [playGameStart] = useSound("/sounds/game-start.mp3", { 
    volume: volume * 0.7,
    soundEnabled,
  });
  
  const [playTurnChange] = useSound("/sounds/turn-change.mp3", { 
    volume: volume * 0.5,
    soundEnabled,
  });
  
  const [playGameOver] = useSound("/sounds/game-over.mp3", { 
    volume: volume * 0.6,
    soundEnabled,
  });

  // Realistic clock tick sounds - interrupt prevents overlapping
  const [playTick] = useSound("/sounds/tick.mp3", { 
    volume: volume * 0.5,
    soundEnabled,
    interrupt: true,
  });
  
  // Urgent tick - distinct electronic beep for clear urgency
  const [playTickUrgent] = useSound("/sounds/tick-urgent.mp3", { 
    volume: volume * 0.4,
    soundEnabled,
    interrupt: true,
  });

  // Update shared ref when play functions change
  useEffect(() => {
    playFunctionsRef.current = { playGameStart, playTurnChange, playGameOver, playTick, playTickUrgent };
  }, [playGameStart, playTurnChange, playGameOver, playTick, playTickUrgent]);

  return <>{children}</>;
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [volume, setVolumeState] = useState(0.5);
  const [isMuted, setIsMutedState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Load from localStorage on mount
  useEffect(() => {
    const storedVolume = localStorage.getItem(LOCAL_STORAGE_SOUND_VOLUME_KEY);
    const storedMuted = localStorage.getItem(LOCAL_STORAGE_SOUND_MUTED_KEY);
    
    if (storedVolume !== null) {
      const parsed = parseFloat(storedVolume);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        setVolumeState(parsed);
      }
    }
    
    if (storedMuted !== null) {
      setIsMutedState(storedMuted === "true");
    }
    
    setIsHydrated(true);
  }, []);

  // Persist volume to localStorage
  const setVolume = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clamped);
    localStorage.setItem(LOCAL_STORAGE_SOUND_VOLUME_KEY, String(clamped));
  }, []);

  // Persist muted state to localStorage
  const setIsMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    localStorage.setItem(LOCAL_STORAGE_SOUND_MUTED_KEY, String(muted));
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted, setIsMuted]);

  // Sound is enabled if not muted AND user doesn't prefer reduced motion
  const soundEnabled = isHydrated && !isMuted && !prefersReducedMotion;

  const playSound = useCallback((name: SoundName) => {
    if (!soundEnabled) return;
    
    switch (name) {
      case "gameStart":
        playFunctionsRef.current?.playGameStart();
        break;
      case "turnChange":
        playFunctionsRef.current?.playTurnChange();
        break;
      case "gameOver":
        playFunctionsRef.current?.playGameOver();
        break;
      case "tick":
        playFunctionsRef.current?.playTick();
        break;
      case "tickUrgent":
        playFunctionsRef.current?.playTickUrgent();
        break;
    }
  }, [soundEnabled]);

  return (
    <SoundContext.Provider value={{
      volume,
      setVolume,
      isMuted,
      setIsMuted,
      toggleMute,
      soundEnabled,
      playSound,
    }}>
      <PlayFunctionCapture volume={volume} soundEnabled={soundEnabled}>
        {children}
      </PlayFunctionCapture>
    </SoundContext.Provider>
  );
}

export function useSoundContext() {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error("useSoundContext must be used within a SoundProvider");
  }
  return context;
}

// Optional hook that returns undefined if not in a SoundProvider
export function useSoundContextOptional() {
  return useContext(SoundContext);
}
