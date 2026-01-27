"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
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

// Web Audio API synthesizer for timer ticks only
class TickSynthesizer {
  private audioContext: AudioContext | null = null;
  private initialized = false;

  init() {
    if (this.initialized) return;
    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.initialized = true;
    } catch {
      console.warn("Web Audio API not supported");
    }
  }

  private createTone(frequency: number, duration: number, volume: number) {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    const now = this.audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // Normal tick: Soft, low click
  playTick(volume: number) {
    this.init();
    this.createTone(800, 0.05, volume * 0.08);
  }

  // Urgent tick: Higher, sharper
  playTickUrgent(volume: number) {
    this.init();
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    // Two-tone for urgency
    this.createTone(1200, 0.06, volume * 0.12);
    
    // Add second higher tone
    const osc2 = this.audioContext.createOscillator();
    const gain2 = this.audioContext.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1500, now);
    gain2.gain.setValueAtTime(volume * 0.06, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc2.connect(gain2);
    gain2.connect(this.audioContext.destination);
    osc2.start(now);
    osc2.stop(now + 0.04);
  }
}

// Ref to store play functions (shared between components)
const playFunctionsRef: { current: {
  playGameStart: () => void;
  playTurnChange: () => void;
  playGameOver: () => void;
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

  // Update shared ref when play functions change
  useEffect(() => {
    playFunctionsRef.current = { playGameStart, playTurnChange, playGameOver };
  }, [playGameStart, playTurnChange, playGameOver]);

  return <>{children}</>;
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [volume, setVolumeState] = useState(0.5);
  const [isMuted, setIsMutedState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const tickSynthesizerRef = useRef<TickSynthesizer | null>(null);

  // Initialize tick synthesizer
  useEffect(() => {
    tickSynthesizerRef.current = new TickSynthesizer();
  }, []);

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
        tickSynthesizerRef.current?.playTick(volume);
        break;
      case "tickUrgent":
        tickSynthesizerRef.current?.playTickUrgent(volume);
        break;
    }
  }, [soundEnabled, volume]);

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
