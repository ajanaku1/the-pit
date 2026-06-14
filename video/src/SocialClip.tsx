import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SOCIAL_DURATION } from "./constants";
import { INTER } from "./fonts";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { GlowText } from "./components/GlowText";
import { Logo } from "./components/Logo";

const VERTICAL_ORBS = [
  { baseX: 220, baseY: 360, size: 460, color: "#e5484d", blur: 130, opacity: 0.14, speed: 0.006 },
  { baseX: 880, baseY: 1560, size: 420, color: "#7f1d1d", blur: 120, opacity: 0.11, speed: 0.005 },
  { baseX: 540, baseY: 980, size: 520, color: "#b91c1c", blur: 150, opacity: 0.08, speed: 0.008 },
  { baseX: 120, baseY: 1380, size: 340, color: "#34d399", blur: 110, opacity: 0.05, speed: 0.007 },
];

export const SocialClip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SOCIAL_DURATION;
  const exitOp = interpolate(frame, [dur - 20, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + Math.sin(frame * 0.12) * 0.04;
  const vsProg = spring({ frame: frame - 40, fps, config: { damping: 12, stiffness: 110 } });
  const vsOp = interpolate(vsProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground orbs={VERTICAL_ORBS} />
      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "80px 60px", zIndex: 10, opacity: exitOp }}>
        <GlowText text="YOU VS" fontSize={64} color={COLORS.green} delay={5} fontWeight={800} style={{ letterSpacing: 4 }} />
        <GlowText text="THE MACHINE" fontSize={84} color={COLORS.accentBright} delay={14} fontWeight={900} glowIntensity={1.2} style={{ marginBottom: 80, letterSpacing: 2 }} />

        <div style={{ marginBottom: 18 }}><Logo size={150} delay={28} spin /></div>
        <div style={{ opacity: vsOp, transform: `scale(${pulse})`, display: "flex", alignItems: "baseline", marginBottom: 30 }}>
          <span style={{ fontFamily: INTER, fontSize: 130, fontWeight: 900, fontStyle: "italic", color: COLORS.white, letterSpacing: -2 }}>THE</span>
          <span style={{ fontFamily: INTER, fontSize: 130, fontWeight: 900, fontStyle: "italic", color: COLORS.accent, letterSpacing: -2, textShadow: `0 0 50px ${COLORS.accent}` }}>PIT</span>
        </div>

        <GlowText text="Battle an autonomous AI fund manager" fontSize={36} color={COLORS.white} delay={55} fontWeight={600} style={{ textAlign: "center", marginBottom: 24, maxWidth: 900 }} />
        <GlowText text="Draft blind · long or short · settle on-chain" fontSize={28} color={COLORS.offWhite} delay={70} fontWeight={500} style={{ textAlign: "center", marginBottom: 90 }} />

        <GlowText text="Live on Robinhood Chain" fontSize={30} color={COLORS.green} delay={90} fontWeight={700} glowIntensity={0.7} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
