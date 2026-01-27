import type { GameState, Player, WordPack } from "@/shared/types";

interface TeamLobbyProps {
  players: Player[];
  currentPlayer: Player | null;
  isRoomOwner: boolean;
  gameState: GameState;
  onSetRole: (team: "red" | "blue" | null, role: "clueGiver" | "guesser" | null, targetPlayerId?: string) => void;
  onRandomize: () => void;
  onStartGame: () => void;
  onTurnDurationChange: (duration: number) => void;
  onWordPackChange: (pack: WordPack) => void;
  onResumeGame?: () => void;
  showControls?: boolean; // Hide start button in rematch mode
}

const turnOptions = [
  { label: "Short (30s)", value: 30 },
  { label: "Medium (60s)", value: 60 },
  { label: "Long (90s)", value: 90 },
];

const wordPackOptions: { label: string; value: WordPack }[] = [
  { label: "Classic", value: "classic" },
  { label: "Kahoot!", value: "kahoot" },
];

export default function TeamLobby({
  players,
  currentPlayer,
  isRoomOwner,
  gameState,
  onSetRole,
  onRandomize,
  onStartGame,
  onTurnDurationChange,
  onWordPackChange,
  onResumeGame,
  showControls = true,
}: TeamLobbyProps) {
  // Check if game is paused (mid-game role reassignment mode)
  const isPaused = gameState.gameStarted && gameState.paused && !gameState.gameOver;
  
  // Check if the paused team has required roles filled
  const pausedTeam = gameState.pausedForTeam;
  const pausedTeamPlayers = players.filter((p) => p.team === pausedTeam);
  const hasClueGiver = pausedTeamPlayers.some((p) => p.role === "clueGiver");
  const hasGuesser = pausedTeamPlayers.some((p) => p.role === "guesser");
  const canResume = hasClueGiver && hasGuesser;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
      {/* Paused state header */}
      {isPaused && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-semibold">Game Paused - Assign Roles</h2>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                {gameState.pauseReason === "clueGiverDisconnected" && (
                  <>The {pausedTeam} team needs a clue giver to continue</>
                )}
                {gameState.pauseReason === "noGuessers" && (
                  <>The {pausedTeam} team needs at least one guesser to continue</>
                )}
                {gameState.pauseReason === "teamDisconnected" && (
                  <>The {pausedTeam} team needs players to continue</>
                )}
              </p>
            </div>
            {isRoomOwner && onResumeGame && (
              <button
                onClick={onResumeGame}
                disabled={!canResume}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Resume Game
              </button>
            )}
          </div>
        </div>
      )}

      {/* Normal lobby header */}
      {showControls && !isPaused && (
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h2 className="text-xl font-semibold">Teams ({players.length}/8)</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Words:</span>
              {isRoomOwner ? (
                <select
                  value={gameState.wordPack}
                  onChange={(e) => onWordPackChange(e.target.value as WordPack)}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                >
                  {wordPackOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {gameState.wordPack === "kahoot" ? "Kahoot!" : "Classic"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Turn:</span>
              {isRoomOwner ? (
                <select
                  value={gameState.turnDuration}
                  onChange={(e) => onTurnDurationChange(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                >
                  {turnOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {gameState.turnDuration}s
                </span>
              )}
            </div>
            {isRoomOwner && (
              <button
                onClick={onRandomize}
                disabled={players.length < 4}
                data-testid="lobby-randomize-btn"
                className="bg-gray-200 text-gray-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
              >
                Randomize
              </button>
            )}
            {isRoomOwner && showControls ? (
              <button
                onClick={onStartGame}
                disabled={players.filter((p) => p.team && p.role).length < 4}
                data-testid="lobby-start-btn"
                className="bg-green-600 text-white px-4 py-1.5 sm:px-6 sm:py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
              >
                Start Game
              </button>
            ) : showControls ? (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Only the room owner can start the game
              </span>
            ) : null}
          </div>
        </div>
      )}

      {!showControls && !isPaused && (
        <h2 className="text-xl font-semibold mb-4">Teams - Ready for Rematch</h2>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {(["red", "blue"] as const).map((team) => {
          const clueGiver = players.find(
            (player) => player.team === team && player.role === "clueGiver"
          );
          const guessers = players.filter(
            (player) => player.team === team && player.role === "guesser"
          );

          return (
            <div
              key={team}
              className={`rounded-xl border-2 p-4 shadow-sm ${
                team === "red"
                  ? "border-red-400 bg-white dark:bg-gray-900"
                  : "border-blue-400 bg-white dark:bg-gray-900"
              }`}
            >
              <h3 className={`text-lg font-semibold mb-3 ${
                team === "red" ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
              }`}>
                {team.toUpperCase()} TEAM
              </h3>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="font-semibold">Clue Giver</span>
                  </div>
                  {showControls && (
                    <button
                      onClick={() => onSetRole(team, "clueGiver")}
                      disabled={Boolean(clueGiver) && clueGiver?.id !== currentPlayer?.id}
                      data-testid={`lobby-join-${team}-clueGiver`}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        clueGiver?.id === currentPlayer?.id
                          ? "bg-gray-800 text-white"
                          : team === "red"
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Join
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 ml-6">Sees all cards • Gives one-word clues</p>
                <div className={`rounded-lg p-3 text-sm border ${
                  clueGiver?.id === currentPlayer?.id
                    ? "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600"
                    : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                }`}>
                  {clueGiver ? (
                    <div className={`font-medium truncate flex items-center gap-2 ${
                      clueGiver.id === currentPlayer?.id ? "text-yellow-700 dark:text-yellow-300" : ""
                    }`}>
                      <span className="text-lg">{clueGiver.avatar}</span>
                      <span>{clueGiver.name}{clueGiver.id === currentPlayer?.id ? " (you)" : ""}</span>
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Open</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="font-semibold">Guessers</span>
                  </div>
                  {showControls && (
                    <button
                      onClick={() => onSetRole(team, "guesser")}
                      data-testid={`lobby-join-${team}-guesser`}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        team === "red"
                          ? "bg-red-100 text-red-800 hover:bg-red-200"
                          : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                      }`}
                    >
                      Join
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 ml-6">Guess words based on clues</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {guessers.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No guessers yet</div>
                  ) : (
                    guessers.map((player) => (
                      <div key={player.id} className={`rounded-lg px-3 py-2 text-sm border flex items-center gap-2 ${
                        player.id === currentPlayer?.id
                          ? "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 font-medium"
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      }`}>
                        <span className="text-lg">{player.avatar}</span>
                        <span className="truncate">{player.name}{player.id === currentPlayer?.id ? " (you)" : ""}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {currentPlayer?.team === team && showControls && (
                <button
                  onClick={() => onSetRole(null, null)}
                  className="px-3 py-1 rounded text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Leave Team
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(showControls || isPaused) && (
        <>
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3">All Players</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {players.map((player) => (
                <div key={player.id} className={`rounded-lg px-3 py-2 text-sm border min-w-0 ${
                  player.id === currentPlayer?.id
                    ? "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600"
                    : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                }`}>
                  <div className={`font-medium flex items-center gap-2 ${
                    player.id === currentPlayer?.id ? "text-yellow-700 dark:text-yellow-300" : ""
                  }`}>
                    <span className="text-lg">{player.avatar}</span>
                    <span className="truncate">{player.name}{player.id === currentPlayer?.id ? " (you)" : ""}</span>
                  </div>
                  {player.team && player.role && (
                    <div className={`text-xs mt-1 ml-7 ${
                      player.team === "red" ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                    }`}>
                      {player.team} {player.role === "clueGiver" ? "clue giver" : "guesser"}
                    </div>
                  )}
                  {!player.team || !player.role ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
                      {isPaused ? "Spectator" : "No team selected"}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {!isPaused && players.filter(p => p.team && p.role).length < 4 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              Waiting for {4 - players.filter(p => p.team && p.role).length} more player{4 - players.filter(p => p.team && p.role).length !== 1 ? "s" : ""} to join teams...
            </p>
          )}
        </>
      )}
    </div>
  );
}
