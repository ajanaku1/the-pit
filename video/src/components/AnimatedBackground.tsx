import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

type Orb = {
  baseX: number; baseY: number; size: number;
  color: string; blur: number; opacity: number; speed: number;
};

const PIT_ORBS: Orb[] = [
  { baseX: 280,  baseY: 220, size: 520, color: "#e5484d", blur: 130, opacity: 0.13, speed: 0.006 },
  { baseX: 1580, baseY: 800, size: 440, color: "#7f1d1d", blur: 120, opacity: 0.11, speed: 0.005 },
  { baseX: 960,  baseY: 520, size: 560, color: "#b91c1c", blur: 150, opacity: 0.08, speed: 0.008 },
  { baseX: 1700, baseY: 180, size: 380, color: "#f59e0b", blur: 110, opacity: 0.05, speed: 0.007 },
  { baseX: 180,  baseY: 840, size: 340, color: "#34d399", blur: 110, opacity: 0.045, speed: 0.009 },
];

export const AnimatedBackground: React.FC<{ orbs?: Orb[] }> = ({ orbs = PIT_ORBS }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {orbs.map((orb, i) => {
        const x = orb.baseX + Math.sin(frame * orb.speed + i * 1.5) * 90;
        const y = orb.baseY + Math.cos(frame * orb.speed + i * 2.1) * 70;
        return (
          <div key={i} style={{
            position: "absolute",
            left: x - orb.size / 2,
            top: y - orb.size / 2,
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: orb.color,
            filter: `blur(${orb.blur}px)`,
            opacity: orb.opacity,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};
