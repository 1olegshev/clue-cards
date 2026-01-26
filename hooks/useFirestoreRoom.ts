/**
 * Firestore-based room connection hook.
 * Manages real-time subscriptions to room, players, board, and messages.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestore } from "@/lib/firebase";
import type { GameState, Player, ChatMessage, RoomClosedReason } from "@/shared/types";
import { LOCAL_STORAGE_PLAYER_ID_KEY } from "@/shared/constants";
import { useGameContext } from "@/components/GameContext";
import * as actions from "@/lib/firestore-actions";

export interface UseFirestoreRoomReturn {
  // State
  gameState: GameState | null;
  players: Player[];
  currentPlayer: Player | null;
  messages: ChatMessage[];
  isConnecting: boolean;
  connectionError: string | null;
  connectedPlayerCount: number;
  roomClosedReason: RoomClosedReason | null;
  chatInput: string;
  setChatInput: (value: string) => void;

  // Handlers
  handleStartGame: () => void;
  handleSetLobbyRole: (team: "red" | "blue" | null, role: "spymaster" | "operative" | null) => void;
  handleRandomizeTeams: () => void;
  handleRematch: () => void;
  handleEndGame: () => void;
  handleResumeGame: () => void;
  handleVoteCard: (index: number) => void;
  handleConfirmReveal: (index: number) => void;
  handleEndTurn: () => void;
  handleSendMessage: (e: React.FormEvent) => void;
  handleGiveClue: (word: string, count: number) => void;
  handleTurnDurationChange: (duration: number) => void;
}

// Helper to convert Firestore data to GameState
function convertToGameState(
  roomCode: string,
  roomData: any,
  players: Player[],
  board: any[],
  playerId: string | null
): GameState | null {
  if (!roomData) return null;

  // Convert board array to Card[]
  const cards = board
    .sort((a, b) => parseInt(a.id) - parseInt(b.id))
    .map((cardDoc) => ({
      word: cardDoc.word,
      team: cardDoc.team,
      revealed: cardDoc.revealed || false,
      revealedBy: cardDoc.revealedBy || undefined,
    }));

  // Convert card votes from board documents (use card's ID as index, not array position)
  const cardVotes: Record<number, string[]> = {};
  board.forEach((cardDoc) => {
    const cardIndex = parseInt(cardDoc.id, 10);
    if (cardDoc.votes && cardDoc.votes.length > 0 && !isNaN(cardIndex)) {
      cardVotes[cardIndex] = cardDoc.votes;
    }
  });

  // Convert timestamps
  const turnStartTime = roomData.turnStartTime
    ? (roomData.turnStartTime as Timestamp).toMillis()
    : null;

  return {
    roomCode: roomCode,
    players,
    board: cards,
    ownerId: roomData.ownerId || null,
    cardVotes,
    currentTeam: roomData.currentTeam || "red",
    startingTeam: roomData.startingTeam || "red",
    currentClue: roomData.currentClue || null,
    remainingGuesses: roomData.remainingGuesses ?? null,
    turnStartTime,
    turnDuration: roomData.turnDuration || 60,
    gameStarted: roomData.gameStarted || false,
    gameOver: roomData.gameOver || false,
    winner: roomData.winner || null,
    paused: roomData.paused || false,
    pauseReason: roomData.pauseReason || null,
    pausedForTeam: roomData.pausedForTeam || null,
  };
}

// Helper to convert Firestore message to ChatMessage
function convertToChatMessage(msgDoc: any): ChatMessage {
  const data = msgDoc.data();
  return {
    id: msgDoc.id,
    playerId: data.playerId || undefined,
    playerName: data.playerName,
    message: data.message,
    timestamp: data.timestamp ? (data.timestamp as Timestamp).toMillis() : Date.now(),
    type: data.type,
  };
}

export function useFirestoreRoom(
  roomCode: string,
  playerName: string
): UseFirestoreRoomReturn {
  const { setIsLastPlayer, setIsActiveGame } = useGameContext();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectedPlayerCount, setConnectedPlayerCount] = useState(0);
  const [roomClosedReason, setRoomClosedReason] = useState<RoomClosedReason | null>(null);

  const playerIdRef = useRef<string | null>(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);
  
  // Refs to store latest snapshot data for efficient state assembly
  const roomDataRef = useRef<any>(null);
  const playersDataRef = useRef<Player[]>([]);
  const boardDataRef = useRef<any[]>([]);

  // Initialize player ID
  useEffect(() => {
    const storedPlayerId = window.sessionStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
    playerIdRef.current = storedPlayerId;
  }, []);

  // Join room and set up listeners
  useEffect(() => {
    console.log("useFirestoreRoom effect:", { roomCode, playerName });
    
    if (!playerName || !roomCode) {
      console.log("Missing roomCode or playerName, skipping");
      return;
    }

    const db = getFirestore();
    console.log("Firestore db:", db ? "initialized" : "NOT initialized");
    
    if (!db) {
      setConnectionError("Firestore not initialized. Check Firebase configuration.");
      setIsConnecting(false);
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    let playerId = playerIdRef.current;
    if (!playerId) {
      // Generate new player ID
      playerId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      playerIdRef.current = playerId;
      window.sessionStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, playerId);
    }

    // Function to assemble game state from refs (no additional reads)
    const assembleGameState = () => {
      if (!roomDataRef.current) {
        setGameState(null);
        return;
      }
      const state = convertToGameState(
        roomCode,
        roomDataRef.current,
        playersDataRef.current,
        boardDataRef.current,
        playerId
      );
      setGameState(state);
    };

    // Set up presence updates (every 30 seconds) - only after join succeeds
    const updatePresence = () => {
      if (playerId) {
        const playerRef = doc(db, "rooms", roomCode, "players", playerId);
        updateDoc(playerRef, {
          connected: true,
          lastSeen: serverTimestamp(),
        }).catch((err) => console.error("Presence update failed:", err));
      }
    };

    // Track if room has been created (to handle initial listener state)
    let roomCreated = false;

    // Listen to room document
    const roomRef = doc(db, "rooms", roomCode);
    const unsubscribeRoom = onSnapshot(
      roomRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          // Only show "room closed" if room was previously created
          if (roomCreated) {
            setRoomClosedReason("allPlayersLeft");
            roomDataRef.current = null;
            setGameState(null);
          }
          return;
        }
        // Room exists
        roomCreated = true;
        // Store room data and reassemble state
        roomDataRef.current = snapshot.data();
        assembleGameState();
      },
      (error) => {
        console.error("Room listener error:", error);
        setConnectionError(error.message);
        setIsConnecting(false);
      }
    );

    // Join room AFTER setting up listeners
    console.log("Calling joinRoom:", { roomCode, playerId, playerName });
    actions
      .joinRoom(roomCode, playerId, playerName)
      .then(() => {
        console.log("joinRoom succeeded");
        setIsConnecting(false);
        // Start presence updates only after successful join
        presenceIntervalRef.current = setInterval(updatePresence, 30000);
        updatePresence();
      })
      .catch((error) => {
        console.error("Error joining room:", error);
        setConnectionError(error.message || "Failed to join room");
        setIsConnecting(false);
      });

    // Listen to players collection
    const playersRef = collection(db, "rooms", roomCode, "players");
    const unsubscribePlayers = onSnapshot(
      playersRef,
      (snapshot) => {
        const playersList: Player[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          name: docSnap.data().name,
          team: docSnap.data().team || null,
          role: docSnap.data().role || null,
        }));

        // Store in ref and update state
        playersDataRef.current = playersList;
        setPlayers(playersList);

        // Find current player
        const current = playerId
          ? playersList.find((p) => p.id === playerId)
          : playersList.find((p) => p.name === playerName);
        setCurrentPlayer(current || null);

        // Count connected players
        const connected = snapshot.docs.filter((docSnap) => docSnap.data().connected === true).length;
        setConnectedPlayerCount(connected);

        // Reassemble game state
        assembleGameState();
      },
      (error) => {
        console.error("Players listener error:", error);
      }
    );

    // Listen to board collection
    const boardRef = collection(db, "rooms", roomCode, "board");
    const unsubscribeBoard = onSnapshot(
      boardRef,
      (snapshot) => {
        // Store board data with IDs and reassemble state
        boardDataRef.current = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        assembleGameState();
      },
      (error) => {
        console.error("Board listener error:", error);
      }
    );

    // Listen to messages collection (limit to recent 100)
    const messagesRef = collection(db, "rooms", roomCode, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(100));
    const unsubscribeMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messagesList = snapshot.docs.map(convertToChatMessage).reverse();
        setMessages(messagesList);
      },
      (error) => {
        console.error("Messages listener error:", error);
      }
    );

    // Store unsubscribes (only 4 listeners now, no duplicates)
    unsubscribesRef.current = [
      unsubscribeRoom,
      unsubscribePlayers,
      unsubscribeBoard,
      unsubscribeMessages,
    ];

    // Cleanup
    return () => {
      unsubscribesRef.current.forEach((unsub) => unsub());
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }
      // Mark player as disconnected
      if (playerId) {
        actions.leaveRoom(roomCode, playerId).catch((err) => console.error("Leave room failed:", err));
      }
    };
  }, [roomCode, playerName]);

  // Check if user is the last connected player
  const isLastPlayer = Boolean(
    connectedPlayerCount === 1 && gameState?.gameStarted && !gameState?.gameOver
  );
  const isActiveGame = Boolean(gameState?.gameStarted && !gameState?.gameOver);

  // Update game context for Navbar
  useEffect(() => {
    setIsLastPlayer(isLastPlayer);
    setIsActiveGame(isActiveGame);

    return () => {
      setIsLastPlayer(false);
      setIsActiveGame(false);
    };
  }, [isLastPlayer, isActiveGame, setIsLastPlayer, setIsActiveGame]);

  // Handlers
  const handleStartGame = useCallback(() => {
    if (!playerIdRef.current) return;
    actions.startGame(roomCode, playerIdRef.current).catch((error) => {
      console.error("Error starting game:", error);
      setConnectionError(error.message);
    });
  }, [roomCode]);

  const handleSetLobbyRole = useCallback(
    (team: "red" | "blue" | null, role: "spymaster" | "operative" | null) => {
      if (!playerIdRef.current || (gameState?.gameStarted && !gameState?.gameOver)) return;
      actions
        .setLobbyRole(roomCode, playerIdRef.current, team, role)
        .catch((error) => console.error("Error setting lobby role:", error));
    },
    [roomCode, gameState]
  );

  const handleRandomizeTeams = useCallback(() => {
    if (!playerIdRef.current) return;
    const isRoomOwner = currentPlayer?.id && gameState?.ownerId === currentPlayer.id;
    if (!isRoomOwner || (gameState?.gameStarted && !gameState?.gameOver)) return;
    actions.randomizeTeams(roomCode, playerIdRef.current).catch((error) => {
      console.error("Error randomizing teams:", error);
    });
  }, [roomCode, currentPlayer, gameState]);

  const handleRematch = useCallback(() => {
    if (!playerIdRef.current) return;
    actions.rematch(roomCode, playerIdRef.current).catch((error) => {
      console.error("Error starting rematch:", error);
    });
  }, [roomCode]);

  const handleEndGame = useCallback(() => {
    if (!playerIdRef.current) return;
    actions.endGame(roomCode, playerIdRef.current).catch((error) => {
      console.error("Error ending game:", error);
    });
  }, [roomCode]);

  const handleResumeGame = useCallback(() => {
    if (!playerIdRef.current) return;
    actions.resumeGame(roomCode, playerIdRef.current).catch((error) => {
      console.error("Error resuming game:", error);
      setConnectionError(error.message);
    });
  }, [roomCode]);

  const handleVoteCard = useCallback(
    (index: number) => {
      if (!playerIdRef.current) return;
      const isMyTurn =
        gameState?.gameStarted &&
        currentPlayer?.team === gameState.currentTeam &&
        currentPlayer?.role === "operative";
      const canVote = Boolean(
        isMyTurn &&
        gameState?.currentClue &&
        (gameState.remainingGuesses ?? 0) > 0 &&
        !gameState?.gameOver &&
        !gameState?.paused
      );
      if (canVote) {
        actions.voteCard(roomCode, playerIdRef.current, index).catch((error) => {
          console.error("Error voting:", error);
        });
      }
    },
    [roomCode, gameState, currentPlayer]
  );

  const handleConfirmReveal = useCallback(
    (index: number) => {
      if (!playerIdRef.current) return;
      const isMyTurn =
        gameState?.gameStarted &&
        currentPlayer?.team === gameState.currentTeam &&
        currentPlayer?.role === "operative";
      const canVote = Boolean(
        isMyTurn &&
        gameState?.currentClue &&
        (gameState.remainingGuesses ?? 0) > 0 &&
        !gameState?.gameOver &&
        !gameState?.paused
      );
      if (canVote) {
        actions
          .confirmReveal(roomCode, playerIdRef.current, index)
          .catch((error) => {
            console.error("Error confirming reveal:", error);
          });
      }
    },
    [roomCode, gameState, currentPlayer]
  );

  const handleEndTurn = useCallback(() => {
    actions.endTurn(roomCode).catch((error) => {
      console.error("Error ending turn:", error);
    });
  }, [roomCode]);

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || !playerIdRef.current) return;
      actions
        .sendMessage(roomCode, playerIdRef.current, chatInput.trim(), "chat")
        .then(() => setChatInput(""))
        .catch((error) => console.error("Error sending message:", error));
    },
    [roomCode, chatInput]
  );

  const handleGiveClue = useCallback(
    (word: string, count: number) => {
      if (!playerIdRef.current) return;
      actions.giveClue(roomCode, playerIdRef.current, word, count).catch((error) => {
        console.error("Error giving clue:", error);
        setConnectionError(error.message);
      });
    },
    [roomCode]
  );

  const handleTurnDurationChange = useCallback(
    (duration: number) => {
      if (!playerIdRef.current) return;
      const isRoomOwner = currentPlayer?.id && gameState?.ownerId === currentPlayer.id;
      if (!isRoomOwner || gameState?.gameStarted) return;
      actions.setTurnDuration(roomCode, playerIdRef.current, duration).catch((error) => {
        console.error("Error setting turn duration:", error);
      });
    },
    [roomCode, currentPlayer, gameState]
  );

  return {
    gameState,
    players,
    currentPlayer,
    messages,
    isConnecting,
    connectionError,
    connectedPlayerCount,
    roomClosedReason,
    chatInput,
    setChatInput,
    handleStartGame,
    handleSetLobbyRole,
    handleRandomizeTeams,
    handleRematch,
    handleEndGame,
    handleResumeGame,
    handleVoteCard,
    handleConfirmReveal,
    handleEndTurn,
    handleSendMessage,
    handleGiveClue,
    handleTurnDurationChange,
  };
}
