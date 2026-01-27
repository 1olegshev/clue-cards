/**
 * Realtime Database room hook - composes smaller hooks for room management.
 * This is the main entry point that provides a unified API.
 */

import { useEffect } from "react";
import { useGameContext } from "@/components/GameContext";
import { useRoomConnection } from "./room/useRoomConnection";
import { useGameActions } from "./room/useGameActions";
import { useChatActions } from "./room/useChatActions";
import * as actions from "@/lib/rtdb-actions";
import { STALE_PLAYER_CHECK_INTERVAL_MS, STALE_PLAYER_GRACE_MS } from "@/shared/constants";
import type { GameState, Player, ChatMessage, RoomClosedReason, WordPack } from "@/shared/types";

export interface UseRtdbRoomReturn {
  gameState: GameState | null;
  players: Player[];
  currentPlayer: Player | null;
  messages: ChatMessage[];
  isConnecting: boolean;
  connectionError: string | null;
  connectedPlayerCount: number;
  roomClosedReason: RoomClosedReason | null;
  chatInput: string;
  setChatInput: (value: string) => void;
  isSendingChat: boolean;
  handleStartGame: () => void;
  handleSetLobbyRole: (team: "red" | "blue" | null, role: "clueGiver" | "guesser" | null, targetPlayerId?: string) => void;
  handleRandomizeTeams: () => void;
  handleRematch: () => void;
  handleEndGame: () => void;
  handleResumeGame: () => void;
  handleVoteCard: (index: number) => void;
  handleConfirmReveal: (index: number) => void;
  handleEndTurn: () => void;
  handleSendMessage: (e: React.FormEvent) => void;
  handleGiveClue: (word: string, count: number) => void;
  handleTurnDurationChange: (duration: number) => void;
  handleWordPackChange: (pack: WordPack) => void;
}

export function useRtdbRoom(
  roomCode: string,
  playerName: string,
  playerAvatar: string
): UseRtdbRoomReturn {
  const { setIsLastPlayer, setIsActiveGame, setLeaveRoom } = useGameContext();

  // Room connection and state
  const connection = useRoomConnection(roomCode, playerName, playerAvatar);

  // Game actions (uses ErrorContext internally)
  const gameActions = useGameActions(roomCode, connection.uid);

  // Chat actions
  const chatActions = useChatActions(roomCode, connection.uid);

  // Update GameContext with room state
  const isLast = connection.connectedPlayerCount === 1 && 
    !!connection.gameState?.gameStarted && 
    !connection.gameState?.gameOver;
  const isActive = !!connection.gameState?.gameStarted && !connection.gameState?.gameOver;

  useEffect(() => {
    setIsLastPlayer(isLast);
    setIsActiveGame(isActive);
    return () => {
      setIsLastPlayer(false);
      setIsActiveGame(false);
    };
  }, [isLast, isActive, setIsLastPlayer, setIsActiveGame]);

  // Set up leaveRoom callback for Navbar
  useEffect(() => {
    console.log("[useRtdbRoom] Setting up leaveRoom callback", { 
      roomCode, 
      uid: connection.uid?.slice(0, 8),
      hasUid: !!connection.uid 
    });
    
    const leaveRoomFn = async () => {
      console.log("[Room] leaveRoom called", { uid: connection.uid, roomCode });
      if (connection.uid && roomCode) {
        await actions.leaveRoom(roomCode, connection.uid);
        console.log("[Room] leaveRoom completed");
      } else {
        console.warn("[Room] leaveRoom skipped - missing uid or roomCode");
      }
    };
    setLeaveRoom(leaveRoomFn);
    
    return () => {
      console.log("[useRtdbRoom] Cleanup: clearing leaveRoom callback");
      setLeaveRoom(async () => {});
    };
  }, [roomCode, connection.uid, setLeaveRoom]);

  // Owner-only cleanup: demote stale disconnected players to spectators
  // Runs in all phases (lobby, active game, paused, game over) to keep player list clean
  useEffect(() => {
    if (!connection.uid || !roomCode || !connection.gameState) return;
    if (connection.gameState.ownerId !== connection.uid) return;

    let intervalId: NodeJS.Timeout | null = null;

    const runCleanup = () => {
      actions
        .pruneStalePlayers(roomCode, connection.uid!, STALE_PLAYER_GRACE_MS)
        .catch((err) => {
          console.warn("[Room] Failed to prune stale players:", err.message);
        });
    };

    runCleanup();
    intervalId = setInterval(runCleanup, STALE_PLAYER_CHECK_INTERVAL_MS);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [connection.uid, roomCode, connection.gameState?.ownerId]);

  return {
    // Connection state
    gameState: connection.gameState,
    players: connection.players,
    currentPlayer: connection.currentPlayer,
    messages: connection.messages,
    isConnecting: connection.isConnecting,
    connectionError: connection.connectionError,
    connectedPlayerCount: connection.connectedPlayerCount,
    roomClosedReason: connection.roomClosedReason,
    
    // Chat
    chatInput: chatActions.chatInput,
    setChatInput: chatActions.setChatInput,
    isSendingChat: chatActions.isSending,
    handleSendMessage: chatActions.handleSendMessage,
    
    // Game actions
    handleStartGame: gameActions.handleStartGame,
    handleSetLobbyRole: gameActions.handleSetLobbyRole,
    handleRandomizeTeams: gameActions.handleRandomizeTeams,
    handleRematch: gameActions.handleRematch,
    handleEndGame: gameActions.handleEndGame,
    handleResumeGame: gameActions.handleResumeGame,
    handleVoteCard: gameActions.handleVoteCard,
    handleConfirmReveal: gameActions.handleConfirmReveal,
    handleEndTurn: gameActions.handleEndTurn,
    handleGiveClue: gameActions.handleGiveClue,
    handleTurnDurationChange: gameActions.handleTurnDurationChange,
    handleWordPackChange: gameActions.handleWordPackChange,
  };
}
