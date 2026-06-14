import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCENE_DURATIONS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { Logo } from "../components/Logo";
import { ChainBadges } from "../components/ChainBadges";

const STATS = [
  { to: 48, suffix: "", l: "tests passing" },
  { to: 10, suffix: "", l: "assets · 2 markets" },
  { to: 10, prefix: "~", suffix: "s", l: "bell → settle" },
  { to: 100, suffix: "%", l: "autonomous Boss" },
];

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATIONS.close;

  const logoOp = 1;
  const fadeOut = interpolate(frame, [dur - 60, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cornerOp = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const wordProg = spring({ frame: frame - 16, fps, config: { damping: 14, stiffness: 90 } });
  const wordOp = interpolate(wordProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const wordScale = interpolate(wordProg, [0, 1], [0.92, 1]);

  const Corner: React.FC<{ pos: React.CSSProperties }> = ({ pos }) => (
    <div style={{ position: "absolute", width: 55, height: 55, opacity: cornerOp, ...pos }} />
  );

  return (
    <AbsoluteFill style={{ background: COLORS.bg, opacity: fadeOut }}>
      <AnimatedBackground />
      <Corner pos={{ top: 50, left: 50, borderTop: `3px solid ${COLORS.accent}`, borderLeft: `3px solid ${COLORS.accent}` }} />
      <Corner pos={{ top: 50, right: 50, borderTop: `3px solid ${COLORS.accent}`, borderRight: `3px solid ${COLORS.accent}` }} />
      <Corner pos={{ bottom: 50, left: 50, borderBottom: `3px solid ${COLORS.accent}`, borderLeft: `3px solid ${COLORS.accent}` }} />
      <Corner pos={{ bottom: 50, right: 50, borderBottom: `3px solid ${COLORS.accent}`, borderRight: `3px solid ${COLORS.accent}` }} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <div style={{ marginBottom: 8, opacity: logoOp }}><Logo size={96} delay={2} spin /></div>
        <div style={{ opacity: wordOp, transform: `scale(${wordScale})`, display: "flex", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontFamily: INTER, fontSize: 120, fontWeight: 900, fontStyle: "italic", color: COLORS.white, letterSpacing: -2 }}>THE</span>
          <span style={{ fontFamily: INTER, fontSize: 120, fontWeight: 900, fontStyle: "italic", color: COLORS.accent, letterSpacing: -2, textShadow: `0 0 50px ${COLORS.accent}80` }}>PIT</span>
        </div>

        <GlowText text="Beat the machine — if you can." fontSize={32} color={COLORS.offWhite} delay={26} fontWeight={600} style={{ marginBottom: 40 }} />

        <div style={{ display: "flex", gap: 52, marginBottom: 42 }}>
          {STATS.map((s, i) => {
            const enter = 44 + i * 14;
            const p = spring({ frame: frame - enter, fps, config: { damping: 16, stiffness: 130 } });
            const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(p, [0, 1], [16, 0]);
            const count = Math.round(interpolate(frame - enter, [0, 32], [0, s.to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
            return (
              <div key={i} style={{ textAlign: "center", opacity: op, transform: `translateY(${y}px)` }}>
                <div style={{ fontFamily: INTER, fontSize: 46, fontWeight: 900, color: COLORS.accentBright, fontStyle: "italic" }}>
                  {s.prefix ?? ""}{count}{s.suffix}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 16, color: COLORS.muted, marginTop: 4 }}>{s.l}</div>
              </div>
            );
          })}
        </div>

        <GlowText text="web-eta-teal-85.vercel.app" fontSize={28} color={COLORS.green} delay={108} fontWeight={700} glowIntensity={0.6} style={{ marginBottom: 26 }} />
        <ChainBadges delay={128} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
