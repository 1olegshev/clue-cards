/**
 * Realtime Database actions for the game.
 * Uses onDisconnect() for reliable room cleanup when players leave.
 */

import {
  ref, get, set, update, remove, push, serverTimestamp, onDisconnect,
  runTransaction,
  DatabaseReference,
} from "firebase/database";
import { getDatabase } from "./firebase";
import { generateBoard, assignTeams } from "@/shared/words";
import { isValidClue, teamsAreReady, shufflePlayers, getRequiredVotes } from "@/shared/game-utils";
import type {
  Player,
  Team,
  PauseReason,
  WordPack,
  FirebaseBoardCard,
  FirebasePlayerData,
  FirebaseMessageData,
  FirebaseRoomData,
} from "@/shared/types";
import {
  TURN_DURATIONS,
  DEFAULT_TURN_DURATION,
  WORD_PACKS,
  DEFAULT_WORD_PACK,
  MIN_PLAYERS_TO_START,
} from "@/shared/constants";
import {
  sanitizePlayerName,
  sanitizeClue,
  sanitizeChatMessage,
  isValidClueFormat,
} from "@/shared/validation";

// Type aliases for internal use (cleaner code)
type BoardCard = FirebaseBoardCard;
type RoomData = FirebaseRoomData;
type PlayerData = FirebasePlayerData;
type MessageData = FirebaseMessageData;

function getDb() {
  const db = getDatabase();
  if (!db) throw new Error("Database not initialized");
  return db;
}

// Check if team can play (for pause logic)
// connected !== false treats undefined as connected (backwards compatible)
function checkPause(
  players: Record<string, PlayerData>,
  team: "red" | "blue",
  hasClue: boolean
): { paused: boolean; reason: PauseReason; team: Team | null } {
  const teamPlayers = Object.values(players).filter((p) => p.team === team);
  const hasClueGiver = teamPlayers.some((p) => p.role === "clueGiver" && p.connected !== false);
  const hasGuesser = teamPlayers.some((p) => p.role === "guesser" && p.connected !== false);
  const anyConnected = teamPlayers.some((p) => p.connected !== false);

  if (!anyConnected) return { paused: true, reason: "teamDisconnected", team };
  if (!hasClue && !hasClueGiver) return { paused: true, reason: "clueGiverDisconnected", team };
  if (hasClue && !hasGuesser) return { paused: true, reason: "noGuessers", team };
  return { paused: false, reason: null, team: null };
}

// Convert votes object to array of player IDs
function votesToArray(votes: Record<string, boolean> | undefined): string[] {
  if (!votes) return [];
  return Object.keys(votes).filter((id) => votes[id]);
}

// Convert array to votes object
function arrayToVotes(arr: string[]): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  arr.forEach((id) => { obj[id] = true; });
  return obj;
}

// ============================================================================
// Room Management
// ============================================================================

/**
 * Join a room. Sets up onDisconnect to handle cleanup when player leaves.
 * Returns the onDisconnect reference so the caller can cancel it if needed.
 */
export async function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string,
  playerAvatar: string
): Promise<{ disconnectRef: DatabaseReference }> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  // Sanitize player name
  const sanitizedName = sanitizePlayerName(playerName);
  if (!sanitizedName) throw new Error("Invalid player name");

  const roomSnap = await get(roomRef);

  if (!roomSnap.exists()) {
    // Create new room
    const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";
    await set(roomRef, {
      ownerId: playerId,
      currentTeam: startingTeam,
      startingTeam,
      wordPack: DEFAULT_WORD_PACK,
      currentClue: null,
      remainingGuesses: null,
      turnStartTime: null,
      turnDuration: DEFAULT_TURN_DURATION,
      gameStarted: false,
      gameOver: false,
      winner: null,
      paused: false,
      pauseReason: null,
      pausedForTeam: null,
      createdAt: serverTimestamp(),
      board: [],
    });
  } else {
    // Room exists - check for duplicate names
    const playersSnap = await get(playersRef);
    const players = (playersSnap.val() || {}) as Record<string, PlayerData>;
    
    // Check if another connected player has the same name
    const duplicateName = Object.entries(players).find(
      ([id, p]) => id !== playerId && p.name.toLowerCase() === sanitizedName.toLowerCase() && p.connected
    );
    if (duplicateName) {
      throw new Error("Name already taken");
    }
  }

  // Check if this player already exists (rejoining)
  const existingPlayerSnap = await get(playerRef);
  
  if (existingPlayerSnap.exists()) {
    // Rejoin - preserve team/role, update name/avatar and connection status
    await update(playerRef, {
      name: sanitizedName,
      avatar: playerAvatar,
      connected: true,
      lastSeen: serverTimestamp(),
    });
  } else {
    // New player
    await set(playerRef, {
      name: sanitizedName,
      avatar: playerAvatar,
      team: null,
      role: null,
      connected: true,
      lastSeen: serverTimestamp(),
    });
  }

  // Set up initial onDisconnect - marks player as disconnected
  // This will be updated dynamically when player count changes
  const playerDisconnect = onDisconnect(playerRef);
  await playerDisconnect.update({
    connected: false,
    lastSeen: serverTimestamp(),
  });

  return { disconnectRef: playerRef };
}

/**
 * Update onDisconnect behavior based on whether this player is the last one.
 * Call this whenever the player list changes.
 * - If last connected player: onDisconnect deletes the entire room
 * - If others are connected: onDisconnect just marks this player disconnected
 * 
 * NOTE: We set up the new handler BEFORE cancelling old ones to avoid a race
 * condition where the browser could close between cancel and setup.
 */
export async function updateDisconnectBehavior(
  roomCode: string,
  playerId: string,
  connectedCount: number
): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);

  if (connectedCount <= 1) {
    // I'm the last (or only) connected player - delete room on disconnect
    // First set up room deletion, then cancel player-level handler
    await onDisconnect(roomRef).remove();
    await onDisconnect(playerRef).cancel();
  } else {
    // Others are connected - just mark myself as disconnected
    // First set up player disconnect, then cancel room-level handler
    await onDisconnect(playerRef).update({
      connected: false,
      lastSeen: serverTimestamp(),
    });
    await onDisconnect(roomRef).cancel();
  }
}

// Grace period before transferring ownership (in milliseconds)
// Allows for page refreshes, network switches (WiFi → mobile), etc.
// Kept short (30s) to avoid game stalls when owner disconnects
export const OWNER_DISCONNECT_GRACE_PERIOD_MS = 30 * 1000; // 30 seconds

export interface ReassignResult {
  /** New owner's name if reassigned */
  newOwnerName: string | null;
  /** If true, owner is disconnected but within grace period - caller should retry later */
  withinGracePeriod: boolean;
  /** Milliseconds remaining in grace period (only if withinGracePeriod is true) */
  gracePeriodRemainingMs: number;
}

/**
 * Check if the room owner is disconnected and reassign to another connected player.
 * Returns information about the result, including whether we're within grace period.
 * 
 * @param addMessage - Whether to add a system message. Set to false when called
 *                     from listeners to avoid duplicate messages from race conditions.
 * @param skipGracePeriod - If true, skip the grace period check (used when owner explicitly leaves)
 */
export async function reassignOwnerIfNeeded(
  roomCode: string,
  addMessage: boolean = false,
  skipGracePeriod: boolean = false
): Promise<ReassignResult> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists() || !playersSnap.exists()) {
    return { newOwnerName: null, withinGracePeriod: false, gracePeriodRemainingMs: 0 };
  }

  const roomData = roomSnap.val() as RoomData;
  const players = playersSnap.val() as Record<string, PlayerData>;
  
  // Check if current owner is disconnected
  // connected !== false treats undefined as connected (backwards compatible)
  const currentOwner = players[roomData.ownerId];
  if (currentOwner?.connected !== false) {
    return { newOwnerName: null, withinGracePeriod: false, gracePeriodRemainingMs: 0 };
  }
  
  // Check grace period - only transfer if owner has been disconnected long enough
  // This prevents accidental transfers during page refreshes or network switches
  if (!skipGracePeriod && currentOwner?.lastSeen) {
    const disconnectedFor = Date.now() - currentOwner.lastSeen;
    if (disconnectedFor < OWNER_DISCONNECT_GRACE_PERIOD_MS) {
      const remaining = OWNER_DISCONNECT_GRACE_PERIOD_MS - disconnectedFor;
      return { newOwnerName: null, withinGracePeriod: true, gracePeriodRemainingMs: remaining };
    }
  }
  
  // Find first connected player to become new owner
  const newOwnerEntry = Object.entries(players).find(([, p]) => p.connected !== false);
  if (!newOwnerEntry) {
    return { newOwnerName: null, withinGracePeriod: false, gracePeriodRemainingMs: 0 };
  }
  
  const [newOwnerId, newOwnerData] = newOwnerEntry;
  if (newOwnerId === roomData.ownerId) {
    return { newOwnerName: null, withinGracePeriod: false, gracePeriodRemainingMs: 0 };
  }
  
  // Reassign ownership
  await update(roomRef, { ownerId: newOwnerId });
  
  // Only add message when explicitly requested (from leaveRoom, not from listeners)
  if (addMessage) {
    await push(ref(db, `rooms/${roomCode}/messages`), {
      playerId: null,
      playerName: "System",
      message: `${newOwnerData.name} is now the room owner.`,
      timestamp: serverTimestamp(),
      type: "system",
    });
  }
  
  return { newOwnerName: newOwnerData.name, withinGracePeriod: false, gracePeriodRemainingMs: 0 };
}

/**
 * Leave room explicitly. Checks if last player and deletes room if so.
 */
export async function leaveRoom(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const playersSnap = await get(playersRef);
  if (!playersSnap.exists()) {
    await remove(roomRef);
    return;
  }

  const players = playersSnap.val() as Record<string, PlayerData>;
  // connected !== false treats undefined as connected (backwards compatible)
  const connectedCount = Object.entries(players).filter(
    ([id, p]) => id !== playerId && p.connected !== false
  ).length;

  if (connectedCount === 0) {
    // Last player leaving - delete the room
    await remove(roomRef);
  } else {
    // Mark as disconnected and clear votes
    const roomSnap = await get(roomRef);
    if (roomSnap.exists()) {
      const roomData = roomSnap.val() as RoomData;
      const board = roomData.board || [];
      const updatedBoard = board.map((c) => ({
        ...c,
        votes: arrayToVotes(votesToArray(c.votes).filter((id) => id !== playerId)),
      }));
      await update(roomRef, { board: updatedBoard });
    }
    await update(playerRef, { connected: false, lastSeen: serverTimestamp() });
    
    // Reassign owner if the leaving player was the owner (add message since this is explicit leave)
    // Skip grace period since this is an explicit leave action
    await reassignOwnerIfNeeded(roomCode, true, true);
  }
}

// ============================================================================
// Game Lifecycle
// ============================================================================

export async function startGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (roomData.gameStarted) throw new Error("Game already started");

  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const players = Object.entries(playersData)
    .map(([id, p]) => ({
      id,
      name: p.name,
      avatar: p.avatar || "🐱",
      team: p.team,
      role: p.role,
      connected: p.connected,
    }))
    .filter((p) => p.team && p.role) as Player[];

  if (!teamsAreReady(players)) throw new Error("Teams not ready");

  const wordPack = (roomData.wordPack || "classic") as WordPack;
  const boardWords = generateBoard(wordPack);
  const startingTeam = roomData.startingTeam as "red" | "blue";
  const board: BoardCard[] = assignTeams(boardWords, startingTeam).map((c) => ({
    word: c.word,
    team: c.team,
    revealed: false,
    revealedBy: null,
    votes: {},
  }));

  await update(roomRef, {
    gameStarted: true,
    currentTeam: startingTeam,
    turnStartTime: serverTimestamp(),
    currentClue: null,
    remainingGuesses: null,
    gameOver: false,
    winner: null,
    paused: false,
    pauseReason: null,
    pausedForTeam: null,
    board,
  });
}

export async function rematch(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);
  const messagesRef = ref(db, `rooms/${roomCode}/messages`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (!roomData.gameOver) throw new Error("Game not over");

  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const players = Object.entries(playersData)
    .map(([id, p]) => ({
      id,
      name: p.name,
      avatar: p.avatar || "🐱",
      team: p.team,
      role: p.role,
      connected: p.connected,
    }))
    .filter((p) => p.team && p.role) as Player[];

  if (!teamsAreReady(players)) throw new Error("Teams not ready");

  const wordPack = (roomData.wordPack || "classic") as WordPack;
  const boardWords = generateBoard(wordPack);
  const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";
  const board: BoardCard[] = assignTeams(boardWords, startingTeam).map((c) => ({
    word: c.word,
    team: c.team,
    revealed: false,
    revealedBy: null,
    votes: {},
  }));

  // Clear messages and update room
  await remove(messagesRef);
  await update(roomRef, {
    gameStarted: true,
    currentTeam: startingTeam,
    startingTeam,
    turnStartTime: serverTimestamp(),
    currentClue: null,
    remainingGuesses: null,
    gameOver: false,
    winner: null,
    paused: false,
    pauseReason: null,
    pausedForTeam: null,
    board,
  });
}

export async function endGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (!roomData.gameStarted) throw new Error("Game not started");

  // Reset player teams/roles
  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const playerUpdates: Record<string, null> = {};
  Object.keys(playersData).forEach((id) => {
    playerUpdates[`players/${id}/team`] = null;
    playerUpdates[`players/${id}/role`] = null;
  });

  // Owner stays the same - they're just ending the game, not leaving
  await update(roomRef, {
    gameStarted: false,
    gameOver: false,
    winner: null,
    currentClue: null,
    remainingGuesses: null,
    turnStartTime: null,
    paused: false,
    pauseReason: null,
    pausedForTeam: null,
    board: [],
    ...playerUpdates,
  });

  // Add system message
  await push(ref(db, `rooms/${roomCode}/messages`), {
    playerId: null,
    playerName: "System",
    message: "Game ended by room owner.",
    timestamp: serverTimestamp(),
    type: "system",
  });
}

export async function resumeGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (!roomData.paused || !roomData.gameStarted || roomData.gameOver) throw new Error("Invalid game state");

  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const team = roomData.currentTeam as "red" | "blue";
  const hasClueGiver = Object.values(playersData).some(
    (p) => p.team === team && p.role === "clueGiver" && p.connected
  );
  const hasGuesser = Object.values(playersData).some(
    (p) => p.team === team && p.role === "guesser" && p.connected
  );

  if (!hasClueGiver || !hasGuesser) throw new Error("Team needs clue giver and guesser");

  await update(roomRef, {
    paused: false,
    pauseReason: null,
    pausedForTeam: null,
    turnStartTime: serverTimestamp(),
  });

  await push(ref(db, `rooms/${roomCode}/messages`), {
    playerId: null,
    playerName: "System",
    message: "Game resumed.",
    timestamp: serverTimestamp(),
    type: "system",
  });
}

// ============================================================================
// Lobby Actions
// ============================================================================

export async function setTurnDuration(roomCode: string, playerId: string, duration: number): Promise<void> {
  if (!TURN_DURATIONS.includes(duration as typeof TURN_DURATIONS[number])) throw new Error("Invalid duration");
  
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const roomSnap = await get(roomRef);

  if (!roomSnap.exists()) throw new Error("Room not found");
  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (roomData.gameStarted) throw new Error("Game already started");

  await update(roomRef, { turnDuration: duration });
}

export async function setWordPack(roomCode: string, playerId: string, pack: WordPack): Promise<void> {
  if (!WORD_PACKS.includes(pack)) throw new Error("Invalid word pack");
  
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const roomSnap = await get(roomRef);

  if (!roomSnap.exists()) throw new Error("Room not found");
  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (roomData.gameStarted) throw new Error("Game already started");

  await update(roomRef, { wordPack: pack });
}

export async function setLobbyRole(
  roomCode: string,
  playerId: string,
  team: "red" | "blue" | null,
  role: "clueGiver" | "guesser" | null,
  requesterId?: string // Owner can assign other players
): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const playerData = playersData[playerId];
  const isOwner = requesterId && roomData.ownerId === requesterId;
  const isSpectator = !playerData?.team || !playerData?.role;
  
  // During active game: only allow owner to add spectators as guessers
  if (roomData.gameStarted && !roomData.gameOver && !roomData.paused) {
    if (!isOwner) throw new Error("Only owner can add players during game");
    if (!isSpectator) throw new Error("Can only add spectators during game");
    if (role === "clueGiver") throw new Error("Can only add as guesser during game");
  }

  // Check for duplicate clue giver
  if (role === "clueGiver" && team) {
    const existing = Object.entries(playersData).find(
      ([id, p]) => id !== playerId && p.team === team && p.role === "clueGiver"
    );
    if (existing) throw new Error("Team already has a clue giver");
  }

  await update(playerRef, { team: team || null, role: role || null });
}

export async function randomizeTeams(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== playerId) throw new Error("Not room owner");
  if (roomData.gameStarted && !roomData.gameOver) throw new Error("Game in progress");

  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const players = Object.entries(playersData).map(([id, p]) => ({
    id,
    name: p.name,
    avatar: p.avatar || "🐱",
    team: p.team,
    role: p.role,
  }));

  if (players.length < MIN_PLAYERS_TO_START) throw new Error("Need at least 4 players");

  const shuffled = shufflePlayers(players);
  const half = Math.ceil(players.length / 2); // Red team gets extra player if odd

  const updates: Record<string, any> = {};
  shuffled.forEach((p, i) => {
    const isRedTeam = i < half;
    const isFirstOfTeam = i === 0 || i === half;
    updates[`players/${p.id}/team`] = isRedTeam ? "red" : "blue";
    updates[`players/${p.id}/role`] = isFirstOfTeam ? "clueGiver" : "guesser";
  });

  await update(roomRef, updates);
}

// ============================================================================
// Gameplay
// ============================================================================

export async function giveClue(roomCode: string, playerId: string, word: string, count: number): Promise<void> {
  const sanitized = sanitizeClue(word);
  if (!isValidClueFormat(sanitized) || count < 0) throw new Error("Invalid clue");

  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);

  const [roomSnap, playerSnap] = await Promise.all([get(roomRef), get(playerRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");
  if (!playerSnap.exists()) throw new Error("Player not found");

  const roomData = roomSnap.val() as RoomData;
  const playerData = playerSnap.val() as PlayerData;

  if (!roomData.gameStarted || roomData.gameOver || roomData.currentClue) throw new Error("Cannot give clue now");
  if (playerData.role !== "clueGiver" || playerData.team !== roomData.currentTeam) throw new Error("Not your turn");

  const board = roomData.board || [];
  if (!isValidClue(sanitized, board.map((c) => c.word))) throw new Error("Invalid clue word");

  // Clear votes and set clue
  const updatedBoard = board.map((c) => ({ ...c, votes: {} }));

  await update(roomRef, {
    currentClue: { word: sanitized.toUpperCase(), count },
    remainingGuesses: count + 1,
    turnStartTime: serverTimestamp(),
    board: updatedBoard,
  });

  await push(ref(db, `rooms/${roomCode}/messages`), {
    playerId,
    playerName: playerData.name,
    message: `${sanitized} ${count}`,
    timestamp: serverTimestamp(),
    type: "clue",
  });
}

export async function voteCard(roomCode: string, playerId: string, cardIndex: number): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  const votesRef = ref(db, `rooms/${roomCode}/board/${cardIndex}/votes`);

  // First validate player and game state (these don't need to be in the transaction)
  const [roomSnap, playerSnap] = await Promise.all([get(roomRef), get(playerRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");
  if (!playerSnap.exists()) throw new Error("Player not found");

  const roomData = roomSnap.val() as RoomData;
  const playerData = playerSnap.val() as PlayerData;

  if (!roomData.gameStarted || roomData.gameOver || !roomData.currentClue || (roomData.remainingGuesses ?? 0) <= 0) {
    throw new Error("Cannot vote now");
  }
  if (playerData.role !== "guesser" || playerData.team !== roomData.currentTeam) throw new Error("Not your turn");

  const board = roomData.board || [];
  if (cardIndex < 0 || cardIndex >= board.length || board[cardIndex].revealed) {
    throw new Error("Invalid card");
  }

  // Use transaction to atomically toggle the vote
  // This prevents race conditions when multiple players vote simultaneously
  await runTransaction(votesRef, (currentVotes) => {
    const votes = currentVotes || {};
    
    // Toggle vote
    if (votes[playerId]) {
      delete votes[playerId];
    } else {
      votes[playerId] = true;
    }
    
    return votes;
  });
}

export async function confirmReveal(roomCode: string, playerId: string, cardIndex: number): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);
  const cardRevealedRef = ref(db, `rooms/${roomCode}/board/${cardIndex}/revealed`);

  const [roomSnap, playerSnap, playersSnap] = await Promise.all([
    get(roomRef),
    get(playerRef),
    get(playersRef),
  ]);

  if (!roomSnap.exists()) throw new Error("Room not found");
  if (!playerSnap.exists()) throw new Error("Player not found");

  const roomData = roomSnap.val() as RoomData;
  const playerData = playerSnap.val() as PlayerData;
  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;

  if (!roomData.gameStarted || roomData.gameOver || !roomData.currentClue || (roomData.remainingGuesses ?? 0) <= 0) {
    throw new Error("Cannot reveal now");
  }
  if (playerData.role !== "guesser" || playerData.team !== roomData.currentTeam) throw new Error("Not your turn");

  const board = roomData.board || [];
  if (cardIndex < 0 || cardIndex >= board.length || board[cardIndex].revealed) {
    throw new Error("Invalid card");
  }

  const card = board[cardIndex];
  // Count all guessers on the team (not just connected) so threshold stays
  // consistent even if someone's connection temporarily drops
  const guessers = Object.values(playersData).filter(
    (p) => p.team === roomData.currentTeam && p.role === "guesser"
  );
  const required = getRequiredVotes(guessers.length);
  const voteCount = Object.keys(card.votes || {}).length;

  if (voteCount < required || !card.votes?.[playerId]) {
    throw new Error("Not enough votes");
  }

  // Use transaction to atomically claim the reveal (prevents race condition)
  // If two players try to reveal simultaneously, only one will succeed
  const transactionResult = await runTransaction(cardRevealedRef, (currentRevealed) => {
    if (currentRevealed === true) {
      // Card already revealed by another player - abort transaction
      return undefined;
    }
    return true;
  });

  if (!transactionResult.committed) {
    throw new Error("Card already revealed");
  }

  const isCorrect = card.team === roomData.currentTeam;
  const isTrap = card.team === "trap";
  // Count remaining team cards (excluding the one we're about to reveal)
  const remainingTeamCards = board.filter(
    (c, i) => c.team === roomData.currentTeam && !c.revealed && i !== cardIndex
  ).length;
  const newGuesses = (roomData.remainingGuesses ?? 1) - 1;

  // Build system message for the reveal
  const teamLabel = card.team === "red" ? "Red" 
    : card.team === "blue" ? "Blue" 
    : card.team === "trap" ? "Trap" 
    : "Neutral";
  const teamEmoji = card.team === "red" ? "🔴" 
    : card.team === "blue" ? "🔵" 
    : card.team === "trap" ? "⬛" 
    : "🟡";
  const revealMessage = `${teamEmoji} "${card.word}" revealed — ${teamLabel}`;

  // Update remaining card fields and game state
  // Note: revealed is already set to true by the transaction above
  const cardUpdate = {
    [`board/${cardIndex}/revealedBy`]: playerId,
    [`board/${cardIndex}/votes`]: {},
  };

  if (isTrap) {
    await update(roomRef, {
      ...cardUpdate,
      gameOver: true,
      winner: roomData.currentTeam === "red" ? "blue" : "red",
      currentClue: null,
      remainingGuesses: null,
      turnStartTime: null,
    });
  } else if (!isCorrect || newGuesses === 0) {
    const newTeam = roomData.currentTeam === "red" ? "blue" : "red";
    const pause = checkPause(playersData, newTeam, false);
    // Clear votes from all unrevealed cards when turn ends
    const boardVotesCleared: Record<string, null> = {};
    board.forEach((c, i) => {
      if (!c.revealed && i !== cardIndex) {
        boardVotesCleared[`board/${i}/votes`] = null;
      }
    });
    await update(roomRef, {
      ...cardUpdate,
      ...boardVotesCleared,
      currentTeam: newTeam,
      currentClue: null,
      remainingGuesses: null,
      turnStartTime: pause.paused ? null : serverTimestamp(),
      paused: pause.paused,
      pauseReason: pause.reason,
      pausedForTeam: pause.team,
    });
  } else if (remainingTeamCards === 0) {
    await update(roomRef, {
      ...cardUpdate,
      gameOver: true,
      winner: roomData.currentTeam,
      currentClue: null,
      remainingGuesses: null,
      turnStartTime: null,
    });
  } else {
    await update(roomRef, {
      ...cardUpdate,
      remainingGuesses: newGuesses,
    });
  }

  // Add system message about the reveal (after board update)
  await push(ref(db, `rooms/${roomCode}/messages`), {
    playerId: null,
    playerName: "System",
    message: revealMessage,
    timestamp: serverTimestamp(),
    type: "system",
  });
}

export async function endTurn(roomCode: string): Promise<void> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (!roomData.gameStarted || roomData.gameOver) throw new Error("Game not active");

  const playersData = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const newTeam = roomData.currentTeam === "red" ? "blue" : "red";
  const pause = checkPause(playersData, newTeam, false);
  
  // Clear votes from all unrevealed cards using explicit paths
  const board = roomData.board || [];
  const votesCleared: Record<string, null> = {};
  board.forEach((c, i) => {
    if (!c.revealed) {
      votesCleared[`board/${i}/votes`] = null;
    }
  });

  await update(roomRef, {
    ...votesCleared,
    currentTeam: newTeam,
    currentClue: null,
    remainingGuesses: null,
    turnStartTime: pause.paused ? null : serverTimestamp(),
    paused: pause.paused,
    pauseReason: pause.reason,
    pausedForTeam: pause.team,
  });
}

// ============================================================================
// Chat
// ============================================================================

export async function sendMessage(
  roomCode: string,
  playerId: string,
  message: string,
  type: "clue" | "chat"
): Promise<void> {
  const sanitized = sanitizeChatMessage(message);
  if (!sanitized) throw new Error("Message cannot be empty");

  const db = getDb();
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  const playerSnap = await get(playerRef);

  if (!playerSnap.exists()) throw new Error("Player not found");
  const playerData = playerSnap.val() as PlayerData;

  await push(ref(db, `rooms/${roomCode}/messages`), {
    playerId,
    playerName: playerData.name,
    message: sanitized,
    timestamp: serverTimestamp(),
    type,
  });
}

// ============================================================================
// Presence - not needed with onDisconnect, but keeping for manual cleanup
// ============================================================================

export async function pruneStalePlayers(
  roomCode: string,
  requesterId: string,
  graceMs: number
): Promise<string[]> {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);

  const [roomSnap, playersSnap] = await Promise.all([get(roomRef), get(playersRef)]);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.val() as RoomData;
  if (roomData.ownerId !== requesterId) throw new Error("Not room owner");

  const players = (playersSnap.val() || {}) as Record<string, PlayerData>;
  const now = Date.now();

  // Find stale players who are disconnected beyond grace period AND have a team/role
  const stalePlayers: { id: string; name: string }[] = [];

  Object.entries(players).forEach(([id, p]) => {
    if (p.connected === true) return;
    if (!p.lastSeen || now - p.lastSeen >= graceMs) {
      // Only count as stale if they have a team or role to clear
      if (p.team !== null || p.role !== null) {
        stalePlayers.push({ id, name: p.name });
      }
    }
  });

  if (stalePlayers.length === 0) return [];

  const updates: Record<string, any> = {};

  // Clear team/role for stale players so they no longer block readiness/roles
  stalePlayers.forEach(({ id }) => {
    const player = players[id];
    if (!player) return;
    if (player.team !== null) updates[`players/${id}/team`] = null;
    if (player.role !== null) updates[`players/${id}/role`] = null;
  });

  // Remove stale votes from board (if any)
  const staleIds = new Set(stalePlayers.map((p) => p.id));
  const board = roomData.board || [];
  let boardChanged = false;
  const updatedBoard = board.map((card) => {
    if (!card.votes) return card;
    const votes = votesToArray(card.votes);
    const filteredVotes = votes.filter((id) => !staleIds.has(id));
    if (filteredVotes.length === votes.length) return card;
    boardChanged = true;
    return { ...card, votes: arrayToVotes(filteredVotes) };
  });

  if (boardChanged) {
    updates.board = updatedBoard;
  }

  if (Object.keys(updates).length > 0) {
    await update(roomRef, updates);
  }

  // Add system message for each demoted player (batch them to avoid spam)
  if (stalePlayers.length > 0) {
    const names = stalePlayers.map((p) => p.name).join(", ");
    const message = stalePlayers.length === 1
      ? `${names} moved to spectators (disconnected)`
      : `${names} moved to spectators (disconnected)`;
    await push(ref(db, `rooms/${roomCode}/messages`), {
      playerId: null,
      playerName: "System",
      message,
      timestamp: serverTimestamp(),
      type: "system",
    });
  }

  return stalePlayers.map((p) => p.id);
}

export async function deleteRoom(roomCode: string): Promise<void> {
  const db = getDb();
  await remove(ref(db, `rooms/${roomCode}`));
}
