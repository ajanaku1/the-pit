import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { SectionTitle } from "../components/SectionTitle";
import { GlassCard } from "../components/GlassCard";

const CARDS = [
  { tag: "TWO MARKETS", title: "Stocks + Crypto", body: "Tokenized TSLA, AMZN, PLTR, NFLX, AMD on weekdays. BTC, ETH, BNB, SOL, XRP — 24/7.", color: COLORS.accent, enter: 30 },
  { tag: "LONG / SHORT", title: "Pick your side", body: "Go long on conviction, short the rest. A 2x move wipes a short, never your stake.", color: COLORS.green, enter: 95 },
  { tag: "VIRTUAL, SETTLED IN USDG", title: "No swaps, real stakes", body: "Allocations are virtual; signed prices settle the pot in USDG, on-chain.", color: COLORS.cyan, enter: 160 },
];

export const Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <SectionTitle eyebrow="Markets & sides" title="Built for traders" style={{ marginBottom: 52 }} />
        <div style={{ display: "flex", gap: 28, maxWidth: 1640, padding: "0 60px" }}>
          {CARDS.map((c, i) => {
            const prog = spring({ frame: frame - c.enter, fps, config: { damping: 16, stiffness: 140 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(prog, [0, 1], [24, 0]);
            const scale = interpolate(prog, [0, 1], [0.93, 1]);
            return (
              <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${y}px) scale(${scale})` }}>
                <GlassCard borderColor={`${c.color}44`} style={{ padding: "32px 30px", height: 290 }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: c.color, letterSpacing: 2, marginBottom: 18 }}>{c.tag}</div>
                  <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 800, color: COLORS.white, marginBottom: 16 }}>{c.title}</div>
                  <div style={{ fontFamily: INTER, fontSize: 19, color: COLORS.offWhite, lineHeight: 1.55 }}>{c.body}</div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
