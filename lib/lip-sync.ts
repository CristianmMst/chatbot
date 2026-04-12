export type MouthCueValue = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";

export type MouthCue = {
  end: number;
  start: number;
  value: MouthCueValue;
};

export function isMouthCueValue(value: string): value is MouthCueValue {
  return ["A", "B", "C", "D", "E", "F", "G", "H", "X"].includes(value);
}

export function sanitizeMouthCues(value: unknown): MouthCue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { start?: unknown }).start !== "number" ||
      typeof (item as { end?: unknown }).end !== "number" ||
      typeof (item as { value?: unknown }).value !== "string"
    ) {
      return [];
    }

    const mouthCue = item as { end: number; start: number; value: string };

    if (!isMouthCueValue(mouthCue.value)) {
      return [];
    }

    return [{
      end: mouthCue.end,
      start: mouthCue.start,
      value: mouthCue.value,
    }];
  });
}
