// The original's scenes as it laid them out in Godot: every picture and character with its centre
// and scale in its 640x360 view. Drawing the view as the original framed it keeps the rooms,
// and everyone standing on their floors, where the original put them.

import type Phaser from "phaser";
import type { Speaker } from "./types";

/** A picture's centre and scale in the original's view, and its width in the original's pixels. */
export type Placement = { x: number; y: number; scale: number; scaleY?: number; width: number };

export type CastMember = { speaker: Speaker; x: number; y: number; scale: number; flip?: boolean };

export type Staging = {
  picture: Placement;
  /** Everyone in the room, in the original's drawing order (back to front). */
  cast?: CastMember[];
  /** The bakery counter, drawn in front of the baker. */
  counter?: Placement;
  /** Outdoor scenes: the sky and drifting clouds show through the picture's transparent sky. */
  sky?: boolean;
};

const ROOM: Placement = { x: 322, y: 208, scale: 0.42, width: 1536 };
const DETECTIVE: CastMember = { speaker: "detective", x: 478, y: 223, scale: 0.2 };
const KID: CastMember = { speaker: "kid", x: 189, y: 255, scale: 0.18, flip: true };

export const STAGING: Record<string, Staging> = {
  "living-room": { picture: ROOM, cast: [DETECTIVE, KID] },
  office: {
    picture: ROOM,
    cast: [
      { speaker: "detective", x: 195, y: 227, scale: 0.2, flip: true },
      { speaker: "kid", x: 444, y: 257, scale: 0.18 },
    ],
  },
  "library-room": { picture: ROOM, cast: [DETECTIVE, KID] },
  "geo-room": { picture: ROOM, cast: [DETECTIVE, KID] },
  "observatory-hall": { picture: ROOM, cast: [DETECTIVE, KID] },
  "space-room": { picture: { x: 325, y: 163, scale: 0.45, width: 1536 }, cast: [DETECTIVE, KID] },
  "bakery-room": {
    picture: { x: 323, y: 178, scale: 0.51, width: 1264 },
    cast: [
      { speaker: "baker", x: 313, y: 167, scale: 0.22, flip: true },
      { speaker: "detective", x: 420, y: 236, scale: 0.2 },
      { speaker: "kid", x: 178, y: 260, scale: 0.18, flip: true },
    ],
    // counter.png sat at (306, 222) at 0.25; counter.webp is its drawn part, 1223 wide, whose centre is
    // 3.5 right of and 23.5 above the full picture's
    counter: { x: 306 + 3.5 * 0.25, y: 222 - 23.5 * 0.25, scale: 0.25, width: 1223 },
  },
  "tower-room": {
    picture: { x: 321, y: 210, scale: 0.43, width: 1536 },
    cast: [
      { speaker: "phantom", x: 157, y: 222, scale: 0.22, flip: true },
      { speaker: "detective", x: 364, y: 235, scale: 0.2 },
      { speaker: "kid", x: 541, y: 270, scale: 0.18 },
    ],
  },
  house: { picture: { x: 321, y: 151, scale: 0.43, width: 1536 }, sky: true },
  library: { picture: { x: 321, y: 169, scale: 0.43, width: 1536 }, sky: true },
  bakery: { picture: { x: 325, y: 195, scale: 0.53, width: 1264 }, sky: true },
  planetarium: { picture: { x: 325, y: 181, scale: 0.43, width: 1536 }, sky: true },
  "clock-tower": { picture: { x: 320, y: 195, scale: 0.41796875, scaleY: 0.391, width: 1536 }, sky: true },
};

/** Character frames keep the original's whole 1024x1536 frame, centred where Godot centred it. */
export const FRAME_WIDTH = 1024;

/**
 * Each character loops its three frames as 1, 2, 3, 2, 1 nonstop, at 5 frames a second; the
 * detective's speed scale of 0.8 makes his 4.
 */
export const IDLE_FRAMES = (key: string) => [key, `${key}-2`, `${key}-3`, `${key}-2`, key];
export const IDLE_FPS: Record<Speaker, number> = { detective: 4, kid: 5, baker: 5, phantom: 5 };

/** The outdoor sky: sky3.png turned upside down and tinted pink. */
export const SKY_TINT = 0xf9caf9;

/** clouds_1.png at (288, 174), scale 0.35, repeating every 672 and drifting right 5 a second. */
export const CLOUDS = { x: 288, y: 174, scale: 0.35, width: 1920, speed: 5 };

/** The original's view: 640x360, which Godot stretched to fill the window. */
export const VIEW = { width: 640, height: 360 };

/** Maps the original's view onto the screen: its centre at `centre`, `k` design pixels per pixel. */
export function stageFrame(centre: { x: number; y: number }, k: number) {
  return {
    k,
    x: (x: number) => centre.x + (x - VIEW.width / 2) * k,
    y: (y: number) => centre.y + (y - VIEW.height / 2) * k,
  };
}

export type StageFrame = ReturnType<typeof stageFrame>;

/** Puts a picture where the original placed it; `image` is its WebP, a scaled copy of the original. */
export function placeOnStage(image: Phaser.GameObjects.Image, placement: Placement, frame: StageFrame) {
  const perPixel = (placement.width * frame.k) / image.width;
  return image
    .setPosition(frame.x(placement.x), frame.y(placement.y))
    .setScale(placement.scale * perPixel, (placement.scaleY ?? placement.scale) * perPixel);
}
