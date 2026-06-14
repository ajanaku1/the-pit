import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

// Animated section heading: title springs up, accent underline wipes in beneath it.
export const SectionTitle: React.FC<{
  title: string; eyebrow?: string; delay?: number; style?: React.CSSProperties;
}> = ({ title, eyebrow, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 90 } });
  const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(prog, [0, 1], [22, 0]);
  const lineW = interpolate(spring({ frame: frame - delay - 8, fps, config: { damping: 18, stiffness: 110 } }), [0, 1], [0, 1]);
  const ebOp = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ textAlign: "center", ...style }}>
      {eyebrow && (
        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, letterSpacing: 4, color: COLORS.accent, opacity: ebOp, marginBottom: 12, textTransform: "uppercase" }}>
          {eyebrow}
        </div>
      )}
      <div style={{ fontFamily: INTER, fontSize: 46, fontWeight: 800, color: COLORS.white, opacity: op, transform: `translateY(${y}px)`, textShadow: `0 0 30px ${COLORS.accent}25` }}>
        {title}
      </div>
      <div style={{ height: 4, width: `${lineW * 90}px`, margin: "16px auto 0", borderRadius: 3, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.green})`, boxShadow: `0 0 16px ${COLORS.accent}80` }} />
    </div>
  );
};
