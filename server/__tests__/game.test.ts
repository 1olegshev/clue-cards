import { describe, it, expect, beforeEach } from 'vitest';
import {
  shufflePlayers,
  teamsAreReady,
  getRequiredVotes,
  clearVotes,
  resetGameState,
  checkAndUpdatePauseState,
  isValidClue,
} from '../game';
import type { Player, Card } from '../../shared/types';
import type { Room } from '../types';
import { WebSocket } from 'ws';

// ============================================================================
// Test Helpers
// ============================================================================

function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: `player-${Math.random().toString(36).substring(7)}`,
    name: 'Test Player',
    team: null,
    role: null,
    ...overrides,
  };
}

function createCard(word: string, team: Card['team'] = 'neutral'): Card {
  return { word, team, revealed: false };
}

function createRoom(overrides: Partial<Room> = {}): Room {
  return {
    state: {
      roomCode: 'TEST123',
      players: [],
      board: [],
      ownerId: null,
      cardVotes: {},
      currentTeam: 'red',
      startingTeam: 'red',
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
    },
    messages: [],
    clients: new Map(),
    lastActivity: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// shufflePlayers
// ============================================================================

describe('shufflePlayers', () => {
  it('returns an array of the same length', () => {
    const players = [createPlayer(), createPlayer(), createPlayer()];
    const shuffled = shufflePlayers(players);
    expect(shuffled).toHaveLength(players.length);
  });

  it('contains all original players', () => {
    const players = [
      createPlayer({ id: 'p1' }),
      createPlayer({ id: 'p2' }),
      createPlayer({ id: 'p3' }),
    ];
    const shuffled = shufflePlayers(players);
    const shuffledIds = shuffled.map((p) => p.id);
    expect(shuffledIds).toContain('p1');
    expect(shuffledIds).toContain('p2');
    expect(shuffledIds).toContain('p3');
  });

  it('does not mutate original array', () => {
    const players = [createPlayer({ id: 'p1' }), createPlayer({ id: 'p2' })];
    const originalOrder = players.map((p) => p.id);
    shufflePlayers(players);
    expect(players.map((p) => p.id)).toEqual(originalOrder);
  });
});

// ============================================================================
// teamsAreReady
// ============================================================================

describe('teamsAreReady', () => {
  it('returns false for fewer than 4 players', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
    ];
    expect(teamsAreReady(players)).toBe(false);
  });

  it('returns false for odd number of players', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(teamsAreReady(players)).toBe(false);
  });

  it('returns false for unequal team sizes', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
    ];
    expect(teamsAreReady(players)).toBe(false);
  });

  it('returns false if a team has no spymaster', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
    ];
    expect(teamsAreReady(players)).toBe(false);
  });

  it('returns false if a team has multiple spymasters', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'operative' }),
    ];
    expect(teamsAreReady(players)).toBe(false);
  });

  it('returns false if players have null team/role', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: null, role: null }),
    ];
    expect(teamsAreReady(players)).toBe(false);
  });

  it('returns true for valid 4-player setup', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'operative' }),
    ];
    expect(teamsAreReady(players)).toBe(true);
  });

  it('returns true for valid 6-player setup', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
    ];
    expect(teamsAreReady(players)).toBe(true);
  });

  it('returns true for valid 8-player setup', () => {
    const players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
    ];
    expect(teamsAreReady(players)).toBe(true);
  });
});

// ============================================================================
// isValidClue
// ============================================================================

describe('isValidClue', () => {
  const boardWords = ['APPLE', 'BANANA', 'CHERRY', 'DOG', 'ELEPHANT'];

  describe('exact match rejection', () => {
    it('rejects exact match (same case)', () => {
      expect(isValidClue('APPLE', boardWords)).toBe(false);
    });

    it('rejects exact match (lowercase)', () => {
      expect(isValidClue('apple', boardWords)).toBe(false);
    });

    it('rejects exact match (mixed case)', () => {
      expect(isValidClue('Apple', boardWords)).toBe(false);
    });
  });

  describe('substring rejection', () => {
    it('rejects clue that is substring of board word', () => {
      expect(isValidClue('ELEPH', boardWords)).toBe(false); // in ELEPHANT
    });

    it('rejects clue that contains board word as substring', () => {
      expect(isValidClue('PINEAPPLE', boardWords)).toBe(false); // contains APPLE
    });

    it('rejects clue that is contained in board word', () => {
      expect(isValidClue('DOG', boardWords)).toBe(false);
      expect(isValidClue('DOGS', boardWords)).toBe(false); // DOG is substring of DOGS
    });
  });

  describe('plural variant rejection', () => {
    it('rejects simple plural (adding S)', () => {
      expect(isValidClue('APPLES', boardWords)).toBe(false);
    });

    it('does NOT reject irregular plurals (limitation)', () => {
      // Note: The current implementation only checks simple +S/+ES and -S/-ES
      // Irregular plurals like CHERRY→CHERRIES are NOT caught
      // This is a known limitation documented here
      expect(isValidClue('CHERRIES', boardWords)).toBe(true); // CHERRY→CHERRIES not caught
    });

    it('rejects singular when plural is on board', () => {
      const pluralBoard = ['APPLES', 'DOGS'];
      expect(isValidClue('APPLE', pluralBoard)).toBe(false);
      expect(isValidClue('DOG', pluralBoard)).toBe(false);
    });

    it('rejects ES plural variant', () => {
      const esBoard = ['BOXES'];
      expect(isValidClue('BOX', esBoard)).toBe(false);
    });
  });

  describe('valid clues', () => {
    it('accepts unrelated words', () => {
      expect(isValidClue('TREE', boardWords)).toBe(true);
    });

    it('accepts words with no overlap', () => {
      expect(isValidClue('MOUNTAIN', boardWords)).toBe(true);
    });

    it('accepts short unrelated words', () => {
      expect(isValidClue('CAT', boardWords)).toBe(true);
    });

    it('accepts clues that are coincidental middle substrings', () => {
      // "war" appears in "dwarf" but is not a prefix or suffix - should be allowed
      const boardWithDwarf = ['DWARF', 'APPLE'];
      expect(isValidClue('WAR', boardWithDwarf)).toBe(true);
      expect(isValidClue('war', boardWithDwarf)).toBe(true);
    });

    it('is case insensitive for valid clues', () => {
      expect(isValidClue('tree', boardWords)).toBe(true);
      expect(isValidClue('TREE', boardWords)).toBe(true);
      expect(isValidClue('Tree', boardWords)).toBe(true);
    });
  });
});

// ============================================================================
// getRequiredVotes
// ============================================================================

describe('getRequiredVotes', () => {
  it('returns 1 for 1 operative', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(getRequiredVotes(room)).toBe(1);
  });

  it('returns 1 for 2 operatives', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(getRequiredVotes(room)).toBe(1);
  });

  it('returns 2 for 3 operatives', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(getRequiredVotes(room)).toBe(2);
  });

  it('returns 2 for 4 operatives', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(getRequiredVotes(room)).toBe(2);
  });

  it('returns 3 for 5 operatives', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(getRequiredVotes(room)).toBe(3);
  });

  it('caps at 3 votes for 6+ operatives', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'red', role: 'operative' }),
    ];
    expect(getRequiredVotes(room)).toBe(3);
  });

  it('only counts operatives from current team', () => {
    const room = createRoom();
    room.state.currentTeam = 'red';
    room.state.players = [
      createPlayer({ team: 'red', role: 'spymaster' }),
      createPlayer({ team: 'red', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'spymaster' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
      createPlayer({ team: 'blue', role: 'operative' }),
    ];
    // Only 1 red operative
    expect(getRequiredVotes(room)).toBe(1);
  });
});

// ============================================================================
// clearVotes
// ============================================================================

describe('clearVotes', () => {
  it('clears all card votes', () => {
    const room = createRoom();
    room.state.cardVotes = {
      0: ['player1', 'player2'],
      5: ['player3'],
      12: ['player1', 'player3'],
    };
    clearVotes(room);
    expect(room.state.cardVotes).toEqual({});
  });

  it('handles empty votes', () => {
    const room = createRoom();
    room.state.cardVotes = {};
    clearVotes(room);
    expect(room.state.cardVotes).toEqual({});
  });
});

// ============================================================================
// resetGameState
// ============================================================================

describe('resetGameState', () => {
  it('generates new board with 25 cards', () => {
    const room = createRoom();
    resetGameState(room);
    expect(room.state.board).toHaveLength(25);
  });

  it('resets game flags', () => {
    const room = createRoom();
    room.state.gameStarted = true;
    room.state.gameOver = true;
    room.state.winner = 'red';
    resetGameState(room);
    expect(room.state.gameStarted).toBe(false);
    expect(room.state.gameOver).toBe(false);
    expect(room.state.winner).toBe(null);
  });

  it('clears current clue and guesses', () => {
    const room = createRoom();
    room.state.currentClue = { word: 'TEST', count: 3 };
    room.state.remainingGuesses = 2;
    resetGameState(room);
    expect(room.state.currentClue).toBe(null);
    expect(room.state.remainingGuesses).toBe(null);
  });

  it('clears turn timer', () => {
    const room = createRoom();
    room.state.turnStartTime = Date.now();
    resetGameState(room);
    expect(room.state.turnStartTime).toBe(null);
  });

  it('clears pause state', () => {
    const room = createRoom();
    room.state.paused = true;
    room.state.pauseReason = 'spymasterDisconnected';
    room.state.pausedForTeam = 'red';
    resetGameState(room);
    expect(room.state.paused).toBe(false);
    expect(room.state.pauseReason).toBe(null);
    expect(room.state.pausedForTeam).toBe(null);
  });

  it('clears card votes', () => {
    const room = createRoom();
    room.state.cardVotes = { 0: ['player1'] };
    resetGameState(room);
    expect(room.state.cardVotes).toEqual({});
  });

  it('sets currentTeam to startingTeam', () => {
    const room = createRoom();
    resetGameState(room);
    expect(room.state.currentTeam).toBe(room.state.startingTeam);
  });
});

// ============================================================================
// checkAndUpdatePauseState
// ============================================================================

describe('checkAndUpdatePauseState', () => {
  // Mock WebSocket for client map
  const mockWs = {} as WebSocket;

  describe('non-active game states', () => {
    it('returns no change if game not started', () => {
      const room = createRoom();
      room.state.gameStarted = false;
      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(false);
    });

    it('returns no change if game is over', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.gameOver = true;
      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(false);
    });

    it('clears pause state if game ends while paused', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.gameOver = true;
      room.state.paused = true;
      room.state.pauseReason = 'spymasterDisconnected';
      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(false);
    });
  });

  describe('team disconnected pause', () => {
    it('pauses when entire team disconnects', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Only blue team connected
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(true);
      expect(room.state.pauseReason).toBe('teamDisconnected');
      expect(room.state.pausedForTeam).toBe('red');
    });

    it('resumes when disconnected team player reconnects', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.paused = true;
      room.state.pauseReason = 'teamDisconnected';
      room.state.pausedForTeam = 'red';
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Red player reconnects
      room.clients.set('p1', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(false);
      expect(result.message).toContain('resumed');
    });
  });

  describe('spymaster disconnected pause', () => {
    it('pauses when current team spymaster disconnects before clue', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.currentClue = null; // No clue given yet
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Spymaster p1 disconnected
      room.clients.set('p2', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(true);
      expect(room.state.pauseReason).toBe('spymasterDisconnected');
      expect(room.state.pausedForTeam).toBe('red');
    });

    it('does NOT pause when spymaster disconnects AFTER clue given', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.currentClue = { word: 'TEST', count: 2 }; // Clue already given
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Spymaster p1 disconnected but clue is given
      room.clients.set('p2', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(false);
      expect(room.state.paused).toBe(false);
    });

    it('resumes when spymaster reconnects', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.currentClue = null;
      room.state.paused = true;
      room.state.pauseReason = 'spymasterDisconnected';
      room.state.pausedForTeam = 'red';
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Spymaster reconnects
      room.clients.set('p1', mockWs);
      room.clients.set('p2', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(false);
    });
  });

  describe('no operatives pause', () => {
    it('pauses when all operatives disconnect after clue', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.currentClue = { word: 'TEST', count: 2 }; // Clue given
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Red operative p2 disconnected
      room.clients.set('p1', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(true);
      expect(room.state.pauseReason).toBe('noOperatives');
      expect(room.state.pausedForTeam).toBe('red');
    });

    it('resumes when operative reconnects', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.currentClue = { word: 'TEST', count: 2 };
      room.state.paused = true;
      room.state.pauseReason = 'noOperatives';
      room.state.pausedForTeam = 'red';
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      // Operative reconnects
      room.clients.set('p1', mockWs);
      room.clients.set('p2', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const result = checkAndUpdatePauseState(room);
      expect(result.changed).toBe(true);
      expect(room.state.paused).toBe(false);
    });
  });

  describe('turn timer reset on resume', () => {
    it('resets turnStartTime when game resumes', () => {
      const room = createRoom();
      room.state.gameStarted = true;
      room.state.currentTeam = 'red';
      room.state.currentClue = null;
      room.state.paused = true;
      room.state.pauseReason = 'spymasterDisconnected';
      room.state.pausedForTeam = 'red';
      room.state.turnStartTime = 1000; // Old timestamp
      room.state.players = [
        createPlayer({ id: 'p1', team: 'red', role: 'spymaster' }),
        createPlayer({ id: 'p2', team: 'red', role: 'operative' }),
        createPlayer({ id: 'p3', team: 'blue', role: 'spymaster' }),
        createPlayer({ id: 'p4', team: 'blue', role: 'operative' }),
      ];
      room.clients.set('p1', mockWs);
      room.clients.set('p2', mockWs);
      room.clients.set('p3', mockWs);
      room.clients.set('p4', mockWs);

      const beforeTime = Date.now();
      checkAndUpdatePauseState(room);
      const afterTime = Date.now();

      expect(room.state.turnStartTime).toBeGreaterThanOrEqual(beforeTime);
      expect(room.state.turnStartTime).toBeLessThanOrEqual(afterTime);
    });
  });
});
