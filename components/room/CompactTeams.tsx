import type { Player } from "@/shared/types";

interface CompactTeamsProps {
  players: Player[];
  currentPlayerId?: string | null;
  isRoomOwner?: boolean;
  onAddSpectator?: (team: "red" | "blue", playerId: string) => void;
}

export default function CompactTeams({ players, currentPlayerId, isRoomOwner, onAddSpectator }: CompactTeamsProps) {
  // Spectators are players without a team or role
  const spectators = players.filter((p) => !p.team || !p.role);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Teams</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
              className={`rounded-lg border p-3 ${
                team === "red"
                  ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                  : "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20"
              }`}
            >
              <div className={`text-xs font-bold uppercase mb-2 ${
                team === "red" ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
              }`}>
                {team} Team
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <svg className="w-3 h-3 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className={`font-medium truncate ${
                    clueGiver?.id === currentPlayerId 
                      ? "text-yellow-600 dark:text-yellow-400" 
                      : "text-gray-800 dark:text-gray-200"
                  }`}>
                    {clueGiver?.name || "—"}{clueGiver?.id === currentPlayerId ? " (you)" : ""}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <svg className="w-3 h-3 shrink-0 mt-0.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                    {guessers.length === 0 ? (
                      <span>—</span>
                    ) : (
                      guessers.map((p, i) => (
                        <span key={p.id} className={`whitespace-nowrap ${
                          p.id === currentPlayerId 
                            ? "text-yellow-600 dark:text-yellow-400 font-medium" 
                            : ""
                        }`}>
                          {p.name}{p.id === currentPlayerId ? " (you)" : ""}{i < guessers.length - 1 ? "," : ""}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spectators section */}
      {spectators.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Spectators ({spectators.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {spectators.map((p) => (
              <div
                key={p.id}
                className={`text-xs px-2 py-1 rounded-lg flex items-center gap-2 ${
                  p.id === currentPlayerId
                    ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                <span>{p.name}{p.id === currentPlayerId ? " (you)" : ""}</span>
                {isRoomOwner && onAddSpectator && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => onAddSpectator("red", p.id)}
                      className="px-1.5 py-0.5 rounded bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700"
                      title="Add to Red team"
                    >
                      +R
                    </button>
                    <button
                      onClick={() => onAddSpectator("blue", p.id)}
                      className="px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-300 dark:hover:bg-blue-700"
                      title="Add to Blue team"
                    >
                      +B
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
