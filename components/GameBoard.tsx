"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, Player } from "@/shared/types";

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
  const isSpymaster = currentPlayer?.role === "spymaster";
  
  // Track which cards are animating (for the flip effect)
  const [animatingCards, setAnimatingCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef<boolean[]>([]);
  
  // Track vote counts for badge animation
  const prevVotesRef = useRef<Record<number, number>>({});
  const [animatingBadges, setAnimatingBadges] = useState<Set<number>>(new Set());

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

  const getCardColor = (card: Card) => {
    if (!card.revealed && !isSpymaster) {
      return "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100";
    }

    if (card.revealed) {
      switch (card.team) {
        case "red":
          return "bg-red-600 text-white";
        case "blue":
          return "bg-blue-600 text-white";
        case "assassin":
          return "bg-gray-900 text-white";
        default:
          return "bg-yellow-200 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100";
      }
    }

    // Spymaster view (unrevealed)
    switch (card.team) {
      case "red":
        return "bg-red-100 dark:bg-red-900 border-2 border-red-500 text-red-900 dark:text-red-100";
      case "blue":
        return "bg-blue-100 dark:bg-blue-900 border-2 border-blue-500 text-blue-900 dark:text-blue-100";
      case "assassin":
        return "bg-gray-800 border-2 border-gray-600 text-white";
      default:
        return "bg-yellow-50 dark:bg-yellow-900 border-2 border-yellow-400 text-yellow-900 dark:text-yellow-100";
    }
  };

  return (
    <div className="grid grid-cols-5 gap-2 max-w-2xl mx-auto">
      {board.map((card, index) => {
        const votes = cardVotes[index] ?? [];
        const hasVoted = currentPlayerId ? votes.includes(currentPlayerId) : false;
        const canConfirm = canVote && requiredVotes > 0 && votes.length >= requiredVotes && hasVoted;
        const isAnimating = animatingCards.has(index);
        const isBadgeAnimating = animatingBadges.has(index);

        return (
          <div key={index} className="relative">
            <button
              onClick={() => !card.revealed && canVote && onVoteCard(index)}
              disabled={card.revealed || !canVote}
              data-testid={`board-card-${index}`}
              className={`
                aspect-square p-2 rounded-lg font-semibold text-sm w-full
                transition-all duration-200
                ${getCardColor(card)}
                ${card.revealed || !canVote
                  ? "cursor-default"
                  : "cursor-pointer hover:scale-105 active:scale-95"
                }
                ${card.revealed ? "line-through opacity-75" : ""}
                ${hasVoted ? "ring-2 ring-blue-500" : ""}
                ${isAnimating ? "card-flip" : ""}
              `}
            >
              <div className="flex items-center justify-center h-full text-center">
                {card.word}
              </div>
            </button>
            {votes.length > 0 && !card.revealed && (
              <div 
                className={`absolute top-1 left-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold ${isBadgeAnimating ? "badge-pop" : ""}`}
                title={`Votes: ${votes.length}`}
              >
                {votes.length}
              </div>
            )}
            {hasVoted && !card.revealed && (
              <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded" title="You voted">
                ✓
              </div>
            )}
            {canConfirm && !card.revealed && (
              <button
                onClick={() => onConfirmReveal(index)}
                data-testid={`board-reveal-${index}`}
                className="absolute bottom-1 right-1 bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 font-semibold shadow-lg"
                title="Click to reveal this card"
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
