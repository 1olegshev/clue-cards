"use client";

import type { Card, Player, Team } from "@/shared/types";

interface PlayerStats {
  player: Player;
  correctGuesses: number;
  wrongGuesses: number;
  assassinHit: boolean;
}

interface GameStatsProps {
  board: Card[];
  players: Player[];
  winner: Team | null;
}

export default function GameStats({ board, players, winner }: GameStatsProps) {
  // Calculate stats for each operative
  const playerStats: PlayerStats[] = players
    .filter((p) => p.role === "operative")
    .map((player) => {
      const revealedCards = board.filter((card) => card.revealedBy === player.id);
      const correctGuesses = revealedCards.filter((card) => card.team === player.team).length;
      const wrongGuesses = revealedCards.filter(
        (card) => card.team !== player.team && card.team !== "assassin"
      ).length;
      const assassinHit = revealedCards.some((card) => card.team === "assassin");

      return {
        player,
        correctGuesses,
        wrongGuesses,
        assassinHit,
      };
    })
    .sort((a, b) => {
      // Sort by correct guesses (desc), then by wrong guesses (asc)
      if (b.correctGuesses !== a.correctGuesses) {
        return b.correctGuesses - a.correctGuesses;
      }
      return a.wrongGuesses - b.wrongGuesses;
    });

  // Get top 5 players (or all if less than 5)
  const topPlayers = playerStats.slice(0, 5);

  // Calculate team stats
  const redCards = board.filter((c) => c.team === "red");
  const blueCards = board.filter((c) => c.team === "blue");
  const redRevealed = redCards.filter((c) => c.revealed).length;
  const blueRevealed = blueCards.filter((c) => c.revealed).length;

  // Check if assassin was hit
  const assassinHit = board.some((c) => c.team === "assassin" && c.revealed);

  const getMedalEmoji = (index: number) => {
    switch (index) {
      case 0: return "🥇";
      case 1: return "🥈";
      case 2: return "🥉";
      default: return `#${index + 1}`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Game Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-lg p-4 text-center ${
          winner === "red" 
            ? "bg-red-100 dark:bg-red-900/40 border-2 border-red-400" 
            : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
        }`}>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">
            {redRevealed}/{redCards.length}
          </div>
          <div className="text-sm text-red-600 dark:text-red-400">
            Red Cards Revealed
          </div>
          {winner === "red" && (
            <div className="mt-2 text-lg font-semibold text-red-700 dark:text-red-300">
              🏆 Winner!
            </div>
          )}
        </div>
        <div className={`rounded-lg p-4 text-center ${
          winner === "blue" 
            ? "bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400" 
            : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
        }`}>
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {blueRevealed}/{blueCards.length}
          </div>
          <div className="text-sm text-blue-600 dark:text-blue-400">
            Blue Cards Revealed
          </div>
          {winner === "blue" && (
            <div className="mt-2 text-lg font-semibold text-blue-700 dark:text-blue-300">
              🏆 Winner!
            </div>
          )}
        </div>
      </div>

      {/* Assassin indicator */}
      {assassinHit && (
        <div className="bg-gray-900 text-white rounded-lg p-3 text-center">
          <span className="text-lg">💀</span> Assassin was revealed - instant loss!
        </div>
      )}

      {/* Top Players */}
      {topPlayers.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Top Operatives
          </h4>
          <div className="space-y-2">
            {topPlayers.map((stat, index) => (
              <div
                key={stat.player.id}
                className={`flex items-center justify-between p-2 rounded-lg ${
                  stat.player.team === "red"
                    ? "bg-red-50 dark:bg-red-900/20"
                    : "bg-blue-50 dark:bg-blue-900/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg w-8">{getMedalEmoji(index)}</span>
                  <span className={`font-medium ${
                    stat.player.team === "red" 
                      ? "text-red-800 dark:text-red-200" 
                      : "text-blue-800 dark:text-blue-200"
                  }`}>
                    {stat.player.name}
                  </span>
                  {stat.assassinHit && (
                    <span className="text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded" title="Hit the assassin">
                      💀
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    ✓ {stat.correctGuesses}
                  </span>
                  {stat.wrongGuesses > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      ✗ {stat.wrongGuesses}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {playerStats.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No cards were revealed by operatives.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
