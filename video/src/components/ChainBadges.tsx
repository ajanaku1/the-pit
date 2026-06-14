import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

const Pill: React.FC<{ icon: string; label: string; delay: number; sub?: string }> = ({ icon, label, delay, sub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 130 } });
  const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(prog, [0, 1], [14, 0]);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 11,
      background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
      borderRadius: 999, padding: "10px 18px",
      opacity: op, transform: `translateY(${y}px)`, backdropFilter: "blur(6px)",
    }}>
      <Img src={staticFile(icon)} style={{ width: 26, height: 26, display: "block" }} />
      <div style={{ textAlign: "left", lineHeight: 1.15 }}>
        {sub && <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: 1 }}>{sub}</div>}
        <div style={{ fontFamily: INTER, fontSize: 17, fontWeight: 700, color: COLORS.white }}>{label}</div>
      </div>
    </div>
  );
};

export const ChainBadges: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
  <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center" }}>
    <Pill icon="assets/robinhood.svg" sub="BUILT ON" label="Robinhood Chain" delay={delay} />
    <Pill icon="assets/arbitrum.svg" sub="ARBITRUM" label="Open House London" delay={delay + 12} />
  </div>
);
