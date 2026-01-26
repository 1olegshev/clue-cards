import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  rooms,
  generatePlayerId,
  createInitialGameState,
  getOrCreateRoom,
  broadcastToRoom,
  broadcastPlayerCount,
  broadcastRoomClosed,
  cancelAbandonmentTimeout,
  scheduleRoomCleanup,
  cleanupIdleRooms,
} from '../room';
import { IDLE_ROOM_TIMEOUT } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a mock WebSocket */
function createMockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

/** Clean up rooms between tests */
function clearRooms() {
  rooms.forEach((room, code) => {
    if (room.abandonmentTimeout) {
      clearTimeout(room.abandonmentTimeout);
    }
  });
  rooms.clear();
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
// generatePlayerId
// ============================================================================

describe('generatePlayerId', () => {
  it('returns a non-empty string', () => {
    const id = generatePlayerId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generatePlayerId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates alphanumeric IDs', () => {
    const id = generatePlayerId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

// ============================================================================
// createInitialGameState
// ============================================================================

describe('createInitialGameState', () => {
  it('creates state with provided room code', () => {
    const state = createInitialGameState('ABC123');
    expect(state.roomCode).toBe('ABC123');
  });

  it('initializes empty players array', () => {
    const state = createInitialGameState('TEST');
    expect(state.players).toEqual([]);
  });

  it('creates board with 25 cards', () => {
    const state = createInitialGameState('TEST');
    expect(state.board).toHaveLength(25);
  });

  it('all cards start unrevealed', () => {
    const state = createInitialGameState('TEST');
    state.board.forEach((card) => {
      expect(card.revealed).toBe(false);
    });
  });

  it('sets starting team randomly (red or blue)', () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const state = createInitialGameState(`TEST${i}`);
      results.add(state.startingTeam);
    }
    expect(results.has('red') || results.has('blue')).toBe(true);
  });

  it('currentTeam matches startingTeam', () => {
    const state = createInitialGameState('TEST');
    expect(state.currentTeam).toBe(state.startingTeam);
  });

  it('initializes with correct default values', () => {
    const state = createInitialGameState('TEST');
    expect(state.ownerId).toBe(null);
    expect(state.cardVotes).toEqual({});
    expect(state.currentClue).toBe(null);
    expect(state.remainingGuesses).toBe(null);
    expect(state.turnStartTime).toBe(null);
    expect(state.turnDuration).toBe(60);
    expect(state.gameStarted).toBe(false);
    expect(state.gameOver).toBe(false);
    expect(state.winner).toBe(null);
    expect(state.paused).toBe(false);
    expect(state.pauseReason).toBe(null);
    expect(state.pausedForTeam).toBe(null);
  });

  it('has correct card distribution', () => {
    const state = createInitialGameState('TEST');
    const startingTeamCount = state.board.filter(
      (c) => c.team === state.startingTeam
    ).length;
    const otherTeam = state.startingTeam === 'red' ? 'blue' : 'red';
    const otherTeamCount = state.board.filter((c) => c.team === otherTeam).length;
    const neutralCount = state.board.filter((c) => c.team === 'neutral').length;
    const assassinCount = state.board.filter((c) => c.team === 'assassin').length;

    expect(startingTeamCount).toBe(9);
    expect(otherTeamCount).toBe(8);
    expect(neutralCount).toBe(7);
    expect(assassinCount).toBe(1);
  });
});

// ============================================================================
// getOrCreateRoom
// ============================================================================

describe('getOrCreateRoom', () => {
  it('creates new room if not exists', () => {
    expect(rooms.has('NEWROOM')).toBe(false);
    const room = getOrCreateRoom('NEWROOM');
    expect(rooms.has('NEWROOM')).toBe(true);
    expect(room.state.roomCode).toBe('NEWROOM');
  });

  it('returns existing room if exists', () => {
    const room1 = getOrCreateRoom('EXISTING');
    room1.state.players.push({
      id: 'p1',
      name: 'Player 1',
      team: null,
      role: null,
    });

    const room2 = getOrCreateRoom('EXISTING');
    expect(room2.state.players).toHaveLength(1);
    expect(room2.state.players[0].id).toBe('p1');
  });

  it('initializes room with empty clients map', () => {
    const room = getOrCreateRoom('TEST');
    expect(room.clients).toBeInstanceOf(Map);
    expect(room.clients.size).toBe(0);
  });

  it('initializes room with empty messages array', () => {
    const room = getOrCreateRoom('TEST');
    expect(room.messages).toEqual([]);
  });

  it('sets lastActivity timestamp', () => {
    const before = Date.now();
    const room = getOrCreateRoom('TEST');
    const after = Date.now();
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
    expect(room.lastActivity).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// broadcastToRoom
// ============================================================================

describe('broadcastToRoom', () => {
  it('sends state to all connected clients', () => {
    const room = getOrCreateRoom('TEST');
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    room.clients.set('p1', ws1);
    room.clients.set('p2', ws2);

    broadcastToRoom('TEST');

    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  it('excludes specified player from broadcast', () => {
    const room = getOrCreateRoom('TEST');
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    room.clients.set('p1', ws1);
    room.clients.set('p2', ws2);

    broadcastToRoom('TEST', 'p1');

    expect(ws1.send).not.toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  it('does nothing for non-existent room', () => {
    // Should not throw
    expect(() => broadcastToRoom('NONEXISTENT')).not.toThrow();
  });

  it('skips clients with closed connections', () => {
    const room = getOrCreateRoom('TEST');
    const wsOpen = createMockWs();
    const wsClosed = {
      readyState: WebSocket.CLOSED,
      send: vi.fn(),
    } as unknown as WebSocket;

    room.clients.set('p1', wsOpen);
    room.clients.set('p2', wsClosed);

    broadcastToRoom('TEST');

    expect(wsOpen.send).toHaveBeenCalledTimes(1);
    expect(wsClosed.send).not.toHaveBeenCalled();
  });

  it('updates lastActivity timestamp', () => {
    const room = getOrCreateRoom('TEST');
    const ws = createMockWs();
    room.clients.set('p1', ws);

    const oldActivity = room.lastActivity;
    vi.advanceTimersByTime(1000);
    broadcastToRoom('TEST');

    expect(room.lastActivity).toBeGreaterThan(oldActivity);
  });

  it('sends correct message format', () => {
    const room = getOrCreateRoom('TEST');
    const ws = createMockWs();
    room.clients.set('p1', ws);
    room.messages.push({
      id: 'msg1',
      playerName: 'System',
      message: 'Test',
      timestamp: Date.now(),
      type: 'system',
    });

    broadcastToRoom('TEST');

    const sentData = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.type).toBe('stateUpdate');
    expect(parsed.state).toBeDefined();
    expect(parsed.messages).toHaveLength(1);
  });
});

// ============================================================================
// broadcastPlayerCount
// ============================================================================

describe('broadcastPlayerCount', () => {
  it('sends player count to all clients', () => {
    const room = getOrCreateRoom('TEST');
    room.state.players = [
      { id: 'p1', name: 'P1', team: null, role: null },
      { id: 'p2', name: 'P2', team: null, role: null },
      { id: 'p3', name: 'P3', team: null, role: null },
    ];
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    room.clients.set('p1', ws1);
    room.clients.set('p2', ws2);

    broadcastPlayerCount('TEST');

    const sentData = (ws1.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.type).toBe('playerCountUpdate');
    expect(parsed.connectedCount).toBe(2);
    expect(parsed.totalPlayers).toBe(3);
  });

  it('does nothing for non-existent room', () => {
    expect(() => broadcastPlayerCount('NONEXISTENT')).not.toThrow();
  });
});

// ============================================================================
// broadcastRoomClosed
// ============================================================================

describe('broadcastRoomClosed', () => {
  it('sends roomClosed with abandoned reason', () => {
    const room = getOrCreateRoom('TEST');
    const ws = createMockWs();
    room.clients.set('p1', ws);

    broadcastRoomClosed('TEST', 'abandoned');

    const sentData = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.type).toBe('roomClosed');
    expect(parsed.reason).toBe('abandoned');
  });

  it('sends roomClosed with allPlayersLeft reason', () => {
    const room = getOrCreateRoom('TEST');
    const ws = createMockWs();
    room.clients.set('p1', ws);

    broadcastRoomClosed('TEST', 'allPlayersLeft');

    const sentData = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.reason).toBe('allPlayersLeft');
  });

  it('sends roomClosed with timeout reason', () => {
    const room = getOrCreateRoom('TEST');
    const ws = createMockWs();
    room.clients.set('p1', ws);

    broadcastRoomClosed('TEST', 'timeout');

    const sentData = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.reason).toBe('timeout');
  });
});

// ============================================================================
// cancelAbandonmentTimeout
// ============================================================================

describe('cancelAbandonmentTimeout', () => {
  it('clears existing timeout', () => {
    const room = getOrCreateRoom('TEST');
    room.abandonmentTimeout = setTimeout(() => {}, 10000);

    cancelAbandonmentTimeout(room);

    expect(room.abandonmentTimeout).toBeUndefined();
  });

  it('handles room without timeout gracefully', () => {
    const room = getOrCreateRoom('TEST');
    expect(() => cancelAbandonmentTimeout(room)).not.toThrow();
  });
});

// ============================================================================
// scheduleRoomCleanup
// ============================================================================

describe('scheduleRoomCleanup', () => {
  it('deletes room after grace period (active game)', () => {
    const room = getOrCreateRoom('TEST');
    room.state.gameStarted = true;
    room.state.gameOver = false;

    scheduleRoomCleanup('TEST', room);
    expect(rooms.has('TEST')).toBe(true);

    // Advance past 30-second grace period
    vi.advanceTimersByTime(31000);
    expect(rooms.has('TEST')).toBe(false);
  });

  it('deletes room after grace period (lobby)', () => {
    const room = getOrCreateRoom('TEST');
    room.state.gameStarted = false;

    scheduleRoomCleanup('TEST', room);
    expect(rooms.has('TEST')).toBe(true);

    // Lobby has 60-second grace period
    vi.advanceTimersByTime(59000);
    expect(rooms.has('TEST')).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(rooms.has('TEST')).toBe(false);
  });

  it('does not delete room if client reconnects', () => {
    const room = getOrCreateRoom('TEST');
    room.state.gameStarted = false;

    scheduleRoomCleanup('TEST', room);

    // Simulate reconnection
    vi.advanceTimersByTime(30000);
    room.clients.set('p1', createMockWs());

    // Even after grace period, room stays because client is connected
    vi.advanceTimersByTime(40000);
    expect(rooms.has('TEST')).toBe(true);
  });

  it('cancels previous timeout when rescheduled', () => {
    const room = getOrCreateRoom('TEST');
    room.state.gameStarted = false;

    scheduleRoomCleanup('TEST', room);
    scheduleRoomCleanup('TEST', room); // Reschedule

    // Should still work correctly
    vi.advanceTimersByTime(61000);
    expect(rooms.has('TEST')).toBe(false);
  });
});

// ============================================================================
// cleanupIdleRooms
// ============================================================================

describe('cleanupIdleRooms', () => {
  it('removes orphaned rooms (no connected clients)', () => {
    const room = getOrCreateRoom('ORPHAN');
    // No clients connected
    expect(room.clients.size).toBe(0);

    cleanupIdleRooms();

    expect(rooms.has('ORPHAN')).toBe(false);
  });

  it('keeps rooms with connected clients', () => {
    const room = getOrCreateRoom('ACTIVE');
    room.clients.set('p1', createMockWs());

    cleanupIdleRooms();

    expect(rooms.has('ACTIVE')).toBe(true);
  });

  it('removes rooms idle for more than 4 hours', () => {
    const room = getOrCreateRoom('IDLE');
    room.clients.set('p1', createMockWs());
    room.lastActivity = Date.now() - IDLE_ROOM_TIMEOUT - 1000;

    cleanupIdleRooms();

    expect(rooms.has('IDLE')).toBe(false);
  });

  it('keeps rooms with recent activity', () => {
    const room = getOrCreateRoom('RECENT');
    room.clients.set('p1', createMockWs());
    room.lastActivity = Date.now() - 1000; // 1 second ago

    cleanupIdleRooms();

    expect(rooms.has('RECENT')).toBe(true);
  });

  it('broadcasts roomClosed before deleting idle room', () => {
    const room = getOrCreateRoom('IDLE');
    const ws = createMockWs();
    room.clients.set('p1', ws);
    room.lastActivity = Date.now() - IDLE_ROOM_TIMEOUT - 1000;

    cleanupIdleRooms();

    const sentData = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(sentData);
    expect(parsed.type).toBe('roomClosed');
    expect(parsed.reason).toBe('timeout');
  });

  it('handles multiple rooms correctly', () => {
    // Orphan room (no clients)
    getOrCreateRoom('ORPHAN');

    // Active room with clients
    const activeRoom = getOrCreateRoom('ACTIVE');
    activeRoom.clients.set('p1', createMockWs());

    // Idle room
    const idleRoom = getOrCreateRoom('IDLE');
    idleRoom.clients.set('p2', createMockWs());
    idleRoom.lastActivity = Date.now() - IDLE_ROOM_TIMEOUT - 1000;

    cleanupIdleRooms();

    expect(rooms.has('ORPHAN')).toBe(false);
    expect(rooms.has('ACTIVE')).toBe(true);
    expect(rooms.has('IDLE')).toBe(false);
  });
});
