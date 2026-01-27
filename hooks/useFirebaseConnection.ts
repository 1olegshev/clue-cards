/**
 * Hook for monitoring Firebase Realtime Database connection status.
 * Uses Firebase's .info/connected path for real-time connection monitoring.
 */

import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { getDatabase } from "@/lib/firebase";

export type ConnectionState = "connected" | "disconnected" | "unknown";

export function useFirebaseConnection(): ConnectionState {
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

  return connectionState;
}
