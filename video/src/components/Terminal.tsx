import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, TERMINAL } from "../constants";
import { MONO } from "../fonts";

type LineColor = "prompt" | "text" | "green" | "yellow" | "red" | "blue" | "purple";

export const Terminal: React.FC<{
  lines: { text: string; color: LineColor }[];
  title?: string; charsPerFrame?: number;
  delay?: number; style?: React.CSSProperties;
}> = ({ lines, title = "the-pit-boss", charsPerFrame = 0.9, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);
  const visibleChars = Math.floor(adjustedFrame * charsPerFrame);

  const containerProg = spring({ frame: adjustedFrame, fps: useVideoConfig().fps, config: { damping: 20, stiffness: 120 } });
  const containerOp = interpolate(containerProg, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
  const containerScale = interpolate(containerProg, [0, 1], [0.96, 1]);

  const colorMap: Record<LineColor, string> = {
    prompt: TERMINAL.prompt, text: TERMINAL.text,
    green: TERMINAL.green, yellow: TERMINAL.yellow,
    red: TERMINAL.red, blue: TERMINAL.blue, purple: TERMINAL.purple,
  };

  let charCount = 0;
  return (
    <div style={{
      width: 1180, minHeight: 360, background: TERMINAL.bg,
      borderRadius: 14, border: `1px solid ${COLORS.border}`,
      boxShadow: `0 0 50px ${COLORS.accent}18`,
      overflow: "hidden", opacity: containerOp,
      transform: `scale(${containerScale})`, ...style,
    }}>
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, borderBottom: `1px solid ${COLORS.border}`, alignItems: "center" }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#34d399" }} />
        <span style={{ fontFamily: MONO, fontSize: 13, color: TERMINAL.prompt, marginLeft: 8 }}>{title}</span>
      </div>
      <div style={{ padding: "18px 24px" }}>
        {lines.map((line, i) => {
          const lineStart = charCount;
          charCount += line.text.length;
          if (lineStart >= visibleChars) return null;
          const visible = Math.min(line.text.length, visibleChars - lineStart);
          const isTyping = visible < line.text.length && visible > 0;
          return (
            <div key={i} style={{
              fontFamily: MONO, fontSize: 18, lineHeight: 1.75,
              color: colorMap[line.color], whiteSpace: "pre-wrap",
            }}>
              {line.text.slice(0, visible)}
              {isTyping && (
                <span style={{ opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0, color: COLORS.accent }}>_</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
