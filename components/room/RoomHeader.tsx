import { useState } from "react";
import type { Player } from "@/shared/types";

interface RoomHeaderProps {
  roomCode: string;
  currentPlayer: Player | null;
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }
  
  // Fallback: create temporary textarea
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch (err) {
    console.error("Failed to copy:", err);
    return false;
  }
}

export default function RoomHeader({ roomCode, currentPlayer }: RoomHeaderProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyRoomCode = async () => {
    const success = await copyToClipboard(roomCode);
    if (success) {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleShareRoom = async () => {
    const roomUrl = `${window.location.origin}/room/${roomCode}`;
    const success = await copyToClipboard(roomUrl);
    if (success) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 mb-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Room:{" "}
            </h1>
            <button
              onClick={handleCopyRoomCode}
              className="text-2xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hover:opacity-80 cursor-pointer transition-opacity"
              title="Click to copy room code"
            >
              {roomCode}
            </button>
          </div>
          <button
            onClick={handleShareRoom}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-all"
            title="Copy room URL"
          >
            {copiedUrl ? (
              <>
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-600">URL Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>Share Room</span>
              </>
            )}
          </button>
          {codeCopied && (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
              Code copied!
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {currentPlayer?.team && (
            <span className={`px-2 py-1 rounded text-white text-xs ${
              currentPlayer.team === "red" ? "bg-red-600" : "bg-blue-600"
            }`}>
              {currentPlayer.name} • {currentPlayer.team} {currentPlayer.role}
            </span>
          )}
          {!currentPlayer?.team && (
            <span className="text-gray-600 dark:text-gray-400 text-sm">
              {currentPlayer?.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
