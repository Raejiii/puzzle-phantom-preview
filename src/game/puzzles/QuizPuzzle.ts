import Phaser from "phaser";
import { GREEN, NAVY, RED, type Rect } from "../art";
import type { Puzzle } from "../types";
import { STORY_FONT, UI_FONT, drawPanel, fitText, makeButton, type Button } from "../ui";
import type { PuzzleHooks, PuzzleView } from "./puzzle";

const TYPE_MS = 50;

/**
 * One question at a time, as in the original: the question types out while it is read aloud and
 * the options wait until it has. A right answer shows "Correct!" and moves on once its clip ends;
 * a wrong one shows "Try again!", then the question comes back.
 */
export class QuizPuzzle implements PuzzleView {
  private index = 0;
  private busy = false;
  private typing: Phaser.Time.TimerEvent | null = null;
  private shown = 0;
  private board: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private portrait = false;
  private panel: Phaser.GameObjects.Graphics;
  private question: Phaser.GameObjects.Text;
  private buttons: Button[] = [];

  constructor(
    private scene: Phaser.Scene,
    private puzzle: Extract<Puzzle, { kind: "quiz" }>,
    private hooks: PuzzleHooks,
  ) {
    this.panel = scene.add.graphics().setDepth(10);
    this.question = scene.add
      .text(0, 0, "", {
        fontFamily: STORY_FONT,
        fontSize: "40px",
        color: "#ffffff",
        align: "center",
        lineSpacing: 8,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.showQuestion(0);
  }

  private get current() {
    return this.puzzle.questions[this.index];
  }

  private get isTyping() {
    return this.shown < this.current.text.length;
  }

  private showQuestion(index: number) {
    this.index = index;
    this.buttons.forEach((button) => button.container.destroy());
    this.buttons = this.current.options.map((option, i) => makeButton(this.scene, option, () => this.choose(i), { font: UI_FONT }));
    this.buttons.forEach((button) => button.container.setDepth(12).setAlpha(0));
    this.scene.tweens.add({ targets: this.buttons.map((button) => button.container), alpha: 1, duration: 260 });
    this.busy = false;
    this.shown = 0;
    this.question.setText("");
    this.place(this.board, this.portrait);
    this.typing?.remove();
    this.typing = this.scene.time.addEvent({
      delay: TYPE_MS,
      loop: true,
      callback: () => {
        this.shown = Math.min(this.current.text.length, this.shown + 1);
        this.question.setText(this.current.text.slice(0, this.shown));
        if (!this.isTyping) {
          this.typing?.remove();
          this.typing = null;
        }
      },
    });
    this.hooks.audio.playVoice(this.current.audio);
  }

  /** Puts a line in place of the question, e.g. "Correct!". */
  private say(text: string) {
    this.typing?.remove();
    this.typing = null;
    this.shown = this.current.text.length;
    this.question.setText(text);
    this.place(this.board, this.portrait);
  }

  private choose(option: number) {
    if (this.busy || this.isTyping) return;
    this.busy = true;
    const button = this.buttons[option];
    this.buttons.forEach((other) => other.setEnabled(false));
    button.setEnabled(true);
    if (option === this.current.correct) {
      button.setColors(GREEN);
      this.say("Correct!");
      this.hooks.correct(this.index);
      this.hooks.audio.playVoice(this.current.correctAudio, () => {
        if (this.index + 1 < this.puzzle.questions.length) this.showQuestion(this.index + 1);
        else this.hooks.done();
      });
      return;
    }
    button.setColors(RED);
    this.say("Try again!");
    this.hooks.wrong();
    const x = button.container.x;
    this.scene.tweens.add({
      targets: button.container,
      x: x + 10,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => (button.container.x = x),
    });
    this.hooks.audio.playVoice(this.current.wrongAudio, () => {
      button.setColors(NAVY);
      this.buttons.forEach((other) => other.setEnabled(true));
      this.say(this.current.text);
      this.busy = false;
    });
  }

  place(board: Rect, portrait: boolean) {
    this.board = board;
    this.portrait = portrait;
    if (board.width === 0) return;
    const count = this.buttons.length;
    const cx = board.x + board.width / 2;
    // Options side by side in landscape (two rows of two for four), one column on a phone
    const columns = portrait ? 1 : count === 3 ? 3 : 2;
    const rows = Math.ceil(count / columns);
    const buttonHeight = portrait ? 104 : 110;
    const gap = 22;
    const optionsHeight = rows * buttonHeight + (rows - 1) * gap;
    const questionHeight = portrait ? 400 : 280;
    const panelHeight = Math.min(board.height, 50 + questionHeight + 40 + optionsHeight + 50);
    const top = board.y + Math.max(0, (board.height - panelHeight) / 2) * 0.4;
    drawPanel(this.panel, board.width, panelHeight, { fill: NAVY }).setPosition(cx, top + panelHeight / 2);

    // Sized for the whole question so it doesn't move while it types
    const typed = this.question.text;
    this.question.setFixedSize(0, 0).setText(this.current.text);
    fitText(this.question, board.width - 90, questionHeight, portrait ? 40 : 46, 22);
    const width = this.question.width;
    const height = this.question.height;
    this.question.setText(typed).setFixedSize(width, 0);
    this.question.setPosition(cx, top + 50 + (questionHeight - height) / 2);

    const optionsTop = top + 50 + questionHeight + 40;
    const buttonWidth = (board.width - 80 - (columns - 1) * gap) / columns;
    this.buttons.forEach((button, i) => {
      const column = i % columns;
      const row = Math.floor(i / columns);
      button.setSize(buttonWidth, buttonHeight, portrait ? 36 : 38);
      button.container.setPosition(
        board.x + 40 + buttonWidth / 2 + column * (buttonWidth + gap),
        optionsTop + buttonHeight / 2 + row * (buttonHeight + gap),
      );
    });
  }

  hints() {
    return { key: `question-${this.index}`, list: this.current.hint ? [this.current.hint] : [] };
  }

  destroy() {
    this.typing?.remove();
    this.buttons.forEach((button) => button.container.destroy());
    this.panel.destroy();
    this.question.destroy();
  }
}
