"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface GameContextValue {
  isLastPlayer: boolean;
  setIsLastPlayer: (value: boolean) => void;
  isActiveGame: boolean;
  setIsActiveGame: (value: boolean) => void;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [isLastPlayer, setIsLastPlayer] = useState(false);
  const [isActiveGame, setIsActiveGame] = useState(false);

  return (
    <GameContext.Provider value={{ isLastPlayer, setIsLastPlayer, isActiveGame, setIsActiveGame }}>
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
