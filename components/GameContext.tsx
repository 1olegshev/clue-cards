"use client";

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from "react";

interface GameContextValue {
  isLastPlayer: boolean;
  setIsLastPlayer: (value: boolean) => void;
  isActiveGame: boolean;
  setIsActiveGame: (value: boolean) => void;
  // Leave room callback - set by useRtdbRoom, called by Navbar before navigation
  leaveRoom: () => Promise<void>;
  setLeaveRoom: (fn: () => Promise<void>) => void;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [isLastPlayer, setIsLastPlayer] = useState(false);
  const [isActiveGame, setIsActiveGame] = useState(false);
  const leaveRoomRef = useRef<() => Promise<void>>(async () => {});
  
  const setLeaveRoom = useCallback((fn: () => Promise<void>) => {
    leaveRoomRef.current = fn;
  }, []);
  
  const leaveRoom = useCallback(async () => {
    await leaveRoomRef.current();
  }, []);

  return (
    <GameContext.Provider value={{ 
      isLastPlayer, setIsLastPlayer, 
      isActiveGame, setIsActiveGame,
      leaveRoom, setLeaveRoom 
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGameContext must be used within a GameProvider");
  }
  return context;
}

// Optional hook that returns undefined if not in a GameProvider
export function useGameContextOptional() {
  return useContext(GameContext);
}
