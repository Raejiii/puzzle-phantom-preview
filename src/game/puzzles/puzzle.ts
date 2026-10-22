import type { Rect } from "../art";
import type { LevelAudio } from "../audio";

export type PuzzleHooks = {
  /** A step solved: scores its point once. */
  correct(step: string | number): void;
  /** A wrong answer: lowers accuracy. */
  wrong(): void;
  /** The whole puzzle is solved and its celebration has played. */
  done(): void;
  audio: LevelAudio;
};

export interface PuzzleView {
  /** Lays everything out in the board area; called again when the screen turns. */
  place(board: Rect, portrait: boolean): void;
  /**
   * Hints for what the player is looking at now, and a key so each question keeps its own count.
   * `numbered` cards read "HINT 1", "HINT 2"…, as on the original's word puzzles.
   */
  hints(): { key: string; list: string[]; numbered?: boolean };
  destroy(): void;
}
