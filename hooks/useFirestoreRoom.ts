/**
 * Firestore room hook - manages real-time subscriptions and game actions.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { doc, collection, onSnapshot, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { getFirestore } from "@/lib/firebase";
import type { GameState, Player, ChatMessage, RoomClosedReason, Card } from "@/shared/types";
import { LOCAL_STORAGE_PLAYER_ID_KEY } from "@/shared/constants";
import { useGameContext } from "@/components/GameContext";
import * as actions from "@/lib/firestore-actions";

export interface UseFirestoreRoomReturn {
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
}

interface BoardCard {
  word: string;
  team: string;
  revealed: boolean;
  revealedBy: string | null;
  votes: string[];
}

function toGameState(roomCode: string, roomData: any, players: Player[]): GameState | null {
  if (!roomData) return null;
  const boardData: BoardCard[] = roomData.board || [];
  
  const cardVotes: Record<number, string[]> = {};
  boardData.forEach((c, i) => { if (c.votes?.length) cardVotes[i] = c.votes; });

  return {
    roomCode,
    players,
    board: boardData.map((c) => ({ word: c.word, team: c.team as Card["team"], revealed: c.revealed || false, revealedBy: c.revealedBy || undefined })),
    ownerId: roomData.ownerId || null,
    cardVotes,
    currentTeam: roomData.currentTeam || "red",
    startingTeam: roomData.startingTeam || "red",
    wordPack: roomData.wordPack || "classic",
    currentClue: roomData.currentClue || null,
    remainingGuesses: roomData.remainingGuesses ?? null,
    turnStartTime: roomData.turnStartTime ? (roomData.turnStartTime as Timestamp).toMillis() : null,
    turnDuration: roomData.turnDuration || 60,
    gameStarted: roomData.gameStarted || false,
    gameOver: roomData.gameOver || false,
    winner: roomData.winner || null,
    paused: roomData.paused || false,
    pauseReason: roomData.pauseReason || null,
    pausedForTeam: roomData.pausedForTeam || null,
  };
}

function toMessage(doc: any): ChatMessage {
  const d = doc.data();
  return {
    id: doc.id,
    playerId: d.playerId || undefined,
    playerName: d.playerName,
    message: d.message,
    timestamp: d.timestamp ? (d.timestamp as Timestamp).toMillis() : Date.now(),
    type: d.type,
  };
}

export function useFirestoreRoom(roomCode: string, playerName: string): UseFirestoreRoomReturn {
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
  const presenceRef = useRef<NodeJS.Timeout | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  const roomDataRef = useRef<any>(null);
  const playersRef = useRef<Player[]>([]);

  // Get or create player ID
  useEffect(() => {
    playerIdRef.current = sessionStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
  }, []);

  // Main effect: join room and set up listeners
  useEffect(() => {
    if (!playerName || !roomCode) return;

    const db = getFirestore();
    if (!db) {
      setConnectionError("Firestore not initialized");
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

    const rebuild = () => {
      setGameState(roomDataRef.current ? toGameState(roomCode, roomDataRef.current, playersRef.current) : null);
    };

    let roomExists = false;

    // Room listener
    const unsub1 = onSnapshot(doc(db, "rooms", roomCode), (snap) => {
      if (!snap.exists()) {
        if (roomExists) { setRoomClosedReason("allPlayersLeft"); roomDataRef.current = null; setGameState(null); }
        return;
      }
      roomExists = true;
      roomDataRef.current = snap.data();
      rebuild();
    }, (err) => { setConnectionError(err.message); setIsConnecting(false); });

    // Players listener
    const unsub2 = onSnapshot(collection(db, "rooms", roomCode, "players"), (snap) => {
      const list: Player[] = snap.docs.map((d) => ({
        id: d.id, name: d.data().name, team: d.data().team || null, role: d.data().role || null,
      }));
      playersRef.current = list;
      setPlayers(list);
      setCurrentPlayer(list.find((p) => p.id === playerId) || null);
      setConnectedPlayerCount(snap.docs.filter((d) => d.data().connected).length);
      rebuild();
    });

    // Messages listener
    const unsub3 = onSnapshot(
      query(collection(db, "rooms", roomCode, "messages"), orderBy("timestamp", "desc"), limit(100)),
      (snap) => setMessages(snap.docs.map(toMessage).reverse())
    );

    unsubsRef.current = [unsub1, unsub2, unsub3];

    // Join room
    actions.joinRoom(roomCode, playerId, playerName)
      .then(() => {
        setIsConnecting(false);
        // Presence ping: update own lastSeen, mark stale players as disconnected, cleanup empty rooms
        const ping = () => actions.presencePing(roomCode, playerId!).catch(() => {});
        presenceRef.current = setInterval(ping, 30000);
        ping();
      })
      .catch((e) => { setConnectionError(e.message || "Failed to join"); setIsConnecting(false); });

    return () => {
      unsubsRef.current.forEach((u) => u());
      if (presenceRef.current) clearInterval(presenceRef.current);
      if (playerId) actions.leaveRoom(roomCode, playerId).catch(() => {});
    };
  }, [roomCode, playerName]);

  // Update context
  const isLast = connectedPlayerCount === 1 && !!gameState?.gameStarted && !gameState?.gameOver;
  const isActive = !!gameState?.gameStarted && !gameState?.gameOver;
  
  useEffect(() => {
    setIsLastPlayer(isLast);
    setIsActiveGame(isActive);
    return () => { setIsLastPlayer(false); setIsActiveGame(false); };
  }, [isLast, isActive, setIsLastPlayer, setIsActiveGame]);

  // Action helpers - let server validate, just call
  const pid = () => playerIdRef.current;
  const err = (e: any) => setConnectionError(e.message);

  const handleStartGame = useCallback(() => { if (pid()) actions.startGame(roomCode, pid()!).catch(err); }, [roomCode]);
  const handleSetLobbyRole = useCallback((t: "red" | "blue" | null, r: "spymaster" | "operative" | null) => {
    if (pid()) actions.setLobbyRole(roomCode, pid()!, t, r).catch(() => {});
  }, [roomCode]);
  const handleRandomizeTeams = useCallback(() => { if (pid()) actions.randomizeTeams(roomCode, pid()!).catch(() => {}); }, [roomCode]);
  const handleRematch = useCallback(() => { if (pid()) actions.rematch(roomCode, pid()!).catch(() => {}); }, [roomCode]);
  const handleEndGame = useCallback(() => { if (pid()) actions.endGame(roomCode, pid()!).catch(() => {}); }, [roomCode]);
  const handleResumeGame = useCallback(() => { if (pid()) actions.resumeGame(roomCode, pid()!).catch(err); }, [roomCode]);
  const handleVoteCard = useCallback((i: number) => { if (pid()) actions.voteCard(roomCode, pid()!, i).catch(() => {}); }, [roomCode]);
  const handleConfirmReveal = useCallback((i: number) => { if (pid()) actions.confirmReveal(roomCode, pid()!, i).catch(() => {}); }, [roomCode]);
  const handleEndTurn = useCallback(() => { actions.endTurn(roomCode).catch(() => {}); }, [roomCode]);
  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && pid()) actions.sendMessage(roomCode, pid()!, chatInput.trim(), "chat").then(() => setChatInput("")).catch(() => {});
  }, [roomCode, chatInput]);
  const handleGiveClue = useCallback((w: string, c: number) => { if (pid()) actions.giveClue(roomCode, pid()!, w, c).catch(err); }, [roomCode]);
  const handleTurnDurationChange = useCallback((d: number) => { if (pid()) actions.setTurnDuration(roomCode, pid()!, d).catch(() => {}); }, [roomCode]);

  return {
    gameState, players, currentPlayer, messages, isConnecting, connectionError,
    connectedPlayerCount, roomClosedReason, chatInput, setChatInput,
    handleStartGame, handleSetLobbyRole, handleRandomizeTeams, handleRematch,
    handleEndGame, handleResumeGame, handleVoteCard, handleConfirmReveal,
    handleEndTurn, handleSendMessage, handleGiveClue, handleTurnDurationChange,
  };
}
