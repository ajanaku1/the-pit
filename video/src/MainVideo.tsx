import React from "react";
import { AbsoluteFill, Audio, staticFile, interpolate } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import type { TransitionPresentation, TransitionTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { COLORS, CROSSFADE, FPS, TOTAL_FRAMES, SCENE_DURATIONS, AUDIO_DURATIONS, AUDIO_FILES } from "./constants";
import { Subtitles } from "./Subtitles";
import { BrandPin } from "./components/BrandPin";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { HowItWorks } from "./scenes/HowItWorks";
import { Battle } from "./scenes/Battle";
import { Features } from "./scenes/Features";
import { Autonomous } from "./scenes/Autonomous";
import { Architecture } from "./scenes/Architecture";
import { Close } from "./scenes/Close";

const SceneAudio: React.FC<{ src: string; audioDuration: number }> = ({ src, audioDuration }) => (
  <Audio
    src={staticFile(src)}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, Math.round(FPS * 0.3)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const fadeOut = interpolate(f, [audioDuration - FPS, audioDuration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

const spring28 = springTiming({ config: { damping: 200 }, durationInFrames: CROSSFADE });
const lin = linearTiming({ durationInFrames: CROSSFADE });

const scenes = [
  { id: "hook", Component: Hook },
  { id: "problem", Component: Problem },
  { id: "howitworks", Component: HowItWorks },
  { id: "battle", Component: Battle },
  { id: "features", Component: Features },
  { id: "autonomous", Component: Autonomous },
  { id: "architecture", Component: Architecture },
  { id: "close", Component: Close },
] as const;

// One transition per gap (7). All run for CROSSFADE frames so the timeline math holds.
type Pres = TransitionPresentation<Record<string, unknown>>;
const p = (x: unknown) => x as Pres;
const TRANSITIONS: { presentation: Pres; timing: TransitionTiming }[] = [
  { presentation: p(slide({ direction: "from-right" })), timing: spring28 },   // hook -> problem
  { presentation: p(wipe({ direction: "from-left" })), timing: lin },          // problem -> howitworks
  { presentation: p(slide({ direction: "from-bottom" })), timing: spring28 },  // howitworks -> battle
  { presentation: p(fade()), timing: lin },                                    // battle -> features
  { presentation: p(wipe({ direction: "from-bottom-right" })), timing: lin },  // features -> autonomous
  { presentation: p(slide({ direction: "from-right" })), timing: spring28 },   // autonomous -> architecture
  { presentation: p(fade()), timing: lin },                                    // architecture -> close
];

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const id = scene.id as keyof typeof SCENE_DURATIONS;
          const elements: React.ReactNode[] = [
            <TransitionSeries.Sequence key={id} durationInFrames={SCENE_DURATIONS[id]}>
              <scene.Component />
              <SceneAudio src={AUDIO_FILES[id]} audioDuration={AUDIO_DURATIONS[id]} />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            const t = TRANSITIONS[i];
            elements.push(
              <TransitionSeries.Transition key={`t-${id}`} presentation={t.presentation} timing={t.timing} />,
            );
          }
          return elements;
        })}
      </TransitionSeries>
      <BrandPin totalFrames={TOTAL_FRAMES} />
      <Subtitles />
    </AbsoluteFill>
  );
};
