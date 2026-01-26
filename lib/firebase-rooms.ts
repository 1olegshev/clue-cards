import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getFirestore } from "./firebase";
import type { GameState } from "@/shared/types";

export interface RoomSnapshot {
  roomCode: string;
  state: GameState;
  lastUpdated: any; // Firestore Timestamp
  createdAt: any; // Firestore Timestamp
}

export async function saveRoomSnapshot(roomCode: string, state: GameState): Promise<boolean> {
  const db = getFirestore();
  if (!db) {
    console.warn("Firestore not initialized. Room snapshot not saved.");
    return false;
  }

  try {
    const roomRef = doc(db, "rooms", roomCode);
    const snapshot: RoomSnapshot = {
      roomCode,
      state,
      lastUpdated: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const existingDoc = await getDoc(roomRef);
    if (existingDoc.exists()) {
      await updateDoc(roomRef, {
        state,
        lastUpdated: serverTimestamp(),
      });
    } else {
      await setDoc(roomRef, snapshot);
    }

    return true;
  } catch (error) {
    console.error("Error saving room snapshot:", error);
    return false;
  }
}

export async function loadRoomSnapshot(roomCode: string): Promise<GameState | null> {
  const db = getFirestore();
  if (!db) {
    console.warn("Firestore not initialized. Room snapshot not loaded.");
    return null;
  }

  try {
    const roomRef = doc(db, "rooms", roomCode);
    const docSnap = await getDoc(roomRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data() as RoomSnapshot;
      return data.state;
    }
    
    return null;
  } catch (error) {
    console.error("Error loading room snapshot:", error);
    return null;
  }
}
