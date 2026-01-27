"use client";

import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { getDatabase } from "@/lib/firebase";

type ConnectionState = "connected" | "disconnected" | "unknown";

/**
 * Indicator showing Firebase connection status.
 * Uses Firebase's .info/connected path for real-time connection monitoring.
 */
export default function ConnectionIndicator() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("unknown");

  useEffect(() => {
    const db = getDatabase();
    if (!db) {
      setConnectionState("disconnected");
      return;
    }

    // Firebase special path that indicates connection status
    const connectedRef = ref(db, ".info/connected");
    
    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        setConnectionState("connected");
      } else {
        setConnectionState("disconnected");
      }
    });

    return () => unsubscribe();
  }, []);

  // Don't show anything while still determining connection status
  if (connectionState === "unknown") {
    return null;
  }

  // Only show indicator when disconnected
  if (connectionState === "connected") {
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
