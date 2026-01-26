"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    router.push(`/room/${code}?name=${encodeURIComponent(playerName)}&create=true`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    router.push(`/room/${roomCode.toUpperCase()}?name=${encodeURIComponent(playerName)}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <h1 className="text-5xl font-bold text-center mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Clue Cards
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          A word guessing party game
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Name
            </label>
            <input
              id="name"
              data-testid="home-name-input"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating) {
                  handleCreateRoom();
                }
              }}
            />
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleCreateRoom}
              disabled={!playerName.trim() || isCreating}
              data-testid="home-create-btn"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              Create New Room
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span>
            </div>
          </div>

          <div>
            <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Room Code
            </label>
            <input
              id="roomCode"
              data-testid="home-code-input"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter room code"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white uppercase"
              maxLength={6}
              onKeyDown={(e) => {
                if (e.key === "Enter" && playerName.trim() && roomCode.trim()) {
                  handleJoinRoom();
                }
              }}
            />
          </div>

          <button
            onClick={handleJoinRoom}
            disabled={!playerName.trim() || !roomCode.trim()}
            data-testid="home-join-btn"
            className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            Join Room
          </button>
        </div>
      </div>
    </main>
  );
}


