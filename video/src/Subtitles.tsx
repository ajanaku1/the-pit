import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { INTER } from "./fonts";
import { COLORS, CROSSFADE, SCENE_DURATIONS, AUDIO_DURATIONS } from "./constants";

type SceneId = keyof typeof SCENE_DURATIONS;

// Narration split into display-sized lines (matches SCRIPT.md, lightly chunked).
const SCRIPT: Record<SceneId, string[]> = {
  hook: [
    "Every prediction market lets you bet against the crowd.",
    "The Pit lets you fight something that never blinks:",
    "an autonomous AI fund manager, live and on-chain.",
  ],
  problem: [
    "Most markets are slow and passive. You place a bet, then you wait.",
    "The Pit is a sixty-second duel.",
    "Draft a portfolio, stake USDG, and out-trade the machine before the bell.",
  ],
  howitworks: [
    "Both sides draft blind.",
    "Commit-reveal locks your picks and the Boss's at the same instant,",
    "so it can never copy you.",
    "Then both hands flip face-up and race live, long or short, to the closing price.",
  ],
  battle: [
    "Here's a real round on Robinhood Chain.",
    "I draft three tickers and step into the pit.",
    "The Boss counter-drafts on its own, reveals, and our two books climb side by side.",
    "When the bell rings, the contract settles on-chain in a single transaction.",
    "Winner takes the pot.",
  ],
  features: [
    "Trade tokenized stocks on weekdays, or crypto, twenty-four seven.",
    "Go long on what you believe in, and short what you don't.",
    "A two-times move wipes a short, but never your whole stake.",
  ],
  autonomous: [
    "The Boss isn't waiting for its turn.",
    "It's a standalone agent that signs prices, joins every open round, talks trash, and settles,",
    "with no human in the loop.",
    "The Humans versus Machine score lives on-chain for anyone to verify.",
  ],
  architecture: [
    "Web and Telegram up front.",
    "Commit-reveal battle contracts and a Data-Streams-shaped price relay underneath.",
    "One autonomous agent tying it all together.",
  ],
  close: [
    "The Pit. Beat the machine, if you can.",
    "Live now on Robinhood Chain, built for the Arbitrum Open House London Buildathon.",
  ],
};

const ORDER: SceneId[] = [
  "hook", "problem", "howitworks", "battle", "features", "autonomous", "architecture", "close",
];

type Entry = { text: string; start: number; end: number };

function buildEntries(): Entry[] {
  const entries: Entry[] = [];
  let sceneStart = 0;
  for (let s = 0; s < ORDER.length; s++) {
    const id = ORDER[s];
    const audioDur = AUDIO_DURATIONS[id];
    const lines = SCRIPT[id];
    const totalWords = lines.reduce((a, l) => a + l.split(" ").length, 0);
    let cumWords = 0;
    for (const line of lines) {
      const wc = line.split(" ").length;
      const start = sceneStart + Math.round((cumWords / totalWords) * audioDur);
      cumWords += wc;
      const end = sceneStart + Math.round((cumWords / totalWords) * audioDur);
      entries.push({ text: line, start, end });
    }
    sceneStart += SCENE_DURATIONS[id] - CROSSFADE;
  }
  return entries;
}

const ENTRIES = buildEntries();

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const active = ENTRIES.find((e) => frame >= e.start && frame < e.end);
  if (!active) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", zIndex: 50 }}>
      <div style={{
        background: "rgba(0,0,0,0.7)",
        borderRadius: 10,
        padding: "12px 28px",
        marginBottom: 64,
        maxWidth: 1500,
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{
          fontFamily: INTER, fontSize: 30, fontWeight: 600,
          color: "#ffffff", textAlign: "center", lineHeight: 1.4,
        }}>
          {active.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
