"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import useSound from "use-sound";
import { Howl } from "howler";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { 
  LOCAL_STORAGE_SOUND_MUTED_KEY, 
  LOCAL_STORAGE_SOUND_VOLUME_KEY,
  LOCAL_STORAGE_MUSIC_VOLUME_KEY,
  LOCAL_STORAGE_MUSIC_ENABLED_KEY,
} from "@/shared/constants";

export type SoundName = "gameStart" | "turnChange" | "gameOver" | "tick" | "tickUrgent";
export type MusicTrack = "lobby" | "game-30s" | "game-60s" | "game-90s" | "victory" | null;

interface SoundContextValue {
  // Sound effects
  volume: number;
  setVolume: (volume: number) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  toggleMute: () => void;
  soundEnabled: boolean;
  playSound: (name: SoundName) => void;
  // Background music
  musicVolume: number;
  setMusicVolume: (volume: number) => void;
  musicEnabled: boolean;
  setMusicEnabled: (enabled: boolean) => void;
  toggleMusic: () => void;
  currentTrack: MusicTrack;
  setMusicTrack: (track: MusicTrack) => void;
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

// Music track paths
const MUSIC_TRACKS: Record<Exclude<MusicTrack, null>, string> = {
  "lobby": "/sounds/music/lobby.mp3",
  "game-30s": "/sounds/music/game-30s.mp3",
  "game-60s": "/sounds/music/game-60s.mp3",
  "game-90s": "/sounds/music/game-90s.mp3",
  "victory": "/sounds/music/victory.mp3",
};

export function SoundProvider({ children }: { children: ReactNode }) {
  // Sound effects state
  const [volume, setVolumeState] = useState(0.5);
  const [isMuted, setIsMutedState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Music state
  const [musicVolume, setMusicVolumeState] = useState(0.3);
  const [musicEnabled, setMusicEnabledState] = useState(false);
  const [currentTrack, setCurrentTrackState] = useState<MusicTrack>(null);
  const howlRef = useRef<Howl | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const storedVolume = localStorage.getItem(LOCAL_STORAGE_SOUND_VOLUME_KEY);
    const storedMuted = localStorage.getItem(LOCAL_STORAGE_SOUND_MUTED_KEY);
    const storedMusicVolume = localStorage.getItem(LOCAL_STORAGE_MUSIC_VOLUME_KEY);
    const storedMusicEnabled = localStorage.getItem(LOCAL_STORAGE_MUSIC_ENABLED_KEY);
    
    if (storedVolume !== null) {
      const parsed = parseFloat(storedVolume);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        setVolumeState(parsed);
      }
    }
    
    if (storedMuted !== null) {
      setIsMutedState(storedMuted === "true");
    }

    if (storedMusicVolume !== null) {
      const parsed = parseFloat(storedMusicVolume);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        setMusicVolumeState(parsed);
      }
    }

    if (storedMusicEnabled !== null) {
      setMusicEnabledState(storedMusicEnabled === "true");
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

  // Music volume
  const setMusicVolume = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setMusicVolumeState(clamped);
    localStorage.setItem(LOCAL_STORAGE_MUSIC_VOLUME_KEY, String(clamped));
    // Update current howl volume
    if (howlRef.current) {
      howlRef.current.volume(clamped);
    }
  }, []);

  // Music enabled toggle
  const setMusicEnabled = useCallback((enabled: boolean) => {
    setMusicEnabledState(enabled);
    localStorage.setItem(LOCAL_STORAGE_MUSIC_ENABLED_KEY, String(enabled));
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicEnabled(!musicEnabled);
  }, [musicEnabled, setMusicEnabled]);

  // Set music track
  const setMusicTrack = useCallback((track: MusicTrack) => {
    setCurrentTrackState(track);
  }, []);

  // Handle music playback based on track, enabled state, and reduced motion
  useEffect(() => {
    // Stop current music if exists
    if (howlRef.current) {
      howlRef.current.fade(howlRef.current.volume(), 0, 500);
      const oldHowl = howlRef.current;
      setTimeout(() => {
        oldHowl.stop();
        oldHowl.unload();
      }, 500);
      howlRef.current = null;
    }

    // Don't play if no track, music disabled, not hydrated, or user prefers reduced motion
    if (!currentTrack || !musicEnabled || !isHydrated || prefersReducedMotion) {
      return;
    }

    // Create new Howl for the track
    const howl = new Howl({
      src: [MUSIC_TRACKS[currentTrack]],
      loop: true,
      volume: 0,
      html5: true, // Better for long audio files
    });

    howlRef.current = howl;

    // Play and fade in
    howl.play();
    howl.fade(0, musicVolume, 1000);

    // Cleanup on unmount or track change
    return () => {
      if (howl.playing()) {
        howl.fade(howl.volume(), 0, 300);
        setTimeout(() => {
          howl.stop();
          howl.unload();
        }, 300);
      }
    };
  }, [currentTrack, musicEnabled, isHydrated, prefersReducedMotion, musicVolume]);

  // Update volume when musicVolume changes (without recreating howl)
  useEffect(() => {
    if (howlRef.current && musicEnabled && isHydrated) {
      howlRef.current.volume(musicVolume);
    }
  }, [musicVolume, musicEnabled, isHydrated]);

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
      musicVolume,
      setMusicVolume,
      musicEnabled,
      setMusicEnabled,
      toggleMusic,
      currentTrack,
      setMusicTrack,
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
