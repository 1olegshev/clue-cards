"use client";

import type { ChatMessage, Player } from "@/shared/types";

interface ChatLogProps {
  messages: ChatMessage[];
  players?: Player[];
}

export default function ChatLog({ messages, players = [] }: ChatLogProps) {
  // Show both chat and system messages
  const chatMessages = messages.filter((msg) => msg.type === "chat" || msg.type === "system");

  // Helper to get avatar by playerId
  const getAvatar = (playerId?: string) => {
    if (!playerId) return null;
    const player = players.find((p) => p.id === playerId);
    return player?.avatar || null;
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 h-64 overflow-y-scroll scrollbar-thin">
      <h3 className="font-semibold mb-3">Chat</h3>
      <div className="space-y-2">
        {chatMessages.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No messages yet</p>
        ) : (
          chatMessages.map((msg) => {
            const avatar = getAvatar(msg.playerId);
            return (
              <div
                key={msg.id}
                className={`text-sm ${
                  msg.type === "system"
                    ? "bg-amber-100 dark:bg-amber-900/30 border-l-2 border-amber-500 pl-2 py-1 -mx-1 rounded-r"
                    : ""
                }`}
              >
                {msg.type === "system" ? (
                  <span className="text-amber-700 dark:text-amber-300 italic">
                    {msg.message}
                  </span>
                ) : (
                  <>
                    {avatar && <span className="mr-1">{avatar}</span>}
                    <span className="font-semibold">{msg.playerName}:</span>{" "}
                    <span>{msg.message}</span>
                  </>
                )}
                <span className="text-gray-400 text-xs ml-2">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
