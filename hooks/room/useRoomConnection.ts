/**
 * Room connection hook - manages real-time subscriptions and presence.
 * Uses onDisconnect for reliable presence detection.
 * Monitors .info/connected to restore presence after reconnection.
 */

import { useEffect, useState, useRef } from "react";
import { ref, onValue, query, orderByChild, limitToLast, off, DatabaseReference, update, serverTimestamp } from "firebase/database";
import { getDatabase } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import * as actions from "@/lib/rtdb-actions";
import { toGameState, toPlayers, toMessages, PlayerData, GameState, Player, ChatMessage, RoomClosedReason, FirebaseRoomData } from "./types";

export interface UseRoomConnectionReturn {
  gameState: GameState | null;
  players: Player[];
  currentPlayer: Player | null;
  messages: ChatMessage[];
  isConnecting: boolean;
  connectionError: string | null;
  setConnectionError: (error: string | null) => void;
  connectedPlayerCount: number;
  roomClosedReason: RoomClosedReason | null;
  uid: string | null;
}

export function useRoomConnection(
  roomCode: string,
  playerName: string,
  playerAvatar: string
): UseRoomConnectionReturn {
  const { uid, isLoading: authLoading } = useAuth();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectedPlayerCount, setConnectedPlayerCount] = useState(0);
  const [roomClosedReason, setRoomClosedReason] = useState<RoomClosedReason | null>(null);

  const roomDataRef = useRef<FirebaseRoomData | null>(null);
  const playersDataRef = useRef<Record<string, PlayerData> | null>(null);
  const disconnectRefRef = useRef<DatabaseReference | null>(null);
  const wasConnectedRef = useRef<boolean | null>(null);

  // Main effect: join room and set up listeners
  useEffect(() => {
    // Wait for auth to be ready and all required params
    if (authLoading || !uid || !playerName || !roomCode || !playerAvatar) return;

    const db = getDatabase();
    if (!db) {
      setConnectionError("Database not initialized");
      setIsConnecting(false);
      return;
    }

    // Use AbortController pattern to prevent operations after cleanup
    let isCleanedUp = false;

    setIsConnecting(true);
    setConnectionError(null);

    const playerId = uid;

    const roomRef = ref(db, `rooms/${roomCode}`);
    const playersRef = ref(db, `rooms/${roomCode}/players`);
    const messagesRef = ref(db, `rooms/${roomCode}/messages`);
    const connectedRef = ref(db, ".info/connected");

    let roomExists = false;

    const rebuild = () => {
      if (isCleanedUp) return;
      const playersList = toPlayers(playersDataRef.current);
      setPlayers(playersList);
      setCurrentPlayer(playersList.find((p) => p.id === playerId) || null);
      setGameState(roomDataRef.current ? toGameState(roomCode, roomDataRef.current, playersList) : null);
    };

    // Room listener
    const unsubRoom = onValue(roomRef, (snap) => {
      if (isCleanedUp) return;
      if (!snap.exists()) {
        if (roomExists) {
          setRoomClosedReason("allPlayersLeft");
          roomDataRef.current = null;
          setGameState(null);
        }
        return;
      }
      roomExists = true;
      roomDataRef.current = snap.val();
      rebuild();
    }, (err) => {
      if (isCleanedUp) return;
      setConnectionError(err.message);
      setIsConnecting(false);
    });

    // Players listener - also updates onDisconnect behavior based on player count
    let lastConnectedCount = -1;
    const unsubPlayers = onValue(playersRef, (snap) => {
      if (isCleanedUp) return;
      const data = snap.val() as Record<string, PlayerData> | null;
      playersDataRef.current = data;
      
      const connected = data
        ? Object.values(data).filter((p) => p.connected).length
        : 0;
      setConnectedPlayerCount(connected);
      rebuild();
      
      // Update onDisconnect behavior when connected count changes
      if (connected !== lastConnectedCount && playerId) {
        lastConnectedCount = connected;
        actions.updateDisconnectBehavior(roomCode, playerId, connected).catch((err) => {
          // Log but don't show to user - this is a background operation
          console.warn("[Room] Failed to update disconnect behavior:", err.message);
        });
        
        // Fix race condition: Only try to reassign owner if this player could become owner
        // (i.e., they are the first connected player alphabetically by ID)
        if (data) {
          const connectedPlayerIds = Object.entries(data)
            .filter(([, p]) => p.connected)
            .map(([id]) => id)
            .sort();
          
          // Only the first connected player (by ID order) should attempt reassignment
          if (connectedPlayerIds[0] === playerId) {
            actions.reassignOwnerIfNeeded(roomCode).catch((err) => {
              // Log but don't show to user - this is a background operation
              console.warn("[Room] Failed to reassign owner:", err.message);
            });
          }
        }
      }
    });

    // Messages listener (limited to last 100)
    const messagesQuery = query(messagesRef, orderByChild("timestamp"), limitToLast(100));
    const unsubMessages = onValue(messagesQuery, (snap) => {
      if (isCleanedUp) return;
      setMessages(toMessages(snap.val()));
    });

    // Connection listener - restore presence after reconnection
    // When Firebase connection drops, onDisconnect marks us as disconnected.
    // When it reconnects, we need to re-mark ourselves as connected.
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (isCleanedUp) return;
      const isConnected = snap.val() === true;
      
      // Only act on reconnection (was disconnected, now connected)
      // Skip the initial connection since joinRoom handles that
      if (wasConnectedRef.current === false && isConnected) {
        const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
        update(playerRef, {
          connected: true,
          lastSeen: serverTimestamp(),
        }).catch((err) => {
          console.warn("[Room] Failed to restore presence after reconnection:", err.message);
        });
        
        // Re-establish onDisconnect handler after reconnection
        // Calculate connected count from current players data (using ref to avoid stale closure)
        const currentConnected = playersDataRef.current
          ? Object.values(playersDataRef.current).filter((p) => p.connected).length + 1 // +1 for ourselves reconnecting
          : 1;
        actions.updateDisconnectBehavior(roomCode, playerId, currentConnected).catch((err) => {
          console.warn("[Room] Failed to update disconnect behavior after reconnection:", err.message);
        });
      }
      
      wasConnectedRef.current = isConnected;
    });

    // Join room and set up onDisconnect
    actions.joinRoom(roomCode, playerId, playerName, playerAvatar)
      .then(({ disconnectRef }) => {
        if (isCleanedUp) return;
        disconnectRefRef.current = disconnectRef;
        setIsConnecting(false);
      })
      .catch((e) => {
        if (isCleanedUp) return;
        setConnectionError(e.message || "Failed to join");
        setIsConnecting(false);
      });

    return () => {
      // Mark as cleaned up to prevent any further state updates
      isCleanedUp = true;
      
      off(roomRef);
      off(playersRef);
      off(messagesRef);
      off(connectedRef);
      
      // Reset connection tracking ref
      wasConnectedRef.current = null;
      
      // Explicitly leave room on navigation
      // Log errors but don't block cleanup - user is already navigating away
      if (playerId) {
        actions.leaveRoom(roomCode, playerId).catch((err) => {
          console.warn("[Room] Failed to leave room cleanly:", err.message);
        });
      }
    };
  }, [roomCode, playerName, playerAvatar, uid, authLoading]);

  return {
    gameState,
    players,
    currentPlayer,
    messages,
    isConnecting,
    connectionError,
    setConnectionError,
    connectedPlayerCount,
    roomClosedReason,
    uid,
  };
}
