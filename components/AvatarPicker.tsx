"use client";

import { useState, useRef, useEffect } from "react";
import { AVATARS } from "@/shared/constants";

interface AvatarPickerProps {
  selected: string;
  onSelect: (avatar: string) => void;
}

export default function AvatarPicker({ selected, onSelect }: AvatarPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (avatar: string) => {
    onSelect(avatar);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Avatar Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 text-3xl rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-all border-2 border-transparent hover:border-blue-400 focus:border-blue-500 focus:outline-none"
        title="Click to change avatar"
      >
        {selected || "🐱"}
      </button>
      
      {/* Edit indicator */}
      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>

      {/* Popover Picker */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-6 gap-2 w-[276px]">
            {AVATARS.map((avatar) => (
              <button
                key={avatar}
                type="button"
                onClick={() => handleSelect(avatar)}
                className={`w-10 h-10 text-2xl rounded-lg flex items-center justify-center transition-all ${
                  selected === avatar
                    ? "bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500 scale-110"
                    : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
