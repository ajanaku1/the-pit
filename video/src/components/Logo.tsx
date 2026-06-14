import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";

// The Pit mark (chart climbing out of the pit), with a spring entrance + glow.
export const Logo: React.FC<{ size: number; delay?: number; spin?: boolean }> = ({ size, delay = 0, spin = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 95 } });
  const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(prog, [0, 1], [0.6, 1]);
  const rot = spin ? interpolate(prog, [0, 1], [-22, 0]) : 0;
  return (
    <Img
      src={staticFile("assets/logo.svg")}
      style={{
        width: size, height: size, display: "block",
        opacity: op, transform: `scale(${scale}) rotate(${rot}deg)`,
        filter: `drop-shadow(0 0 ${size * 0.18}px ${COLORS.accent}70)`,
      }}
    />
  );
};
