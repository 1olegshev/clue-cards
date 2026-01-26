"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import { useGameContext } from "./GameContext";

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}

function ComputerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
    </svg>
  );
}

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { isLastPlayer, isActiveGame, leaveRoom } = useGameContext();
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Check if user is in a game room
  const isInRoom = pathname?.startsWith("/room/");
  const shouldShowWarning = isInRoom && isActiveGame;

  const handleHomeClick = async (e: React.MouseEvent) => {
    if (shouldShowWarning) {
      e.preventDefault();
      setShowLeaveModal(true);
    } else if (isInRoom) {
      // In room but no active game - leave explicitly before navigating
      e.preventDefault();
      setIsLeaving(true);
      try {
        await leaveRoom();
      } catch (err) {
        console.error("Error leaving room:", err);
      }
      router.push("/");
    }
    // If not in room, just navigate normally
  };

  const handleConfirmLeave = async () => {
    setShowLeaveModal(false);
    setIsLeaving(true);
    try {
      await leaveRoom();
    } catch (err) {
      console.error("Error leaving room:", err);
    }
    router.push("/");
  };

  const handleCancelLeave = () => {
    setShowLeaveModal(false);
  };

  const cycleTheme = () => {
    const themes: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <SunIcon className="w-5 h-5" />;
      case "dark":
        return <MoonIcon className="w-5 h-5" />;
      case "system":
        return <ComputerIcon className="w-5 h-5" />;
    }
  };

  const getThemeLabel = () => {
    switch (theme) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      case "system":
        return "System";
    }
  };

  return (
    <>
      <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            onClick={handleHomeClick}
            className="text-xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
          >
            Clue Cards
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={cycleTheme}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={`Current: ${getThemeLabel()}. Click to cycle.`}
            >
              {getThemeIcon()}
              <span className="text-sm font-medium hidden sm:inline">{getThemeLabel()}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Leave Game Confirmation Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCancelLeave}
          />
          
          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              {/* Warning Icon */}
              <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                isLastPlayer 
                  ? "bg-red-100 dark:bg-red-900/30" 
                  : "bg-amber-100 dark:bg-amber-900/30"
              }`}>
                <svg 
                  className={`w-6 h-6 ${
                    isLastPlayer 
                      ? "text-red-600 dark:text-red-400" 
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {isLastPlayer ? "End Game?" : "Leave Game?"}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {isLastPlayer 
                  ? "You are the last player in the game. If you leave, the game will end for everyone."
                  : "You will be disconnected from the current game. Are you sure you want to leave?"
                }
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={handleCancelLeave}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={handleConfirmLeave}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-colors ${
                    isLastPlayer
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {isLastPlayer ? "End Game" : "Leave"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
