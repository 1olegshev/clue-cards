// localStorage keys
export const LOCAL_STORAGE_AVATAR_KEY = "cluecards_avatar";
export const LOCAL_STORAGE_SOUND_VOLUME_KEY = "cluecards_sound_volume";
export const LOCAL_STORAGE_SOUND_MUTED_KEY = "cluecards_sound_muted";
export const LOCAL_STORAGE_MUSIC_VOLUME_KEY = "cluecards_music_volume";
export const LOCAL_STORAGE_MUSIC_ENABLED_KEY = "cluecards_music_enabled";

// Game configuration
export const TURN_DURATIONS = [30, 60, 90] as const;
export const DEFAULT_TURN_DURATION = 60;
export const WORD_PACKS = ["classic", "kahoot"] as const;
export const DEFAULT_WORD_PACK = "classic";

// Validation limits
export const MAX_PLAYER_NAME_LENGTH = 20;
export const MAX_CLUE_LENGTH = 30;
export const MAX_CHAT_MESSAGE_LENGTH = 200;
export const MIN_PLAYERS_TO_START = 4;

// Avatars
export const AVATARS = [
  "🐱", "🐶", "🐻", "🦊", "🐼", "🦁", "🐯", "🐮",
  "🐷", "🐸", "🐵", "🐔", "🦄", "🐲", "🦖", "🐙",
  "🦋", "🐝", "🐢", "🦜", "🎃", "🤖", "👻", "👾",
] as const;

export type Avatar = typeof AVATARS[number];

export function getRandomAvatar(): Avatar {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}
