import type { GameApi } from "@ekgamer/game-shell";

export type Speaker = "detective" | "kid" | "baker" | "phantom";

/**
 * One tap of the story. With a `speaker` it is a line of dialogue over the cast; without one it is
 * narration in the caption box. `style: "note"` shows the text on the Phantom's parchment and
 * `style: "place"` as a big location title.
 */
export type StoryBeat = {
  /** Image key in public/assets, e.g. "office". */
  background: string;
  text: string;
  speaker?: Speaker;
  style?: "note" | "place";
  /** Voice-over (or the typing sound on place titles): a key in public/assets/audio. */
  audio?: string;
  /** A sound that plays before the line, e.g. the box unlocking. */
  sound?: string;
  /** For a note: the original's picture of it, and where its text goes on that picture. */
  noteImage?: string;
  noteArea?: NoteArea;
};

/** A box on a 1536-wide original picture, turned by `rotation` radians about its top-left corner. */
export type NoteArea = { x: number; y: number; width: number; height: number; rotation?: number };

export type QuizQuestion = {
  text: string;
  options: string[];
  /** Index of the right option. */
  correct: number;
  hint?: string;
  /** Read-out of the question, and what plays after a right or wrong answer. */
  audio?: string;
  correctAudio?: string;
  wrongAudio?: string;
};

/** Sounds after a right or wrong move; one is picked at random, never the same twice in a row. */
type Feedback = { rightSounds?: string[]; wrongSounds?: string[] };

export type Direction = "N" | "E" | "S" | "W";

export type MapPlace = { letter: string; name: string; column: number; row: number };

export type Puzzle =
  | {
      kind: "unscramble";
      /** The answer, and its letters in the order they start on the board. */
      word: string;
      letters: string[];
      hints?: string[];
    }
  | { kind: "quiz"; title?: string; questions: QuizQuestion[] }
  | ({
      kind: "map";
      /** Heading over the map. */
      title?: string;
      columns: number;
      rows: number;
      places: MapPlace[];
      /** Letter of the place the walk starts from. */
      start: string;
      steps: { direction: Direction; blocks: number }[];
      /** The directions card as written; made from `steps` when left out. */
      directions?: string;
      /** Order of the places in the key; the order of `places` when left out. */
      legendOrder?: string[];
      hints?: string[];
    } & Feedback)
  | ({
      kind: "order";
      /** Image keys in the right order, e.g. "planet-mercury". */
      items: string[];
      /** Names shown under each item, in the same order. */
      labels: string[];
      hints?: string[];
    } & Feedback);

export type PhantomLevel = {
  id?: string | number;
  name?: string;
  level?: number;
  /** Shown above the puzzle, e.g. "Unscramble the Phantom's word". */
  instruction: string;
  /** Background behind the puzzle. */
  background: string;
  /** Music that loops while the puzzle is on. */
  music?: string;
  /** The original's how-to clip for this puzzle, e.g. "assets/video/how-to-1.mp4". */
  howToVideo?: string;
  /** Time on the midnight clock as the level starts, "h:mm" in the evening. */
  clock?: string;
  /** What the puzzle uncovers, pinned on the case board when it's solved. */
  clue?: string;
  intro: StoryBeat[];
  puzzle: Puzzle;
  outro: StoryBeat[];
};

export type PhantomConfig = {
  title?: string;
  instructions?: string;
  duration?: number;
  background?: string;
  howToVideoUrl?: string;
  passingScorePercent?: number;
  audio?: {
    instructions?: {
      src?: string;
    } | null;
    background?: {
      src?: string;
    } | null;
  };
  showAnswers?: boolean;
  showRestartButton?: boolean;
  customAssets?: unknown[];
  levels?: PhantomLevel[];
};

export type PhantomRuntime = {
  gameApi: GameApi;
  gameId: string;
  level: number;
  levelConfig?: PhantomLevel;
  config?: PhantomConfig;
  totalLevels: number;
};
