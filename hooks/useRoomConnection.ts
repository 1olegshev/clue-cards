import { useEffect, useState, useRef } from "react";
import type { GameState, Player, ChatMessage, RoomClosedReason } from "@/shared/types";
import { DEFAULT_WS_PORT, LOCAL_STORAGE_PLAYER_ID_KEY } from "@/shared/constants";
import { useGameContext } from "@/components/GameContext";

export interface UseRoomConnectionReturn {
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
  handleVoteCard: (index: number) => void;
  handleConfirmReveal: (index: number) => void;
  handleEndTurn: () => void;
  handleSendMessage: (e: React.FormEvent) => void;
  handleGiveClue: (word: string, count: number) => void;
  handleTurnDurationChange: (duration: number) => void;
}

export function useRoomConnection(
  roomCode: string,
  playerName: string
): UseRoomConnectionReturn {
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

  const wsRef = useRef<WebSocket | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastConnectedCountRef = useRef<number>(0);
  const lastGameStateRef = useRef<GameState | null>(null);

  useEffect(() => {
    if (!playerName || !roomCode) return;

    // Track if effect is still active (handles React Strict Mode double-mount)
    let isActive = true;

    setIsConnecting(true);
    setConnectionError(null);

    // Initialize WebSocket connection
    const hostname = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "localhost"
      : window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${hostname}:${DEFAULT_WS_PORT}`;
    console.log("Connecting to WebSocket:", wsUrl);
    const websocket = new WebSocket(wsUrl);

    // Set connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      if (isActive && websocket.readyState !== WebSocket.OPEN) {
        setConnectionError("Failed to connect to game server. Make sure the WebSocket server is running on port 8080.");
        setIsConnecting(false);
        websocket.close();
      }
    }, 5000);

    websocket.onopen = () => {
      if (!isActive) {
        websocket.close();
        return;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      setIsConnecting(false);
      const storedPlayerId = window.sessionStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
      websocket.send(JSON.stringify({
        type: "join",
        roomCode,
        playerName,
        playerId: storedPlayerId || undefined,
      }));
    };

    websocket.onmessage = (event) => {
      if (!isActive) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "stateUpdate") {
          setGameState(message.state);
          lastGameStateRef.current = message.state;
          setPlayers(message.state.players);
          setMessages(message.messages || []);
          setIsConnecting(false);
          setConnectionError(null);
          const storedPlayerId = window.sessionStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
          const resolvedSelfId = message.selfPlayerId || storedPlayerId;
          if (message.selfPlayerId && message.selfPlayerId !== storedPlayerId) {
            window.sessionStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, message.selfPlayerId);
          }
          // Find current player - prioritize by ID for reconnect, fallback to name
          const player = resolvedSelfId
            ? message.state.players.find((p: Player) => p.id === resolvedSelfId)
            : message.state.players.find((p: Player) => p.name === playerName);
          
          if (player) {
            setCurrentPlayer(player);
            // Ensure localStorage is updated if we found player by ID
            if (resolvedSelfId && resolvedSelfId !== storedPlayerId) {
              window.sessionStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, resolvedSelfId);
            }
          } else {
            setCurrentPlayer(null);
          }
        } else if (message.type === "playerCountUpdate") {
          setConnectedPlayerCount(message.connectedCount);
          lastConnectedCountRef.current = message.connectedCount;
        } else if (message.type === "roomClosed") {
          setRoomClosedReason(message.reason as RoomClosedReason);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    websocket.onerror = (error) => {
      // Ignore errors from cancelled connections (React Strict Mode)
      if (!isActive) return;
      console.error("WebSocket error:", error);
      setConnectionError("Connection error. Please check if the WebSocket server is running.");
      setIsConnecting(false);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };

    websocket.onclose = (event) => {
      // Ignore close events from cancelled connections (React Strict Mode)
      if (!isActive) return;
      console.log("WebSocket closed", event.code, event.reason);
      setIsConnecting(false);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      // Use refs to get the latest values (state captured in closure is stale)
      const wasLastPlayer = lastConnectedCountRef.current === 1;
      const lastKnownGameState = lastGameStateRef.current;
      
      // If the player was the last connected player, they won't receive the
      // server's roomClosed message (their connection is already closed).
      // Show them an appropriate message based on game state.
      if (wasLastPlayer && lastKnownGameState) {
        if (lastKnownGameState.gameStarted && !lastKnownGameState.gameOver) {
          console.log("Last player disconnected during active game - treating as room abandoned");
          setRoomClosedReason("abandoned");
        } else {
          console.log("Last player disconnected in lobby - treating as room closed");
          setRoomClosedReason("allPlayersLeft");
        }
        return;
      }
      
      // Only show error if it wasn't a normal closure and we never got game state
      if (event.code !== 1000 && !lastKnownGameState) {
        setConnectionError("Connection closed. Please refresh the page.");
      }
    };

    wsRef.current = websocket;

    return () => {
      isActive = false;
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      websocket.close();
    };
  }, [roomCode, playerName]);

  // Check if user is the last connected player
  const isLastPlayer = Boolean(connectedPlayerCount === 1 && gameState?.gameStarted && !gameState?.gameOver);
  const isActiveGame = Boolean(gameState?.gameStarted && !gameState?.gameOver);

  // Update game context for Navbar
  useEffect(() => {
    setIsLastPlayer(isLastPlayer);
    setIsActiveGame(isActiveGame);
    
    // Cleanup when leaving the page
    return () => {
      setIsLastPlayer(false);
      setIsActiveGame(false);
    };
  }, [isLastPlayer, isActiveGame, setIsLastPlayer, setIsActiveGame]);

  const sendMessage = (message: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const handleStartGame = () => {
    sendMessage({ type: "startGame" });
  };

  const handleSetLobbyRole = (team: "red" | "blue" | null, role: "spymaster" | "operative" | null) => {
    if (!wsRef.current || (gameState?.gameStarted && !gameState?.gameOver)) return;
    sendMessage({ type: "setLobbyRole", team, role });
  };

  const handleRandomizeTeams = () => {
    const isRoomOwner = currentPlayer?.id && gameState?.ownerId === currentPlayer.id;
    if (!wsRef.current || !isRoomOwner || (gameState?.gameStarted && !gameState?.gameOver)) return;
    sendMessage({ type: "randomizeTeams" });
  };

  const handleRematch = () => {
    sendMessage({ type: "rematch" });
  };

  const handleEndGame = () => {
    sendMessage({ type: "endGame" });
  };

  const handleVoteCard = (index: number) => {
    const isMyTurn = gameState?.gameStarted &&
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
      sendMessage({ type: "voteCard", cardIndex: index });
    }
  };

  const handleConfirmReveal = (index: number) => {
    const isMyTurn = gameState?.gameStarted &&
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
      sendMessage({ type: "confirmReveal", cardIndex: index });
    }
  };

  const handleEndTurn = () => {
    sendMessage({ type: "endTurn" });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !wsRef.current) return;

    const messageType = "chat";
    sendMessage({
      type: "sendMessage",
      message: chatInput.trim(),
      messageType
    });
    setChatInput("");
  };

  const handleTurnDurationChange = (duration: number) => {
    const isRoomOwner = currentPlayer?.id && gameState?.ownerId === currentPlayer.id;
    if (!wsRef.current || !isRoomOwner || gameState?.gameStarted) return;
    sendMessage({
      type: "setTurnDuration",
      duration,
    });
  };

  const handleGiveClue = (word: string, count: number) => {
    sendMessage({
      type: "giveClue",
      word,
      count,
    });
  };

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
    handleVoteCard,
    handleConfirmReveal,
    handleEndTurn,
    handleSendMessage,
    handleGiveClue,
    handleTurnDurationChange,
  };
}
