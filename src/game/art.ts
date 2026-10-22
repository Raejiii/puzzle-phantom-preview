// Layouts in design pixels: the camera zooms the design space to fit the screen. Landscape follows
// the original's 16:9-ish scenes on a 1440x1024 page; portrait is for phones held upright.

export type Rect = { x: number; y: number; width: number; height: number };

export type Layout = {
  width: number;
  height: number;
  /** Narration and dialogue panel along the bottom. */
  caption: Rect;
  /** Characters stand on this line, this tall, at these x positions for one to three people. */
  cast: { bottom: number; height: number; slots: number[][] };
  /** The Phantom's notes: parchment centre and height. */
  note: { x: number; y: number; height: number };
  /** Location titles. */
  place: { x: number; y: number; size: number };
  /** Area the puzzles use, under the instruction line. */
  board: Rect;
  instruction: { y: number; size: number };
};

export const LANDSCAPE: Layout = {
  width: 1440,
  height: 1024,
  caption: { x: 140, y: 790, width: 1160, height: 200 },
  cast: { bottom: 820, height: 600, slots: [[720], [380, 1060], [300, 720, 1140]] },
  note: { x: 720, y: 560, height: 800 },
  place: { x: 720, y: 540, size: 76 },
  board: { x: 120, y: 250, width: 1200, height: 740 },
  instruction: { y: 200, size: 40 },
};

export const PORTRAIT: Layout = {
  width: 750,
  height: 1334,
  caption: { x: 25, y: 1020, width: 700, height: 290 },
  cast: { bottom: 1050, height: 560, slots: [[375], [200, 550], [150, 375, 600]] },
  note: { x: 375, y: 690, height: 960 },
  place: { x: 375, y: 640, size: 58 },
  board: { x: 25, y: 300, width: 700, height: 1010 },
  instruction: { y: 240, size: 36 },
};

// The detective-board look: midnight navy panels with a gold frame, ink on parchment
export const NAVY = 0x1b2150;
export const NAVY_DARK = 0x10142f;
export const GOLD = 0xf2c14e;
export const GOLD_TEXT = "#f2c14e";
export const PAPER = 0xf6ecd2;
export const INK = "#3b2a1a";
export const INK_FILL = 0x3b2a1a;
export const GREEN = 0x3fbf6f;
export const RED = 0xe85a4f;

/** The original's pictures are 1536 wide; note text areas in the config are in those pixels. */
export const SOURCE_WIDTH = 1536;

/** Dots on the planet door picture (planet-door-closeup.webp, 560x585), top to bottom. */
export const DOOR_DOTS = { x: 280, ys: [81, 141, 213, 285, 345, 417, 477, 537], radius: 16, width: 560 };

export const BACKGROUNDS = [
  "house",
  "office",
  "library",
  "library-room",
  "clue-box",
  "geo-observatory",
  "geo-room",
  "bakery",
  "bakery-room",
  "planetarium",
  "planet-door",
  "space-room",
  "clock-tower",
  "tower-room",
  "epilogue-trial",
  "epilogue-club",
  "epilogue-riley",
  "gate",
  "kid-door",
  "detective-desk",
  "detective-desk-2",
  "living-room",
  "box-off",
  "box-unlocked",
  "recipe-card",
  "oven",
  "observatory-hall",
  "planet-door-open",
  "epilogue-trial-2",
];

export const CHARACTERS = ["detective", "kid", "baker", "phantom"];
/** Each character's blink, as the original loops it: eyes open, half shut, shut, half shut. */
export const BLINK_FRAMES = (key: string) => [key, `${key}-2`, `${key}-3`, `${key}-2`, key];

export const NOTES = [1, 2, 3, 4, 5, 6, 7].map((n) => `note-${n}`);

export const PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"].map(
  (name) => `planet-${name}`,
);

/** Every image the game loads from public/assets, as `<key>.webp`. */
export const RUNTIME_IMAGES = [
  ...BACKGROUNDS,
  ...CHARACTERS.flatMap((key) => [key, `${key}-2`, `${key}-3`]),
  ...NOTES,
  ...PLANETS,
  "compass",
  "planet-door-closeup",
  "planet-box",
];
