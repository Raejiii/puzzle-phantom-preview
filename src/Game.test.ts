import { readFileSync, readdirSync, statSync } from "fs";
import { describe, expect, it } from "vitest";
import { RUNTIME_IMAGES } from "./game/art";
import {
  audioFor,
  castFor,
  clockAngles,
  minutesToMidnight,
  parseClock,
  getLevelConfigByIndex,
  getLevelIndex,
  imagesFor,
  isAnswerPath,
  isLastLevel,
  isValidLevel,
  mapAnswer,
  missQuestionId,
  pathChange,
  puzzleTotal,
  spells,
  stepQuestionId,
  swapLetters,
  walk,
} from "./game/logic";
import type { PhantomConfig, PhantomLevel, Puzzle, StoryBeat } from "./game/types";

const config = JSON.parse(
  readFileSync(new URL("../public/config.json", import.meta.url), "utf8"),
) as PhantomConfig;
const assetDir = new URL("../public/assets/", import.meta.url);
const audioDir = new URL("../public/assets/audio/", import.meta.url);
const levels = config.levels ?? [];

// Mirrors the first-attempt guard in @ekgamer/game-shell 2.0.32 scoring.submitAnswer
function createShellScoring() {
  const wrongIds = new Set<string | number>();
  const scoredIds = new Set<string | number>();
  let points = 0;
  return {
    submit(isCorrect: boolean, id: string | number) {
      if (!isCorrect) {
        wrongIds.add(id);
        return;
      }
      if (wrongIds.has(id) || scoredIds.has(id)) return;
      points += 1;
      scoredIds.add(id);
    },
    get points() {
      return points;
    },
  };
}

const level = (n: number) => levels[n] as PhantomLevel;

describe("The Puzzle Phantom of Willowbrook", () => {
  it("detects the final level using the shell zero-based level index", () => {
    expect(getLevelIndex(undefined)).toBe(0);
    expect(isLastLevel(5, 7)).toBe(false);
    expect(isLastLevel(6, 7)).toBe(true);
    expect(getLevelConfigByIndex(config, 0)?.id).toBe("lvl-1");
    expect(getLevelConfigByIndex(config, levels.length)).toBeUndefined();
  });

  it("has one level per puzzle in the original, in the story's order", () => {
    expect(levels.map((l) => l.puzzle.kind)).toEqual(["unscramble", "unscramble", "unscramble", "quiz", "map", "quiz", "order"]);
    for (const l of levels) expect(isValidLevel(l), String(l.id)).toBe(true);
  });

  it("only uses images that ship in public/assets", () => {
    for (const l of levels) {
      for (const key of imagesFor(l)) expect(RUNTIME_IMAGES, `${l.id} uses ${key}`).toContain(key);
    }
  });

  it("unscrambles the three words from the Phantom's note", () => {
    const words = levels.slice(0, 3).map((l) => l.puzzle as Extract<Puzzle, { kind: "unscramble" }>);
    expect(words.map((p) => p.word)).toEqual(["LEARN", "MIDNIGHT", "LIBRARY"]);
    // The note scrambles them as ALERN, DIMTHNIG and YRARLIB
    const note = level(0).intro.find((beat) => beat.style === "note")?.text ?? "";
    for (const p of words) expect(note).toContain(p.letters.join(""));
    // ALERN -> LAERN -> LEARN
    const once = swapLetters(words[0].letters, 0, 1);
    expect(spells(once, "LEARN")).toBe(false);
    expect(spells(swapLetters(once, 1, 2), "LEARN")).toBe(true);
  });

  it("walks the map directions from the Geo-Observatory to the Bakery", () => {
    const puzzle = level(4).puzzle as Extract<Puzzle, { kind: "map" }>;
    const answer = mapAnswer(puzzle);
    expect(answer?.place?.name).toBe("BAKER'S SHOP");
    expect(answer?.path).toHaveLength(8);
    expect(walk({ column: 0, row: 2 }, [{ direction: "N", blocks: 2 }])).toEqual([
      { column: 0, row: 2 },
      { column: 0, row: 1 },
      { column: 0, row: 0 },
    ]);
  });

  it("lets the path step back, keeps it to neighbouring blocks, and blocks lettered places off the route", () => {
    const puzzle = level(4).puzzle as Extract<Puzzle, { kind: "map" }>;
    const answer = mapAnswer(puzzle)!.path;
    const { places, columns, rows } = puzzle;
    const start = answer[0];
    const up = { column: 3, row: 1 };
    expect(pathChange([start], up, answer, places, columns, rows)).toBe("extend");
    expect(pathChange([start, up], start, answer, places, columns, rows)).toBe("backtrack");
    expect(pathChange([start], { column: 4, row: 1 }, answer, places, columns, rows)).toBe("ignore"); // diagonal
    expect(pathChange([start], { column: 3, row: 3 }, answer, places, columns, rows)).toBe("extend"); // wrong, but free
    // D sits two blocks south of G: not on the route, so the path can't enter it
    expect(pathChange([start, { column: 3, row: 3 }], { column: 3, row: 4 }, answer, places, columns, rows)).toBe("ignore");
    // B is the last block of the route, so it takes the path there
    expect(pathChange(answer.slice(0, -1), answer[answer.length - 1], answer, places, columns, rows)).toBe("extend");
    expect(isAnswerPath(answer, answer)).toBe(true);
  });

  it("asks the original quiz questions with the right answers", () => {
    const matter = level(3).puzzle as Extract<Puzzle, { kind: "quiz" }>;
    expect(matter.questions.map((q) => q.options[q.correct])).toEqual(["LIQUID", "GAS", "LIQUID", "The Sun"]);
    const bakery = level(5).puzzle as Extract<Puzzle, { kind: "quiz" }>;
    expect(bakery.questions.map((q) => q.options[q.correct])).toEqual([
      "(b) 3 times",
      "(b) 3 batches",
      "(c) 24 cookies",
      "(b) 3 eggs",
      "(b) 3:15 PM",
    ]);
    for (const q of [...matter.questions, ...bakery.questions]) {
      expect(q.hint).toBeTruthy();
      expect(q.audio && q.correctAudio && q.wrongAudio, q.text).toBeTruthy();
    }
  });

  it("orders the planets from the Sun outwards", () => {
    const puzzle = level(6).puzzle as Extract<Puzzle, { kind: "order" }>;
    expect(puzzle.labels).toEqual(["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]);
    expect(puzzleTotal(puzzle)).toBe(8);
  });

  it("puts everyone who talks in a scene on screen: the detective, Sam, then whoever they meet", () => {
    const beats: StoryBeat[] = [
      { background: "bakery", style: "place", text: "Bakery" },
      { background: "bakery-room", speaker: "baker", text: "Hello" },
      { background: "bakery-room", speaker: "detective", text: "Hi" },
      { background: "bakery-room", speaker: "kid", text: "Hey" },
      { background: "bakery-room", text: "Narration" },
    ];
    expect(castFor(beats, 1)).toEqual(["detective", "kid", "baker"]);
    expect(castFor(beats, 0)).toEqual([]);
    expect(castFor(beats, 4)).toEqual([]);
  });

  it("ends the story with the Phantom unmasked", () => {
    const outro = level(6).outro;
    expect(outro.some((beat) => beat.speaker === "phantom")).toBe(true);
    expect(outro[outro.length - 1].background).toBe("epilogue-riley");
  });

  it("rejects levels that can't be played", () => {
    const base = level(0);
    expect(isValidLevel({ ...base, puzzle: { kind: "unscramble", word: "LEARN", letters: ["L", "E", "A", "R", "N"] } })).toBe(false);
    expect(isValidLevel({ ...base, puzzle: { kind: "unscramble", word: "LEARN", letters: ["A", "L", "E", "R"] } })).toBe(false);
    expect(isValidLevel({ ...base, puzzle: { kind: "quiz", questions: [{ text: "?", options: ["a", "b"], correct: 2 }] } })).toBe(false);
    expect(isValidLevel({ ...base, intro: [{ background: "", text: "x" }] })).toBe(false);
    expect(isValidLevel(undefined)).toBe(false);
  });

  it("still scores a step solved after a wrong answer", () => {
    const shell = createShellScoring();
    shell.submit(false, missQuestionId(1));
    shell.submit(true, stepQuestionId(0));
    shell.submit(true, stepQuestionId(0));
    shell.submit(true, stepQuestionId(1));
    expect(shell.points).toBe(2);
  });

  it("voices every line of the story, with the typewriter sound on place titles", () => {
    for (const l of levels) {
      for (const beat of [...l.intro, ...l.outro]) {
        expect(beat.audio, beat.text).toBeTruthy();
        expect(beat.audio === "typing", beat.text).toBe(beat.style === "place");
      }
      expect(l.music, String(l.id)).toBeTruthy();
    }
    // The three word puzzles follow each other with no story in between, as in the original
    expect(level(1).intro).toEqual([]);
    expect(level(2).intro).toEqual([]);
  });

  it("ships exactly the sounds the levels play, plus the silence that stands in for the shell's music", () => {
    const files = readdirSync(audioDir);
    const expected = new Set(levels.flatMap((l) => audioFor(l)));
    expected.add("silence");
    expect(files.sort()).toEqual([...expected].map((key) => `${key}.mp3`).sort());
    expect(config.audio?.background?.src).toBe("assets/audio/silence.mp3");
  });

  it("ships exactly the runtime images and start background, with no spaces in their names", () => {
    const files = readdirSync(assetDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const expected = [...RUNTIME_IMAGES, "start-background"].map((key) => `${key}.webp`);
    expect(files.sort()).toEqual(expected.sort());
    expect(config.background).toBe("assets/start-background.webp");
    for (const file of files) expect(file).not.toMatch(/\s/);
  });

  it("shows each note on the original's picture of it, and has a how-to clip for every puzzle", () => {
    for (const l of levels) {
      for (const beat of [...l.intro, ...l.outro].filter((b) => b.style === "note")) {
        expect(RUNTIME_IMAGES, beat.text.slice(0, 30)).toContain(beat.noteImage);
        expect(beat.noteArea?.width, beat.text.slice(0, 30)).toBeGreaterThan(0);
      }
      expect(l.howToVideo, String(l.id)).toMatch(/^assets\/video\/how-to-\d\.mp4$/);
      expect(statSync(new URL(`../public/${l.howToVideo}`, import.meta.url)).size).toBeGreaterThan(0);
    }
    expect(statSync(new URL(`../public/${config.howToVideoUrl}`, import.meta.url)).size).toBeGreaterThan(0);
  });

  it("runs the clock toward midnight, one clue per level for the case board", () => {
    const times = levels.map((l) => parseClock(l.clock ?? ""));
    for (const time of times) expect(time).not.toBeNull();
    for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    expect(minutesToMidnight(parseClock("11:30")!)).toBe(30);
    expect(clockAngles(parseClock("9:15")!)).toEqual({ hour: 277.5, minute: 90 });
    expect(parseClock("13:00")).toBeNull();
    expect(new Set(levels.map((l) => l.clue)).size).toBe(levels.length);
  });

  // The voice-over can't fit the usual 1 MB, so audio and video have a budget of their own
  it("keeps images and config inside 1 MB, and audio and video inside 7 MB", () => {
    const files = readdirSync(new URL("../public/", import.meta.url), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({ path: `${entry.parentPath}/${entry.name}`, size: statSync(`${entry.parentPath}/${entry.name}`).size }));
    const isMedia = (path: string) => path.includes("/assets/audio/") || path.includes("/assets/video/");
    const sum = (list: typeof files) => list.reduce((total, file) => total + file.size, 0);
    expect(sum(files.filter((file) => !isMedia(file.path)))).toBeLessThanOrEqual(1024 * 1024);
    expect(sum(files.filter((file) => isMedia(file.path)))).toBeLessThanOrEqual(7 * 1024 * 1024);
  });
});
