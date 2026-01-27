"use client";

import { useFirebaseConnection } from "@/hooks/useFirebaseConnection";

/**
 * Prominent banner showing when Firebase connection is lost.
 * Designed to be shown in the game room for clear visibility.
 */
export default function OfflineBanner() {
  const connectionState = useFirebaseConnection();

  // Only show when disconnected (not during initial load or when connected)
  if (connectionState !== "disconnected") {
    return null;
  }

  return (
    <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 flex items-center gap-3">
      <div className="relative flex h-3 w-3 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Connection lost
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Trying to reconnect... Your actions may not sync until connection is restored.
        </p>
      </div>
    </div>
  );
}
