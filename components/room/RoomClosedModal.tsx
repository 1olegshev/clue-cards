import { useRouter } from "next/navigation";
import type { RoomClosedReason } from "@/shared/types";

interface RoomClosedModalProps {
  reason: RoomClosedReason;
}

export default function RoomClosedModal({ reason }: RoomClosedModalProps) {
  const router = useRouter();

  const reasonMessages: Record<string, { title: string; message: string }> = {
    abandoned: {
      title: "Game Abandoned",
      message: "All players left the game and no one reconnected in time. The game has ended.",
    },
    allPlayersLeft: {
      title: "Room Closed",
      message: "All players have left the room.",
    },
    timeout: {
      title: "Session Expired",
      message: "The game session has expired due to inactivity.",
    },
  };

  const { title, message } = reasonMessages[reason] || {
    title: "Room Closed",
    message: "This room is no longer available.",
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
          <svg 
            className="w-8 h-8 text-amber-600 dark:text-amber-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        <button
          onClick={() => router.push("/")}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all"
        >
          Return to Home
        </button>
      </div>
    </main>
  );
}
