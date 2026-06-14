import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { Logo } from "../components/Logo";
import { ChainBadges } from "../components/ChainBadges";

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordProg = spring({ frame: frame - 22, fps, config: { damping: 14, stiffness: 90 } });
  const wordScale = interpolate(wordProg, [0, 1], [0.9, 1]);
  const wordOp = interpolate(wordProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  const vsProg = spring({ frame: frame - 78, fps, config: { damping: 12, stiffness: 110 } });
  const vsOp = interpolate(vsProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const vsScale = interpolate(vsProg, [0, 1], [0.7, 1]);
  const pulse = 1 + Math.sin(frame * 0.12) * 0.03;
  // gentle drift on the whole lockup for life
  const drift = Math.sin(frame * 0.02) * 5;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10, transform: `translateY(${drift}px)` }}>
        <div style={{ marginBottom: 14 }}><Logo size={108} delay={2} spin /></div>

        <div style={{ opacity: wordOp, transform: `scale(${wordScale})`, display: "flex", alignItems: "baseline", marginBottom: 16 }}>
          <span style={{ fontFamily: INTER, fontSize: 124, fontWeight: 900, fontStyle: "italic", color: COLORS.white, letterSpacing: -2 }}>THE</span>
          <span style={{ fontFamily: INTER, fontSize: 124, fontWeight: 900, fontStyle: "italic", color: COLORS.accent, letterSpacing: -2, textShadow: `0 0 50px ${COLORS.accent}80` }}>PIT</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 34, opacity: vsOp, transform: `scale(${vsScale})` }}>
          <span style={{ fontFamily: INTER, fontSize: 36, fontWeight: 800, color: COLORS.green }}>YOU</span>
          <span style={{ fontFamily: INTER, fontSize: 50, fontWeight: 900, fontStyle: "italic", color: COLORS.accent, transform: `scale(${pulse})`, textShadow: `0 0 30px ${COLORS.accent}` }}>VS</span>
          <span style={{ fontFamily: INTER, fontSize: 36, fontWeight: 800, color: COLORS.accentBright }}>THE&nbsp;MACHINE</span>
        </div>

        <GlowText
          text="A PvAI prediction market where you battle an autonomous AI fund manager"
          fontSize={27} color={COLORS.offWhite} delay={118} fontWeight={500} glowIntensity={0.4}
          style={{ marginTop: 44, marginBottom: 40, textAlign: "center", maxWidth: 1080 }}
        />

        <ChainBadges delay={170} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
