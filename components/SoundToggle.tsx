"use client";

import { useState, useRef, useEffect } from "react";
import { useSoundContextOptional } from "@/contexts/SoundContext";

/**
 * Sound toggle component with mute button and volume slider.
 * Shows speaker icon that can be clicked to mute/unmute.
 * Hover/click reveals volume slider.
 * Also includes music toggle with separate volume control.
 * On mobile: slider appears below the button.
 * On desktop: slider appears to the right of the button.
 */
export default function SoundToggle() {
  const soundContext = useSoundContextOptional();
  const [showSlider, setShowSlider] = useState(false);
  const [showMusicSlider, setShowMusicSlider] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const musicContainerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const musicTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (musicTimeoutRef.current) {
        clearTimeout(musicTimeoutRef.current);
      }
    };
  }, []);

  // Close slider when clicking outside
  useEffect(() => {
    if (!showSlider && !showMusicSlider) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (showSlider && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSlider(false);
      }
      if (showMusicSlider && musicContainerRef.current && !musicContainerRef.current.contains(e.target as Node)) {
        setShowMusicSlider(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSlider, showMusicSlider]);

  // Don't render if no sound context
  if (!soundContext) {
    return null;
  }

  const { 
    volume, setVolume, isMuted, toggleMute, soundEnabled,
    musicVolume, setMusicVolume, musicEnabled, toggleMusic,
  } = soundContext;

  // Determine which icon to show
  const getIcon = () => {
    if (isMuted || volume === 0) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      );
    }
    if (volume < 0.5) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    );
  };

  // Music note icon
  const getMusicIcon = () => {
    if (!musicEnabled) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" 
            opacity={0.4} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M18.364 5.636l-3.536 3.536m0-3.536l3.536 3.536" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
      </svg>
    );
  };

  const handleMouseEnter = () => {
    // Only use hover on desktop (non-touch devices)
    if (window.matchMedia("(hover: hover)").matches) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShowSlider(true);
    }
  };

  const handleMouseLeave = () => {
    // Only use hover on desktop
    if (window.matchMedia("(hover: hover)").matches) {
      timeoutRef.current = setTimeout(() => {
        setShowSlider(false);
      }, 300);
    }
  };

  const handleMusicMouseEnter = () => {
    if (window.matchMedia("(hover: hover)").matches) {
      if (musicTimeoutRef.current) {
        clearTimeout(musicTimeoutRef.current);
        musicTimeoutRef.current = null;
      }
      setShowMusicSlider(true);
    }
  };

  const handleMusicMouseLeave = () => {
    if (window.matchMedia("(hover: hover)").matches) {
      musicTimeoutRef.current = setTimeout(() => {
        setShowMusicSlider(false);
      }, 300);
    }
  };

  const handleButtonClick = () => {
    // On touch devices, toggle slider visibility
    // On desktop with hover, just toggle mute
    if (window.matchMedia("(hover: none)").matches) {
      setShowSlider(!showSlider);
    } else {
      toggleMute();
    }
  };

  const handleMusicButtonClick = () => {
    if (window.matchMedia("(hover: none)").matches) {
      setShowMusicSlider(!showMusicSlider);
    } else {
      toggleMusic();
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Sound Effects Control */}
      <div 
        ref={containerRef}
        className="relative flex items-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Mute/Unmute Button */}
        <button
          onClick={handleButtonClick}
          className={`p-2 rounded-lg transition-colors ${
            soundEnabled
              ? "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
          title={isMuted ? "Unmute sounds" : "Mute sounds"}
          aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
        >
          {getIcon()}
        </button>

        {/* Volume Slider Popover */}
        <div 
          className={`
            absolute z-50 flex items-center gap-2 px-3 py-2 
            bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600
            transition-all duration-200
            top-full right-0 mt-2 origin-top-right
            sm:top-auto sm:right-auto sm:left-full sm:mt-0 sm:ml-2 sm:origin-left
            ${showSlider ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}
          `}
        >
          <button
            onClick={toggleMute}
            className={`sm:hidden p-1.5 rounded transition-colors ${
              isMuted 
                ? "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300" 
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-blue-500
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-blue-500
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:cursor-pointer"
            aria-label="Sound effects volume"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right tabular-nums">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      {/* Music Control */}
      <div 
        ref={musicContainerRef}
        className="relative flex items-center"
        onMouseEnter={handleMusicMouseEnter}
        onMouseLeave={handleMusicMouseLeave}
      >
        <button
          onClick={handleMusicButtonClick}
          className={`p-2 rounded-lg transition-colors ${
            musicEnabled
              ? "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
          title={musicEnabled ? "Turn off music" : "Turn on music"}
          aria-label={musicEnabled ? "Turn off music" : "Turn on music"}
        >
          {getMusicIcon()}
        </button>

        {/* Music Volume Slider Popover */}
        <div 
          className={`
            absolute z-50 flex items-center gap-2 px-3 py-2 
            bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600
            transition-all duration-200
            top-full right-0 mt-2 origin-top-right
            sm:top-auto sm:right-auto sm:left-full sm:mt-0 sm:ml-2 sm:origin-left
            ${showMusicSlider ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}
          `}
        >
          <button
            onClick={toggleMusic}
            className={`sm:hidden p-1.5 rounded transition-colors ${
              !musicEnabled 
                ? "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300" 
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            aria-label={musicEnabled ? "Turn off" : "Turn on"}
          >
            {getMusicIcon()}
          </button>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={musicVolume}
            onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
            className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-purple-500
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-purple-500
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:cursor-pointer"
            aria-label="Music volume"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right tabular-nums">
            {Math.round(musicVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
