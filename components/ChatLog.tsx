"use client";

import type { ChatMessage } from "@/shared/types";

interface ChatLogProps {
  messages: ChatMessage[];
}

export default function ChatLog({ messages }: ChatLogProps) {
  const chatMessages = messages.filter((msg) => msg.type === "chat");

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto">
      <h3 className="font-semibold mb-3">Chat</h3>
      <div className="space-y-2">
        {chatMessages.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No messages yet</p>
        ) : (
          chatMessages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="font-semibold">{msg.playerName}:</span>{" "}
              <span>{msg.message}</span>
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
