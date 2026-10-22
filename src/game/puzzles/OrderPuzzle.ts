import Phaser from "phaser";
import { DOOR_DOTS, GOLD, INK, NAVY, type Rect } from "../art";
import type { Puzzle } from "../types";
import { UI_FONT, drawPanel } from "../ui";
import type { PuzzleHooks, PuzzleView } from "./puzzle";

type Item = {
  /** Its place in the right order. */
  index: number;
  image: Phaser.GameObjects.Image;
  placed: boolean;
};

// Where the original piles the planets in the box, as fractions of the box's width from its
// centre, and how big each one is (Saturn's rings make it wider). Keyed by label.
const PILE: Record<string, { x: number; y: number; size: number }> = {
  Earth: { x: -0.3, y: -0.05, size: 0.16 },
  Mars: { x: -0.13, y: 0.01, size: 0.16 },
  Mercury: { x: 0.02, y: 0.09, size: 0.16 },
  Neptune: { x: -0.33, y: 0.21, size: 0.16 },
  Saturn: { x: -0.05, y: 0.29, size: 0.24 },
  Uranus: { x: -0.18, y: 0.16, size: 0.16 },
  Venus: { x: 0.19, y: 0.08, size: 0.16 },
  Jupiter: { x: 0.14, y: 0.3, size: 0.16 },
};
const FALLBACK = { x: 0, y: 0.1, size: 0.16 };
// The original's key lists the planets in this order
const KEY_ORDER = ["Earth", "Mars", "Mercury", "Neptune", "Saturn", "Uranus", "Venus", "Jupiter"];

/**
 * The planet door, laid out as in the original: a key of the planets on the left, the door with a
 * dot for each planet in the middle, and the planets piled in a box on the right. Drag a planet to
 * its dot (or tap it, then tap a dot). A planet in the wrong dot goes back to the box.
 */
export class OrderPuzzle implements PuzzleView {
  private items: Item[] = [];
  private slots: { x: number; y: number }[] = [];
  private slotRings: Phaser.GameObjects.Graphics;
  private slotZones: Phaser.GameObjects.Zone[] = [];
  private homes: { x: number; y: number; size: number }[] = [];
  private selected: Item | null = null;
  private dragging: Item | null = null;
  private didDrag = false;
  private planetSize = 60;
  private placedCount = 0;
  private door: Phaser.GameObjects.Image;
  private box: Phaser.GameObjects.Image;
  private keyCard: Phaser.GameObjects.Graphics;
  private keyIcons: Phaser.GameObjects.Image[] = [];
  private keyLabels: Phaser.GameObjects.Text[] = [];
  private panel: Phaser.GameObjects.Graphics;

  constructor(
    private scene: Phaser.Scene,
    private puzzle: Extract<Puzzle, { kind: "order" }>,
    private hooks: PuzzleHooks,
  ) {
    this.panel = scene.add.graphics().setDepth(10);
    this.door = scene.add.image(0, 0, "planet-door-closeup").setDepth(11);
    this.box = scene.add.image(0, 0, "planet-box").setDepth(11);
    this.keyCard = scene.add.graphics().setDepth(11);
    this.slotRings = scene.add.graphics().setDepth(12);

    const keyOrder = [
      ...KEY_ORDER.filter((label) => puzzle.labels.includes(label)),
      ...puzzle.labels.filter((label) => !KEY_ORDER.includes(label)),
    ];
    for (const label of keyOrder) {
      const key = puzzle.items[puzzle.labels.indexOf(label)];
      this.keyIcons.push(scene.add.image(0, 0, key).setDepth(12));
      this.keyLabels.push(
        scene.add
          .text(0, 0, label, { fontFamily: UI_FONT, fontSize: "30px", fontStyle: "600", color: INK, resolution: 2 })
          .setOrigin(0, 0.5)
          .setDepth(12),
      );
    }

    this.slotZones = puzzle.items.map((_, i) => {
      const zone = scene.add.zone(0, 0, 10, 10).setDepth(13).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.tapSlot(i));
      return zone;
    });

    this.items = puzzle.items.map((key, index) => {
      const image = scene.add.image(0, 0, key).setDepth(15).setInteractive({ useHandCursor: true, draggable: true });
      const item: Item = { index, image, placed: false };
      image.on("pointerdown", () => (this.didDrag = false));
      image.on("pointerup", () => {
        if (!this.didDrag) this.tapItem(item);
      });
      image.on("dragstart", () => {
        this.didDrag = true;
        if (item.placed) return;
        this.select(null);
        this.dragging = item;
        image.setDepth(20);
        this.scene.tweens.add({ targets: image, scale: this.scaleFor(item) * 1.25, duration: 100 });
      });
      image.on("drag", (_p: Phaser.Input.Pointer, x: number, y: number) => {
        if (this.dragging === item) image.setPosition(x, y);
      });
      image.on("dragend", (pointer: Phaser.Input.Pointer) => this.drop(item, pointer));
      return item;
    });
  }

  private label(item: Item) {
    return this.puzzle.labels[item.index];
  }

  /** Planets in the box keep their original sizes; on the door each fills its dot. */
  private scaleFor(item: Item) {
    const size = item.placed ? this.planetSize : (this.homes[item.index]?.size ?? this.planetSize);
    return size / Math.max(item.image.width, item.image.height);
  }

  private select(item: Item | null) {
    if (this.selected) this.scene.tweens.add({ targets: this.selected.image, scale: this.scaleFor(this.selected), duration: 120 });
    this.selected = item;
    this.drawSlots();
    if (item) this.scene.tweens.add({ targets: item.image, scale: this.scaleFor(item) * 1.3, duration: 120, ease: "Back.easeOut" });
  }

  private tapItem(item: Item) {
    if (item.placed) return;
    this.select(this.selected === item ? null : item);
  }

  private tapSlot(index: number) {
    const item = this.selected;
    if (!item) return;
    this.select(null);
    this.tryPlace(item, index);
  }

  private drop(item: Item, pointer: Phaser.Input.Pointer) {
    if (this.dragging !== item) return;
    this.dragging = null;
    // Where the finger let go, so a quick flick lands where it was aimed
    let nearest = -1;
    let best = this.planetSize * 0.9;
    this.slots.forEach((slot, i) => {
      const distance = Phaser.Math.Distance.Between(slot.x, slot.y, pointer.worldX, pointer.worldY);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    if (nearest >= 0) {
      this.tryPlace(item, nearest);
      return;
    }
    // Let go over its spot in the box: a tap that wobbled into a drag, so pick the planet up
    const home = this.homes[item.index];
    if (home && Phaser.Math.Distance.Between(home.x, home.y, pointer.worldX, pointer.worldY) < home.size) {
      this.scene.tweens.killTweensOf(item.image);
      item.image.setPosition(home.x, home.y).setScale(this.scaleFor(item)).setDepth(15);
      this.tapItem(item);
      return;
    }
    this.sendBack(item);
  }

  private tryPlace(item: Item, slotIndex: number) {
    if (this.items.some((other) => other.placed && other.index === slotIndex)) {
      this.sendBack(item);
      return;
    }
    if (item.index !== slotIndex) {
      this.hooks.wrong();
      this.hooks.audio.playOneOf(this.puzzle.wrongSounds);
      this.sendBack(item, true);
      return;
    }
    item.placed = true;
    item.image.disableInteractive();
    this.placedCount += 1;
    this.hooks.correct(item.index);
    this.hooks.audio.playOneOf(this.puzzle.rightSounds);
    const slot = this.slots[slotIndex];
    this.scene.tweens.add({
      targets: item.image,
      x: slot.x,
      y: slot.y,
      scale: this.scaleFor(item),
      duration: 260,
      ease: "Back.easeOut",
      onComplete: () => {
        item.image.setDepth(14);
        this.drawSlots();
      },
    });
    if (this.placedCount === this.items.length) this.scene.time.delayedCall(1200, () => this.hooks.done());
  }

  private sendBack(item: Item, shake = false) {
    const home = this.homes[item.index];
    this.scene.tweens.add({
      targets: item.image,
      x: home.x,
      y: home.y,
      scale: this.scaleFor(item),
      duration: shake ? 380 : 260,
      ease: shake ? "Back.easeOut" : "Sine.easeOut",
      onComplete: () => {
        item.image.setDepth(15);
        if (!shake) return;
        this.scene.tweens.add({ targets: item.image, x: home.x + 6, duration: 50, yoyo: true, repeat: 3, onComplete: () => (item.image.x = home.x) });
      },
    });
  }

  /** Rings round the empty dots while a planet is picked, so it's clear where it can go. */
  private drawSlots() {
    const g = this.slotRings.clear();
    if (!this.selected) return;
    this.slots.forEach((slot, i) => {
      if (this.items.some((item) => item.placed && item.index === i)) return;
      g.lineStyle(4, GOLD, 1).strokeCircle(slot.x, slot.y, this.planetSize * 0.55);
    });
  }

  place(board: Rect, portrait: boolean) {
    const cx = board.x + board.width / 2;
    drawPanel(this.panel, board.width, board.height, { fill: NAVY, alpha: 0.88 }).setPosition(cx, board.y + board.height / 2);

    // Door, key and box: side by side in landscape; the door on top on a phone
    let doorRect: Rect;
    let keyRect: Rect;
    let boxRect: Rect;
    if (portrait) {
      const doorHeight = board.height * 0.56;
      doorRect = { x: board.x, y: board.y + 10, width: board.width, height: doorHeight };
      const below = { y: board.y + doorHeight + 20, height: board.height - doorHeight - 30 };
      keyRect = { x: board.x + 20, y: below.y, width: board.width * 0.44, height: below.height };
      boxRect = { x: board.x + board.width * 0.5, y: below.y, width: board.width * 0.48, height: below.height };
    } else {
      const third = board.width / 3.4;
      keyRect = { x: board.x + 30, y: board.y + 40, width: third * 0.85, height: board.height - 80 };
      doorRect = { x: board.x + third, y: board.y + 10, width: board.width - third * 2.1, height: board.height - 20 };
      boxRect = { x: board.x + board.width - third * 1.05, y: board.y + 40, width: third, height: board.height - 80 };
    }

    // The door picture, and its dots as drop slots
    const doorScale = Math.min(doorRect.width / this.door.width, doorRect.height / this.door.height);
    const doorX = doorRect.x + doorRect.width / 2;
    const doorY = doorRect.y + doorRect.height / 2;
    this.door.setPosition(doorX, doorY).setScale(doorScale);
    // Dots are measured on the 560-wide picture
    const toScreen = (this.door.width / DOOR_DOTS.width) * doorScale;
    const pictureHeight = this.door.height / (this.door.width / DOOR_DOTS.width);
    const gap = (DOOR_DOTS.ys[1] - DOOR_DOTS.ys[0]) * toScreen;
    this.planetSize = Math.min(gap * 0.92, 110);
    this.slots = DOOR_DOTS.ys.slice(0, this.items.length).map((y) => ({
      x: doorX + (DOOR_DOTS.x - DOOR_DOTS.width / 2) * toScreen,
      y: doorY + (y - pictureHeight / 2) * toScreen,
    }));
    this.slotZones.forEach((zone, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      zone.setPosition(slot.x, slot.y).setSize(this.planetSize, this.planetSize);
      zone.input?.hitArea?.setTo?.(0, 0, this.planetSize, this.planetSize);
    });

    // The key: a white card listing the planets
    const rows = this.keyLabels.length;
    const rowHeight = Math.min(70, (keyRect.height - 30) / rows);
    const cardHeight = rowHeight * rows + 30;
    const cardTop = keyRect.y + (keyRect.height - cardHeight) / 2;
    this.keyCard.clear().fillStyle(0xffffff, 1).fillRoundedRect(keyRect.x, cardTop, keyRect.width, cardHeight, 18);
    this.keyCard.lineStyle(3, 0xd8d0c0, 1).strokeRoundedRect(keyRect.x, cardTop, keyRect.width, cardHeight, 18);
    const iconSize = rowHeight * 0.7;
    this.keyLabels.forEach((label, i) => {
      const y = cardTop + 15 + rowHeight * (i + 0.5);
      const icon = this.keyIcons[i];
      icon.setPosition(keyRect.x + 20 + iconSize / 2, y).setScale(iconSize / Math.max(icon.width, icon.height));
      label.setPosition(keyRect.x + 32 + iconSize, y).setFontSize(Math.round(Math.min(30, rowHeight * 0.5)));
    });

    // The box, with the planets that aren't on the door piled in it
    const boxScale = Math.min(boxRect.width / this.box.width, boxRect.height / this.box.height);
    const boxX = boxRect.x + boxRect.width / 2;
    const boxY = boxRect.y + boxRect.height / 2;
    this.box.setPosition(boxX, boxY).setScale(boxScale);
    const boxWidth = this.box.width * boxScale;
    this.homes = this.items.map((item) => {
      const pile = PILE[this.label(item)] ?? FALLBACK;
      return { x: boxX + pile.x * boxWidth, y: boxY + pile.y * boxWidth, size: Math.max(pile.size * boxWidth * 1.25, 40) };
    });

    for (const item of this.items) {
      this.scene.tweens.killTweensOf(item.image);
      const at = item.placed ? this.slots[item.index] : this.homes[item.index];
      const scale = this.scaleFor(item) * (this.selected === item ? 1.3 : 1);
      item.image.setPosition(at.x, at.y).setScale(scale);
    }
    this.drawSlots();
  }

  hints() {
    return { key: "order", list: this.puzzle.hints ?? [] };
  }

  destroy() {
    this.items.forEach((item) => item.image.destroy());
    this.slotZones.forEach((zone) => zone.destroy());
    [...this.keyIcons, ...this.keyLabels].forEach((item) => item.destroy());
    [this.panel, this.door, this.box, this.keyCard, this.slotRings].forEach((item) => item.destroy());
  }
}
