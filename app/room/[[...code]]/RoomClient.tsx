"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import TransitionOverlay from "@/components/TransitionOverlay";
import { useRtdbRoom } from "@/hooks/useRtdbRoom";
import { useGameTimer } from "@/hooks/useGameTimer";
import { useTransitionOverlays } from "@/hooks/useTransitionOverlays";
import { useTimerSound } from "@/hooks/useTimerSound";
import { useRoomDerivedState } from "@/hooks/useRoomDerivedState";
import { useSoundContextOptional, type MusicTrack } from "@/contexts/SoundContext";
import { LOCAL_STORAGE_AVATAR_KEY, getRandomAvatar } from "@/shared/constants";
import {
  RoomHeader,
  RoomClosedModal,
  JoinRoomForm,
  ConnectionStatus,
  GameView,
  LobbyView,
} from "@/components/room";
import OfflineBanner from "@/components/OfflineBanner";

export default function RoomPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Extract room code from pathname: /room/ABC123 -> ABC123
  const roomCode = pathname?.split("/room/")[1]?.split("/")[0] || "";
  const playerName = searchParams.get("name") || "";

  // Get avatar from localStorage (or random default)
  const [playerAvatar, setPlayerAvatar] = useState<string | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_AVATAR_KEY);
    if (stored) {
      setPlayerAvatar(stored);
    } else {
      const random = getRandomAvatar();
      setPlayerAvatar(random);
      localStorage.setItem(LOCAL_STORAGE_AVATAR_KEY, random);
    }
  }, []);

  // Custom hooks - only join room once avatar is loaded to prevent re-join race condition
  const room = useRtdbRoom(roomCode, playerName, playerAvatar || "");
  const timer = useGameTimer(room.gameState, room.handleEndTurn);
  const overlays = useTransitionOverlays(room.gameState);
  const derived = useRoomDerivedState(room.gameState, room.currentPlayer, room.players);
  
  // Timer tick sounds
  useTimerSound({
    timeRemaining: timer.timeRemaining,
    isPaused: room.gameState?.paused,
    isGameOver: room.gameState?.gameOver,
  });

  // Background music - changes based on game state
  const soundContext = useSoundContextOptional();
  useEffect(() => {
    if (!soundContext) return;
    
    const gameState = room.gameState;
    let track: MusicTrack = null;
    
    if (!gameState) {
      track = null;
    } else if (gameState.gameOver) {
      track = "victory";
    } else if (gameState.gameStarted) {
      // Select track based on turn duration
      const duration = gameState.turnDuration || 60;
      if (duration <= 30) {
        track = "game-30s";
      } else if (duration <= 60) {
        track = "game-60s";
      } else {
        track = "game-90s";
      }
    } else {
      // In lobby
      track = "lobby";
    }
    
    soundContext.setMusicTrack(track);
  }, [room.gameState?.gameStarted, room.gameState?.gameOver, room.gameState?.turnDuration, soundContext]);

  // Early returns for special states
  if (room.roomClosedReason) {
    return <RoomClosedModal reason={room.roomClosedReason} />;
  }

  if (!playerName) {
    return (
      <JoinRoomForm
        roomCode={roomCode}
        onJoin={(name, avatar) => {
          localStorage.setItem(LOCAL_STORAGE_AVATAR_KEY, avatar);
          router.replace(`/room/${roomCode}?name=${encodeURIComponent(name)}`);
        }}
      />
    );
  }

  if (!room.gameState) {
    return (
      <ConnectionStatus
        isConnecting={room.isConnecting}
        connectionError={room.connectionError}
      />
    );
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      {/* Transition Overlays */}
      {overlays.showGameStart && (
        <TransitionOverlay
          type="gameStart"
          team={overlays.transitionTeam}
          onComplete={overlays.dismissGameStart}
        />
      )}
      {overlays.showTurnChange && (
        <TransitionOverlay
          type="turnChange"
          team={overlays.transitionTeam}
          onComplete={overlays.dismissTurnChange}
        />
      )}
      {overlays.showGameOver && (
        <TransitionOverlay
          type="gameOver"
          team={overlays.transitionTeam}
          onComplete={overlays.dismissGameOver}
        />
      )}
      
      <div className="max-w-6xl mx-auto">
        <RoomHeader roomCode={roomCode} currentPlayer={room.currentPlayer} />
        <OfflineBanner />

        {room.gameState.gameStarted ? (
          <GameView 
            room={room} 
            derived={derived} 
            timer={timer}
            overlays={overlays}
          />
        ) : (
          <LobbyView 
            room={room} 
            derived={derived} 
          />
        )}
      </div>
    </main>
  );
}
