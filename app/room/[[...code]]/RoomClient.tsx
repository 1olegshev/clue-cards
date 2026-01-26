"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";
import type { GameState } from "@/shared/types";
import GameBoard from "@/components/GameBoard";
import ChatLog from "@/components/ChatLog";
import ClueHistory from "@/components/ClueHistory";
import TransitionOverlay from "@/components/TransitionOverlay";
import { useFirestoreRoom } from "@/hooks/useFirestoreRoom";
import { useGameTimer } from "@/hooks/useGameTimer";
import { useTransitionOverlays } from "@/hooks/useTransitionOverlays";
import {
  RoomHeader,
  GameStatusPanel,
  TeamLobby,
  CompactTeams,
  RoomClosedModal,
  JoinRoomForm,
  ConnectionStatus,
} from "@/components/room";

export default function RoomPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Extract room code from pathname: /room/ABC123 -> ABC123
  const roomCode = pathname?.split("/room/")[1]?.split("/")[0] || "";
  const playerName = searchParams.get("name") || "";

  // Debug logging
  console.log("RoomClient:", { pathname, roomCode, playerName });

  // Custom hooks
  const room = useFirestoreRoom(roomCode, playerName);
  const timer = useGameTimer(room.gameState, room.handleEndTurn);
  const overlays = useTransitionOverlays(room.gameState);

  // Derived state
  const isMyTurn = useMemo(() => {
    return Boolean(
      room.gameState?.gameStarted &&
      room.currentPlayer?.team === room.gameState.currentTeam &&
      room.currentPlayer?.role === "operative"
    );
  }, [room.gameState, room.currentPlayer]);

  const isRoomOwner = useMemo(() => {
    return Boolean(room.currentPlayer?.id && room.gameState?.ownerId === room.currentPlayer.id);
  }, [room.currentPlayer, room.gameState]);

  const canVote = useMemo(() => {
    return Boolean(
      isMyTurn &&
      room.gameState?.currentClue &&
      (room.gameState.remainingGuesses ?? 0) > 0 &&
      !room.gameState?.gameOver &&
      !room.gameState?.paused
    );
  }, [isMyTurn, room.gameState]);

  const canGiveClue = useMemo(() => {
    return Boolean(
      room.gameState?.gameStarted &&
      !room.gameState?.gameOver &&
      !room.gameState?.paused &&
      room.currentPlayer?.role === "spymaster" &&
      room.currentPlayer?.team === room.gameState?.currentTeam &&
      !room.gameState?.currentClue
    );
  }, [room.gameState, room.currentPlayer]);

  const operativeCount = useMemo(() => {
    if (!room.gameState) return 0;
    return room.players.filter(
      (player) => player.team === room.gameState?.currentTeam && player.role === "operative"
    ).length;
  }, [room.gameState, room.players]);

  const requiredVotes = useMemo(() => {
    return operativeCount <= 1 ? 1 : Math.min(3, Math.ceil(operativeCount / 2));
  }, [operativeCount]);

  const turnGlowClass = useMemo(() => {
    return room.gameState?.currentTeam === "red"
      ? "shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
      : "shadow-[0_0_0_1px_rgba(59,130,246,0.25)]";
  }, [room.gameState?.currentTeam]);

  // Early returns
  if (room.roomClosedReason) {
    return <RoomClosedModal reason={room.roomClosedReason} />;
  }

  if (!playerName) {
    return (
      <JoinRoomForm
        roomCode={roomCode}
        onJoin={(name) => router.replace(`/room/${roomCode}?name=${encodeURIComponent(name)}`)}
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

        {/* Game Board - Show first when game is active */}
        {room.gameState.gameStarted && (
          <>
            <GameStatusPanel
              gameState={room.gameState}
              timeRemaining={timer.timeRemaining}
              isMyTurn={isMyTurn}
              isRoomOwner={isRoomOwner}
              canGiveClue={canGiveClue}
              clueAnimating={overlays.clueAnimating}
              players={room.players}
              onEndTurn={room.handleEndTurn}
              onEndGame={room.handleEndGame}
              onResumeGame={room.handleResumeGame}
              onRematch={room.handleRematch}
              onGiveClue={room.handleGiveClue}
            />

            {/* Board and Chat */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 ${turnGlowClass}`}>
                  <GameBoard
                    board={room.gameState.board}
                    currentPlayer={room.currentPlayer}
                    cardVotes={room.gameState.cardVotes}
                    currentPlayerId={room.currentPlayer?.id ?? null}
                    requiredVotes={requiredVotes}
                    canVote={canVote}
                    onVoteCard={room.handleVoteCard}
                    onConfirmReveal={room.handleConfirmReveal}
                  />
                  
                  {/* Player/Team indicator below board - only show if player has team */}
                  {room.currentPlayer?.team && room.currentPlayer?.role && (
                    <div className="mt-4 flex justify-center">
                      <div className={`inline-flex items-center gap-3 px-5 py-3 rounded-xl border-2 shadow-sm ${
                        room.currentPlayer.team === "red" 
                          ? "bg-red-50 dark:bg-red-900/30 border-red-400 dark:border-red-600" 
                          : "bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600"
                      }`}>
                        <span className={`text-xs font-medium uppercase tracking-wide ${
                          room.currentPlayer.team === "red" ? "text-red-500 dark:text-red-400" : "text-blue-500 dark:text-blue-400"
                        }`}>
                          You are
                        </span>
                        <span className={`font-bold text-lg ${
                          room.currentPlayer.team === "red" ? "text-red-700 dark:text-red-200" : "text-blue-700 dark:text-blue-200"
                        }`}>
                          {room.currentPlayer.team.toUpperCase()} {room.currentPlayer.role === "spymaster" ? "Spymaster" : "Operative"}
                        </span>
                        <span className={`text-sm ${
                          room.currentPlayer.team === "red" ? "text-red-600 dark:text-red-300" : "text-blue-600 dark:text-blue-300"
                        }`}>
                          ({room.currentPlayer.name})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                  <ClueHistory clues={room.messages} />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                  <ChatLog messages={room.messages} />
                  <form onSubmit={room.handleSendMessage} className="mt-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={room.chatInput}
                        onChange={(e) => room.setChatInput(e.target.value)}
                        placeholder="Type message..."
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={!room.chatInput.trim()}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            <CompactTeams players={room.players} />
          </>
        )}

        {/* Lobby - Full Teams Section (Before Game Starts) */}
        {!room.gameState.gameStarted && (
          <TeamLobby
            players={room.players}
            currentPlayer={room.currentPlayer}
            isRoomOwner={isRoomOwner}
            gameState={room.gameState}
            onSetRole={room.handleSetLobbyRole}
            onRandomize={room.handleRandomizeTeams}
            onStartGame={room.handleStartGame}
            onTurnDurationChange={room.handleTurnDurationChange}
            showControls={true}
          />
        )}

        {/* Game Over - Show Full Teams for Rematch */}
        {room.gameState.gameStarted && room.gameState.gameOver && (
          <TeamLobby
            players={room.players}
            currentPlayer={room.currentPlayer}
            isRoomOwner={isRoomOwner}
            gameState={room.gameState}
            onSetRole={room.handleSetLobbyRole}
            onRandomize={room.handleRandomizeTeams}
            onStartGame={room.handleStartGame}
            onTurnDurationChange={room.handleTurnDurationChange}
            showControls={false}
          />
        )}
      </div>
    </main>
  );
}
