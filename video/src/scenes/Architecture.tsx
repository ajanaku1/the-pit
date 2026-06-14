import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { SectionTitle } from "../components/SectionTitle";
import { GlassCard } from "../components/GlassCard";

const COLUMNS = [
  { title: "FRONT", color: COLORS.cyan, items: ["Web app (Vite + viem)", "Telegram bot (grammY)"], enter: 30 },
  { title: "CONTRACTS", color: COLORS.accent, items: ["Battle: commit-reveal + escrow", "Price relay (Data Streams shape)", "Settles in USDG, one tx"], enter: 80 },
  { title: "AGENT", color: COLORS.green, items: ["Signs prices every 60s", "Counter-drafts + settles", "Watches stocks & crypto"], enter: 130 },
];

export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <SectionTitle eyebrow="Architecture" title="Under the hood" style={{ marginBottom: 52 }} />
        <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
          {COLUMNS.map((col, ci) => {
            const prog = spring({ frame: frame - col.enter, fps, config: { damping: 16, stiffness: 120 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(prog, [0, 1], [22, 0]);
            return (
              <React.Fragment key={ci}>
                <div style={{ opacity: op, transform: `translateY(${y}px)`, width: 420 }}>
                  <GlassCard borderColor={`${col.color}44`} style={{ padding: "26px 28px", minHeight: 280 }}>
                    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: col.color, letterSpacing: 3, marginBottom: 20 }}>{col.title}</div>
                    {col.items.map((it, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                        <span style={{ color: col.color, fontFamily: MONO, fontSize: 18 }}>›</span>
                        <span style={{ fontFamily: INTER, fontSize: 19, color: COLORS.offWhite, lineHeight: 1.4 }}>{it}</span>
                      </div>
                    ))}
                  </GlassCard>
                </div>
                {ci < COLUMNS.length - 1 && (
                  <div style={{
                    fontFamily: INTER, fontSize: 40, fontWeight: 900,
                    color: COLORS.accent, opacity: interpolate(frame, [col.enter + 30, col.enter + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                  }}>→</div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
