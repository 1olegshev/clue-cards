import { useState, useEffect, useRef, FormEvent } from "react";
import type { GameState } from "@/shared/types";

interface ClueInputProps {
  gameState: GameState;
  onGiveClue: (word: string, count: number) => void;
}

function validateClue(word: string, gameState: GameState): string | null {
  const normalized = word.toUpperCase();
  const boardWords = gameState.board.map((c) => c.word.toUpperCase());
  
  // Exact match
  if (boardWords.includes(normalized)) {
    return `"${word}" is a word on the board`;
  }
  
  // Substring check
  for (const boardWord of boardWords) {
    if (boardWord.includes(normalized)) {
      return `"${word}" is contained in "${boardWord}"`;
    }
    if (normalized.includes(boardWord)) {
      return `"${word}" contains the board word "${boardWord}"`;
    }
  }
  
  // Plural variants
  const variants = [
    normalized + "S",
    normalized + "ES", 
    normalized.endsWith("S") ? normalized.slice(0, -1) : null,
    normalized.endsWith("ES") ? normalized.slice(0, -2) : null,
  ].filter(Boolean) as string[];
  
  for (const variant of variants) {
    if (boardWords.includes(variant)) {
      return `"${word}" is too similar to "${variant}"`;
    }
  }
  
  return null;
}

export default function ClueInput({ gameState, onGiveClue }: ClueInputProps) {
  const [clueWord, setClueWord] = useState("");
  const [clueCount, setClueCount] = useState(1);
  const [clueError, setClueError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when component mounts
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    const trimmed = clueWord.trim();
    if (!trimmed || clueCount < 0) return;
    
    // Check for spaces
    if (/\s/.test(trimmed)) {
      setClueError("Clue must be a single word (no spaces)");
      return;
    }
    
    // Validate against board words
    const validationError = validateClue(trimmed, gameState);
    if (validationError) {
      setClueError(validationError);
      return;
    }
    
    setClueError(null);
    onGiveClue(trimmed, clueCount);
    setClueWord("");
    setClueCount(1);
  };

  return (
    <div className="mt-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-400 dark:border-amber-500 rounded-xl p-4 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30 ring-2 ring-amber-300/50 dark:ring-amber-500/30 animate-pulse-subtle">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="font-bold text-amber-800 dark:text-amber-200">Your turn, Spymaster!</span>
        <span className="text-sm text-amber-700 dark:text-amber-300">Give a one-word clue and number of related cards</span>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Clue word</label>
            <input
              ref={inputRef}
              type="text"
              value={clueWord}
              onChange={(e) => {
                setClueWord(e.target.value);
                setClueError(null); // Clear error on input
              }}
              placeholder="Enter one word..."
              data-testid="game-clue-input"
              className={`w-full px-3 py-2 border-2 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-gray-700 dark:text-white ${
                clueError 
                  ? "border-red-500 dark:border-red-500" 
                  : "border-amber-300 dark:border-amber-600"
              }`}
            />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Count</label>
            <input
              type="number"
              min={0}
              max={9}
              value={clueCount}
              onChange={(e) => setClueCount(Number(e.target.value))}
              data-testid="game-clue-count"
              className="w-full px-3 py-2 border-2 border-amber-300 dark:border-amber-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="self-end">
            <button
              type="submit"
              disabled={!clueWord.trim()}
              data-testid="game-clue-btn"
              className="bg-amber-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              Give Clue
            </button>
          </div>
        </div>
        {clueError && (
          <div className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {clueError}
          </div>
        )}
      </form>
    </div>
  );
}
