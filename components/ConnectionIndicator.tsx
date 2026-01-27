"use client";

import { useFirebaseConnection } from "@/hooks/useFirebaseConnection";

/**
 * Indicator showing Firebase connection status in navbar.
 * Shows a small badge when disconnected.
 */
export default function ConnectionIndicator() {
  const connectionState = useFirebaseConnection();

  // Don't show anything while still determining connection status or when connected
  if (connectionState !== "disconnected") {
    return null;
  }

  return (
    <div 
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      title="Connection lost. Trying to reconnect..."
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
      </span>
      <span className="text-xs font-medium hidden sm:inline">Offline</span>
    </div>
  );
}
