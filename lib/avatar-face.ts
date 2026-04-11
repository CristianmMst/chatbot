export type FacialControls = {
  smile: number;
  browsUp: number;
  browsDown: number;
  blink: number;
  jawOpen: number;
  frown: number;
};

export const defaultFacialControls: FacialControls = {
  smile: 0,
  browsUp: 0,
  browsDown: 0,
  blink: 0,
  jawOpen: 0,
  frown: 0,
};

export const facialControlLabels: Record<keyof FacialControls, string> = {
  smile: "Sonrisa",
  browsUp: "Cejas arriba",
  browsDown: "Cejas abajo",
  blink: "Parpado",
  jawOpen: "Boca abierta",
  frown: "Tristeza",
};

export const facialPresets: Array<{ label: string; controls: FacialControls }> = [
  {
    label: "Neutral",
    controls: defaultFacialControls,
  },
  {
    label: "Happy",
    controls: {
      smile: 0.9,
      browsUp: 0.25,
      browsDown: 0,
      blink: 0,
      jawOpen: 0.1,
      frown: 0,
    },
  },
  {
    label: "Sad",
    controls: {
      smile: 0,
      browsUp: 0,
      browsDown: 0.45,
      blink: 0.1,
      jawOpen: 0,
      frown: 0.75,
    },
  },
  {
    label: "Surprised",
    controls: {
      smile: 0,
      browsUp: 0.85,
      browsDown: 0,
      blink: 0,
      jawOpen: 0.65,
      frown: 0,
    },
  },
];

export const facialTargetMap: Record<keyof FacialControls, string[]> = {
  smile: ["mouthSmileLeft", "mouthSmileRight"],
  browsUp: ["browInnerUp", "browOuterUpLeft", "browOuterUpRight"],
  browsDown: ["browDownLeft", "browDownRight"],
  blink: ["eyeBlinkLeft", "eyeBlinkRight"],
  jawOpen: ["jawOpen"],
  frown: ["mouthFrownLeft", "mouthFrownRight"],
};

export const trackedFacialTargets = Array.from(
  new Set(Object.values(facialTargetMap).flat()),
);
