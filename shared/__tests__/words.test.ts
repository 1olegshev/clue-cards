import { describe, it, expect } from 'vitest';
import { WORD_LIST, generateBoard, assignTeams } from '../words';

// ============================================================================
// WORD_LIST
// ============================================================================

describe('WORD_LIST', () => {
  it('has at least 25 words for a board', () => {
    expect(WORD_LIST.length).toBeGreaterThanOrEqual(25);
  });

  it('contains unique words', () => {
    const uniqueWords = new Set(WORD_LIST);
    expect(uniqueWords.size).toBe(WORD_LIST.length);
  });

  it('words are uppercase', () => {
    WORD_LIST.forEach((word) => {
      expect(word).toBe(word.toUpperCase());
    });
  });
});

// ============================================================================
// generateBoard
// ============================================================================

describe('generateBoard', () => {
  it('returns exactly 25 words', () => {
    const board = generateBoard();
    expect(board).toHaveLength(25);
  });

  it('returns unique words', () => {
    const board = generateBoard();
    const uniqueWords = new Set(board);
    expect(uniqueWords.size).toBe(25);
  });

  it('only uses words from WORD_LIST', () => {
    const board = generateBoard();
    const wordSet = new Set(WORD_LIST);
    board.forEach((word) => {
      expect(wordSet.has(word)).toBe(true);
    });
  });

  it('generates different boards on multiple calls (randomness test)', () => {
    const boards: string[][] = [];
    for (let i = 0; i < 10; i++) {
      boards.push(generateBoard());
    }

    // Check that not all boards are identical
    const firstBoardStr = boards[0].join(',');
    const allSame = boards.every((b) => b.join(',') === firstBoardStr);
    expect(allSame).toBe(false);
  });
});

// ============================================================================
// assignTeams
// ============================================================================

describe('assignTeams', () => {
  const testBoard = generateBoard();

  describe('card distribution', () => {
    it('assigns exactly 25 cards', () => {
      const result = assignTeams(testBoard, 'red');
      expect(result).toHaveLength(25);
    });

    it('starting team gets 9 cards', () => {
      const resultRed = assignTeams(testBoard, 'red');
      const redCount = resultRed.filter((c) => c.team === 'red').length;
      expect(redCount).toBe(9);

      const resultBlue = assignTeams(testBoard, 'blue');
      const blueCount = resultBlue.filter((c) => c.team === 'blue').length;
      expect(blueCount).toBe(9);
    });

    it('other team gets 8 cards', () => {
      const resultRed = assignTeams(testBoard, 'red');
      const blueCount = resultRed.filter((c) => c.team === 'blue').length;
      expect(blueCount).toBe(8);

      const resultBlue = assignTeams(testBoard, 'blue');
      const redCount = resultBlue.filter((c) => c.team === 'red').length;
      expect(redCount).toBe(8);
    });

    it('assigns exactly 7 neutral cards', () => {
      const result = assignTeams(testBoard, 'red');
      const neutralCount = result.filter((c) => c.team === 'neutral').length;
      expect(neutralCount).toBe(7);
    });

    it('assigns exactly 1 assassin', () => {
      const result = assignTeams(testBoard, 'red');
      const assassinCount = result.filter((c) => c.team === 'assassin').length;
      expect(assassinCount).toBe(1);
    });

    it('total distribution is 9 + 8 + 7 + 1 = 25', () => {
      const result = assignTeams(testBoard, 'red');
      const starting = result.filter((c) => c.team === 'red').length;
      const other = result.filter((c) => c.team === 'blue').length;
      const neutral = result.filter((c) => c.team === 'neutral').length;
      const assassin = result.filter((c) => c.team === 'assassin').length;

      expect(starting + other + neutral + assassin).toBe(25);
      expect(starting).toBe(9);
      expect(other).toBe(8);
      expect(neutral).toBe(7);
      expect(assassin).toBe(1);
    });
  });

  describe('word preservation', () => {
    it('preserves all original words', () => {
      const result = assignTeams(testBoard, 'red');
      const resultWords = result.map((c) => c.word);
      expect(resultWords.sort()).toEqual([...testBoard].sort());
    });

    it('each card has a word property', () => {
      const result = assignTeams(testBoard, 'red');
      result.forEach((card) => {
        expect(typeof card.word).toBe('string');
        expect(card.word.length).toBeGreaterThan(0);
      });
    });

    it('each card has a team property', () => {
      const result = assignTeams(testBoard, 'red');
      const validTeams = ['red', 'blue', 'neutral', 'assassin'];
      result.forEach((card) => {
        expect(validTeams).toContain(card.team);
      });
    });
  });

  describe('randomness', () => {
    it('team assignments are randomized', () => {
      // Run multiple times and check that assassin is not always in same position
      const assassinPositions: number[] = [];
      for (let i = 0; i < 20; i++) {
        const result = assignTeams(testBoard, 'red');
        const assassinIndex = result.findIndex((c) => c.team === 'assassin');
        assassinPositions.push(assassinIndex);
      }

      // Check that assassin appears in different positions
      const uniquePositions = new Set(assassinPositions);
      expect(uniquePositions.size).toBeGreaterThan(1);
    });
  });

  describe('starting team variants', () => {
    it('works correctly when red starts', () => {
      const result = assignTeams(testBoard, 'red');
      expect(result.filter((c) => c.team === 'red').length).toBe(9);
      expect(result.filter((c) => c.team === 'blue').length).toBe(8);
    });

    it('works correctly when blue starts', () => {
      const result = assignTeams(testBoard, 'blue');
      expect(result.filter((c) => c.team === 'blue').length).toBe(9);
      expect(result.filter((c) => c.team === 'red').length).toBe(8);
    });
  });
});
