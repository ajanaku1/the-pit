import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { SectionTitle } from "../components/SectionTitle";
import { Terminal } from "../components/Terminal";

const LINES = [
  { text: "$ tsx src/index.ts", color: "prompt" as const },
  { text: "Pit Boss online as 0x8C21…1f31 — markets: Stocks, Crypto", color: "blue" as const },
  { text: "[keeper:stocks] posted 5 prices  market=open", color: "text" as const },
  { text: "[round 2] human opened — counter-drafting (blind)…", color: "yellow" as const },
  { text: "[round 2] joined · revealed hand · trash talk sent", color: "text" as const },
  { text: "[round 2] bell → settle on-chain (1 tx)  +10 USDG", color: "green" as const },
  { text: "  leaderboard: humans 0 — machine 1", color: "purple" as const },
];

export const Autonomous: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badgeProg = spring({ frame: frame - 200, fps, config: { damping: 16, stiffness: 120 } });
  const badgeOp = interpolate(badgeProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <SectionTitle eyebrow="Meet your opponent" title="The Boss runs itself" style={{ marginBottom: 18 }} />
        <GlowText text="One autonomous agent — no human in the loop" fontSize={22} color={COLORS.offWhite} delay={18} fontWeight={500} style={{ marginBottom: 36 }} />
        <Terminal lines={LINES} delay={30} charsPerFrame={1.0} />
        <div style={{
          marginTop: 28, opacity: badgeOp,
          fontFamily: INTER, fontSize: 20, fontWeight: 700, color: COLORS.accentBright,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <span style={{ color: COLORS.green }}>●</span> Humans vs Machine — verifiable on-chain
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
