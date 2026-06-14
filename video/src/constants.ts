// The Pit — demo video constants. Theme: crimson/black fight-night.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const COLORS = {
  bg: "#0b0708",
  bgCard: "rgba(32,12,14,0.62)",
  accent: "#e5484d",
  accentDim: "#7f1d1d",
  accentBright: "#ff6b6b",
  green: "#34d399",
  greenDim: "#166534",
  secondary: "#34d399",
  amber: "#f59e0b",
  cyan: "#22d3ee",
  white: "#f6efef",
  offWhite: "#c6aab0",
  muted: "#7a5e62",
  border: "rgba(229,72,77,0.22)",
  red: "#ef4444",
};

export const TERMINAL = {
  bg: "#0c0809",
  text: "#d9c9cc",
  green: "#34d399",
  yellow: "#f59e0b",
  red: "#f85149",
  blue: "#58a6ff",
  purple: "#bc8cff",
  prompt: "#8b7479",
};

export const SCENE_GAP = Math.round(1.2 * FPS); // 36 frames breathing room after audio

// Real ffprobe durations (seconds * FPS, rounded)
export const AUDIO_DURATIONS = {
  hook: 311,
  problem: 341,
  howitworks: 377,
  battle: 490,
  features: 333,
  autonomous: 431,
  architecture: 278,
  close: 224,
} as const;

export const SCENE_DURATIONS = {
  hook: AUDIO_DURATIONS.hook + SCENE_GAP,
  problem: AUDIO_DURATIONS.problem + SCENE_GAP,
  howitworks: AUDIO_DURATIONS.howitworks + SCENE_GAP,
  battle: AUDIO_DURATIONS.battle + SCENE_GAP,
  features: AUDIO_DURATIONS.features + SCENE_GAP,
  autonomous: AUDIO_DURATIONS.autonomous + SCENE_GAP,
  architecture: AUDIO_DURATIONS.architecture + SCENE_GAP,
  close: AUDIO_DURATIONS.close + 90, // extra hold + slow fade
} as const;

export const CROSSFADE = 24; // 0.8s

export const TOTAL_FRAMES =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  CROSSFADE * (Object.keys(SCENE_DURATIONS).length - 1);

export const AUDIO_FILES: Record<keyof typeof SCENE_DURATIONS, string> = {
  hook: "audio/hook.mp3",
  problem: "audio/problem.mp3",
  howitworks: "audio/howitworks.mp3",
  battle: "audio/battle.mp3",
  features: "audio/features.mp3",
  autonomous: "audio/autonomous.mp3",
  architecture: "audio/architecture.mp3",
  close: "audio/close.mp3",
};

// Social clip
export const SOCIAL_FPS = 30;
export const SOCIAL_W = 1080;
export const SOCIAL_H = 1920;
export const SOCIAL_DURATION = 11 * SOCIAL_FPS;
