/**
 * Firestore actions for the game.
 * Room cleanup is best-effort: delete when the last connected player leaves.
 */

import {
  doc, collection, getDoc, getDocs, deleteDoc, addDoc, serverTimestamp, runTransaction, Timestamp, writeBatch,
} from "firebase/firestore";
import { getFirestore } from "./firebase";
import { generateBoard, assignTeams } from "@/shared/words";
import { isValidClue, teamsAreReady, shufflePlayers, getRequiredVotes } from "@/shared/game-utils";
import type { Player, Team, PauseReason, WordPack } from "@/shared/types";

const STALE_PLAYER_MS = 2 * 60 * 1000; // 2 minutes - player considered disconnected if no ping

interface BoardCard {
  word: string;
  team: Team;
  revealed: boolean;
  revealedBy: string | null;
  votes: string[];
}

function getDb() {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not initialized");
  return db;
}

// Check if team can play (for pause logic)
function checkPause(
  players: Array<{ team: string | null; role: string | null; connected: boolean }>,
  team: "red" | "blue",
  hasClue: boolean
): { paused: boolean; reason: PauseReason; team: Team | null } {
  const teamPlayers = players.filter((p) => p.team === team);
  const hasClueGiver = teamPlayers.some((p) => p.role === "clueGiver" && p.connected);
  const hasGuesser = teamPlayers.some((p) => p.role === "guesser" && p.connected);
  const anyConnected = teamPlayers.some((p) => p.connected);

  if (!anyConnected) return { paused: true, reason: "teamDisconnected", team };
  if (!hasClue && !hasClueGiver) return { paused: true, reason: "clueGiverDisconnected", team };
  if (hasClue && !hasGuesser) return { paused: true, reason: "noGuessers", team };
  return { paused: false, reason: null, team: null };
}

// Delete a room and all subcollections
async function deleteRoom(roomCode: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  
  // Delete subcollections first
  const [players, messages] = await Promise.all([
    getDocs(collection(db, "rooms", roomCode, "players")),
    getDocs(collection(db, "rooms", roomCode, "messages")),
  ]);
  
  await Promise.all([
    ...players.docs.map((d) => deleteDoc(d.ref)),
    ...messages.docs.map((d) => deleteDoc(d.ref)),
  ]);
  
  await deleteDoc(roomRef);
}

/**
 * Presence ping - updates own lastSeen and marks stale players as disconnected.
 */
export async function presencePing(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  
  if (playersSnap.empty) return;
  
  const now = Date.now();
  const batch = writeBatch(db);
  
  for (const playerDoc of playersSnap.docs) {
    const data = playerDoc.data();
    const lastSeen = data.lastSeen as Timestamp | null;
    const isStale = lastSeen && (now - lastSeen.toMillis() > STALE_PLAYER_MS);
    
    if (playerDoc.id === playerId) {
      // Update own presence
      batch.update(playerDoc.ref, { connected: true, lastSeen: serverTimestamp() });
    } else if (data.connected && isStale) {
      // Mark stale player as disconnected
      batch.update(playerDoc.ref, { connected: false });
    }
  }

  await batch.commit();
}

// ============================================================================
// Room Management
// ============================================================================

export async function joinRoom(roomCode: string, playerId: string, playerName: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    const playerSnap = await tx.get(playerRef);

    if (!roomSnap.exists()) {
      const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";
      tx.set(roomRef, {
        ownerId: playerId, currentTeam: startingTeam, startingTeam,
        wordPack: "classic" as WordPack,
        currentClue: null, remainingGuesses: null, turnStartTime: null, turnDuration: 60,
        gameStarted: false, gameOver: false, winner: null,
        paused: false, pauseReason: null, pausedForTeam: null,
        board: [],
        createdAt: serverTimestamp(), lastActivity: serverTimestamp(),
      });
    } else {
      tx.update(roomRef, { lastActivity: serverTimestamp() });
    }

    if (playerSnap.exists()) {
      tx.update(playerRef, { name: playerName, connected: true, lastSeen: serverTimestamp() });
    } else {
      tx.set(playerRef, { name: playerName, team: null, role: null, connected: true, lastSeen: serverTimestamp() });
      if (roomSnap.exists() && !roomSnap.data().ownerId) {
        tx.update(roomRef, { ownerId: playerId });
      }
    }
  });
}

export async function leaveRoom(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);

  // Get all players to check if this is the last one
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const connectedCount = playersSnap.docs.filter(
    (d) => d.id !== playerId && d.data().connected
  ).length;

  if (connectedCount === 0) {
    // Last player leaving - delete the room
    await deleteRoom(roomCode);
    return;
  }

  // Not the last player - just mark as disconnected and clear votes
  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (roomSnap.exists()) {
      const board: BoardCard[] = roomSnap.data().board || [];
      const updatedBoard = board.map((c) => ({ ...c, votes: c.votes.filter((id) => id !== playerId) }));
      tx.update(roomRef, { board: updatedBoard, lastActivity: serverTimestamp() });
    }
    tx.update(playerRef, { connected: false, lastSeen: serverTimestamp() });
  });
}

// ============================================================================
// Game Lifecycle
// ============================================================================

export async function startGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs
    .map((d) => ({ id: d.id, name: d.data().name, team: d.data().team, role: d.data().role }))
    .filter((p) => p.team && p.role) as Player[];

  if (!teamsAreReady(players)) throw new Error("Teams not ready");

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (data.gameStarted) throw new Error("Game already started");

    const startingTeam = data.startingTeam as "red" | "blue";
    const wordPack = (data.wordPack || "classic") as WordPack;
    const boardWords = generateBoard(wordPack);
    const board = assignTeams(boardWords, startingTeam).map((c) => ({
      word: c.word, team: c.team, revealed: false, revealedBy: null, votes: [],
    }));

    tx.update(roomRef, {
      gameStarted: true, currentTeam: startingTeam, turnStartTime: serverTimestamp(),
      currentClue: null, remainingGuesses: null, gameOver: false, winner: null,
      paused: false, pauseReason: null, pausedForTeam: null, board,
      lastActivity: serverTimestamp(),
    });
  });
}

export async function rematch(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs
    .map((d) => ({ id: d.id, name: d.data().name, team: d.data().team, role: d.data().role }))
    .filter((p) => p.team && p.role) as Player[];

  if (!teamsAreReady(players)) throw new Error("Teams not ready");

  const messagesSnap = await getDocs(collection(db, "rooms", roomCode, "messages"));
  const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (!data.gameOver) throw new Error("Game not over");

    const wordPack = (data.wordPack || "classic") as WordPack;
    const boardWords = generateBoard(wordPack);
    const board = assignTeams(boardWords, startingTeam).map((c) => ({
      word: c.word, team: c.team, revealed: false, revealedBy: null, votes: [],
    }));

    tx.update(roomRef, {
      gameStarted: true, currentTeam: startingTeam, startingTeam, turnStartTime: serverTimestamp(),
      currentClue: null, remainingGuesses: null, gameOver: false, winner: null,
      paused: false, pauseReason: null, pausedForTeam: null, board,
      lastActivity: serverTimestamp(),
    });

    messagesSnap.docs.forEach((d) => tx.delete(d.ref));
  });
}

export async function endGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (!data.gameStarted) throw new Error("Game not started");

    tx.update(roomRef, {
      gameStarted: false, gameOver: false, winner: null, currentClue: null,
      remainingGuesses: null, turnStartTime: null, paused: false, pauseReason: null,
      pausedForTeam: null, board: [], lastActivity: serverTimestamp(),
    });

    playersSnap.docs.forEach((d) => tx.update(d.ref, { team: null, role: null }));

    tx.set(doc(collection(db, "rooms", roomCode, "messages")), {
      playerId: null, playerName: "System",
      message: "Game ended by room owner.",
      timestamp: serverTimestamp(), type: "system",
    });
  });
}

export async function resumeGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs.map((d) => ({
    team: d.data().team, role: d.data().role, connected: d.data().connected,
  }));

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (!data.paused || !data.gameStarted || data.gameOver) throw new Error("Invalid game state");

    const team = data.currentTeam as "red" | "blue";
    const hasClueGiver = players.some((p) => p.team === team && p.role === "clueGiver" && p.connected);
    const hasGuesser = players.some((p) => p.team === team && p.role === "guesser" && p.connected);
    if (!hasClueGiver || !hasGuesser) throw new Error("Team needs clue giver and guesser");

    tx.update(roomRef, {
      paused: false, pauseReason: null, pausedForTeam: null,
      turnStartTime: serverTimestamp(), lastActivity: serverTimestamp(),
    });

    tx.set(doc(collection(db, "rooms", roomCode, "messages")), {
      playerId: null, playerName: "System",
      message: "Game resumed.", timestamp: serverTimestamp(), type: "system",
    });
  });
}

// ============================================================================
// Lobby Actions
// ============================================================================

export async function setTurnDuration(roomCode: string, playerId: string, duration: number): Promise<void> {
  if (![30, 60, 90].includes(duration)) throw new Error("Invalid duration");
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (data.gameStarted) throw new Error("Game already started");
    tx.update(roomRef, { turnDuration: duration, lastActivity: serverTimestamp() });
  });
}

export async function setWordPack(roomCode: string, playerId: string, pack: WordPack): Promise<void> {
  if (!["classic", "kahoot"].includes(pack)) throw new Error("Invalid word pack");
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (data.gameStarted) throw new Error("Game already started");
    tx.update(roomRef, { wordPack: pack, lastActivity: serverTimestamp() });
  });
}

export async function setLobbyRole(
  roomCode: string, playerId: string, team: "red" | "blue" | null, role: "clueGiver" | "guesser" | null
): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);

  // Check for duplicate clue giver
  if (role === "clueGiver" && team) {
    const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
    const existing = playersSnap.docs.find(
      (d) => d.id !== playerId && d.data().team === team && d.data().role === "clueGiver"
    );
    if (existing) throw new Error("Team already has a clue giver");
  }

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.gameStarted && !data.gameOver && !data.paused) throw new Error("Game in progress");

    const player = await tx.get(playerRef);
    if (!player.exists()) throw new Error("Player not found");

    tx.update(playerRef, { team: team || null, role: role || null });
    tx.update(roomRef, { lastActivity: serverTimestamp() });
  });
}

export async function randomizeTeams(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs.map((d) => ({
    id: d.id, name: d.data().name, team: d.data().team, role: d.data().role,
  }));

  if (players.length < 4 || players.length % 2 !== 0) throw new Error("Need even number of players (4+)");

  const shuffled = shufflePlayers(players);
  const half = players.length / 2;

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (data.ownerId !== playerId) throw new Error("Not room owner");
    if (data.gameStarted && !data.gameOver) throw new Error("Game in progress");

    shuffled.forEach((p, i) => {
      tx.update(doc(db, "rooms", roomCode, "players", p.id), {
        team: i < half ? "red" : "blue",
        role: i === 0 || i === half ? "clueGiver" : "guesser",
      });
    });
    tx.update(roomRef, { lastActivity: serverTimestamp() });
  });
}

// ============================================================================
// Gameplay
// ============================================================================

export async function giveClue(roomCode: string, playerId: string, word: string, count: number): Promise<void> {
  const trimmed = word.trim();
  if (!trimmed || !/^\S+$/.test(trimmed) || count < 0) throw new Error("Invalid clue");

  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (!data.gameStarted || data.gameOver || data.currentClue) throw new Error("Cannot give clue now");

    const board: BoardCard[] = data.board || [];
    if (!isValidClue(trimmed, board.map((c) => c.word))) throw new Error("Invalid clue word");

    const player = await tx.get(doc(db, "rooms", roomCode, "players", playerId));
    if (!player.exists()) throw new Error("Player not found");
    const pData = player.data();
    if (pData.role !== "clueGiver" || pData.team !== data.currentTeam) throw new Error("Not your turn");

    tx.update(roomRef, {
      currentClue: { word: trimmed.toUpperCase(), count },
      remainingGuesses: count + 1,
      turnStartTime: serverTimestamp(),
      board: board.map((c) => ({ ...c, votes: [] })),
      lastActivity: serverTimestamp(),
    });

    tx.set(doc(collection(db, "rooms", roomCode, "messages")), {
      playerId, playerName: pData.name, message: `${trimmed} ${count}`,
      timestamp: serverTimestamp(), type: "clue",
    });
  });
}

export async function voteCard(roomCode: string, playerId: string, cardIndex: number): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (!data.gameStarted || data.gameOver || !data.currentClue || data.remainingGuesses <= 0) {
      throw new Error("Cannot vote now");
    }

    const player = await tx.get(doc(db, "rooms", roomCode, "players", playerId));
    if (!player.exists()) throw new Error("Player not found");
    const pData = player.data();
    if (pData.role !== "guesser" || pData.team !== data.currentTeam) throw new Error("Not your turn");

    const board: BoardCard[] = data.board || [];
    if (cardIndex < 0 || cardIndex >= board.length || board[cardIndex].revealed) {
      throw new Error("Invalid card");
    }

    const card = board[cardIndex];
    const votes = card.votes.includes(playerId)
      ? card.votes.filter((id) => id !== playerId)
      : [...card.votes, playerId];

    const updatedBoard = [...board];
    updatedBoard[cardIndex] = { ...card, votes };

    tx.update(roomRef, { board: updatedBoard, lastActivity: serverTimestamp() });
  });
}

export async function confirmReveal(roomCode: string, playerId: string, cardIndex: number): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs.map((d) => ({
    id: d.id, team: d.data().team, role: d.data().role, connected: d.data().connected,
  }));

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (!data.gameStarted || data.gameOver || !data.currentClue || data.remainingGuesses <= 0) {
      throw new Error("Cannot reveal now");
    }

    const player = await tx.get(doc(db, "rooms", roomCode, "players", playerId));
    if (!player.exists()) throw new Error("Player not found");
    const pData = player.data();
    if (pData.role !== "guesser" || pData.team !== data.currentTeam) throw new Error("Not your turn");

    const board: BoardCard[] = data.board || [];
    if (cardIndex < 0 || cardIndex >= board.length || board[cardIndex].revealed) {
      throw new Error("Invalid card");
    }

    const card = board[cardIndex];
    const guessers = players.filter((p) => p.team === data.currentTeam && p.role === "guesser" && p.connected);
    const required = getRequiredVotes(guessers.length);

    if (card.votes.length < required || !card.votes.includes(playerId)) {
      throw new Error("Not enough votes");
    }

    // Reveal the card and clear only its votes (keep votes on other cards)
    const updatedBoard = board.map((c, i) => 
      i === cardIndex 
        ? { ...c, revealed: true, revealedBy: playerId, votes: [] }
        : c
    );

    const isCorrect = card.team === data.currentTeam;
    const isTrap = card.team === "trap";
    const remainingTeamCards = updatedBoard.filter((c) => c.team === data.currentTeam && !c.revealed).length;
    const newGuesses = data.remainingGuesses - 1;

    if (isTrap) {
      tx.update(roomRef, {
        board: updatedBoard, gameOver: true, winner: data.currentTeam === "red" ? "blue" : "red",
        currentClue: null, remainingGuesses: null, turnStartTime: null, lastActivity: serverTimestamp(),
      });
    } else if (!isCorrect || newGuesses === 0) {
      const newTeam = data.currentTeam === "red" ? "blue" : "red";
      const pause = checkPause(players, newTeam, false);
      tx.update(roomRef, {
        board: updatedBoard, currentTeam: newTeam, currentClue: null, remainingGuesses: null,
        turnStartTime: pause.paused ? null : serverTimestamp(),
        paused: pause.paused, pauseReason: pause.reason, pausedForTeam: pause.team,
        lastActivity: serverTimestamp(),
      });
    } else if (remainingTeamCards === 0) {
      tx.update(roomRef, {
        board: updatedBoard, gameOver: true, winner: data.currentTeam,
        currentClue: null, remainingGuesses: null, turnStartTime: null, lastActivity: serverTimestamp(),
      });
    } else {
      tx.update(roomRef, {
        board: updatedBoard, remainingGuesses: newGuesses, lastActivity: serverTimestamp(),
      });
    }
  });
}

export async function endTurn(roomCode: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs.map((d) => ({
    team: d.data().team, role: d.data().role, connected: d.data().connected,
  }));

  return runTransaction(db, async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists()) throw new Error("Room not found");
    const data = room.data();
    if (!data.gameStarted || data.gameOver) throw new Error("Game not active");

    const newTeam = data.currentTeam === "red" ? "blue" : "red";
    const pause = checkPause(players, newTeam, false);
    const board: BoardCard[] = data.board || [];

    tx.update(roomRef, {
      board: board.map((c) => ({ ...c, votes: [] })),
      currentTeam: newTeam, currentClue: null, remainingGuesses: null,
      turnStartTime: pause.paused ? null : serverTimestamp(),
      paused: pause.paused, pauseReason: pause.reason, pausedForTeam: pause.team,
      lastActivity: serverTimestamp(),
    });
  });
}

// ============================================================================
// Chat
// ============================================================================

export async function sendMessage(roomCode: string, playerId: string, message: string, type: "clue" | "chat"): Promise<void> {
  const db = getDb();
  const player = await getDoc(doc(db, "rooms", roomCode, "players", playerId));
  if (!player.exists()) throw new Error("Player not found");

  await addDoc(collection(db, "rooms", roomCode, "messages"), {
    playerId, playerName: player.data().name, message: message.trim(),
    timestamp: serverTimestamp(), type,
  });
}
