/**
 * Realtime Database room hook - manages real-time subscriptions and game actions.
 * Uses onDisconnect for reliable presence detection.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { ref, onValue, query, orderByChild, limitToLast, off, DatabaseReference } from "firebase/database";
import { getDatabase } from "@/lib/firebase";
import type { GameState, Player, ChatMessage, RoomClosedReason, Card, WordPack } from "@/shared/types";
import { LOCAL_STORAGE_PLAYER_ID_KEY } from "@/shared/constants";
import { useGameContext } from "@/components/GameContext";
import * as actions from "@/lib/rtdb-actions";

export interface UseRtdbRoomReturn {
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
  handleWordPackChange: (pack: WordPack) => void;
}

interface BoardCard {
  word: string;
  team: string;
  revealed: boolean;
  revealedBy: string | null;
  votes: Record<string, boolean>;
}

interface PlayerData {
  name: string;
  team: string | null;
  role: string | null;
  connected: boolean;
  lastSeen: number;
}

interface MessageData {
  playerId: string | null;
  playerName: string;
  message: string;
  timestamp: number;
  type: string;
}

function toGameState(roomCode: string, roomData: any, players: Player[]): GameState | null {
  if (!roomData) return null;
  const boardData: BoardCard[] = roomData.board || [];

  const cardVotes: Record<number, string[]> = {};
  boardData.forEach((c, i) => {
    const votes = c.votes ? Object.keys(c.votes).filter((id) => c.votes[id]) : [];
    if (votes.length) cardVotes[i] = votes;
  });

  return {
    roomCode,
    players,
    board: boardData.map((c) => ({
      word: c.word,
      team: c.team as Card["team"],
      revealed: c.revealed || false,
      revealedBy: c.revealedBy || undefined,
    })),
    ownerId: roomData.ownerId || null,
    cardVotes,
    currentTeam: roomData.currentTeam || "red",
    startingTeam: roomData.startingTeam || "red",
    wordPack: roomData.wordPack || "classic",
    currentClue: roomData.currentClue || null,
    remainingGuesses: roomData.remainingGuesses ?? null,
    turnStartTime: roomData.turnStartTime || null,
    turnDuration: roomData.turnDuration || 60,
    gameStarted: roomData.gameStarted || false,
    gameOver: roomData.gameOver || false,
    winner: roomData.winner || null,
    paused: roomData.paused || false,
    pauseReason: roomData.pauseReason || null,
    pausedForTeam: roomData.pausedForTeam || null,
  };
}

function toPlayers(playersData: Record<string, PlayerData> | null): Player[] {
  if (!playersData) return [];
  return Object.entries(playersData).map(([id, p]) => ({
    id,
    name: p.name,
    team: (p.team as Player["team"]) || null,
    role: (p.role as Player["role"]) || null,
  }));
}

function toMessages(messagesData: Record<string, MessageData> | null): ChatMessage[] {
  if (!messagesData) return [];
  return Object.entries(messagesData)
    .map(([id, m]) => ({
      id,
      playerId: m.playerId || undefined,
      playerName: m.playerName,
      message: m.message,
      timestamp: m.timestamp || Date.now(),
      type: m.type as ChatMessage["type"],
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function useRtdbRoom(roomCode: string, playerName: string): UseRtdbRoomReturn {
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
  const roomDataRef = useRef<any>(null);
  const playersDataRef = useRef<Record<string, PlayerData> | null>(null);
  const disconnectRefRef = useRef<DatabaseReference | null>(null);

  // Get or create player ID
  useEffect(() => {
    playerIdRef.current = sessionStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
  }, []);

  // Main effect: join room and set up listeners
  useEffect(() => {
    if (!playerName || !roomCode) return;

    const db = getDatabase();
    if (!db) {
      setConnectionError("Database not initialized");
      setIsConnecting(false);
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    let playerId = playerIdRef.current;
    if (!playerId) {
      playerId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      playerIdRef.current = playerId;
      sessionStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, playerId);
    }

    const roomRef = ref(db, `rooms/${roomCode}`);
    const playersRef = ref(db, `rooms/${roomCode}/players`);
    const messagesRef = ref(db, `rooms/${roomCode}/messages`);

    let roomExists = false;

    const rebuild = () => {
      const playersList = toPlayers(playersDataRef.current);
      setPlayers(playersList);
      setCurrentPlayer(playersList.find((p) => p.id === playerId) || null);
      setGameState(roomDataRef.current ? toGameState(roomCode, roomDataRef.current, playersList) : null);
    };

    // Room listener
    const unsubRoom = onValue(roomRef, (snap) => {
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
      setConnectionError(err.message);
      setIsConnecting(false);
    });

    // Players listener - also updates onDisconnect behavior based on player count
    let lastConnectedCount = -1;
    const unsubPlayers = onValue(playersRef, (snap) => {
      const data = snap.val() as Record<string, PlayerData> | null;
      playersDataRef.current = data;
      
      const connected = data
        ? Object.values(data).filter((p) => p.connected).length
        : 0;
      setConnectedPlayerCount(connected);
      rebuild();
      
      // Update onDisconnect behavior when connected count changes
      // If I'm the last player, onDisconnect should delete the room
      if (connected !== lastConnectedCount && playerId) {
        lastConnectedCount = connected;
        actions.updateDisconnectBehavior(roomCode, playerId, connected).catch(() => {});
      }
    });

    // Messages listener (limited to last 100)
    const messagesQuery = query(messagesRef, orderByChild("timestamp"), limitToLast(100));
    const unsubMessages = onValue(messagesQuery, (snap) => {
      setMessages(toMessages(snap.val()));
    });

    // Join room and set up onDisconnect
    actions.joinRoom(roomCode, playerId, playerName)
      .then(({ disconnectRef }) => {
        disconnectRefRef.current = disconnectRef;
        setIsConnecting(false);
      })
      .catch((e) => {
        setConnectionError(e.message || "Failed to join");
        setIsConnecting(false);
      });

    return () => {
      off(roomRef);
      off(playersRef);
      off(messagesRef);
      // onDisconnect handles room cleanup automatically:
      // - If last player: deletes entire room
      // - If others connected: marks player as disconnected
    };
  }, [roomCode, playerName]);

  // Update context
  const isLast = connectedPlayerCount === 1 && !!gameState?.gameStarted && !gameState?.gameOver;
  const isActive = !!gameState?.gameStarted && !gameState?.gameOver;

  useEffect(() => {
    setIsLastPlayer(isLast);
    setIsActiveGame(isActive);
    return () => {
      setIsLastPlayer(false);
      setIsActiveGame(false);
    };
  }, [isLast, isActive, setIsLastPlayer, setIsActiveGame]);

  // Action helpers
  const pid = () => playerIdRef.current;
  const err = (e: any) => setConnectionError(e.message);

  const handleStartGame = useCallback(() => {
    if (pid()) actions.startGame(roomCode, pid()!).catch(err);
  }, [roomCode]);

  const handleSetLobbyRole = useCallback((t: "red" | "blue" | null, r: "spymaster" | "operative" | null) => {
    if (pid()) actions.setLobbyRole(roomCode, pid()!, t, r).catch(() => {});
  }, [roomCode]);

  const handleRandomizeTeams = useCallback(() => {
    if (pid()) actions.randomizeTeams(roomCode, pid()!).catch(() => {});
  }, [roomCode]);

  const handleRematch = useCallback(() => {
    if (pid()) actions.rematch(roomCode, pid()!).catch(() => {});
  }, [roomCode]);

  const handleEndGame = useCallback(() => {
    if (pid()) actions.endGame(roomCode, pid()!).catch(() => {});
  }, [roomCode]);

  const handleResumeGame = useCallback(() => {
    if (pid()) actions.resumeGame(roomCode, pid()!).catch(err);
  }, [roomCode]);

  const handleVoteCard = useCallback((i: number) => {
    if (pid()) actions.voteCard(roomCode, pid()!, i).catch(() => {});
  }, [roomCode]);

  const handleConfirmReveal = useCallback((i: number) => {
    if (pid()) actions.confirmReveal(roomCode, pid()!, i).catch(() => {});
  }, [roomCode]);

  const handleEndTurn = useCallback(() => {
    actions.endTurn(roomCode).catch(() => {});
  }, [roomCode]);

  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && pid()) {
      actions.sendMessage(roomCode, pid()!, chatInput.trim(), "chat")
        .then(() => setChatInput(""))
        .catch(() => {});
    }
  }, [roomCode, chatInput]);

  const handleGiveClue = useCallback((w: string, c: number) => {
    if (pid()) actions.giveClue(roomCode, pid()!, w, c).catch(err);
  }, [roomCode]);

  const handleTurnDurationChange = useCallback((d: number) => {
    if (pid()) actions.setTurnDuration(roomCode, pid()!, d).catch(() => {});
  }, [roomCode]);

  const handleWordPackChange = useCallback((pack: WordPack) => {
    if (pid()) actions.setWordPack(roomCode, pid()!, pack).catch(() => {});
  }, [roomCode]);

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
    handleWordPackChange,
  };
}
