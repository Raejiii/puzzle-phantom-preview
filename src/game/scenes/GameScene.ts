import Phaser from "phaser";
import { GOLD, GOLD_TEXT, LANDSCAPE, NAVY, NAVY_DARK, PORTRAIT, type Layout, type Rect } from "../art";
import { LevelAudio, audioUrl } from "../audio";
import { CaseBoard, MidnightClock } from "../CaseOverlays";
import {
  audioFor,
  getLevelConfigByIndex,
  isLastLevel,
  isValidLevel,
  missQuestionId,
  puzzleTotal,
  stepQuestionId,
} from "../logic";
import { getPixelRatio } from "../pixelRatio";
import { addBadge, loadAutoAdvance, loadBadges, saveAutoAdvance } from "../prefs";
import { MapPuzzle } from "../puzzles/MapPuzzle";
import { OrderPuzzle } from "../puzzles/OrderPuzzle";
import type { PuzzleHooks, PuzzleView } from "../puzzles/puzzle";
import { QuizPuzzle } from "../puzzles/QuizPuzzle";
import { UnscramblePuzzle } from "../puzzles/UnscramblePuzzle";
import { StoryView } from "../StoryView";
import type { PhantomLevel, PhantomRuntime } from "../types";
import { STORY_FONT, UI_FONT, drawPanel, fitText, makeButton, type Button } from "../ui";

// Keep the game's own buttons and text below the shell's title and level/timer strip, in CSS pixels
const SHELL_HEADER_CSS = 112;
const FADE_MS = 350;

const DEMO_LEVEL: PhantomLevel = {
  instruction: "Unscramble the word",
  background: "office",
  intro: [],
  puzzle: { kind: "unscramble", word: "CLUE", letters: ["U", "L", "C", "E"] },
  outro: [],
};

type Phase = "intro" | "puzzle" | "outro" | "done";

export class GameScene extends Phaser.Scene {
  private runtime!: PhantomRuntime;
  private levelData: PhantomLevel = DEMO_LEVEL;
  private layout: Layout = LANDSCAPE;
  private phase: Phase = "intro";
  private solved = 0;
  private total = 1;
  private missCount = 0;
  /** Hints shown so far, per puzzle part (each quiz question counts its own). */
  private hintsSeen = new Map<string, number>();
  /** Any hint opened this level; solving without one earns the detective badge. */
  private usedHint = false;
  private autoAdvance = false;

  private background!: Phaser.GameObjects.Image;
  private backgroundNext!: Phaser.GameObjects.Image;
  private backgroundKey = "";
  private dim!: Phaser.GameObjects.Rectangle;
  /** Dark fade behind the shell's white title and timer, so they read on bright rooms too. */
  private headerShade!: Phaser.GameObjects.Graphics;
  private story!: StoryView;
  private puzzle: PuzzleView | null = null;
  private instruction!: Phaser.GameObjects.Text;
  private skipButton!: Button;
  private autoButton!: Button;
  private hintButton!: Button;
  private howToButton!: Button;
  /** The puzzle's how-to clip, played over the game. */
  private howToOverlay: HTMLDivElement | null = null;
  /** The midnight clock or the case board while one is up. */
  private overlay: { place(view: Rect): void } | null = null;
  private hintPopup!: Phaser.GameObjects.Container;
  private hintPanel!: Phaser.GameObjects.Graphics;
  private hintTitle!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private hintClose!: Button;
  private hintBlocker!: Phaser.GameObjects.Rectangle;
  /** "YOU'RE OUT OF HINTS", shown for a moment once every hint has been seen. */
  private hintEnd!: Phaser.GameObjects.Text;
  private audio!: LevelAudio;

  constructor() {
    super("GameScene");
  }

  init() {
    this.runtime = this.registry.get("phantomRuntime") as PhantomRuntime;
    const level = this.runtime?.levelConfig ?? getLevelConfigByIndex(this.runtime?.config, this.runtime?.level);
    this.levelData = isValidLevel(level) ? level : DEMO_LEVEL;
    this.phase = "intro";
    this.solved = 0;
    this.total = puzzleTotal(this.levelData.puzzle);
    this.missCount = 0;
    this.hintsSeen = new Map();
    this.usedHint = false;
    this.overlay = null;
    this.puzzle = null;
    this.backgroundKey = "";
  }

  /** Loads the level's voice-over, music and sounds; ones from earlier levels are already in the cache. */
  preload() {
    for (const key of audioFor(this.levelData)) {
      if (!this.cache.audio.exists(key)) this.load.audio(key, audioUrl(key));
    }
  }

  create() {
    this.audio = new LevelAudio(this);
    this.events.once("shutdown", () => {
      this.removeHowTo();
      this.audio.stopAll();
      this.scale.off("resize", this.handleResize, this);
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.puzzle?.destroy();
      this.puzzle = null;
    });
    // A press only becomes a drag once the finger moves about 12 CSS pixels. The canvas runs at
    // device pixels, so on a phone a fixed 10 was a 3 px wobble and swallowed ordinary taps.
    this.input.dragDistanceThreshold = 12 * getPixelRatio();

    this.layout = this.pickLayout();
    this.background = this.add.image(0, 0, this.levelData.background).setDepth(-10);
    this.backgroundNext = this.add.image(0, 0, this.levelData.background).setDepth(-9).setAlpha(0);
    this.dim = this.add.rectangle(0, 0, 10, 10, NAVY_DARK, 0.5).setDepth(-5).setAlpha(0);
    this.headerShade = this.add.graphics().setDepth(29);
    this.story = new StoryView(this, this.audio, (key) => this.setBackground(key));

    this.instruction = this.add
      .text(0, 0, this.levelData.instruction, {
        fontFamily: STORY_FONT,
        fontSize: "40px",
        color: "#ffffff",
        align: "center",
        stroke: "#10142f",
        strokeThickness: 8,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);
    this.hintEnd = this.add
      .text(0, 0, "YOU'RE OUT OF HINTS", {
        fontFamily: UI_FONT,
        fontSize: "40px",
        fontStyle: "700",
        color: "#ffffff",
        stroke: "#10142f",
        strokeThickness: 8,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);

    this.skipButton = makeButton(this, "Skip story ▸▸", () => this.story.skip(), { fill: NAVY });
    this.skipButton.container.setDepth(30);
    this.autoAdvance = loadAutoAdvance();
    this.autoButton = makeButton(this, "", () => this.toggleAuto(), { fill: NAVY });
    this.autoButton.container.setDepth(30);
    this.story.setAutoAdvance(this.autoAdvance);
    this.hintButton = makeButton(this, "💡 Hint", () => this.showHint(), { fill: 0x7b3fa0 });
    this.hintButton.container.setDepth(30).setVisible(false);
    this.howToButton = makeButton(this, "▶ How to", () => this.openHowTo(), { fill: 0x1f8a4c });
    this.howToButton.container.setDepth(30).setVisible(false);
    this.setStoryButtons(false);
    this.createHintPopup();

    this.runtime?.gameApi?.reportScore(0, this.total);
    this.scale.on("resize", this.handleResize, this);
    this.placeEverything();
    this.startIntro();
  }

  // ---------- flow ----------

  private startIntro() {
    this.phase = "intro";
    this.runtime?.gameApi?.freezeTimer?.();
    const begin = () => {
      this.setStoryButtons(this.levelData.intro.length > 0);
      this.story.play(this.levelData.intro, () => this.startPuzzle());
    };
    // The race to midnight: the clock moves on from where the last level left it
    if (!this.levelData.clock) {
      begin();
      return;
    }
    const previous = getLevelConfigByIndex(this.runtime?.config, (this.runtime?.level ?? 0) - 1);
    const from = (this.runtime?.level ?? 0) > 0 ? previous?.clock : undefined;
    this.overlay = new MidnightClock(this, from, this.levelData.clock, () => {
      this.overlay = null;
      begin();
    });
    this.placeEverything();
  }

  /** Skip and the auto-advance switch, shown while the story plays. */
  private setStoryButtons(visible: boolean) {
    this.skipButton.container.setVisible(visible);
    this.autoButton.container.setVisible(visible);
    this.autoButton.label.setText(this.autoAdvance ? "Auto ▶ On" : "Auto ▶ Off");
    this.autoButton.setColors(this.autoAdvance ? 0x1f8a4c : NAVY);
  }

  private toggleAuto() {
    this.autoAdvance = !this.autoAdvance;
    saveAutoAdvance(this.autoAdvance);
    this.story.setAutoAdvance(this.autoAdvance);
    this.setStoryButtons(true);
  }

  private startPuzzle() {
    this.phase = "puzzle";
    this.setStoryButtons(false);
    this.setBackground(this.levelData.background);
    this.tweens.add({ targets: this.dim, alpha: 1, duration: FADE_MS });
    this.instruction.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.instruction, alpha: 1, duration: FADE_MS });
    this.hintButton.container.setVisible(true);
    this.howToButton.container.setVisible(!!this.levelData.howToVideo);

    const hooks: PuzzleHooks = {
      correct: (step) => this.scoreStep(step),
      wrong: () => this.miss(),
      done: () => this.puzzleSolved(),
      audio: this.audio,
    };
    const { puzzle } = this.levelData;
    switch (puzzle.kind) {
      case "unscramble":
        this.puzzle = new UnscramblePuzzle(this, puzzle, hooks);
        break;
      case "quiz":
        this.puzzle = new QuizPuzzle(this, puzzle, hooks);
        break;
      case "map":
        this.puzzle = new MapPuzzle(this, puzzle, hooks);
        break;
      case "order":
        this.puzzle = new OrderPuzzle(this, puzzle, hooks);
        break;
    }
    this.placeEverything();
    this.audio.playMusic(this.levelData.music);
    this.runtime?.gameApi?.unfreezeTimer?.();
  }

  private scoreStep(step: string | number) {
    this.solved = Math.min(this.total, this.solved + 1);
    this.runtime?.gameApi?.scoring?.submitAnswer(true, stepQuestionId(step));
    this.runtime?.gameApi?.reportScore(this.solved, this.total);
  }

  private miss() {
    this.missCount += 1;
    this.runtime?.gameApi?.scoring?.submitAnswer(false, missQuestionId(this.missCount));
  }

  private puzzleSolved() {
    this.runtime?.gameApi?.freezeTimer?.();
    this.closeHint();
    this.removeHowTo();
    this.hintButton.container.setVisible(false);
    this.howToButton.container.setVisible(false);
    this.instruction.setVisible(false);
    if (!this.usedHint) addBadge(this.levelId());
    this.puzzle?.destroy();
    this.puzzle = null;
    this.audio.stopMusic();
    this.tweens.add({ targets: this.dim, alpha: 0, duration: FADE_MS });
    this.runtime?.gameApi?.playConfetti?.();
    this.phase = "outro";
    this.setStoryButtons(this.levelData.outro.length > 0);
    this.story.play(this.levelData.outro, () => this.finish());
  }

  private levelId(index = this.runtime?.level ?? 0) {
    const level = getLevelConfigByIndex(this.runtime?.config, index);
    return String(level?.id ?? `level-${index}`);
  }

  private finish() {
    this.phase = "done";
    this.setStoryButtons(false);
    const last = isLastLevel(this.runtime?.level, this.runtime?.totalLevels);
    const report = () => {
      this.overlay = null;
      if (!this.runtime?.gameApi) return;
      if (last) this.runtime.gameApi.reportGameWon();
      else this.runtime.gameApi.reportLevelComplete();
    };
    this.runtime?.gameApi?.playBigConfetti?.();
    // Pin this level's clue on the case board: earlier levels are solved, later ones still "?"
    const levels = this.runtime?.config?.levels ?? [];
    const current = this.runtime?.level ?? 0;
    if (!this.levelData.clue || levels.length === 0) {
      this.time.delayedCall(1200, report);
      return;
    }
    const badges = loadBadges();
    const entries = levels.map((level, i) => ({
      clue: level.clue ?? "",
      solved: i <= current,
      badge: i === current ? !this.usedHint : badges.has(this.levelId(i)),
    }));
    this.overlay = new CaseBoard(this, entries, current, report);
    this.placeEverything();
  }

  // ---------- how-to video ----------

  /** Plays the original's how-to clip for this puzzle over the game; the timer waits meanwhile. */
  private openHowTo() {
    const url = this.levelData.howToVideo;
    const parent = this.game.canvas?.parentElement;
    if (!url || !parent || this.phase !== "puzzle") return;
    this.removeHowTo();
    this.runtime?.gameApi?.freezeTimer?.();
    this.audio.pauseMusic();

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "5",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      padding: "16px",
      background: "rgba(16, 20, 47, 0.85)",
    });
    const video = document.createElement("video");
    video.src = url;
    video.autoplay = true;
    video.controls = true;
    video.playsInline = true;
    video.muted = this.sound.mute;
    Object.assign(video.style, {
      maxWidth: "min(92%, 960px)",
      maxHeight: "70%",
      borderRadius: "16px",
      border: "4px solid #f2c14e",
      background: "#000",
    });
    const close = document.createElement("button");
    close.textContent = "CLOSE";
    Object.assign(close.style, {
      font: "600 20px Fredoka, Arial, sans-serif",
      color: "#fff",
      background: "#2b3275",
      border: "3px solid #f2c14e",
      borderRadius: "999px",
      padding: "10px 32px",
      cursor: "pointer",
    });
    close.addEventListener("click", () => this.closeHowTo());
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) this.closeHowTo();
    });
    overlay.append(video, close);
    parent.appendChild(overlay);
    this.howToOverlay = overlay;
  }

  private closeHowTo() {
    if (!this.howToOverlay) return;
    this.removeHowTo();
    this.audio.resumeMusic();
    if (this.phase === "puzzle") this.runtime?.gameApi?.unfreezeTimer?.();
  }

  private removeHowTo() {
    this.howToOverlay?.querySelector("video")?.pause();
    this.howToOverlay?.remove();
    this.howToOverlay = null;
  }

  // ---------- background ----------

  /** Crossfades to another background image. */
  private setBackground(key: string) {
    if (key === this.backgroundKey || !this.textures.exists(key)) return;
    const first = this.backgroundKey === "";
    this.backgroundKey = key;
    if (first) {
      this.background.setTexture(key);
      this.fitBackground(this.background);
      return;
    }
    this.tweens.killTweensOf(this.backgroundNext);
    this.backgroundNext.setTexture(key).setAlpha(0);
    this.fitBackground(this.backgroundNext);
    this.tweens.add({
      targets: this.backgroundNext,
      alpha: 1,
      duration: FADE_MS,
      onComplete: () => {
        this.background.setTexture(key);
        this.fitBackground(this.background);
        this.backgroundNext.setAlpha(0);
      },
    });
  }

  private fitBackground(image: Phaser.GameObjects.Image) {
    const { width, height } = this.scale;
    const zoom = this.cameras.main.zoom;
    const cover = Math.max(width / image.width, height / image.height) / zoom;
    image.setPosition(this.layout.width / 2, this.layout.height / 2).setScale(cover);
  }

  // ---------- hints ----------

  private createHintPopup() {
    this.hintBlocker = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.55).setDepth(49).setVisible(false).setInteractive();
    this.hintBlocker.on("pointerdown", () => this.closeHint());
    this.hintPanel = this.add.graphics();
    this.hintTitle = this.add
      .text(0, 0, "HINT", { fontFamily: UI_FONT, fontSize: "44px", fontStyle: "700", color: GOLD_TEXT, resolution: 2 })
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 0, "", { fontFamily: UI_FONT, fontSize: "38px", fontStyle: "600", color: "#ffffff", align: "center", resolution: 2 })
      .setOrigin(0.5);
    this.hintClose = makeButton(this, "CLOSE", () => this.closeHint(), { fill: 0x2b3275 });
    this.hintPopup = this.add
      .container(0, 0, [this.hintPanel, this.hintTitle, this.hintText, this.hintClose.container])
      .setDepth(50)
      .setVisible(false);
  }

  private showHint() {
    if (!this.puzzle || this.phase !== "puzzle") return;
    const { key, list, numbered } = this.puzzle.hints();
    const seen = this.hintsSeen.get(key) ?? 0;
    // As in the original: a quiz question shows its one hint each time; the other puzzles go
    // through their hints in turn and then say they're out
    const single = list.length === 1;
    if (list.length === 0 || (!single && seen >= list.length)) {
      this.showHintEnd();
      return;
    }
    const index = single ? 0 : seen;
    this.hintsSeen.set(key, seen + 1);
    this.usedHint = true;
    this.hintTitle.setText(numbered ? `HINT ${index + 1}` : "HINT");
    this.hintText.setText(list[index]);
    this.hintBlocker.setVisible(true);
    this.hintPopup.setVisible(true).setScale(0.8).setAlpha(0);
    this.placeHint();
    this.tweens.add({ targets: this.hintPopup, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
  }

  private showHintEnd() {
    this.tweens.killTweensOf(this.hintEnd);
    this.hintEnd.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.hintEnd,
      alpha: 0,
      delay: 1000,
      duration: 500,
      onComplete: () => this.hintEnd.setVisible(false),
    });
  }

  private closeHint() {
    this.hintBlocker?.setVisible(false);
    this.hintPopup?.setVisible(false);
  }

  private placeHint() {
    const view = this.visibleRect();
    const width = Math.min(760, view.width - 60);
    const height = 420;
    drawPanel(this.hintPanel, width, height, { fill: 0x4a1f6e, border: GOLD });
    this.hintTitle.setPosition(0, -height / 2 + 56);
    this.hintText.setPosition(0, -10);
    fitText(this.hintText, width - 80, 200, 38, 20);
    this.hintClose.setSize(220, 72, 32);
    this.hintClose.container.setPosition(0, height / 2 - 66);
    this.hintPopup.setPosition(this.layout.width / 2, this.layout.height / 2);
    this.hintBlocker.setPosition(view.x + view.width / 2, view.y + view.height / 2).setSize(view.width * 2, view.height * 4);
    this.hintBlocker.input?.hitArea?.setTo?.(0, 0, view.width * 2, view.height * 4);
  }

  // ---------- layout ----------

  private pickLayout() {
    return this.scale.height > this.scale.width ? PORTRAIT : LANDSCAPE;
  }

  private handleResize() {
    const next = this.pickLayout();
    if (next !== this.layout) this.layout = next;
    this.placeEverything();
  }

  /** The design-space rectangle on screen, from just under the shell's header to the bottom. */
  private visibleRect(): Rect {
    const camera = this.cameras.main;
    const halfWidth = this.scale.width / 2 / camera.zoom;
    const halfHeight = this.scale.height / 2 / camera.zoom;
    const top = this.layout.height / 2 - halfHeight;
    const headerBottom = top + (SHELL_HEADER_CSS * getPixelRatio()) / camera.zoom;
    return {
      x: this.layout.width / 2 - halfWidth,
      y: headerBottom,
      width: halfWidth * 2,
      height: this.layout.height / 2 + halfHeight - headerBottom,
    };
  }

  private placeEverything() {
    const { width, height } = this.scale;
    const zoom = Math.min(width / this.layout.width, height / this.layout.height);
    this.cameras.main.setZoom(zoom).centerOn(this.layout.width / 2, this.layout.height / 2);
    this.fitBackground(this.background);
    this.fitBackground(this.backgroundNext);
    const view = this.visibleRect();
    this.dim.setPosition(view.x + view.width / 2, this.layout.height / 2).setSize(view.width * 2, this.layout.height * 4);
    const screenTop = this.layout.height / 2 - height / 2 / zoom;
    const shadeHeight = (view.y - screenTop) * 1.25;
    this.headerShade
      .clear()
      .fillGradientStyle(NAVY_DARK, NAVY_DARK, NAVY_DARK, NAVY_DARK, 0.7, 0.7, 0, 0)
      .fillRect(view.x, screenTop, view.width, shadeHeight);

    // Everything the game draws starts a little under the shell's header
    const shift = Math.max(0, view.y + 16 - (this.layout.instruction.y - this.layout.instruction.size));
    const portrait = this.layout === PORTRAIT;

    this.skipButton.setSize(portrait ? 250 : 240, 64, 26);
    this.skipButton.container.setPosition(
      Math.min(this.layout.width, view.x + view.width) - this.skipButton.width / 2 - 20,
      Math.max(view.y + 46, 70),
    );
    const right = Math.min(this.layout.width, view.x + view.width);
    const left = Math.max(0, view.x);
    this.autoButton.setSize(portrait ? 220 : 210, 64, 26);
    this.autoButton.container.setPosition(right - this.skipButton.width - this.autoButton.width / 2 - 36, this.skipButton.container.y);
    this.hintButton.setSize(170, portrait ? 60 : 70, 30);
    this.howToButton.setSize(portrait ? 170 : 190, portrait ? 60 : 70, 28);

    this.instruction.setPosition(this.layout.width / 2, this.layout.instruction.y + shift);
    const hintRoom = portrait ? 0 : 200;
    fitText(this.instruction, this.layout.width - 40 - hintRoom * 2, portrait ? 110 : 64, this.layout.instruction.size, 20);
    if (portrait) {
      // On a phone the hint button sits on the right of the instruction's line, which moves up a little
      this.instruction.setX(this.layout.width / 2 - 90);
      fitText(this.instruction, this.layout.width - 230, 110, this.layout.instruction.size, 20);
    }
    // Hint on the right of the instruction line and How to on the left; stacked on the right on a phone
    const lineY = this.layout.instruction.y + shift;
    this.hintButton.container.setPosition(right - this.hintButton.width / 2 - 20, portrait ? lineY - 34 : lineY);
    this.howToButton.container.setPosition(
      portrait ? right - this.howToButton.width / 2 - 20 : left + this.howToButton.width / 2 + 20,
      portrait ? lineY + 34 : lineY,
    );

    const board = this.layout.board;
    const boardRect: Rect = { ...board, y: board.y + shift, height: board.height - shift };
    this.puzzle?.place(boardRect, portrait);
    this.story.place(this.layout, view);
    this.hintEnd.setPosition(this.layout.width / 2, this.layout.board.y + this.layout.board.height - 40);
    fitText(this.hintEnd, view.width - 60, 80, 40, 20);
    if (this.hintPopup.visible) this.placeHint();
    this.overlay?.place(view);
  }
}
