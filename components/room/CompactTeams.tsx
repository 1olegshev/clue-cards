import type { Player } from "@/shared/types";

interface CompactTeamsProps {
  players: Player[];
}

export default function CompactTeams({ players }: CompactTeamsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Teams</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {(["red", "blue"] as const).map((team) => {
          const spymaster = players.find(
            (player) => player.team === team && player.role === "spymaster"
          );
          const operatives = players.filter(
            (player) => player.team === team && player.role === "operative"
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
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`w-2 h-2 rounded-full ${
                    team === "red" ? "bg-red-500" : "bg-blue-500"
                  }`}></span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {spymaster?.name || "—"}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">(Spymaster)</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 pl-3.5">
                  Operatives: {operatives.map(p => p.name).join(", ") || "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
