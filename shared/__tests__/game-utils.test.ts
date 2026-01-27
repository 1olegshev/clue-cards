import { describe, it, expect } from 'vitest';
import {
  shufflePlayers,
  teamsAreReady,
  getRequiredVotes,
  isValidClue,
} from '../game-utils';
import type { Player } from '../types';

// ============================================================================
// Helper to create test players
// ============================================================================

function createPlayer(
  overrides: Partial<Player> & { id: string; name: string }
): Player {
  return {
    avatar: "🐱",
    team: null,
    role: null,
    ...overrides,
  };
}

// ============================================================================
// shufflePlayers
// ============================================================================

describe('shufflePlayers', () => {
  it('returns array of same length', () => {
    const players: Player[] = [
      createPlayer({ id: '1', name: 'Alice' }),
      createPlayer({ id: '2', name: 'Bob' }),
      createPlayer({ id: '3', name: 'Charlie' }),
    ];
    const shuffled = shufflePlayers(players);
    expect(shuffled).toHaveLength(3);
  });

  it('contains all original players', () => {
    const players: Player[] = [
      createPlayer({ id: '1', name: 'Alice' }),
      createPlayer({ id: '2', name: 'Bob' }),
      createPlayer({ id: '3', name: 'Charlie' }),
    ];
    const shuffled = shufflePlayers(players);
    const names = shuffled.map((p) => p.name).sort();
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('does not mutate original array', () => {
    const players: Player[] = [
      createPlayer({ id: '1', name: 'Alice' }),
      createPlayer({ id: '2', name: 'Bob' }),
    ];
    const originalOrder = [...players];
    shufflePlayers(players);
    expect(players).toEqual(originalOrder);
  });

  it('produces different orderings over multiple calls (randomness)', () => {
    const players: Player[] = [
      createPlayer({ id: '1', name: 'A' }),
      createPlayer({ id: '2', name: 'B' }),
      createPlayer({ id: '3', name: 'C' }),
      createPlayer({ id: '4', name: 'D' }),
      createPlayer({ id: '5', name: 'E' }),
    ];

    const orderings = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const shuffled = shufflePlayers(players);
      orderings.add(shuffled.map((p) => p.name).join(','));
    }
    // Should have multiple different orderings
    expect(orderings.size).toBeGreaterThan(1);
  });
});

// ============================================================================
// teamsAreReady
// ============================================================================

describe('teamsAreReady', () => {
  describe('minimum player requirements', () => {
    it('returns false with fewer than 4 assigned players', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
      ];
      expect(teamsAreReady(players)).toBe(false);
    });

    it('returns true with exactly 4 properly assigned players', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'guesser' }),
      ];
      expect(teamsAreReady(players)).toBe(true);
    });
  });

  describe('clue giver requirements', () => {
    it('returns false if red team has no clue giver', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'guesser' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'guesser' }),
      ];
      expect(teamsAreReady(players)).toBe(false);
    });

    it('returns false if blue team has no clue giver', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'guesser' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'guesser' }),
      ];
      expect(teamsAreReady(players)).toBe(false);
    });

    it('returns false if red team has multiple clue givers', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'guesser' }),
      ];
      expect(teamsAreReady(players)).toBe(false);
    });

    it('returns false if blue team has multiple clue givers', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'clueGiver' }),
      ];
      expect(teamsAreReady(players)).toBe(false);
    });
  });

  describe('spectators and unassigned players', () => {
    it('ignores players without team assignment', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'guesser' }),
        createPlayer({ id: '5', name: 'Spectator', team: null, role: null }),
      ];
      expect(teamsAreReady(players)).toBe(true);
    });

    it('ignores players with team but no role', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'guesser' }),
        createPlayer({ id: '5', name: 'Partial', team: 'red', role: null }),
      ];
      expect(teamsAreReady(players)).toBe(true);
    });
  });

  describe('valid team configurations', () => {
    it('returns true with unequal team sizes', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'red', role: 'guesser' }),
        createPlayer({ id: '4', name: 'D', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '5', name: 'E', team: 'blue', role: 'guesser' }),
      ];
      expect(teamsAreReady(players)).toBe(true);
    });

    it('returns true with many guessers per team', () => {
      const players: Player[] = [
        createPlayer({ id: '1', name: 'A', team: 'red', role: 'clueGiver' }),
        createPlayer({ id: '2', name: 'B', team: 'red', role: 'guesser' }),
        createPlayer({ id: '3', name: 'C', team: 'red', role: 'guesser' }),
        createPlayer({ id: '4', name: 'D', team: 'red', role: 'guesser' }),
        createPlayer({ id: '5', name: 'E', team: 'blue', role: 'clueGiver' }),
        createPlayer({ id: '6', name: 'F', team: 'blue', role: 'guesser' }),
        createPlayer({ id: '7', name: 'G', team: 'blue', role: 'guesser' }),
      ];
      expect(teamsAreReady(players)).toBe(true);
    });
  });
});

// ============================================================================
// getRequiredVotes
// ============================================================================

describe('getRequiredVotes', () => {
  it('returns 1 for 0 guessers', () => {
    expect(getRequiredVotes(0)).toBe(1);
  });

  it('returns 1 for 1 guesser', () => {
    expect(getRequiredVotes(1)).toBe(1);
  });

  it('returns 1 for 2 guessers (ceil(2/2) = 1)', () => {
    expect(getRequiredVotes(2)).toBe(1);
  });

  it('returns 2 for 3 guessers (ceil(3/2) = 2)', () => {
    expect(getRequiredVotes(3)).toBe(2);
  });

  it('returns 2 for 4 guessers (ceil(4/2) = 2)', () => {
    expect(getRequiredVotes(4)).toBe(2);
  });

  it('returns 3 for 5 guessers (ceil(5/2) = 3)', () => {
    expect(getRequiredVotes(5)).toBe(3);
  });

  it('returns 3 for 6 guessers (ceil(6/2) = 3)', () => {
    expect(getRequiredVotes(6)).toBe(3);
  });

  it('caps at 3 for large teams', () => {
    expect(getRequiredVotes(10)).toBe(3);
    expect(getRequiredVotes(20)).toBe(3);
    expect(getRequiredVotes(100)).toBe(3);
  });
});

// ============================================================================
// isValidClue
// ============================================================================

describe('isValidClue', () => {
  const sampleBoard = ['APPLE', 'BANK', 'CAR', 'DOG', 'FARMER', 'DWARF'];

  describe('exact matches', () => {
    it('rejects exact match (same case)', () => {
      expect(isValidClue('APPLE', sampleBoard)).toBe(false);
    });

    it('rejects exact match (different case)', () => {
      expect(isValidClue('apple', sampleBoard)).toBe(false);
      expect(isValidClue('Apple', sampleBoard)).toBe(false);
    });

    it('accepts words not on the board', () => {
      expect(isValidClue('TESTING', sampleBoard)).toBe(true);
      expect(isValidClue('RANDOM', sampleBoard)).toBe(true);
    });
  });

  describe('prefix/suffix relationships', () => {
    it('rejects clue that is prefix of board word', () => {
      // FARM is prefix of FARMER
      expect(isValidClue('FARM', sampleBoard)).toBe(false);
    });

    it('rejects clue that is suffix of board word', () => {
      // ARF is suffix of DWARF
      expect(isValidClue('ARF', sampleBoard)).toBe(false);
    });

    it('rejects clue when board word is prefix of clue', () => {
      // DOG is prefix of DOGHOUSE
      expect(isValidClue('DOGHOUSE', sampleBoard)).toBe(false);
    });

    it('rejects clue when board word is suffix of clue', () => {
      // BANK is suffix of RIVERBANK
      expect(isValidClue('RIVERBANK', sampleBoard)).toBe(false);
    });

    it('allows coincidental substrings that are not prefix/suffix', () => {
      // WAR is inside DWARF but not as prefix or suffix
      expect(isValidClue('WAR', sampleBoard)).toBe(true);
    });
  });

  describe('plural variants', () => {
    it('rejects simple S plural of board word', () => {
      expect(isValidClue('CARS', sampleBoard)).toBe(false);
      expect(isValidClue('DOGS', sampleBoard)).toBe(false);
    });

    it('rejects ES plural of board word', () => {
      // If BENCH was on board, BENCHES would be rejected
      const boardWithBench = ['BENCH'];
      expect(isValidClue('BENCHES', boardWithBench)).toBe(false);
    });

    it('rejects singular when plural is on board', () => {
      const boardWithPlural = ['CARS', 'DOGS'];
      expect(isValidClue('CAR', boardWithPlural)).toBe(false);
      expect(isValidClue('DOG', boardWithPlural)).toBe(false);
    });

    it('allows unrelated words ending in S', () => {
      expect(isValidClue('PLUS', sampleBoard)).toBe(true);
      expect(isValidClue('GLASS', sampleBoard)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty board', () => {
      expect(isValidClue('ANYTHING', [])).toBe(true);
    });

    it('handles single character clues', () => {
      const boardWithA = ['A', 'AT'];
      expect(isValidClue('A', boardWithA)).toBe(false);
      expect(isValidClue('B', boardWithA)).toBe(true);
    });

    it('is case insensitive for board words', () => {
      const mixedCaseBoard = ['Apple', 'BaNK'];
      expect(isValidClue('APPLE', mixedCaseBoard)).toBe(false);
      expect(isValidClue('bank', mixedCaseBoard)).toBe(false);
    });
  });
});
