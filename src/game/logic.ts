import { STAGING, type CastMember } from "./stage";
import type { Direction, MapPlace, PhantomConfig, PhantomLevel, Puzzle, Speaker, StoryBeat } from "./types";

export function getLevelIndex(level?: number) {
  return Math.max(0, level ?? 0);
}

export function getLevelConfigByIndex(
  config: PhantomConfig | undefined,
  level?: number,
): PhantomLevel | undefined {
  return config?.levels?.[getLevelIndex(level)];
}

export function isLastLevel(level: number | undefined, totalLevels: number | undefined) {
  const safeTotalLevels = Math.max(0, totalLevels ?? 0);

  if (safeTotalLevels === 0) {
    return true;
  }

  return getLevelIndex(level) + 1 >= safeTotalLevels;
}

// ---------- story ----------

export const SPEAKER_NAMES: Record<Speaker, string> = {
  detective: "Detective Riley",
  kid: "Sam",
  baker: "The Baker",
  phantom: "Professor Weeb",
};

/**
 * Who stands on screen for a line of dialogue: everyone the original put in that room, where it
 * put them, for the whole of the conversation.
 */
export function castFor(beat: StoryBeat | undefined): CastMember[] {
  if (!beat?.speaker || beat.style) return [];
  return STAGING[beat.background]?.cast ?? [];
}

/** Every image a level's story and puzzle show, so tests can check they all ship. */
export function imagesFor(level: PhantomLevel) {
  const keys = new Set<string>([level.background]);
  for (const beat of [...level.intro, ...level.outro]) {
    keys.add(beat.background);
    if (beat.speaker) keys.add(beat.speaker);
  }
  if (level.puzzle.kind === "order") level.puzzle.items.forEach((item) => keys.add(item));
  if (level.puzzle.kind === "map") keys.add("compass");
  return [...keys];
}

/** Every sound a level plays, so the scene can load just those. */
export function audioFor(level: PhantomLevel) {
  const keys = new Set<string>();
  const add = (key?: string) => key && keys.add(key);
  add(level.music);
  for (const beat of [...level.intro, ...level.outro]) {
    add(beat.audio);
    add(beat.sound);
  }
  const { puzzle } = level;
  if (puzzle.kind === "quiz") {
    for (const q of puzzle.questions) [q.audio, q.correctAudio, q.wrongAudio].forEach(add);
  }
  if (puzzle.kind === "map" || puzzle.kind === "order") {
    [...(puzzle.rightSounds ?? []), ...(puzzle.wrongSounds ?? [])].forEach(add);
  }
  return [...keys];
}

/** A random pick from the list that isn't the one picked last time, like the original's sounds. */
export function pickOther<T>(list: T[], last: T | undefined, random = Math.random) {
  const choices = list.length > 1 ? list.filter((item) => item !== last) : list;
  return choices[Math.floor(random() * choices.length)];
}

// ---------- the race to midnight ----------

const MIDNIGHT = 12 * 60;

/** "8:40" (in the evening) as minutes after noon, or null if it doesn't read as a time. */
export function parseClock(text: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  return (hours % 12) * 60 + minutes;
}

export function minutesToMidnight(minutes: number) {
  return Math.max(0, MIDNIGHT - minutes);
}

/** Clock-hand angles in degrees clockwise from 12. */
export function clockAngles(minutes: number) {
  return { hour: ((minutes / 60) % 12) * 30, minute: (minutes % 60) * 6 };
}

// ---------- unscramble ----------

export function swapLetters<T>(letters: T[], a: number, b: number) {
  const next = [...letters];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function spells(letters: string[], word: string) {
  return letters.join("") === word;
}

const sameLetters = (a: string[], b: string[]) => [...a].sort().join("") === [...b].sort().join("");

// ---------- map ----------

export type Cell = { column: number; row: number };

const MOVES: Record<Direction, Cell> = {
  N: { column: 0, row: -1 },
  E: { column: 1, row: 0 },
  S: { column: 0, row: 1 },
  W: { column: -1, row: 0 },
};

export const sameCell = (a: Cell | undefined, b: Cell | undefined) =>
  !!a && !!b && a.column === b.column && a.row === b.row;

export function placeAt(places: MapPlace[], cell: Cell) {
  return places.find((place) => sameCell(place, cell));
}

/** The blocks walked by following the directions, starting on the start place itself. */
export function walk(start: Cell, steps: { direction: Direction; blocks: number }[]): Cell[] {
  const path = [start];
  let at = start;
  for (const { direction, blocks } of steps) {
    for (let i = 0; i < blocks; i += 1) {
      at = { column: at.column + MOVES[direction].column, row: at.row + MOVES[direction].row };
      path.push(at);
    }
  }
  return path;
}

export function mapAnswer(puzzle: Extract<Puzzle, { kind: "map" }>) {
  const start = puzzle.places.find((place) => place.letter === puzzle.start);
  if (!start) return null;
  const path = walk(start, puzzle.steps);
  const end = path[path.length - 1];
  return { path, place: placeAt(puzzle.places, end) };
}

export type PathChange = "extend" | "backtrack" | "ignore";

/**
 * What a touched block does to the path being drawn: the block before the end steps back, a
 * neighbouring free block extends it. Lettered places only take the path when they are the next
 * block of the answer, as in the original.
 */
export function pathChange(path: Cell[], cell: Cell, answer: Cell[], places: MapPlace[], columns: number, rows: number): PathChange {
  if (cell.column < 0 || cell.row < 0 || cell.column >= columns || cell.row >= rows) return "ignore";
  const end = path[path.length - 1];
  if (!end || sameCell(end, cell)) return "ignore";
  if (path.length >= 2 && sameCell(path[path.length - 2], cell)) return "backtrack";
  if (path.some((step) => sameCell(step, cell))) return "ignore";
  if (Math.abs(cell.column - end.column) + Math.abs(cell.row - end.row) !== 1) return "ignore";
  if (placeAt(places, cell) && !sameCell(answer[path.length], cell)) return "ignore";
  return "extend";
}

export function isAnswerPath(path: Cell[], answer: Cell[]) {
  return path.length === answer.length && path.every((cell, i) => sameCell(cell, answer[i]));
}

// ---------- checks ----------

function isValidPuzzle(puzzle: Puzzle | undefined) {
  if (!puzzle) return false;
  switch (puzzle.kind) {
    case "unscramble": {
      const word = puzzle.word?.toUpperCase();
      return (
        !!word &&
        word.length >= 3 &&
        word.length <= 9 &&
        Array.isArray(puzzle.letters) &&
        sameLetters(puzzle.letters, word.split("")) &&
        !spells(puzzle.letters, word)
      );
    }
    case "quiz":
      return (
        Array.isArray(puzzle.questions) &&
        puzzle.questions.length > 0 &&
        puzzle.questions.every(
          (q) =>
            !!q.text &&
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            q.options.length <= 4 &&
            Number.isInteger(q.correct) &&
            q.correct >= 0 &&
            q.correct < q.options.length,
        )
      );
    case "map": {
      const answer = mapAnswer(puzzle);
      if (!answer?.place || answer.place.letter === puzzle.start) return false;
      const inside = answer.path.every(
        (cell) => cell.column >= 0 && cell.row >= 0 && cell.column < puzzle.columns && cell.row < puzzle.rows,
      );
      const noRevisit = new Set(answer.path.map((cell) => `${cell.column},${cell.row}`)).size === answer.path.length;
      return inside && noRevisit;
    }
    case "order":
      return (
        Array.isArray(puzzle.items) &&
        puzzle.items.length >= 3 &&
        puzzle.items.length <= 8 &&
        puzzle.labels?.length === puzzle.items.length
      );
    default:
      return false;
  }
}

export function isValidLevel(level: PhantomLevel | undefined): level is PhantomLevel {
  if (!level || !level.background || !level.instruction) return false;
  if (!Array.isArray(level.intro) || !Array.isArray(level.outro)) return false;
  const beatsOk = [...level.intro, ...level.outro].every((beat) => !!beat?.background && !!beat.text);
  return beatsOk && isValidPuzzle(level.puzzle);
}

// ---------- scoring ----------

/** Points a level is worth: one per word, question, finished map or placed item. */
export function puzzleTotal(puzzle: Puzzle) {
  switch (puzzle.kind) {
    case "unscramble":
    case "map":
      return 1;
    case "quiz":
      return puzzle.questions.length;
    case "order":
      return puzzle.items.length;
  }
}

/** Question id for each scoring step, so it scores once per level. */
export const stepQuestionId = (step: number | string) => `step-${step}`;

/** Each wrong answer gets its own id, so it lowers accuracy without blocking a step's point. */
export const missQuestionId = (missNumber: number) => `miss-${missNumber}`;
