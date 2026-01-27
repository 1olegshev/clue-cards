import { useState } from "react";
import type { GameState, Player } from "@/shared/types";
import GameStats from "@/components/GameStats";
import ClueInput from "./ClueInput";

interface GameStatusPanelProps {
  gameState: GameState;
  timeRemaining: number | null;
  isMyTurn: boolean;
  isRoomOwner: boolean;
  canGiveClue: boolean;
  clueAnimating: boolean;
  players: Player[];
  showGameOverOverlay?: boolean;
  onEndTurn: () => void;
  onEndGame: () => void;
  onResumeGame: () => void;
  onRematch?: () => void;
  onGiveClue: (word: string, count: number) => void;
}

export default function GameStatusPanel({
  gameState,
  timeRemaining,
  isMyTurn,
  isRoomOwner,
  canGiveClue,
  clueAnimating,
  players,
  showGameOverOverlay = false,
  onEndTurn,
  onEndGame,
  onResumeGame,
  onRematch,
  onGiveClue,
}: GameStatusPanelProps) {
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const turnHighlightClass = gameState.currentTeam === "red"
    ? "border-red-400 bg-red-50/70 dark:bg-red-900/20"
    : "border-blue-400 bg-blue-50/70 dark:bg-blue-900/20";
  
  const turnBannerClass = gameState.currentTeam === "red"
    ? "bg-red-team text-white"
    : "bg-blue-team text-white";

  // Calculate remaining cards for each team
  const redRemaining = gameState.board.filter(
    (card) => card.team === "red" && !card.revealed
  ).length;
  const blueRemaining = gameState.board.filter(
    (card) => card.team === "blue" && !card.revealed
  ).length;

  return (
    <div className={`border-2 rounded-2xl shadow-xl overflow-hidden mb-4 ${turnHighlightClass}`}>
      {/* Turn indicator banner */}
      {!gameState.gameOver && (
        <div className={`px-4 py-2 flex items-center justify-center gap-2 ${turnBannerClass}`}>
          <span className="font-bold text-lg uppercase tracking-wide">
            {gameState.currentTeam} Team's Turn
          </span>
          {!gameState.currentClue && (
            <span className="text-sm opacity-90">— Waiting for clue</span>
          )}
          {gameState.currentClue && (
            <span className="text-sm opacity-90">— Guessing</span>
          )}
        </div>
      )}
      <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Score display */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded font-bold ${
              gameState.currentTeam === "red" ? "bg-red-team text-white" : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
            }`}>
              Red: {redRemaining}
            </span>
            <span className={`px-3 py-1 rounded font-bold ${
              gameState.currentTeam === "blue" ? "bg-blue-team text-white" : "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
            }`}>
              Blue: {blueRemaining}
            </span>
          </div>
          {timeRemaining !== null && (
            <div className={`
              text-lg font-mono flex items-center gap-2
              ${gameState.paused ? "text-amber-600 dark:text-amber-400" : ""}
              ${!gameState.paused && timeRemaining <= 10 && timeRemaining > 0 ? "timer-urgent text-red-600 font-bold" : ""}
            `}>
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
              {gameState.paused && (
                <span className="text-xs font-semibold bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded">
                  PAUSED
                </span>
              )}
            </div>
          )}
          {gameState.currentClue && (
            <div className={`
              flex items-center gap-3 bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-400 dark:border-amber-600 rounded-lg px-4 py-2
              ${clueAnimating ? "clue-announce" : ""}
            `}>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">Clue</span>
              <span className="font-bold text-xl text-amber-900 dark:text-amber-100">{gameState.currentClue.word}</span>
              <span className="bg-amber-600 text-white text-sm font-bold px-2 py-0.5 rounded-full">{gameState.currentClue.count}</span>
              {gameState.remainingGuesses !== null && (
                <span className="text-sm text-amber-700 dark:text-amber-300 ml-2">
                  {gameState.remainingGuesses} guess{gameState.remainingGuesses !== 1 ? 'es' : ''} left
                </span>
              )}
            </div>
          )}
          {gameState.remainingGuesses !== null && !gameState.currentClue && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Guesses left: {gameState.remainingGuesses}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isMyTurn && (
            <button
              onClick={onEndTurn}
              data-testid="game-end-turn-btn"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-all"
            >
              End Turn
            </button>
          )}
          {isRoomOwner && !gameState.gameOver && (
            <button
              onClick={() => setShowEndGameModal(true)}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-all"
            >
              End Game
            </button>
          )}
        </div>
      </div>
      
      {/* Game Paused Banner */}
      {gameState.paused && (() => {
        // Check if conditions are met to resume
        const pausedTeam = gameState.pausedForTeam;
        const teamPlayers = players.filter((p) => p.team === pausedTeam);
        const hasClueGiver = teamPlayers.some((p) => p.role === "clueGiver");
        const hasGuesser = teamPlayers.some((p) => p.role === "guesser");
        const canResume = hasClueGiver && hasGuesser;
        
        return (
          <div className="bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-600 rounded-lg p-4 text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-lg font-bold text-amber-800 dark:text-amber-200">Game Paused</span>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
              {gameState.pauseReason === "teamDisconnected" && (
                <>{gameState.pausedForTeam?.toUpperCase()} team has no connected players. Waiting for reconnection...</>
              )}
              {gameState.pauseReason === "clueGiverDisconnected" && (
                <>{gameState.pausedForTeam?.toUpperCase()} team clue giver disconnected. Waiting for reconnection...</>
              )}
              {gameState.pauseReason === "noGuessers" && (
                <>{gameState.pausedForTeam?.toUpperCase()} team has no connected guessers. Waiting for reconnection...</>
              )}
            </p>
            {isRoomOwner && (
              <div className="mt-2">
                {canResume ? (
                  <button
                    onClick={onResumeGame}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-all"
                  >
                    Resume Game
                  </button>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Need {pausedTeam} team clue giver and at least one guesser to resume
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })()}
      
      {gameState.gameStarted && !gameState.gameOver && !gameState.paused && !gameState.currentClue && !canGiveClue && (
        <div className={`rounded-lg p-3 text-center mb-4 border-2 ${
          gameState.currentTeam === "red"
            ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700"
            : "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
        }`}>
          <p className={`text-sm font-medium ${
            gameState.currentTeam === "red"
              ? "text-red-800 dark:text-red-200"
              : "text-blue-800 dark:text-blue-200"
          }`}>
            ⏳ Waiting for {gameState.currentTeam} team clue giver to give a clue...
          </p>
        </div>
      )}
      
      {gameState.gameOver && !showGameOverOverlay && (
        <div data-testid="game-over-panel" className="bg-white dark:bg-gray-800 border-2 border-yellow-400 rounded-lg p-6">
          <h3 data-testid="game-winner-text" className="text-2xl font-bold text-center mb-6">
            🎮 Game Over! {gameState.winner?.toUpperCase()} Team Wins!
          </h3>
          
          {/* Game Stats */}
          <GameStats 
            board={gameState.board} 
            players={players} 
            winner={gameState.winner}
          />
          
          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            {isRoomOwner && (
              <div className="flex items-center justify-center gap-3">
                {onRematch && (
                  <button
                    onClick={onRematch}
                    data-testid="game-rematch-btn"
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-all"
                  >
                    Rematch
                  </button>
                )}
                <button
                  onClick={onEndGame}
                  className="bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-all"
                >
                  Back to Lobby
                </button>
              </div>
            )}
            {!isRoomOwner && (
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Waiting for room owner to start rematch or return to lobby...
              </p>
            )}
          </div>
        </div>
      )}
      
      {canGiveClue && (
        <ClueInput gameState={gameState} onGiveClue={onGiveClue} />
      )}
      </div>

      {/* End Game Confirmation Modal */}
      {showEndGameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowEndGameModal(false)}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <svg 
                  className="w-6 h-6 text-red-600 dark:text-red-400"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                End Game?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                This will end the current game for all players and return everyone to the lobby.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndGameModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEndGameModal(false);
                    onEndGame();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  End Game
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
