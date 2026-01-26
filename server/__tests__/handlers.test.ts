import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { rooms, getOrCreateRoom, generatePlayerId } from '../room';
import {
  handleJoin,
  handleLeave,
  handleStartGame,
  handleRematch,
  handleEndGame,
  handleSetTurnDuration,
  handleSetLobbyRole,
  handleRandomizeTeams,
  handleVoteCard,
  handleConfirmReveal,
  handleGiveClue,
  handleEndTurn,
  handleSendMessage,
} from '../handlers';
import type { Player } from '../../shared/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockWs(): WebSocket {
  const ws = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      if (event === 'open') callback();
    }),
  } as unknown as WebSocket;
  return ws;
}

function clearRooms() {
  rooms.forEach((room) => {
    if (room.abandonmentTimeout) {
      clearTimeout(room.abandonmentTimeout);
    }
  });
  rooms.clear();
}

function setupGameRoom(roomCode: string): {
  players: Player[];
  wsMap: Map<string, WebSocket>;
} {
  const room = getOrCreateRoom(roomCode);
  const players: Player[] = [
    { id: 'p1', name: 'RedSpy', team: 'red', role: 'spymaster' },
    { id: 'p2', name: 'RedOp', team: 'red', role: 'operative' },
    { id: 'p3', name: 'BlueSpy', team: 'blue', role: 'spymaster' },
    { id: 'p4', name: 'BlueOp', team: 'blue', role: 'operative' },
  ];
  room.state.players = players;
  room.state.ownerId = 'p1';

  const wsMap = new Map<string, WebSocket>();
  players.forEach((p) => {
    const ws = createMockWs();
    wsMap.set(p.id, ws);
    room.clients.set(p.id, ws);
  });

  return { players, wsMap };
}

// ============================================================================
// Setup/Teardown
// ============================================================================

beforeEach(() => {
  clearRooms();
  vi.useFakeTimers();
});

afterEach(() => {
  clearRooms();
  vi.useRealTimers();
});

// ============================================================================
// handleJoin
// ============================================================================

describe('handleJoin', () => {
  it('creates room and adds player on first join', () => {
    const ws = createMockWs();
    handleJoin(ws, 'NEWROOM', 'Alice');

    expect(rooms.has('NEWROOM')).toBe(true);
    const room = rooms.get('NEWROOM')!;
    expect(room.state.players).toHaveLength(1);
    expect(room.state.players[0].name).toBe('Alice');
  });

  it('sets first player as room owner', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice');

    const room = rooms.get('TEST')!;
    expect(room.state.ownerId).toBe(room.state.players[0].id);
  });

  it('sends state update to joining player', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice');

    expect(ws.send).toHaveBeenCalled();
    const sentData = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.type).toBe('stateUpdate');
    expect(parsed.selfPlayerId).toBeDefined();
  });

  it('allows reconnection with existing playerId', () => {
    const ws1 = createMockWs();
    handleJoin(ws1, 'TEST', 'Alice', 'existing-id');

    const room = rooms.get('TEST')!;
    const playerId = room.state.players[0].id;

    // Simulate disconnect and reconnect
    room.clients.delete(playerId);
    const ws2 = createMockWs();
    handleJoin(ws2, 'TEST', 'Alice Updated', playerId);

    expect(room.state.players).toHaveLength(1);
    expect(room.state.players[0].name).toBe('Alice Updated');
    expect(room.clients.has(playerId)).toBe(true);
  });

  it('adds second player to existing room', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    handleJoin(ws1, 'TEST', 'Alice');
    handleJoin(ws2, 'TEST', 'Bob');

    const room = rooms.get('TEST')!;
    expect(room.state.players).toHaveLength(2);
    expect(room.state.players[1].name).toBe('Bob');
  });

  it('does not change owner when second player joins', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    handleJoin(ws1, 'TEST', 'Alice');
    const room = rooms.get('TEST')!;
    const originalOwner = room.state.ownerId;

    handleJoin(ws2, 'TEST', 'Bob');
    expect(room.state.ownerId).toBe(originalOwner);
  });
});

// ============================================================================
// handleLeave
// ============================================================================

describe('handleLeave', () => {
  it('removes client connection but keeps player data', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice', 'p1');

    const room = rooms.get('TEST')!;
    expect(room.clients.has('p1')).toBe(true);

    handleLeave('TEST', 'p1');

    expect(room.clients.has('p1')).toBe(false);
    expect(room.state.players).toHaveLength(1); // Player data preserved
  });

  it('clears player votes on leave', () => {
    const { wsMap } = setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.cardVotes = { 0: ['p2', 'p4'], 5: ['p2'] };

    handleLeave('TEST', 'p2');

    expect(room.state.cardVotes[0]).toEqual(['p4']);
    expect(room.state.cardVotes[5]).toBeUndefined();
  });

  it('schedules cleanup when last client disconnects', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice', 'p1');

    handleLeave('TEST', 'p1');

    const room = rooms.get('TEST')!;
    expect(room.abandonmentTimeout).toBeDefined();
  });

  it('handles leave from non-existent room gracefully', () => {
    expect(() => handleLeave('NONEXISTENT', 'p1')).not.toThrow();
  });
});

// ============================================================================
// handleStartGame
// ============================================================================

describe('handleStartGame', () => {
  it('starts game when teams are ready', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;

    handleStartGame('TEST', 'p1'); // p1 is owner

    expect(room.state.gameStarted).toBe(true);
    expect(room.state.turnStartTime).not.toBeNull();
  });

  it('only owner can start game', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;

    handleStartGame('TEST', 'p2'); // p2 is not owner

    expect(room.state.gameStarted).toBe(false);
  });

  it('does not start if teams not ready', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'Alice', team: 'red', role: 'spymaster' },
      { id: 'p2', name: 'Bob', team: 'blue', role: 'spymaster' },
    ];
    room.state.ownerId = 'p1';

    handleStartGame('TEST', 'p1');

    expect(room.state.gameStarted).toBe(false);
  });

  it('clears votes on game start', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.cardVotes = { 0: ['p2'] };

    handleStartGame('TEST', 'p1');

    expect(room.state.cardVotes).toEqual({});
  });
});

// ============================================================================
// handleSetLobbyRole
// ============================================================================

describe('handleSetLobbyRole', () => {
  it('sets player team and role', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice', 'p1');

    handleSetLobbyRole('TEST', 'p1', 'red', 'spymaster');

    const room = rooms.get('TEST')!;
    expect(room.state.players[0].team).toBe('red');
    expect(room.state.players[0].role).toBe('spymaster');
  });

  it('prevents duplicate spymasters on same team', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    handleJoin(ws1, 'TEST', 'Alice', 'p1');
    handleJoin(ws2, 'TEST', 'Bob', 'p2');

    handleSetLobbyRole('TEST', 'p1', 'red', 'spymaster');
    handleSetLobbyRole('TEST', 'p2', 'red', 'spymaster');

    const room = rooms.get('TEST')!;
    expect(room.state.players[0].role).toBe('spymaster');
    expect(room.state.players[1].role).toBe(null); // Not changed
  });

  it('allows clearing team/role with null', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice', 'p1');
    handleSetLobbyRole('TEST', 'p1', 'red', 'spymaster');
    handleSetLobbyRole('TEST', 'p1', null, null);

    const room = rooms.get('TEST')!;
    expect(room.state.players[0].team).toBe(null);
    expect(room.state.players[0].role).toBe(null);
  });

  it('does not work during active game', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = false;

    handleSetLobbyRole('TEST', 'p2', 'blue', 'spymaster');

    expect(room.state.players[1].team).toBe('red'); // Unchanged
  });
});

// ============================================================================
// handleRandomizeTeams
// ============================================================================

describe('handleRandomizeTeams', () => {
  it('assigns all players to teams', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'A', team: null, role: null },
      { id: 'p2', name: 'B', team: null, role: null },
      { id: 'p3', name: 'C', team: null, role: null },
      { id: 'p4', name: 'D', team: null, role: null },
    ];
    room.state.ownerId = 'p1';

    handleRandomizeTeams('TEST', 'p1');

    room.state.players.forEach((p) => {
      expect(p.team).toMatch(/^(red|blue)$/);
      expect(p.role).toMatch(/^(spymaster|operative)$/);
    });
  });

  it('creates balanced teams', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'A', team: null, role: null },
      { id: 'p2', name: 'B', team: null, role: null },
      { id: 'p3', name: 'C', team: null, role: null },
      { id: 'p4', name: 'D', team: null, role: null },
    ];
    room.state.ownerId = 'p1';

    handleRandomizeTeams('TEST', 'p1');

    const redCount = room.state.players.filter((p) => p.team === 'red').length;
    const blueCount = room.state.players.filter((p) => p.team === 'blue').length;
    expect(redCount).toBe(2);
    expect(blueCount).toBe(2);
  });

  it('assigns exactly one spymaster per team', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'A', team: null, role: null },
      { id: 'p2', name: 'B', team: null, role: null },
      { id: 'p3', name: 'C', team: null, role: null },
      { id: 'p4', name: 'D', team: null, role: null },
    ];
    room.state.ownerId = 'p1';

    handleRandomizeTeams('TEST', 'p1');

    const redSpymasters = room.state.players.filter(
      (p) => p.team === 'red' && p.role === 'spymaster'
    ).length;
    const blueSpymasters = room.state.players.filter(
      (p) => p.team === 'blue' && p.role === 'spymaster'
    ).length;
    expect(redSpymasters).toBe(1);
    expect(blueSpymasters).toBe(1);
  });

  it('only owner can randomize', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'A', team: null, role: null },
      { id: 'p2', name: 'B', team: null, role: null },
      { id: 'p3', name: 'C', team: null, role: null },
      { id: 'p4', name: 'D', team: null, role: null },
    ];
    room.state.ownerId = 'p1';

    handleRandomizeTeams('TEST', 'p2'); // Not owner

    expect(room.state.players[0].team).toBe(null);
  });

  it('requires even number of players (4+)', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'A', team: null, role: null },
      { id: 'p2', name: 'B', team: null, role: null },
      { id: 'p3', name: 'C', team: null, role: null },
    ];
    room.state.ownerId = 'p1';

    handleRandomizeTeams('TEST', 'p1');

    expect(room.state.players[0].team).toBe(null); // No change
  });
});

// ============================================================================
// handleSetTurnDuration
// ============================================================================

describe('handleSetTurnDuration', () => {
  it('sets valid turn duration', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice', 'p1');

    handleSetTurnDuration('TEST', 'p1', 90);

    const room = rooms.get('TEST')!;
    expect(room.state.turnDuration).toBe(90);
  });

  it('rejects invalid duration', () => {
    const ws = createMockWs();
    handleJoin(ws, 'TEST', 'Alice', 'p1');

    handleSetTurnDuration('TEST', 'p1', 45); // Not in TURN_DURATIONS

    const room = rooms.get('TEST')!;
    expect(room.state.turnDuration).toBe(60); // Default unchanged
  });

  it('only owner can change duration', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    handleJoin(ws1, 'TEST', 'Alice', 'p1');
    handleJoin(ws2, 'TEST', 'Bob', 'p2');

    handleSetTurnDuration('TEST', 'p2', 90);

    const room = rooms.get('TEST')!;
    expect(room.state.turnDuration).toBe(60); // Unchanged
  });

  it('cannot change during active game', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;

    handleSetTurnDuration('TEST', 'p1', 90);

    expect(room.state.turnDuration).toBe(60); // Unchanged
  });
});

// ============================================================================
// handleGiveClue
// ============================================================================

describe('handleGiveClue', () => {
  it('allows spymaster to give clue on their turn', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleGiveClue('TEST', 'p1', 'ANIMAL', 3); // p1 is red spymaster

    expect(room.state.currentClue).toEqual({ word: 'ANIMAL', count: 3 });
    expect(room.state.remainingGuesses).toBe(4); // count + 1
  });

  it('rejects clue from wrong team spymaster', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleGiveClue('TEST', 'p3', 'ANIMAL', 3); // p3 is blue spymaster

    expect(room.state.currentClue).toBe(null);
  });

  it('rejects clue from operative', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleGiveClue('TEST', 'p2', 'ANIMAL', 3); // p2 is red operative

    expect(room.state.currentClue).toBe(null);
  });

  it('rejects clue matching board word', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.board[0].word = 'APPLE';

    handleGiveClue('TEST', 'p1', 'APPLE', 2);

    expect(room.state.currentClue).toBe(null);
  });

  it('rejects second clue before guessing', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'FIRST', count: 2 };

    handleGiveClue('TEST', 'p1', 'SECOND', 3);

    expect(room.state.currentClue?.word).toBe('FIRST');
  });

  it('adds clue to chat messages', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleGiveClue('TEST', 'p1', 'ANIMAL', 3);

    expect(room.messages).toHaveLength(1);
    expect(room.messages[0].type).toBe('clue');
    expect(room.messages[0].message).toBe('ANIMAL 3');
  });

  it('converts clue to uppercase', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleGiveClue('TEST', 'p1', 'animal', 3);

    expect(room.state.currentClue?.word).toBe('ANIMAL');
  });

  it('rejects clue with whitespace', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleGiveClue('TEST', 'p1', 'TWO WORDS', 3);

    expect(room.state.currentClue).toBe(null);
  });
});

// ============================================================================
// handleVoteCard
// ============================================================================

describe('handleVoteCard', () => {
  it('allows operative to vote after clue', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;

    handleVoteCard('TEST', 'p2', 5); // p2 is red operative

    expect(room.state.cardVotes[5]).toContain('p2');
  });

  it('toggles vote on second click', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;

    handleVoteCard('TEST', 'p2', 5);
    expect(room.state.cardVotes[5]).toContain('p2');

    handleVoteCard('TEST', 'p2', 5);
    expect(room.state.cardVotes[5]).toBeUndefined();
  });

  it('rejects vote from wrong team', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;

    handleVoteCard('TEST', 'p4', 5); // p4 is blue operative

    expect(room.state.cardVotes[5]).toBeUndefined();
  });

  it('rejects vote from spymaster', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;

    handleVoteCard('TEST', 'p1', 5); // p1 is spymaster

    expect(room.state.cardVotes[5]).toBeUndefined();
  });

  it('rejects vote before clue', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = null;

    handleVoteCard('TEST', 'p2', 5);

    expect(room.state.cardVotes[5]).toBeUndefined();
  });

  it('rejects vote on revealed card', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.board[5].revealed = true;

    handleVoteCard('TEST', 'p2', 5);

    expect(room.state.cardVotes[5]).toBeUndefined();
  });
});

// ============================================================================
// handleConfirmReveal
// ============================================================================

describe('handleConfirmReveal', () => {
  it('reveals card when enough votes', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.cardVotes = { 5: ['p2'] }; // 1 vote, 1 operative = enough

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.board[5].revealed).toBe(true);
  });

  it('rejects reveal without enough votes', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    // Add extra operative to require more votes
    room.state.players.push({ id: 'p5', name: 'RedOp2', team: 'red', role: 'operative' });
    room.state.players.push({ id: 'p6', name: 'RedOp3', team: 'red', role: 'operative' });
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.cardVotes = { 5: ['p2'] }; // 1 vote, 3 operatives = need 2 votes

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.board[5].revealed).toBe(false);
  });

  it('requires confirmer to have voted', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.players.push({ id: 'p5', name: 'RedOp2', team: 'red', role: 'operative' });
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.cardVotes = { 5: ['p5'] }; // p5 voted, not p2

    handleConfirmReveal('TEST', 'p2', 5); // p2 tries to confirm

    expect(room.state.board[5].revealed).toBe(false);
  });

  it('decrements remaining guesses on correct reveal', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.board[5].team = 'red'; // Correct team
    room.state.cardVotes = { 5: ['p2'] };

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.remainingGuesses).toBe(2);
  });

  it('ends turn on wrong guess', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.board[5].team = 'neutral';
    room.state.cardVotes = { 5: ['p2'] };

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.currentTeam).toBe('blue');
    expect(room.state.currentClue).toBe(null);
  });

  it('ends game on assassin', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.board[5].team = 'assassin';
    room.state.cardVotes = { 5: ['p2'] };

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.gameOver).toBe(true);
    expect(room.state.winner).toBe('blue'); // Opposite team wins
  });

  it('wins game when all team cards revealed', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;

    // Set up board: all red cards revealed except one
    room.state.board.forEach((card, i) => {
      if (card.team === 'red') {
        card.revealed = i !== 5; // Leave card 5 as the last unrevealed red card
      }
    });
    // Ensure card 5 is red and unrevealed
    room.state.board[5].team = 'red';
    room.state.board[5].revealed = false;
    room.state.cardVotes = { 5: ['p2'] };

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.board[5].revealed).toBe(true);
    expect(room.state.gameOver).toBe(true);
    expect(room.state.winner).toBe('red');
  });

  it('ends turn when remaining guesses exhausted after correct reveal', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 1; // Last guess
    room.state.board[5].team = 'red'; // Correct guess
    room.state.cardVotes = { 5: ['p2'] };

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.board[5].revealed).toBe(true);
    expect(room.state.gameOver).toBe(false); // Game continues
    expect(room.state.currentTeam).toBe('blue'); // Turn switches
    expect(room.state.currentClue).toBe(null); // Clue cleared
    expect(room.state.remainingGuesses).toBe(null);
  });

  it('clears votes after reveal', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;
    room.state.board[5].team = 'red';
    room.state.cardVotes = { 5: ['p2'], 10: ['p2'] };

    handleConfirmReveal('TEST', 'p2', 5);

    expect(room.state.cardVotes).toEqual({});
  });
});

// ============================================================================
// handleEndTurn
// ============================================================================

describe('handleEndTurn', () => {
  it('switches to other team', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';

    handleEndTurn('TEST');

    expect(room.state.currentTeam).toBe('blue');
  });

  it('clears current clue', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.currentClue = { word: 'TEST', count: 2 };
    room.state.remainingGuesses = 3;

    handleEndTurn('TEST');

    expect(room.state.currentClue).toBe(null);
    expect(room.state.remainingGuesses).toBe(null);
  });

  it('resets turn timer', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.turnStartTime = 1000;

    const before = Date.now();
    handleEndTurn('TEST');
    const after = Date.now();

    expect(room.state.turnStartTime).toBeGreaterThanOrEqual(before);
    expect(room.state.turnStartTime).toBeLessThanOrEqual(after);
  });

  it('clears votes', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.currentTeam = 'red';
    room.state.cardVotes = { 5: ['p2'] };

    handleEndTurn('TEST');

    expect(room.state.cardVotes).toEqual({});
  });

  it('does nothing if game not started', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = false;
    room.state.currentTeam = 'red';

    handleEndTurn('TEST');

    expect(room.state.currentTeam).toBe('red'); // Unchanged
  });
});

// ============================================================================
// handleRematch
// ============================================================================

describe('handleRematch', () => {
  it('resets game state but keeps players', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = true;
    room.state.winner = 'red';

    handleRematch('TEST', 'p1');

    expect(room.state.gameStarted).toBe(true); // New game started
    expect(room.state.gameOver).toBe(false);
    expect(room.state.winner).toBe(null);
    expect(room.state.players).toHaveLength(4);
  });

  it('only owner can rematch', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = true;

    handleRematch('TEST', 'p2'); // Not owner

    expect(room.state.gameOver).toBe(true); // Unchanged
  });

  it('only works when game is over', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = false;

    handleRematch('TEST', 'p1');

    // Nothing should change - game still in progress
    expect(room.state.gameOver).toBe(false);
  });

  it('generates new board', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = true;
    const oldBoard = room.state.board.map((c) => c.word);

    handleRematch('TEST', 'p1');

    const newBoard = room.state.board.map((c) => c.word);
    // Boards should be different (extremely unlikely to be same)
    expect(newBoard).not.toEqual(oldBoard);
  });

  it('clears messages', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = true;
    room.messages = [{ id: '1', playerName: 'Test', message: 'Hi', timestamp: 0, type: 'chat' }];

    handleRematch('TEST', 'p1');

    expect(room.messages).toEqual([]);
  });
});

// ============================================================================
// handleEndGame
// ============================================================================

describe('handleEndGame', () => {
  it('returns to lobby state', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;
    room.state.gameOver = false;

    handleEndGame('TEST', 'p1');

    expect(room.state.gameStarted).toBe(false);
    expect(room.state.gameOver).toBe(false);
  });

  it('clears player team/role assignments', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;

    handleEndGame('TEST', 'p1');

    room.state.players.forEach((p) => {
      expect(p.team).toBe(null);
      expect(p.role).toBe(null);
    });
  });

  it('only owner can end game', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;

    handleEndGame('TEST', 'p2');

    expect(room.state.gameStarted).toBe(true); // Unchanged
  });

  it('adds system message', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;
    room.state.gameStarted = true;

    handleEndGame('TEST', 'p1');

    expect(room.messages.length).toBeGreaterThan(0);
    expect(room.messages[0].type).toBe('system');
    expect(room.messages[0].message).toContain('ended by room owner');
  });
});

// ============================================================================
// handleSendMessage
// ============================================================================

describe('handleSendMessage', () => {
  it('adds chat message', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;

    handleSendMessage('TEST', 'p1', 'Hello!', 'chat');

    expect(room.messages).toHaveLength(1);
    expect(room.messages[0].message).toBe('Hello!');
    expect(room.messages[0].type).toBe('chat');
    expect(room.messages[0].playerName).toBe('RedSpy');
  });

  it('handles non-existent player gracefully', () => {
    setupGameRoom('TEST');
    const room = rooms.get('TEST')!;

    handleSendMessage('TEST', 'unknown', 'Hello!', 'chat');

    expect(room.messages).toHaveLength(0);
  });

  it('handles non-existent room gracefully', () => {
    expect(() => handleSendMessage('NONEXISTENT', 'p1', 'Hello!', 'chat')).not.toThrow();
  });
});
