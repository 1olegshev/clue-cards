import { useState, FormEvent } from "react";

interface JoinRoomFormProps {
  roomCode: string;
  onJoin: (name: string) => void;
}

export default function JoinRoomForm({ roomCode, onJoin }: JoinRoomFormProps) {
  const [pendingName, setPendingName] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = pendingName.trim();
    if (!trimmed) return;
    onJoin(trimmed);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center">Join Room</h1>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
          Enter your name to join room {roomCode}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="roomName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Name
            </label>
            <input
              id="roomName"
              type="text"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!pendingName.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Join Room
          </button>
        </form>
      </div>
    </main>
  );
}
