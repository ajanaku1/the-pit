import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

// Persistent top-left brand lockup, pinned across the whole video for consistency.
export const BrandPin: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const inOp = interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outOp = interpolate(frame, [totalFrames - 70, totalFrames - 50], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ zIndex: 40, pointerEvents: "none" }}>
      <div style={{
        position: "absolute", top: 38, left: 46,
        display: "flex", alignItems: "center", gap: 9,
        opacity: Math.min(inOp, outOp),
      }}>
        <Img src={staticFile("assets/logo.svg")} style={{ width: 26, height: 26, filter: `drop-shadow(0 0 7px ${COLORS.accent}55)` }} />
        <span style={{ fontFamily: INTER, fontSize: 19, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5, color: COLORS.white }}>
          THE<span style={{ color: COLORS.accent }}>PIT</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
