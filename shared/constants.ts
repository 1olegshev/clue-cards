export const LOCAL_STORAGE_PLAYER_ID_KEY = "cluecards_player_id";
export const LOCAL_STORAGE_AVATAR_KEY = "cluecards_avatar";

export const AVATARS = [
  "🐱", "🐶", "🐻", "🦊", "🐼", "🦁", "🐯", "🐮",
  "🐷", "🐸", "🐵", "🐔", "🦄", "🐲", "🦖", "🐙",
  "🦋", "🐝", "🐢", "🦜", "🎃", "🤖", "👻", "👾",
] as const;

export type Avatar = typeof AVATARS[number];

export function getRandomAvatar(): Avatar {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}
