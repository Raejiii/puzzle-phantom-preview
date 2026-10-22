import Phaser from "phaser";
import { GOLD, GOLD_TEXT, GREEN, INK, INK_FILL, NAVY, PAPER, RED, type Rect } from "../art";
import { isAnswerPath, mapAnswer, pathChange, sameCell, type Cell } from "../logic";
import type { Direction, Puzzle } from "../types";
import { STORY_FONT, UI_FONT, drawPanel, fitText } from "../ui";
import type { PuzzleHooks, PuzzleView } from "./puzzle";

const DIRECTION_NAMES: Record<Direction, string> = { N: "NORTH", E: "EAST", S: "SOUTH", W: "WEST" };
const MAP_FILL = 0x9cc7e8;
const MAP_LINE = 0x2b3275;

type MapData = Extract<Puzzle, { kind: "map" }>;

/** The directions card from the steps, for maps that don't give it as written. */
function directionsFor(puzzle: MapData) {
  const steps = puzzle.steps.map(
    (step, i) => `${i + 1}. ${i === 0 ? "Go" : "Turn"} ${DIRECTION_NAMES[step.direction]} and go ${step.blocks} block${step.blocks === 1 ? "" : "s"}`,
  );
  return [`START at ${puzzle.start}`, ...steps, "Where are you now?"].join("\n");
}

/**
 * The town map from the Geo-Observatory: draw a path block by block from the start, following the
 * directions on the card. Drag along the blocks or tap them one at a time; pressing the start
 * begins again. A wrong path flashes red and clears, as in the original.
 */
export class MapPuzzle implements PuzzleView {
  private answer: Cell[];
  private start: Cell;
  private path: Cell[];
  private drawing = false;
  private solved = false;
  private busy = false;
  private grid = { left: 0, top: 0, cell: 80 };

  private mapPanel: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private gridLines: Phaser.GameObjects.Graphics;
  private pathLine: Phaser.GameObjects.Graphics;
  private startGlow: Phaser.GameObjects.Graphics;
  private letters: Phaser.GameObjects.Text[] = [];
  private compass: Phaser.GameObjects.Image;
  private card: Phaser.GameObjects.Graphics;
  private directions: Phaser.GameObjects.Text;
  private legend: Phaser.GameObjects.Text[] = [];
  /** The key's lines, split in two for the phone layout's two columns. */
  private legendParts: string[][] = [];
  private hitZone: Phaser.GameObjects.Zone;

  constructor(
    private scene: Phaser.Scene,
    private puzzle: MapData,
    private hooks: PuzzleHooks,
  ) {
    const answer = mapAnswer(puzzle);
    this.answer = answer?.path ?? [];
    this.start = this.answer[0] ?? { column: 0, row: 0 };
    this.path = [this.start];

    this.mapPanel = scene.add.graphics().setDepth(10);
    this.title = scene.add
      .text(0, 0, puzzle.title ?? "", { fontFamily: STORY_FONT, fontSize: "36px", color: GOLD_TEXT, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(11);
    this.startGlow = scene.add.graphics().setDepth(12.5).setAlpha(0.65);
    this.gridLines = scene.add.graphics().setDepth(12);
    this.pathLine = scene.add.graphics().setDepth(13);
    this.letters = puzzle.places.map((place) =>
      scene.add
        .text(0, 0, place.letter, { fontFamily: STORY_FONT, fontSize: "48px", color: "#10142f", resolution: 2 })
        .setOrigin(0.5)
        .setDepth(14),
    );
    this.compass = scene.add.image(0, 0, "compass").setDepth(12.6);
    this.card = scene.add.graphics().setDepth(10);
    this.directions = scene.add
      .text(0, 0, puzzle.directions ?? directionsFor(puzzle), {
        fontFamily: STORY_FONT,
        fontSize: "30px",
        color: INK,
        lineSpacing: 10,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    // The key, e.g. "L -> LIBRARY", in two halves so it can sit in two columns on a phone
    const order = puzzle.legendOrder ?? puzzle.places.map((place) => place.letter);
    const lines = order
      .map((letter) => puzzle.places.find((place) => place.letter === letter))
      .filter((place) => !!place)
      .map((place) => `${place!.letter} -> ${place!.name}`);
    const half = Math.ceil(lines.length / 2);
    this.legendParts = [lines.slice(0, half), lines.slice(half)];
    this.legend = this.legendParts.map(() =>
      scene.add
        .text(0, 0, "", {
          fontFamily: UI_FONT,
          fontSize: "24px",
          fontStyle: "500",
          color: "#f6ecd2",
          lineSpacing: 4,
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setDepth(11),
    );

    this.hitZone = scene.add.zone(0, 0, 10, 10).setOrigin(0).setDepth(15).setInteractive({ useHandCursor: true });
    this.hitZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.press(pointer));
    scene.input.on("pointermove", this.move, this);
    scene.input.on("pointerup", this.release, this);

    scene.tweens.add({ targets: this.startGlow, alpha: 0.15, duration: 520, yoyo: true, repeat: -1 });
  }

  private cellAt(pointer: Phaser.Input.Pointer): Cell {
    const { left, top, cell } = this.grid;
    return { column: Math.floor((pointer.worldX - left) / cell), row: Math.floor((pointer.worldY - top) / cell) };
  }

  private press(pointer: Phaser.Input.Pointer) {
    if (this.solved || this.busy) return;
    const cell = this.cellAt(pointer);
    if (sameCell(cell, this.start)) {
      // Pressing the start begins a fresh path
      this.path = [this.start];
      this.drawing = true;
      this.redraw();
      return;
    }
    if (sameCell(cell, this.path[this.path.length - 1])) {
      this.drawing = true;
      return;
    }
    this.drawing = this.touch(cell);
  }

  private move(pointer: Phaser.Input.Pointer) {
    if (!this.drawing || !pointer.isDown) return;
    this.touch(this.cellAt(pointer));
  }

  private release() {
    this.drawing = false;
  }

  /** Extends or steps back the path to a touched block; true when it changed. */
  private touch(cell: Cell) {
    const { columns, rows, places } = this.puzzle;
    const change = pathChange(this.path, cell, this.answer, places, columns, rows);
    if (change === "ignore") return false;
    if (change === "backtrack") this.path = this.path.slice(0, -1);
    else this.path = [...this.path, cell];
    this.redraw();
    if (this.path.length === this.answer.length) this.check();
    return true;
  }

  private check() {
    this.drawing = false;
    if (isAnswerPath(this.path, this.answer)) {
      this.solved = true;
      this.redraw(GREEN);
      this.hooks.correct(0);
      this.hooks.audio.playOneOf(this.puzzle.rightSounds);
      // The finished path blinks, then holds, as in the original
      this.scene.tweens.add({ targets: this.pathLine, alpha: 0, duration: 150, yoyo: true, repeat: 2 });
      this.scene.time.delayedCall(2400, () => this.hooks.done());
      return;
    }
    // Wrong turn: the path flashes red and clears
    this.busy = true;
    this.hooks.wrong();
    this.hooks.audio.playOneOf(this.puzzle.wrongSounds);
    this.redraw(RED);
    this.scene.tweens.add({
      targets: this.pathLine,
      alpha: 0,
      duration: 120,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.busy = false;
        this.path = [this.start];
        this.pathLine.setAlpha(1);
        this.redraw();
      },
    });
  }

  private centre(cell: Cell) {
    const { left, top, cell: size } = this.grid;
    return { x: left + (cell.column + 0.5) * size, y: top + (cell.row + 0.5) * size };
  }

  private redraw(color = GREEN) {
    const g = this.pathLine.clear();
    const size = this.grid.cell;
    if (this.path.length > 1) {
      g.lineStyle(size * 0.22, color, 0.9);
      g.beginPath();
      this.path.forEach((cell, i) => {
        const at = this.centre(cell);
        if (i === 0) g.moveTo(at.x, at.y);
        else g.lineTo(at.x, at.y);
      });
      g.strokePath();
      this.path.forEach((cell) => {
        const at = this.centre(cell);
        g.fillStyle(color, 1).fillCircle(at.x, at.y, size * 0.11);
      });
    }
    // The end of the path, where the next block joins on
    const end = this.centre(this.path[this.path.length - 1]);
    g.lineStyle(5, 0xffffff, 1).strokeCircle(end.x, end.y, size * 0.2);
  }

  place(board: Rect, portrait: boolean) {
    const { columns, rows } = this.puzzle;
    let mapRect: Rect;
    let cardRect: Rect;
    if (portrait) {
      const mapHeight = Math.min(board.height * 0.56, (board.width - 40) * (rows / columns) + 100);
      mapRect = { x: board.x, y: board.y, width: board.width, height: mapHeight };
      cardRect = { x: board.x, y: board.y + mapHeight + 20, width: board.width, height: board.height - mapHeight - 20 };
    } else {
      const mapWidth = board.width * 0.6;
      mapRect = { x: board.x, y: board.y, width: mapWidth, height: board.height };
      cardRect = { x: board.x + mapWidth + 24, y: board.y, width: board.width - mapWidth - 24, height: board.height };
    }

    // The map: square blocks under its title, centred in its panel
    const titleSpace = this.puzzle.title ? 70 : 0;
    const cell = Math.min((mapRect.width - 40) / columns, (mapRect.height - 40 - titleSpace) / rows);
    const left = mapRect.x + (mapRect.width - cell * columns) / 2;
    const top = mapRect.y + titleSpace + (mapRect.height - titleSpace - cell * rows) / 2;
    this.grid = { left, top, cell };
    drawPanel(this.mapPanel, mapRect.width, mapRect.height, { fill: NAVY }).setPosition(
      mapRect.x + mapRect.width / 2,
      mapRect.y + mapRect.height / 2,
    );
    this.title.setPosition(mapRect.x + mapRect.width / 2, top - titleSpace / 2);
    fitText(this.title, mapRect.width - 40, titleSpace - 10, 36, 18);
    const lines = this.gridLines.clear();
    lines.fillStyle(MAP_FILL, 1).fillRect(left, top, cell * columns, cell * rows);
    lines.lineStyle(3, MAP_LINE, 1);
    for (let c = 0; c <= columns; c += 1) lines.lineBetween(left + c * cell, top, left + c * cell, top + rows * cell);
    for (let r = 0; r <= rows; r += 1) lines.lineBetween(left, top + r * cell, left + columns * cell, top + r * cell);
    this.puzzle.places.forEach((place, i) => {
      const at = this.centre(place);
      this.letters[i].setPosition(at.x, at.y + 3).setFontSize(Math.round(cell * 0.56));
    });
    const startAt = this.centre(this.start);
    this.startGlow.clear().fillStyle(GOLD, 1).fillRect(startAt.x - cell / 2, startAt.y - cell / 2, cell, cell);
    this.hitZone.setPosition(left, top).setSize(cell * columns, cell * rows);
    this.hitZone.input?.hitArea?.setTo?.(0, 0, cell * columns, cell * rows);
    // Compass in the map's corner, like the original
    const compassSize = cell * 1.25;
    this.compass
      .setPosition(left + columns * cell - compassSize * 0.55, top + rows * cell - compassSize * 0.55)
      .setScale(compassSize / this.compass.width)
      .setAlpha(0.9);

    // The directions card above the key
    const cx = cardRect.x + cardRect.width / 2;
    const card = this.card.clear();
    card.fillStyle(PAPER, 1).fillRoundedRect(cardRect.x, cardRect.y, cardRect.width, cardRect.height, 18);
    card.lineStyle(4, INK_FILL, 1).strokeRoundedRect(cardRect.x, cardRect.y, cardRect.width, cardRect.height, 18);
    const legendHeight = portrait ? Math.min(170, cardRect.height * 0.42) : Math.min(330, cardRect.height * 0.46);
    const legendTop = cardRect.y + cardRect.height - legendHeight - 14;
    card.fillStyle(NAVY, 1).fillRoundedRect(cardRect.x + 14, legendTop, cardRect.width - 28, legendHeight, 14);

    this.directions.setPosition(cx, cardRect.y + 22);
    fitText(this.directions, cardRect.width - 40, legendTop - cardRect.y - 36, 32, 16);

    if (portrait) {
      // Two columns of the key side by side
      const columnWidth = (cardRect.width - 60) / 2;
      this.legend.forEach((text, i) => {
        text.setVisible(true).setText(this.legendParts[i].join("\n"));
        text.setPosition(cardRect.x + 30 + columnWidth * (i + 0.5), legendTop + 14);
        fitText(text, columnWidth - 10, legendHeight - 24, 22, 12);
      });
      const size = Math.min(...this.legend.map((text) => Number(String(text.style.fontSize).replace("px", ""))));
      this.legend.forEach((text) => text.setFontSize(size));
    } else {
      this.legend[0].setText(this.legendParts.flat().join("\n")).setPosition(cx, legendTop + 16);
      this.legend[1].setVisible(false);
      fitText(this.legend[0], cardRect.width - 60, legendHeight - 28, 24, 12);
    }
    this.redraw(this.solved ? GREEN : undefined);
  }

  hints() {
    return { key: "map", list: this.puzzle.hints ?? [] };
  }

  destroy() {
    this.scene.input.off("pointermove", this.move, this);
    this.scene.input.off("pointerup", this.release, this);
    [this.mapPanel, this.title, this.gridLines, this.pathLine, this.startGlow, this.compass, this.card, this.directions, this.hitZone].forEach(
      (item) => item.destroy(),
    );
    [...this.letters, ...this.legend].forEach((text) => text.destroy());
  }
}
