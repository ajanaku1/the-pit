import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { SectionTitle } from "../components/SectionTitle";
import { GlassCard } from "../components/GlassCard";

const STEPS = [
  { n: "1", label: "Draft blind", detail: "Pick 3 assets, weight them, choose long or short", color: COLORS.accent },
  { n: "2", label: "Commit-reveal", detail: "Both hands lock at once — the Boss can't copy you", color: COLORS.amber },
  { n: "3", label: "Race live", detail: "Cards flip face-up; both books climb to the bell", color: COLORS.cyan },
  { n: "4", label: "Settle on-chain", detail: "Best return wins the USDG pot, in one transaction", color: COLORS.green },
];

export const HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <SectionTitle eyebrow="60 seconds, on-chain" title="How a round works" style={{ marginBottom: 56 }} />
        <div style={{ display: "flex", gap: 26, maxWidth: 1640, width: "100%", justifyContent: "center", padding: "0 60px" }}>
          {STEPS.map((s, i) => {
            const prog = spring({ frame: frame - (40 + i * 28), fps, config: { damping: 15, stiffness: 90 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(prog, [0, 1], [26, 0]);
            const scale = interpolate(prog, [0, 1], [0.93, 1]);
            return (
              <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${y}px) scale(${scale})` }}>
                <GlassCard borderColor={`${s.color}40`} style={{ padding: "30px 26px", height: 230 }}>
                  <div style={{
                    width: 50, height: 50, borderRadius: 12,
                    background: `${s.color}22`, border: `1px solid ${s.color}55`,
                    display: "flex", justifyContent: "center", alignItems: "center",
                    fontFamily: MONO, fontSize: 22, fontWeight: 700, color: s.color,
                    marginBottom: 20, textShadow: `0 0 12px ${s.color}`,
                  }}>{s.n}</div>
                  <div style={{ fontFamily: INTER, fontSize: 25, fontWeight: 800, color: COLORS.white, marginBottom: 12 }}>{s.label}</div>
                  <div style={{ fontFamily: INTER, fontSize: 17, color: COLORS.offWhite, lineHeight: 1.5 }}>{s.detail}</div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
