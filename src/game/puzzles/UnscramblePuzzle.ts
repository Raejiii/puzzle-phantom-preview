import Phaser from "phaser";
import { GOLD, GREEN, INK, INK_FILL, PAPER, type Rect } from "../art";
import { spells, swapLetters } from "../logic";
import type { Puzzle } from "../types";
import { STORY_FONT, drawPanel } from "../ui";
import type { PuzzleHooks, PuzzleView } from "./puzzle";

type Tile = {
  /** Index into the starting letters; tiles keep their identity while they swap places. */
  id: number;
  letter: string;
  container: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Graphics;
};

const TILE = 140;

/** Letter tiles in a row: tap two to swap them (or drag one onto another) until the word is spelled. */
export class UnscramblePuzzle implements PuzzleView {
  private tiles: Tile[] = [];
  /** Tile ids in the order they sit on the board. */
  private order: number[] = [];
  private selected: Tile | null = null;
  private dragging: Tile | null = null;
  /** Set once a press turns into a drag, so letting go isn't also a tap. */
  private didDrag = false;
  private solved = false;
  private positions: { x: number; y: number }[] = [];
  private tileScale = 1;
  private panel: Phaser.GameObjects.Graphics;

  constructor(
    private scene: Phaser.Scene,
    private puzzle: Extract<Puzzle, { kind: "unscramble" }>,
    private hooks: PuzzleHooks,
  ) {
    const word = puzzle.word.toUpperCase();
    this.puzzle = { ...puzzle, word, letters: puzzle.letters.map((letter) => letter.toUpperCase()) };
    this.panel = scene.add.graphics().setDepth(10);

    this.tiles = this.puzzle.letters.map((letter, id) => this.createTile(id, letter));
    this.order = this.tiles.map((tile) => tile.id);
  }

  private createTile(id: number, letter: string): Tile {
    const face = this.scene.add.graphics();
    const text = this.scene.add
      .text(0, 6, letter, { fontFamily: STORY_FONT, fontSize: "92px", color: INK, resolution: 2 })
      .setOrigin(0.5);
    const container = this.scene.add.container(0, 0, [face, text]).setDepth(12).setSize(TILE, TILE);
    const tile: Tile = { id, letter, container, face };
    this.drawTile(tile, false);
    container.setInteractive({ useHandCursor: true, draggable: true });
    container.on("pointerdown", () => (this.didDrag = false));
    container.on("pointerup", () => {
      if (!this.didDrag) this.tap(tile);
    });
    container.on("dragstart", () => {
      this.didDrag = true;
      if (this.solved) return;
      this.dragging = tile;
      container.setDepth(20);
      this.scene.tweens.add({ targets: container, scale: this.tileScale * 1.1, duration: 100 });
    });
    container.on("drag", (_p: Phaser.Input.Pointer, x: number, y: number) => {
      if (this.dragging === tile) container.setPosition(x, y);
    });
    container.on("dragend", (pointer: Phaser.Input.Pointer) => this.drop(tile, pointer));
    return tile;
  }

  private drawTile(tile: Tile, highlighted: boolean, fill = PAPER) {
    const g = tile.face.clear();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-TILE / 2 + 4, -TILE / 2 + 8, TILE, TILE, 18);
    g.fillStyle(highlighted ? 0xffe7a0 : fill, 1).fillRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 18);
    g.lineStyle(highlighted ? 8 : 4, highlighted ? GOLD : INK_FILL, 1).strokeRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 18);
  }

  private tap(tile: Tile) {
    if (this.solved) return;
    if (!this.selected) {
      this.selected = tile;
      this.drawTile(tile, true);
      this.scene.tweens.add({ targets: tile.container, y: tile.container.y - 12, duration: 120, ease: "Back.easeOut" });
      return;
    }
    const first = this.selected;
    this.selected = null;
    this.drawTile(first, false);
    if (first === tile) {
      this.moveHome(tile);
      return;
    }
    this.swap(first, tile);
  }

  private drop(tile: Tile, pointer: Phaser.Input.Pointer) {
    if (this.dragging !== tile) return;
    this.dragging = null;
    // Let go over its own place: a tap that wobbled into a drag, so treat it as a tap
    const home = this.positions[this.order.indexOf(tile.id)];
    if (home && Phaser.Math.Distance.Between(home.x, home.y, pointer.worldX, pointer.worldY) < TILE * this.tileScale * 0.5) {
      this.scene.tweens.killTweensOf(tile.container);
      tile.container.setPosition(home.x, home.y).setScale(this.tileScale).setDepth(12);
      this.tap(tile);
      return;
    }
    // Dropped on another tile (where the finger let go): those two swap; anywhere else it slides back
    const other = this.tiles.find(
      (candidate) =>
        candidate !== tile &&
        Phaser.Math.Distance.Between(candidate.container.x, candidate.container.y, pointer.worldX, pointer.worldY) <
          TILE * this.tileScale * 0.6,
    );
    if (this.selected) {
      this.drawTile(this.selected, false);
      this.moveHome(this.selected);
      this.selected = null;
    }
    if (other) this.swap(tile, other);
    else this.moveHome(tile);
  }

  private swap(a: Tile, b: Tile) {
    const ia = this.order.indexOf(a.id);
    const ib = this.order.indexOf(b.id);
    this.order = swapLetters(this.order, ia, ib);
    this.moveHome(a);
    this.moveHome(b);
    if (spells(this.currentLetters(), this.puzzle.word)) {
      this.solved = true;
      this.scene.time.delayedCall(320, () => this.celebrate());
    }
  }

  private currentLetters() {
    return this.order.map((id) => this.tiles[id].letter);
  }

  private moveHome(tile: Tile) {
    const at = this.positions[this.order.indexOf(tile.id)];
    if (!at) return;
    this.scene.tweens.killTweensOf(tile.container);
    this.scene.tweens.add({
      targets: tile.container,
      x: at.x,
      y: at.y,
      scale: this.tileScale,
      duration: 280,
      ease: "Back.easeOut",
      onComplete: () => tile.container.setDepth(12),
    });
  }

  private celebrate() {
    this.hooks.correct(0);
    this.order.forEach((id, i) => {
      const tile = this.tiles[id];
      tile.container.disableInteractive();
      this.drawTile(tile, false, 0xbff0cf);
      tile.face.lineStyle(6, GREEN, 1).strokeRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 18);
      this.scene.tweens.add({
        targets: tile.container,
        y: tile.container.y - 26,
        duration: 180,
        delay: i * 70,
        yoyo: true,
        ease: "Sine.easeOut",
      });
    });
    this.scene.time.delayedCall(1500, () => this.hooks.done());
  }

  place(board: Rect, portrait: boolean) {
    const count = this.tiles.length;
    // Long words split over two rows on a phone held upright, so the tiles stay big enough to tap
    const rows = portrait && count > 5 ? 2 : 1;
    const perRow = Math.ceil(count / rows);
    const gap = portrait ? 14 : 18;
    const size = Math.min(TILE, (board.width - 60 - gap * (perRow - 1)) / perRow);
    this.tileScale = size / TILE;
    const panelWidth = Math.min(board.width, perRow * size + (perRow - 1) * gap + 90);
    const tilesHeight = rows * size + (rows - 1) * gap;
    const panelHeight = tilesHeight + 90;
    const cx = board.x + board.width / 2;
    const cy = board.y + Math.max(panelHeight / 2 + 20, board.height * 0.4);
    drawPanel(this.panel, panelWidth, panelHeight).setPosition(cx, cy);
    const firstRowY = cy + 4 - (tilesHeight - size) / 2;
    this.positions = this.order.map((_, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      const left = cx - ((inRow - 1) * (size + gap)) / 2;
      return { x: left + (i % perRow) * (size + gap), y: firstRowY + row * (size + gap) };
    });
    this.order.forEach((id, i) => {
      const tile = this.tiles[id];
      this.scene.tweens.killTweensOf(tile.container);
      tile.container.setPosition(this.positions[i].x, this.positions[i].y).setScale(this.tileScale);
    });
    if (this.selected) this.selected.container.y -= 12;
  }

  hints() {
    return { key: "word", list: this.puzzle.hints ?? [], numbered: true };
  }

  destroy() {
    this.tiles.forEach((tile) => tile.container.destroy());
    this.panel.destroy();
  }
}
