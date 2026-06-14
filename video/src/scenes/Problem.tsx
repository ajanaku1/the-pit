import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { SectionTitle } from "../components/SectionTitle";

const OLD = ["Place a bet", "Wait days", "Passive position", "Watch a number"];
const NEW = ["Draft a portfolio", "60-second duel", "Long AND short", "Out-trade the machine"];

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dividerOp = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const col = (items: string[], baseDelay: number, sign: string, color: string, dim: boolean) =>
    items.map((t, i) => {
      const prog = spring({ frame: frame - (baseDelay + i * 15), fps, config: { damping: 18, stiffness: 150 } });
      const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
      const x = interpolate(prog, [0, 1], [sign === "−" ? -24 : 24, 0]);
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, opacity: op, transform: `translateX(${x}px)`, marginBottom: 22 }}>
          <span style={{ fontFamily: INTER, fontSize: 30, fontWeight: 900, color }}>{sign}</span>
          <span style={{ fontFamily: INTER, fontSize: 30, fontWeight: 600, color: dim ? COLORS.muted : COLORS.white, textDecoration: dim ? "line-through" : "none" }}>{t}</span>
        </div>
      );
    });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <SectionTitle eyebrow="The difference" title="Prediction markets are slow. The Pit is a fight." style={{ marginBottom: 64 }} />
        <div style={{ display: "flex", gap: 90, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: INTER, fontSize: 18, fontWeight: 700, color: COLORS.muted, letterSpacing: 3, marginBottom: 24 }}>THE OLD WAY</div>
            {col(OLD, 25, "−", COLORS.red, true)}
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: `linear-gradient(180deg, transparent, ${COLORS.accent}, transparent)`, opacity: dividerOp }} />
          <div>
            <div style={{ fontFamily: INTER, fontSize: 18, fontWeight: 700, color: COLORS.accent, letterSpacing: 3, marginBottom: 24 }}>THE PIT</div>
            {col(NEW, 60, "+", COLORS.green, false)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
