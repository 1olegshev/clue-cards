"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo, KeyboardEvent } from "react";
import type { Card, Player } from "@/shared/types";
import { MaskIcon, TrapIcon, DustCloudIcon } from "@/components/icons/CardBackIcons";

interface GameBoardProps {
  board: Card[];
  currentPlayer: Player | null;
  cardVotes: Record<number, string[]>;
  currentPlayerId: string | null;
  requiredVotes: number;
  canVote: boolean;
  onVoteCard: (index: number) => void;
  onConfirmReveal: (index: number) => void;
}

const GRID_COLS = 5;
const GRID_ROWS = 5;

export default function GameBoard({
  board,
  currentPlayer,
  cardVotes,
  currentPlayerId,
  requiredVotes,
  canVote,
  onVoteCard,
  onConfirmReveal,
}: GameBoardProps) {
  const isClueGiver = currentPlayer?.role === "clueGiver";
  
  // Track which cards are animating (for the flip effect)
  const [animatingCards, setAnimatingCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef<boolean[]>([]);
  
  // Track vote counts for badge animation
  const prevVotesRef = useRef<Record<number, number>>({});
  const [animatingBadges, setAnimatingBadges] = useState<Set<number>>(new Set());

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (focusedIndex === null) {
      // If no card is focused, focus the first one on any arrow key
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        setFocusedIndex(0);
        cardRefs.current[0]?.focus();
      }
      return;
    }

    const row = Math.floor(focusedIndex / GRID_COLS);
    const col = focusedIndex % GRID_COLS;
    let newIndex = focusedIndex;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        newIndex = row > 0 ? focusedIndex - GRID_COLS : focusedIndex;
        break;
      case "ArrowDown":
        e.preventDefault();
        newIndex = row < GRID_ROWS - 1 ? focusedIndex + GRID_COLS : focusedIndex;
        break;
      case "ArrowLeft":
        e.preventDefault();
        newIndex = col > 0 ? focusedIndex - 1 : focusedIndex;
        break;
      case "ArrowRight":
        e.preventDefault();
        newIndex = col < GRID_COLS - 1 ? focusedIndex + 1 : focusedIndex;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (canVote && !board[focusedIndex]?.revealed) {
          onVoteCard(focusedIndex);
        }
        break;
      default:
        return;
    }

    if (newIndex !== focusedIndex) {
      setFocusedIndex(newIndex);
      cardRefs.current[newIndex]?.focus();
    }
  }, [focusedIndex, canVote, board, onVoteCard]);

  // Detect newly revealed cards and trigger flip animation
  useEffect(() => {
    const prevRevealed = prevRevealedRef.current;
    const newlyRevealed: number[] = [];
    
    board.forEach((card, index) => {
      if (card.revealed && prevRevealed[index] === false) {
        newlyRevealed.push(index);
      }
    });
    
    if (newlyRevealed.length > 0) {
      // Add to animating set
      setAnimatingCards(prev => {
        const next = new Set(prev);
        newlyRevealed.forEach(i => next.add(i));
        return next;
      });
      
      // Remove after animation completes
      setTimeout(() => {
        setAnimatingCards(prev => {
          const next = new Set(prev);
          newlyRevealed.forEach(i => next.delete(i));
          return next;
        });
      }, 500);
    }
    
    prevRevealedRef.current = board.map(c => c.revealed);
  }, [board]);

  // Detect vote changes for badge animation
  useEffect(() => {
    const prevVotes = prevVotesRef.current;
    const newAnimating: number[] = [];
    
    Object.entries(cardVotes).forEach(([indexStr, votes]) => {
      const index = Number(indexStr);
      const prevCount = prevVotes[index] ?? 0;
      if (votes.length > prevCount) {
        newAnimating.push(index);
      }
    });
    
    if (newAnimating.length > 0) {
      setAnimatingBadges(prev => {
        const next = new Set(prev);
        newAnimating.forEach(i => next.add(i));
        return next;
      });
      
      // Remove animation class after animation completes
      setTimeout(() => {
        setAnimatingBadges(prev => {
          const next = new Set(prev);
          newAnimating.forEach(i => next.delete(i));
          return next;
        });
      }, 300);
    }
    
    prevVotesRef.current = Object.fromEntries(
      Object.entries(cardVotes).map(([k, v]) => [k, v.length])
    );
  }, [cardVotes]);

  // Memoize card color function based on isClueGiver
  const getCardColor = useCallback((card: Card) => {
    if (!card.revealed && !isClueGiver) {
      return "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100";
    }

    if (card.revealed) {
      switch (card.team) {
        case "red":
          return "bg-red-team text-white";
        case "blue":
          return "bg-blue-team text-white";
        case "trap":
          return "bg-gray-900 text-white";
        default:
          return "bg-yellow-200 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100";
      }
    }

    // Clue giver view (unrevealed)
    switch (card.team) {
      case "red":
        return "bg-red-100 dark:bg-red-900 border-2 border-red-500 text-red-900 dark:text-red-100";
      case "blue":
        return "bg-blue-100 dark:bg-blue-900 border-2 border-blue-500 text-blue-900 dark:text-blue-100";
      case "trap":
        return "bg-gray-800 border-2 border-gray-600 text-white";
      default:
        return "bg-yellow-50 dark:bg-yellow-900 border-2 border-yellow-400 text-yellow-900 dark:text-yellow-100";
    }
  }, [isClueGiver]);

  // Memoize icon color (static function, no dependencies)
  const getCardBackIconColor = useCallback((card: Card) => {
    switch (card.team) {
      case "red":
        return "text-red-800";
      case "blue":
        return "text-blue-800";
      case "trap":
        return "text-gray-500";
      default:
        return "text-yellow-600 dark:text-yellow-800";
    }
  }, []);

  // Memoize icon rendering
  const renderCardBackIcon = useCallback((card: Card) => {
    const iconClass = `w-3/5 h-3/5 opacity-50 ${getCardBackIconColor(card)}`;
    switch (card.team) {
      case "red":
      case "blue":
        return <MaskIcon className={iconClass} />;
      case "trap":
        return <TrapIcon className={iconClass} />;
      default:
        return <DustCloudIcon className={iconClass} />;
    }
  }, [getCardBackIconColor]);

  return (
    <div 
      className="grid grid-cols-5 gap-2 max-w-2xl mx-auto"
      onKeyDown={handleKeyDown}
      role="grid"
      aria-label="Game board"
    >
      {board.map((card, index) => {
        const votes = cardVotes[index] ?? [];
        const hasVoted = currentPlayerId ? votes.includes(currentPlayerId) : false;
        const canConfirm = canVote && requiredVotes > 0 && votes.length >= requiredVotes && hasVoted;
        const isAnimating = animatingCards.has(index);
        const isBadgeAnimating = animatingBadges.has(index);
        const isFocused = focusedIndex === index;

        return (
          <div key={index} className="relative" role="gridcell">
            <button
              ref={(el) => { cardRefs.current[index] = el; }}
              onClick={() => !card.revealed && canVote && onVoteCard(index)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(null)}
              disabled={card.revealed || !canVote}
              tabIndex={canVote && !card.revealed ? 0 : -1}
              data-testid={`board-card-${index}`}
              aria-label={`${card.revealed ? `Revealed: ${card.team}` : card.word}${hasVoted ? ", you voted" : ""}${votes.length > 0 ? `, ${votes.length} votes` : ""}`}
              className={`
                aspect-square p-2 rounded-lg font-semibold text-sm w-full
                transition-all duration-200
                ${getCardColor(card)}
                ${card.revealed || !canVote
                  ? "cursor-default"
                  : "cursor-pointer hover:scale-105 active:scale-95"
                }
                ${hasVoted ? "ring-2 ring-blue-500" : ""}
                ${isFocused && !card.revealed ? "ring-2 ring-yellow-400 ring-offset-2" : ""}
                ${isAnimating ? "card-flip" : ""}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2
              `}
            >
              <div className="flex items-center justify-center h-full text-center">
                {card.revealed ? renderCardBackIcon(card) : card.word}
              </div>
            </button>
            {votes.length > 0 && !card.revealed && (
              <div 
                className={`absolute top-1 left-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold ${isBadgeAnimating ? "badge-pop" : ""}`}
                title={`Votes: ${votes.length}`}
                aria-hidden="true"
              >
                {votes.length}
              </div>
            )}
            {hasVoted && !card.revealed && (
              <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded" title="You voted" aria-hidden="true">
                ✓
              </div>
            )}
            {canConfirm && !card.revealed && (
              <button
                onClick={() => onConfirmReveal(index)}
                data-testid={`board-reveal-${index}`}
                className="absolute bottom-1 right-1 bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 font-semibold shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                title="Click to reveal this card"
                aria-label={`Reveal ${card.word}`}
              >
                Reveal
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
