"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import useSound from "use-sound";
import { Howl, Howler } from "howler";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { 
  LOCAL_STORAGE_SOUND_MUTED_KEY, 
  LOCAL_STORAGE_SOUND_VOLUME_KEY,
  LOCAL_STORAGE_MUSIC_ENABLED_KEY,
} from "@/shared/constants";

export type SoundName = "gameStart" | "turnChange" | "gameOver" | "tick" | "tickUrgent" | "cardReveal";
export type MusicTrack = "lobby" | "game-30s" | "game-60s" | "game-90s" | "victory" | null;

// Music plays at 30% of master volume
const MUSIC_VOLUME_RATIO = 0.3;

// Track if audio context has been unlocked
let audioContextUnlocked = false;

/**
 * Unlock the Web Audio context on first user interaction.
 * Browsers block audio playback until user interacts with the page.
 */
function unlockAudioContext(): Promise<void> {
  if (audioContextUnlocked) return Promise.resolve();

  // Howler exposes the audio context - resume it
  const ctx = Howler.ctx;
  if (ctx && ctx.state === "suspended") {
    return ctx.resume().then(() => {
      audioContextUnlocked = true;
    });
  }

  audioContextUnlocked = true;
  return Promise.resolve();
}

interface SoundContextValue {
  // Sound effects
  volume: number;
  setVolume: (volume: number) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  toggleMute: () => void;
  soundEnabled: boolean;
  playSound: (name: SoundName) => void;
  stopTickSounds: () => void;
  // Background music
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
  playCardReveal: () => void;
  stopTick: () => void;
  stopTickUrgent: () => void;
} | null } = { current: null };

/**
 * Stable inner component that captures use-sound hooks.
 * Defined outside SoundProvider to maintain component identity when props change.
 * This prevents remounting children when volume/soundEnabled changes.
 * 
 * NOTE: We always pass soundEnabled: true to use-sound hooks so Howl instances
 * are always ready to play. The actual mute/enable logic is handled in playSound().
 * This fixes issues where sounds don't work after page refresh until toggled.
 */
function PlayFunctionCapture({ 
  children, 
  volume, 
}: { 
  children: ReactNode; 
  volume: number; 
}) {
  // use-sound hooks for audio files
  // Always enabled - mute logic handled in playSound()
  const [playGameStart] = useSound("/sounds/game-start.mp3", { 
    volume: volume * 0.7,
  });
  
  const [playTurnChange] = useSound("/sounds/turn-change.mp3", { 
    volume: volume * 0.5,
  });
  
  const [playGameOver] = useSound("/sounds/game-over.mp3", { 
    volume: volume * 0.6,
  });

  // Realistic clock tick sounds - interrupt prevents overlapping
  // Also expose stop functions to immediately halt playback
  const [playTick, { stop: stopTick }] = useSound("/sounds/tick.mp3", { 
    volume: volume * 0.5,
    interrupt: true,
  });
  
  // Urgent tick - distinct electronic beep for clear urgency
  const [playTickUrgent, { stop: stopTickUrgent }] = useSound("/sounds/tick-urgent.mp3", { 
    volume: volume * 0.4,
    interrupt: true,
  });

  // Card reveal - subtle flick sound
  const [playCardReveal] = useSound("/sounds/card-reveal.mp3", { 
    volume: volume * 0.3,
    interrupt: true,
  });

  // Update shared ref when play functions change
  useEffect(() => {
    playFunctionsRef.current = { 
      playGameStart, playTurnChange, playGameOver, 
      playTick, playTickUrgent, playCardReveal,
      stopTick, stopTickUrgent,
    };
  }, [playGameStart, playTurnChange, playGameOver, playTick, playTickUrgent, playCardReveal, stopTick, stopTickUrgent]);

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

// Session storage key for audio unlock state (survives page reloads within session)
const SESSION_AUDIO_UNLOCKED_KEY = "cluecards_audio_unlocked";

// Check sessionStorage synchronously for SSR safety
function getInitialAudioUnlocked(): boolean {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem(SESSION_AUDIO_UNLOCKED_KEY) === "true";
  }
  return false;
}

export function SoundProvider({ children }: { children: ReactNode }) {
  // Sound effects state
  const [volume, setVolumeState] = useState(0.5);
  const [isMuted, setIsMutedState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  // Initialize from sessionStorage - if user interacted before, flag is already set
  const [audioUnlocked, setAudioUnlocked] = useState(getInitialAudioUnlocked);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Music state (volume derived from master volume)
  const [musicEnabled, setMusicEnabledState] = useState(false);
  const [currentTrack, setCurrentTrackState] = useState<MusicTrack>(null);
  const howlRef = useRef<Howl | null>(null);

  // Computed music volume (30% of master volume)
  const musicVolume = volume * MUSIC_VOLUME_RATIO;

  // Unlock audio context on first user interaction (browser autoplay policy)
  // Also proactively resume if already unlocked from sessionStorage
  useEffect(() => {
    // If already unlocked from sessionStorage, just resume audio context
    if (audioUnlocked) {
      unlockAudioContext();
      return;
    }

    const events = ["click", "touchstart", "keydown"];
    
    const handleInteraction = () => {
      // Set unlocked and persist to sessionStorage (survives page reloads)
      setAudioUnlocked(true);
      sessionStorage.setItem(SESSION_AUDIO_UNLOCKED_KEY, "true");
      unlockAudioContext();
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
    
    events.forEach(event => {
      document.addEventListener(event, handleInteraction, { once: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, [audioUnlocked]);

  // Load from localStorage on mount
  useEffect(() => {
    const storedVolume = localStorage.getItem(LOCAL_STORAGE_SOUND_VOLUME_KEY);
    const storedMuted = localStorage.getItem(LOCAL_STORAGE_SOUND_MUTED_KEY);
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

  // Store musicVolume in a ref so we can use it in the playback effect without it being a dependency
  const musicVolumeRef = useRef(musicVolume);
  useEffect(() => {
    musicVolumeRef.current = musicVolume;
  }, [musicVolume]);

  // Handle music playback based on track, enabled state, and reduced motion
  // NOTE: musicVolume is NOT in dependencies - volume changes are handled by separate effect below
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
    if (!currentTrack || !musicEnabled || !isHydrated || prefersReducedMotion || !audioUnlocked) {
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

    // Play and fade in to current volume (use ref to get latest value)
    howl.play();
    howl.fade(0, musicVolumeRef.current, 1000);

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
  }, [currentTrack, musicEnabled, isHydrated, prefersReducedMotion, audioUnlocked]);

  // Update volume when musicVolume changes (without recreating/restarting howl)
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
      case "cardReveal":
        playFunctionsRef.current?.playCardReveal();
        break;
    }
  }, [soundEnabled]);

  // Stop all tick sounds immediately (used on turn/game state changes)
  const stopTickSounds = useCallback(() => {
    playFunctionsRef.current?.stopTick();
    playFunctionsRef.current?.stopTickUrgent();
  }, []);

  return (
    <SoundContext.Provider value={{
      volume,
      setVolume,
      isMuted,
      setIsMuted,
      toggleMute,
      soundEnabled,
      playSound,
      stopTickSounds,
      musicEnabled,
      setMusicEnabled,
      toggleMusic,
      currentTrack,
      setMusicTrack,
    }}>
      <PlayFunctionCapture volume={volume}>
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
