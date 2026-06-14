import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";

const VIDEO_START = 36; // frames before the recording fades in

export const Battle: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOp = interpolate(frame, [0, 12, 30, 44], [0, 1, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const videoOp = interpolate(frame, [VIDEO_START, VIDEO_START + 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const videoScale = interpolate(frame, [VIDEO_START, VIDEO_START + 30], [1.03, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // "REAL ROUND · ROBINHOOD CHAIN" tag pinned top-left during the clip
  const tagOp = interpolate(frame, [VIDEO_START + 20, VIDEO_START + 40], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />

      {frame >= VIDEO_START && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: videoOp, zIndex: 5 }}>
          <div style={{
            width: 1680, borderRadius: 16, overflow: "hidden",
            border: `1px solid ${COLORS.border}`,
            boxShadow: `0 0 70px ${COLORS.accent}28`,
            transform: `scale(${videoScale})`,
          }}>
            <OffthreadVideo src={staticFile("assets/battle.mp4")} muted style={{ width: 1680, display: "block" }} />
          </div>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: titleOp, zIndex: 20 }}>
        <GlowText text="A real round, on-chain" fontSize={58} color={COLORS.white} fontWeight={800} />
      </AbsoluteFill>

      <div style={{
        position: "absolute", top: 54, right: 70, zIndex: 30, opacity: tagOp,
        fontFamily: INTER, fontSize: 19, fontWeight: 700, letterSpacing: 1,
        color: COLORS.accentBright,
        background: `${COLORS.bg}cc`, border: `1px solid ${COLORS.accent}55`,
        padding: "8px 16px", borderRadius: 8, backdropFilter: "blur(6px)",
      }}>
        ● LIVE · ROBINHOOD CHAIN TESTNET
      </div>
    </AbsoluteFill>
  );
};
