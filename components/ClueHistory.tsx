"use client";

import type { ChatMessage } from "@/shared/types";

interface ClueHistoryProps {
  clues: ChatMessage[];
}

export default function ClueHistory({ clues }: ClueHistoryProps) {
  const clueMessages = clues.filter((msg) => msg.type === "clue");

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 h-48 overflow-y-scroll scrollbar-thin">
      <h3 className="font-semibold mb-3">Clue History</h3>
      <div className="space-y-2">
        {clueMessages.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No clues yet</p>
        ) : (
          clueMessages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="font-semibold text-blue-600 dark:text-blue-400">{msg.playerName}:</span>{" "}
              <span className="text-blue-700 dark:text-blue-300 font-medium text-base">
                {msg.message}
              </span>
              <span className="text-gray-400 text-xs ml-2">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
