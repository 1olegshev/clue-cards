"use client";

import { useEffect, useState, useRef } from "react";

interface TransitionOverlayProps {
  type: "gameStart" | "turnChange" | "gameOver";
  team?: "red" | "blue" | null;
  message?: string;
  onComplete?: () => void;
}

export default function TransitionOverlay({
  type,
  team,
  message,
  onComplete,
}: TransitionOverlayProps) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");
  const onCompleteRef = useRef(onComplete);
  
  // Keep ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Enter phase
    const enterTimer = setTimeout(() => setPhase("visible"), 50);
    
    // Start exit after visible duration
    const duration = type === "gameStart" ? 2000 : type === "gameOver" ? 3000 : 1500;
    const exitTimer = setTimeout(() => setPhase("exit"), duration);
    
    // Complete after exit animation
    const completeTimer = setTimeout(() => {
      onCompleteRef.current?.();
    }, duration + 400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [type]);

  const teamColor = team === "red" 
    ? "from-red-600 to-red-700" 
    : team === "blue" 
      ? "from-blue-600 to-blue-700" 
      : "from-gray-600 to-gray-700";

  const teamBgLight = team === "red"
    ? "bg-red-500/20"
    : team === "blue"
      ? "bg-blue-500/20"
      : "bg-gray-500/20";

  if (type === "gameStart") {
    return (
      <div 
        className={`
          fixed inset-0 z-50 flex items-center justify-center
          transition-opacity duration-400
          ${phase === "enter" ? "opacity-0" : phase === "exit" ? "opacity-0" : "opacity-100"}
        `}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div 
          className={`
            relative text-center transition-all duration-500
            ${phase === "enter" ? "scale-50 opacity-0" : phase === "exit" ? "scale-110 opacity-0" : "scale-100 opacity-100"}
          `}
        >
          <div className="text-6xl font-bold text-white mb-4 drop-shadow-lg animate-pulse">
            Game Starting!
          </div>
          <div className={`
            inline-block px-8 py-4 rounded-2xl bg-linear-to-r ${teamColor} 
            text-white text-2xl font-bold shadow-2xl
            ${phase === "visible" ? "animate-bounce" : ""}
          `}>
            {team?.toUpperCase()} TEAM goes first!
          </div>
        </div>
      </div>
    );
  }

  if (type === "turnChange") {
    return (
      <div 
        className={`
          fixed top-20 left-0 right-0 z-50 flex justify-center pointer-events-none
          transition-all duration-300
          ${phase === "enter" ? "opacity-0 -translate-y-full" : phase === "exit" ? "opacity-0 -translate-y-full" : "opacity-100 translate-y-0"}
        `}
      >
        <div className={`
          px-8 py-4 rounded-2xl bg-linear-to-r ${teamColor}
          text-white text-xl font-bold shadow-2xl
          flex items-center gap-3
        `}>
          <div className={`w-4 h-4 rounded-full ${team === "red" ? "bg-red-300" : "bg-blue-300"} animate-pulse`} />
          {message || `${team?.toUpperCase()} TEAM's Turn`}
        </div>
      </div>
    );
  }

  if (type === "gameOver") {
    return (
      <div 
        className={`
          fixed inset-0 z-50 flex items-center justify-center pointer-events-none
          transition-opacity duration-500
          ${phase === "enter" ? "opacity-0" : phase === "exit" ? "opacity-0" : "opacity-100"}
        `}
      >
        {/* Celebratory background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`
                absolute w-3 h-3 rounded-full
                ${team === "red" ? "bg-red-400" : "bg-blue-400"}
              `}
              style={{
                left: `${Math.random() * 100}%`,
                top: `-10%`,
                animation: `confetti-fall ${2 + Math.random() * 2}s ease-out forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
                opacity: 0.8,
              }}
            />
          ))}
        </div>
        
        <div 
          className={`
            relative text-center transition-all duration-700
            ${phase === "enter" ? "scale-0 rotate-12" : phase === "exit" ? "scale-150 opacity-0" : "scale-100 rotate-0"}
          `}
        >
          <div className={`
            px-12 py-8 rounded-3xl bg-linear-to-r ${teamColor}
            text-white shadow-2xl
            ${phase === "visible" ? "game-over-glow" : ""}
          `}
          style={phase === "visible" ? {
            boxShadow: team === "red" 
              ? "0 0 60px rgba(239, 68, 68, 0.6), 0 0 120px rgba(239, 68, 68, 0.3)"
              : "0 0 60px rgba(59, 130, 246, 0.6), 0 0 120px rgba(59, 130, 246, 0.3)"
          } : undefined}
          >
            <div className="text-5xl font-bold mb-2">
              🎉 Victory! 🎉
            </div>
            <div className="text-3xl font-semibold">
              {team?.toUpperCase()} TEAM WINS!
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
