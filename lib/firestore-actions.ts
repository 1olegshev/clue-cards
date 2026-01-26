/**
 * Firestore actions for game operations.
 * All game state mutations go through these functions.
 */

import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
  serverTimestamp,
  runTransaction,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { getFirestore } from "./firebase";
import { generateBoard, assignTeams } from "@/shared/words";
import { isValidClue, teamsAreReady, shufflePlayers, getRequiredVotes } from "@/shared/game-utils";
import type { Player, Team, PauseReason } from "@/shared/types";

const TURN_DURATIONS = [30, 60, 90] as const;

// Helper to get Firestore instance
function getDb() {
  const db = getFirestore();
  if (!db) {
    throw new Error("Firestore not initialized");
  }
  return db;
}

// ============================================================================
// Pause Logic Helpers
// ============================================================================

interface PauseCheckResult {
  shouldPause: boolean;
  reason: PauseReason;
  team: Team | null;
}

/**
 * Check if game should pause based on connected players for a team.
 * Called at turn transitions before the new turn begins.
 */
function checkPauseConditions(
  playersData: Array<{ team: string | null; role: string | null; connected: boolean }>,
  currentTeam: "red" | "blue",
  hasClue: boolean
): PauseCheckResult {
  const teamPlayers = playersData.filter((p) => p.team === currentTeam);
  const connectedSpymaster = teamPlayers.find(
    (p) => p.role === "spymaster" && p.connected
  );
  const connectedOperatives = teamPlayers.filter(
    (p) => p.role === "operative" && p.connected
  );

  // Check if entire team is disconnected
  const anyConnected = teamPlayers.some((p) => p.connected);
  if (!anyConnected) {
    return { shouldPause: true, reason: "teamDisconnected", team: currentTeam };
  }

  // If no clue yet, spymaster must be connected
  if (!hasClue && !connectedSpymaster) {
    return { shouldPause: true, reason: "spymasterDisconnected", team: currentTeam };
  }

  // If clue given, at least one operative must be connected
  if (hasClue && connectedOperatives.length === 0) {
    return { shouldPause: true, reason: "noOperatives", team: currentTeam };
  }

  return { shouldPause: false, reason: null, team: null };
}

/**
 * Check if pause conditions are resolved (for resume validation).
 */
function canResume(
  playersData: Array<{ team: string | null; role: string | null; connected: boolean }>,
  currentTeam: "red" | "blue"
): boolean {
  const teamPlayers = playersData.filter((p) => p.team === currentTeam);
  const connectedSpymaster = teamPlayers.find(
    (p) => p.role === "spymaster" && p.connected
  );
  const connectedOperatives = teamPlayers.filter(
    (p) => p.role === "operative" && p.connected
  );

  // Need at least spymaster and 1 operative connected
  return Boolean(connectedSpymaster && connectedOperatives.length >= 1);
}

// ============================================================================
// Room Management
// ============================================================================

/**
 * Join a room as a player
 * Uses transaction to atomically handle room creation and owner assignment
 */
export async function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string
): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    const playerSnap = await transaction.get(playerRef);

    if (!roomSnap.exists()) {
      // Create new room with this player as owner
      const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";
      transaction.set(roomRef, {
        ownerId: playerId,
        currentTeam: startingTeam,
        startingTeam,
        currentClue: null,
        remainingGuesses: null,
        turnStartTime: null,
        turnDuration: 60,
        gameStarted: false,
        gameOver: false,
        winner: null,
        paused: false,
        pauseReason: null,
        pausedForTeam: null,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      });
    } else {
      // Room exists, update lastActivity
      transaction.update(roomRef, {
        lastActivity: serverTimestamp(),
      });
    }

    if (playerSnap.exists()) {
      // Update existing player (reconnecting)
      transaction.update(playerRef, {
        name: playerName,
        connected: true,
        lastSeen: serverTimestamp(),
      });
    } else {
      // Create new player
      transaction.set(playerRef, {
        name: playerName,
        team: null,
        role: null,
        connected: true,
        lastSeen: serverTimestamp(),
      });

      // If room already existed but has no owner, set this player as owner
      if (roomSnap.exists() && !roomSnap.data().ownerId) {
        transaction.update(roomRef, {
          ownerId: playerId,
        });
      }
    }
  });
}

/**
 * Leave a room (mark player as disconnected)
 */
export async function leaveRoom(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);

  // Clear votes from this player
  const boardSnap = await getDocs(collection(db, "rooms", roomCode, "board"));
  const batch = writeBatch(db);

  boardSnap.docs.forEach((cardDoc) => {
    const cardData = cardDoc.data();
    if (cardData.votes && Array.isArray(cardData.votes) && cardData.votes.includes(playerId)) {
      const newVotes = cardData.votes.filter((id: string) => id !== playerId);
      batch.update(cardDoc.ref, { votes: newVotes });
    }
  });

  // Mark player as disconnected
  batch.update(playerRef, {
    connected: false,
    lastSeen: serverTimestamp(),
  });

  await batch.commit();
}

// ============================================================================
// Game Lifecycle
// ============================================================================

/**
 * Start the game
 */
export async function startGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Read collections BEFORE transaction (collections can't be locked in transactions)
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players: Player[] = playersSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      name: docSnap.data().name,
      team: docSnap.data().team,
      role: docSnap.data().role,
    }))
    .filter((p) => p.team && p.role) as Player[];

  if (!teamsAreReady(players)) throw new Error("Teams not ready");

  // Get existing board document IDs to delete
  const existingBoardSnap = await getDocs(collection(db, "rooms", roomCode, "board"));
  const existingCardIds = existingBoardSnap.docs.map((docSnap) => docSnap.id);

  // Generate new board
  const boardWords = generateBoard();

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (roomData.ownerId !== playerId) throw new Error("Not room owner");
    if (roomData.gameStarted) throw new Error("Game already started");

    const startingTeam = roomData.startingTeam as "red" | "blue";
    const cards = assignTeams(boardWords, startingTeam);

    // Update room state
    transaction.update(roomRef, {
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
      lastActivity: serverTimestamp(),
    });

    // Clear existing board
    existingCardIds.forEach((cardId) => {
      transaction.delete(doc(db, "rooms", roomCode, "board", cardId));
    });

    // Create new board
    cards.forEach((card, index) => {
      const cardRef = doc(db, "rooms", roomCode, "board", index.toString());
      transaction.set(cardRef, {
        word: card.word,
        team: card.team,
        revealed: false,
        revealedBy: null,
        votes: [],
      });
    });
  });
}

/**
 * Start a rematch
 */
export async function rematch(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Read collections BEFORE transaction
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players: Player[] = playersSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      name: docSnap.data().name,
      team: docSnap.data().team,
      role: docSnap.data().role,
    }))
    .filter((p) => p.team && p.role) as Player[];

  if (!teamsAreReady(players)) throw new Error("Teams not ready");

  // Get existing board and message IDs to delete
  const existingBoardSnap = await getDocs(collection(db, "rooms", roomCode, "board"));
  const existingCardIds = existingBoardSnap.docs.map((docSnap) => docSnap.id);
  const messagesSnap = await getDocs(collection(db, "rooms", roomCode, "messages"));
  const messageIds = messagesSnap.docs.map((docSnap) => docSnap.id);

  // Generate new board
  const boardWords = generateBoard();
  const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";
  const cards = assignTeams(boardWords, startingTeam);

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (roomData.ownerId !== playerId) throw new Error("Not room owner");
    if (!roomData.gameOver) throw new Error("Game not over");

    // Update room state
    transaction.update(roomRef, {
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
      lastActivity: serverTimestamp(),
    });

    // Clear existing board
    existingCardIds.forEach((cardId) => {
      transaction.delete(doc(db, "rooms", roomCode, "board", cardId));
    });

    // Create new board
    cards.forEach((card, index) => {
      const cardRef = doc(db, "rooms", roomCode, "board", index.toString());
      transaction.set(cardRef, {
        word: card.word,
        team: card.team,
        revealed: false,
        revealedBy: null,
        votes: [],
      });
    });

    // Clear messages
    messageIds.forEach((msgId) => {
      transaction.delete(doc(db, "rooms", roomCode, "messages", msgId));
    });
  });
}

/**
 * End the game and return to lobby
 */
export async function endGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Read players BEFORE transaction
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const playerIds = playersSnap.docs.map((docSnap) => docSnap.id);

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (roomData.ownerId !== playerId) throw new Error("Not room owner");
    if (!roomData.gameStarted || roomData.gameOver) throw new Error("Invalid game state");

    // Update room state
    transaction.update(roomRef, {
      gameStarted: false,
      gameOver: false,
      winner: null,
      currentClue: null,
      remainingGuesses: null,
      turnStartTime: null,
      paused: false,
      pauseReason: null,
      pausedForTeam: null,
      lastActivity: serverTimestamp(),
    });

    // Clear team/role assignments
    playerIds.forEach((pId) => {
      transaction.update(doc(db, "rooms", roomCode, "players", pId), {
        team: null,
        role: null,
      });
    });

    // Add system message
    const messagesRef = collection(db, "rooms", roomCode, "messages");
    transaction.set(doc(messagesRef), {
      playerId: null,
      playerName: "System",
      message: "Game ended by room owner. Players can now re-select teams.",
      timestamp: serverTimestamp(),
      type: "system",
    });
  });
}

/**
 * Resume a paused game (host only)
 * Validates that conditions are met before resuming
 */
export async function resumeGame(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Read players BEFORE transaction
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const playersData = playersSnap.docs.map((docSnap) => ({
    team: docSnap.data().team,
    role: docSnap.data().role,
    connected: docSnap.data().connected,
  }));

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (roomData.ownerId !== playerId) throw new Error("Not room owner");
    if (!roomData.paused) throw new Error("Game not paused");
    if (!roomData.gameStarted || roomData.gameOver) throw new Error("Invalid game state");

    const currentTeam = roomData.currentTeam as "red" | "blue";

    // Verify conditions are met to resume
    if (!canResume(playersData, currentTeam)) {
      throw new Error("Cannot resume: team needs connected spymaster and at least one operative");
    }

    // Resume game
    transaction.update(roomRef, {
      paused: false,
      pauseReason: null,
      pausedForTeam: null,
      turnStartTime: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });

    // Add system message
    const messagesRef = collection(db, "rooms", roomCode, "messages");
    transaction.set(doc(messagesRef), {
      playerId: null,
      playerName: "System",
      message: "Game resumed by room owner.",
      timestamp: serverTimestamp(),
      type: "system",
    });
  });
}

// ============================================================================
// Lobby Actions
// ============================================================================

/**
 * Set turn duration
 */
export async function setTurnDuration(
  roomCode: string,
  playerId: string,
  duration: number
): Promise<void> {
  if (!TURN_DURATIONS.includes(duration as any)) {
    throw new Error("Invalid turn duration");
  }

  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (roomData.ownerId !== playerId) throw new Error("Not room owner");
    if (roomData.gameStarted) throw new Error("Game already started");

    transaction.update(roomRef, {
      turnDuration: duration,
      lastActivity: serverTimestamp(),
    });
  });
}

/**
 * Set player's lobby role
 */
export async function setLobbyRole(
  roomCode: string,
  playerId: string,
  team: "red" | "blue" | null,
  role: "spymaster" | "operative" | null
): Promise<void> {
  const db = getDb();
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);
  const roomRef = doc(db, "rooms", roomCode);

  // Check for duplicate spymaster BEFORE transaction
  if (role === "spymaster" && team) {
    const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
    const existingSpymaster = playersSnap.docs.find(
      (docSnap) =>
        docSnap.id !== playerId &&
        docSnap.data().team === team &&
        docSnap.data().role === "spymaster"
    );
    if (existingSpymaster) {
      throw new Error("Team already has a spymaster");
    }
  }

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    // Allow role changes in lobby, after game over, or when paused
    if (roomData.gameStarted && !roomData.gameOver && !roomData.paused) {
      throw new Error("Cannot change role during active game");
    }

    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error("Player not found");

    if (!team || !role) {
      // Clear assignment
      transaction.update(playerRef, {
        team: null,
        role: null,
      });
      return;
    }

    transaction.update(playerRef, {
      team,
      role,
    });

    transaction.update(roomRef, {
      lastActivity: serverTimestamp(),
    });
  });
}

/**
 * Randomize team assignments
 */
export async function randomizeTeams(roomCode: string, playerId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Get all players BEFORE transaction
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const players = playersSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    name: docSnap.data().name,
    team: docSnap.data().team,
    role: docSnap.data().role,
  }));

  if (players.length < 4 || players.length % 2 !== 0) {
    throw new Error("Need even number of players (4+)");
  }

  // Shuffle and assign teams
  const shuffled = shufflePlayers(players);
  const teamSize = players.length / 2;
  const redTeam = shuffled.slice(0, teamSize);
  const blueTeam = shuffled.slice(teamSize);

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (roomData.ownerId !== playerId) throw new Error("Not room owner");
    if (roomData.gameStarted && !roomData.gameOver) {
      throw new Error("Cannot randomize during active game");
    }

    redTeam.forEach((player, index) => {
      const playerRef = doc(db, "rooms", roomCode, "players", player.id);
      transaction.update(playerRef, {
        team: "red",
        role: index === 0 ? "spymaster" : "operative",
      });
    });

    blueTeam.forEach((player, index) => {
      const playerRef = doc(db, "rooms", roomCode, "players", player.id);
      transaction.update(playerRef, {
        team: "blue",
        role: index === 0 ? "spymaster" : "operative",
      });
    });

    transaction.update(roomRef, {
      lastActivity: serverTimestamp(),
    });
  });
}

// ============================================================================
// Gameplay Actions
// ============================================================================

/**
 * Give a clue (spymaster)
 */
export async function giveClue(
  roomCode: string,
  playerId: string,
  word: string,
  count: number
): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Validate clue format early
  const trimmed = word.trim();
  if (!trimmed || !Number.isFinite(count) || count < 0) {
    throw new Error("Invalid clue");
  }
  if (/\s/.test(trimmed)) throw new Error("Clue must be single word");

  // Get board words for validation BEFORE transaction
  const boardSnap = await getDocs(collection(db, "rooms", roomCode, "board"));
  const boardWords = boardSnap.docs.map((docSnap) => docSnap.data().word);
  const cardIds = boardSnap.docs.map((docSnap) => docSnap.id);
  
  if (!isValidClue(trimmed, boardWords)) {
    throw new Error("Invalid clue word");
  }

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (!roomData.gameStarted || roomData.gameOver) throw new Error("Game not active");
    if (roomData.currentClue) throw new Error("Clue already given");

    // Get player
    const playerRef = doc(db, "rooms", roomCode, "players", playerId);
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error("Player not found");

    const playerData = playerSnap.data();
    if (
      playerData.role !== "spymaster" ||
      playerData.team !== roomData.currentTeam
    ) {
      throw new Error("Not current team's spymaster");
    }

    // Update room state
    transaction.update(roomRef, {
      currentClue: { word: trimmed.toUpperCase(), count },
      remainingGuesses: count + 1,
      turnStartTime: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });

    // Clear all votes
    cardIds.forEach((cardId) => {
      transaction.update(doc(db, "rooms", roomCode, "board", cardId), { votes: [] });
    });

    // Add clue message
    const messagesRef = collection(db, "rooms", roomCode, "messages");
    transaction.set(doc(messagesRef), {
      playerId,
      playerName: playerData.name,
      message: `${trimmed} ${count}`,
      timestamp: serverTimestamp(),
      type: "clue",
    });
  });
}

/**
 * Vote for a card (operative)
 */
export async function voteCard(roomCode: string, playerId: string, cardIndex: number): Promise<void> {
  const db = getDb();
  const cardRef = doc(db, "rooms", roomCode, "board", cardIndex.toString());
  const roomRef = doc(db, "rooms", roomCode);

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (!roomData.gameStarted || roomData.gameOver) throw new Error("Game not active");
    if (!roomData.currentClue || !roomData.remainingGuesses || roomData.remainingGuesses <= 0) {
      throw new Error("No active clue");
    }

    // Get player
    const playerRef = doc(db, "rooms", roomCode, "players", playerId);
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error("Player not found");

    const playerData = playerSnap.data();
    if (
      playerData.role !== "operative" ||
      playerData.team !== roomData.currentTeam
    ) {
      throw new Error("Not current team's operative");
    }

    // Get card
    const cardSnap = await transaction.get(cardRef);
    if (!cardSnap.exists()) throw new Error("Card not found");

    const cardData = cardSnap.data();
    if (cardData.revealed) throw new Error("Card already revealed");

    // Toggle vote
    const votes = cardData.votes || [];
    const existingIndex = votes.indexOf(playerId);
    if (existingIndex >= 0) {
      transaction.update(cardRef, {
        votes: arrayRemove(playerId),
      });
    } else {
      transaction.update(cardRef, {
        votes: arrayUnion(playerId),
      });
    }

    transaction.update(roomRef, {
      lastActivity: serverTimestamp(),
    });
  });
}

/**
 * Confirm card reveal after enough votes
 */
export async function confirmReveal(roomCode: string, playerId: string, cardIndex: number): Promise<void> {
  const db = getDb();
  const cardRef = doc(db, "rooms", roomCode, "board", cardIndex.toString());
  const roomRef = doc(db, "rooms", roomCode);

  // Read collections BEFORE transaction
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const boardSnap = await getDocs(collection(db, "rooms", roomCode, "board"));
  const cardIds = boardSnap.docs.map((docSnap) => docSnap.id);
  const playersData = playersSnap.docs.map((docSnap) => ({
    team: docSnap.data().team,
    role: docSnap.data().role,
    connected: docSnap.data().connected,
  }));

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (!roomData.gameStarted || roomData.gameOver) throw new Error("Game not active");
    if (!roomData.currentClue || !roomData.remainingGuesses || roomData.remainingGuesses <= 0) {
      throw new Error("No active clue");
    }

    // Get player
    const playerRef = doc(db, "rooms", roomCode, "players", playerId);
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error("Player not found");

    const playerData = playerSnap.data();
    if (
      playerData.role !== "operative" ||
      playerData.team !== roomData.currentTeam
    ) {
      throw new Error("Not current team's operative");
    }

    // Get card
    const cardSnap = await transaction.get(cardRef);
    if (!cardSnap.exists()) throw new Error("Card not found");

    const cardData = cardSnap.data();
    if (cardData.revealed) throw new Error("Card already revealed");

    // Check votes
    const votes = cardData.votes || [];
    
    // Calculate required votes from pre-read players data
    const operatives = playersSnap.docs.filter(
      (docSnap) =>
        docSnap.data().team === roomData.currentTeam &&
        docSnap.data().role === "operative" &&
        docSnap.data().connected
    );
    const requiredVotes = getRequiredVotes(operatives.length);

    if (votes.length < requiredVotes || !votes.includes(playerId)) {
      throw new Error("Not enough votes or player didn't vote");
    }

    // Reveal card
    transaction.update(cardRef, {
      revealed: true,
      revealedBy: playerId,
      votes: [],
    });

    const isCorrect = cardData.team === roomData.currentTeam;
    const isAssassin = cardData.team === "assassin";

    // Check for game over
    if (isAssassin) {
      // Assassin - other team wins
      transaction.update(roomRef, {
        gameOver: true,
        winner: roomData.currentTeam === "red" ? "blue" : "red",
        currentClue: null,
        remainingGuesses: null,
        turnStartTime: null,
        lastActivity: serverTimestamp(),
      });
    } else if (!isCorrect) {
      // Wrong team or neutral - end turn
      const newTeam = roomData.currentTeam === "red" ? "blue" : "red";
      const pauseCheck = checkPauseConditions(playersData, newTeam, false);
      transaction.update(roomRef, {
        currentTeam: newTeam,
        turnStartTime: pauseCheck.shouldPause ? null : serverTimestamp(),
        currentClue: null,
        remainingGuesses: null,
        paused: pauseCheck.shouldPause,
        pauseReason: pauseCheck.reason,
        pausedForTeam: pauseCheck.team,
        lastActivity: serverTimestamp(),
      });
    } else {
      // Correct - decrement guesses
      const newRemainingGuesses = Math.max(0, roomData.remainingGuesses - 1);
      
      // Check if all team cards will be revealed (excluding current card being revealed)
      const currentTeamCardsRemaining = boardSnap.docs.filter(
        (docSnap) =>
          docSnap.data().team === roomData.currentTeam && 
          !docSnap.data().revealed &&
          docSnap.id !== cardIndex.toString() // Exclude the card we're revealing
      );

      if (currentTeamCardsRemaining.length === 0) {
        // Team wins (this was the last card)
        transaction.update(roomRef, {
          gameOver: true,
          winner: roomData.currentTeam,
          currentClue: null,
          remainingGuesses: null,
          turnStartTime: null,
          lastActivity: serverTimestamp(),
        });
      } else if (newRemainingGuesses === 0) {
        // Out of guesses - end turn
        const newTeam = roomData.currentTeam === "red" ? "blue" : "red";
        const pauseCheck = checkPauseConditions(playersData, newTeam, false);
        transaction.update(roomRef, {
          currentTeam: newTeam,
          turnStartTime: pauseCheck.shouldPause ? null : serverTimestamp(),
          currentClue: null,
          remainingGuesses: null,
          paused: pauseCheck.shouldPause,
          pauseReason: pauseCheck.reason,
          pausedForTeam: pauseCheck.team,
          lastActivity: serverTimestamp(),
        });
      } else {
        // Continue guessing
        transaction.update(roomRef, {
          remainingGuesses: newRemainingGuesses,
          lastActivity: serverTimestamp(),
        });
      }
    }

    // Clear all votes
    cardIds.forEach((cId) => {
      transaction.update(doc(db, "rooms", roomCode, "board", cId), { votes: [] });
    });
  });
}

/**
 * End the current turn
 */
export async function endTurn(roomCode: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, "rooms", roomCode);

  // Get card IDs and players BEFORE transaction
  const boardSnap = await getDocs(collection(db, "rooms", roomCode, "board"));
  const cardIds = boardSnap.docs.map((docSnap) => docSnap.id);
  const playersSnap = await getDocs(collection(db, "rooms", roomCode, "players"));
  const playersData = playersSnap.docs.map((docSnap) => ({
    team: docSnap.data().team,
    role: docSnap.data().role,
    connected: docSnap.data().connected,
  }));

  return runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");

    const roomData = roomSnap.data();
    if (!roomData.gameStarted || roomData.gameOver) throw new Error("Game not active");

    const newTeam = roomData.currentTeam === "red" ? "blue" : "red";

    // Check if new team can play (no clue yet at turn start)
    const pauseCheck = checkPauseConditions(playersData, newTeam, false);

    // Switch teams (and possibly pause)
    transaction.update(roomRef, {
      currentTeam: newTeam,
      turnStartTime: pauseCheck.shouldPause ? null : serverTimestamp(),
      currentClue: null,
      remainingGuesses: null,
      paused: pauseCheck.shouldPause,
      pauseReason: pauseCheck.reason,
      pausedForTeam: pauseCheck.team,
      lastActivity: serverTimestamp(),
    });

    // Clear all votes
    cardIds.forEach((cardId) => {
      transaction.update(doc(db, "rooms", roomCode, "board", cardId), { votes: [] });
    });
  });
}

// ============================================================================
// Chat
// ============================================================================

/**
 * Send a chat message
 */
export async function sendMessage(
  roomCode: string,
  playerId: string,
  message: string,
  messageType: "clue" | "chat"
): Promise<void> {
  const db = getDb();
  const playerRef = doc(db, "rooms", roomCode, "players", playerId);
  const messagesRef = collection(db, "rooms", roomCode, "messages");

  const playerSnap = await getDoc(playerRef);
  if (!playerSnap.exists()) throw new Error("Player not found");

  const playerData = playerSnap.data();

  await addDoc(messagesRef, {
    playerId,
    playerName: playerData.name,
    message: message.trim(),
    timestamp: serverTimestamp(),
    type: messageType,
  });
}
