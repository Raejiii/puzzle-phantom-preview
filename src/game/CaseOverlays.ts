import Phaser from "phaser";
import { GOLD_TEXT, NAVY_DARK, PAPER, RED, type Rect } from "./art";
import { clockAngles, minutesToMidnight, parseClock } from "./logic";
import { STORY_FONT, UI_FONT, fitText } from "./ui";

const OVERLAY_DEPTH = 45;
const CLOCK_FACE = 0xf6c94a;
const CORK = 0xb0804f;
const CORK_EDGE = 0x6b4426;

/** Something shown over the whole game for a moment, that a tap (or a wait) moves past. */
abstract class Overlay {
  protected container: Phaser.GameObjects.Container;
  private shade: Phaser.GameObjects.Rectangle;
  private timer: Phaser.Time.TimerEvent;
  private finished = false;

  constructor(
    protected scene: Phaser.Scene,
    holdMs: number,
    private onDone: () => void,
  ) {
    this.shade = scene.add.rectangle(0, 0, 10, 10, NAVY_DARK, 0.7).setDepth(OVERLAY_DEPTH).setInteractive();
    this.shade.on("pointerdown", () => this.finish());
    this.container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH + 1).setAlpha(0);
    scene.tweens.add({ targets: this.container, alpha: 1, duration: 250 });
    this.timer = scene.time.delayedCall(holdMs, () => this.finish());
  }

  place(view: Rect) {
    this.shade.setPosition(view.x + view.width / 2, view.y + view.height / 2).setSize(view.width * 2, view.height * 4);
    this.shade.input?.hitArea?.setTo?.(0, 0, view.width * 2, view.height * 4);
    this.layout(view);
  }

  protected abstract layout(view: Rect): void;

  /** Stops anything the overlay still has running, before it fades and is destroyed. */
  protected stop() {}

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.timer.remove();
    this.stop();
    this.scene.tweens.add({
      targets: [this.container, this.shade],
      alpha: 0,
      duration: 250,
      onComplete: () => {
        this.container.destroy();
        this.shade.destroy();
        this.onDone();
      },
    });
  }
}

/**
 * The race to midnight: a clock face whose hands sweep from the time the last level started to
 * this one's, with how long is left until midnight.
 */
export class MidnightClock extends Overlay {
  private face: Phaser.GameObjects.Graphics;
  private hands: Phaser.GameObjects.Graphics;
  private time: Phaser.GameObjects.Text;
  private left: Phaser.GameObjects.Text;
  private minutes: number;
  private radius = 150;
  private sweep: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, from: string | undefined, to: string, onDone: () => void) {
    super(scene, 3400, onDone);
    const end = parseClock(to) ?? 0;
    const start = parseClock(from ?? "") ?? end - 15;
    this.minutes = start;
    this.face = scene.add.graphics();
    this.hands = scene.add.graphics();
    this.time = scene.add
      .text(0, 0, "", { fontFamily: STORY_FONT, fontSize: "64px", color: "#ffffff", stroke: "#10142f", strokeThickness: 8, resolution: 2 })
      .setOrigin(0.5);
    this.left = scene.add
      .text(0, 0, "", { fontFamily: UI_FONT, fontSize: "34px", fontStyle: "600", color: GOLD_TEXT, align: "center", resolution: 2 })
      .setOrigin(0.5);
    this.container.add([this.face, this.hands, this.time, this.left]);
    this.update(start);
    // The hands sweep forward to the new time
    this.sweep = scene.tweens.addCounter({
      from: start,
      to: end,
      delay: 350,
      duration: 1500,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => this.update(Math.round(tween.getValue() ?? end)),
    });
  }

  // Tapped past before the hands finished: stop the sweep so it doesn't draw on a removed clock
  protected stop() {
    this.sweep.remove();
  }

  private update(minutes: number) {
    if (!this.time.active) return;
    this.minutes = minutes;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    this.time.setText(`${hours === 0 ? 12 : hours}:${String(mins).padStart(2, "0")} PM`);
    const leftMinutes = minutesToMidnight(minutes);
    const h = Math.floor(leftMinutes / 60);
    const m = leftMinutes % 60;
    const parts = [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minute${m === 1 ? "" : "s"}` : ""].filter(Boolean);
    this.left.setText(parts.length ? `${parts.join(" ")} until midnight` : "Midnight!");
    this.drawHands();
  }

  private drawHands() {
    const r = this.radius;
    const { hour, minute } = clockAngles(this.minutes);
    const g = this.hands.clear();
    const hand = (angle: number, length: number, width: number) => {
      const a = Phaser.Math.DegToRad(angle - 90);
      g.lineStyle(width, 0x111111, 1).lineBetween(0, 0, Math.cos(a) * length, Math.sin(a) * length);
    };
    hand(hour, r * 0.5, 12);
    hand(minute, r * 0.78, 7);
    g.fillStyle(0x111111, 1).fillCircle(0, 0, 12);
  }

  protected layout(view: Rect) {
    this.radius = Math.min(170, view.width * 0.26, view.height * 0.24);
    const r = this.radius;
    const cx = view.x + view.width / 2;
    const cy = view.y + view.height * 0.4;
    // A gold face with bold ticks, like the clock on the Willowbrook tower
    const g = this.face.clear();
    g.fillStyle(0x000000, 0.3).fillCircle(6, 10, r + 14);
    g.fillStyle(0x2b2b2b, 1).fillCircle(0, 0, r + 14);
    g.fillStyle(CLOCK_FACE, 1).fillCircle(0, 0, r);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const inner = i % 3 === 0 ? r * 0.7 : r * 0.8;
      g.lineStyle(i % 3 === 0 ? 12 : 7, 0x111111, 1).lineBetween(Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
    }
    this.face.setPosition(cx, cy);
    this.hands.setPosition(cx, cy);
    this.drawHands();
    this.time.setPosition(cx, cy + r + 70);
    fitText(this.time, view.width - 60, 90, 64, 24);
    this.left.setPosition(cx, cy + r + 140);
    fitText(this.left, view.width - 60, 80, 34, 18);
  }
}

export type CaseCard = { clue: string; solved: boolean; badge: boolean };

/**
 * Riley's case board: a card for each level's clue, pinned as it's solved, with a gold star for
 * the ones solved without a hint. The newest card pins on with a bounce.
 */
export class CaseBoard extends Overlay {
  private board: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private cards: { container: Phaser.GameObjects.Container; shape: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; star: Phaser.GameObjects.Text }[] = [];
  private badgeLine: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private entries: CaseCard[],
    private newest: number,
    onDone: () => void,
  ) {
    super(scene, 4200, onDone);
    this.board = scene.add.graphics();
    this.title = scene.add
      .text(0, 0, "CASE BOARD", { fontFamily: STORY_FONT, fontSize: "52px", color: "#ffffff", stroke: "#3b2a1a", strokeThickness: 8, resolution: 2 })
      .setOrigin(0.5);
    this.container.add([this.board, this.title]);
    for (const entry of entries) {
      const shape = scene.add.graphics();
      const text = scene.add
        .text(0, 4, entry.solved ? entry.clue : "?", {
          fontFamily: STORY_FONT,
          fontSize: "30px",
          color: entry.solved ? "#3b2a1a" : "#9a8a70",
          align: "center",
          resolution: 2,
        })
        .setOrigin(0.5);
      const star = scene.add.text(0, 0, "★", { fontFamily: UI_FONT, fontSize: "40px", color: GOLD_TEXT, stroke: "#7a5200", strokeThickness: 4, resolution: 2 }).setOrigin(0.5);
      star.setVisible(entry.solved && entry.badge);
      const container = scene.add.container(0, 0, [shape, text, star]);
      this.container.add(container);
      this.cards.push({ container, shape, text, star });
    }
    const earned = entries[newest]?.badge;
    this.badgeLine = scene.add
      .text(0, 0, earned ? "★ Detective badge: solved without hints!" : "", {
        fontFamily: UI_FONT,
        fontSize: "34px",
        fontStyle: "700",
        color: GOLD_TEXT,
        stroke: "#10142f",
        strokeThickness: 6,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.container.add(this.badgeLine);

    // The newest card pins on, then its star (if earned) pops
    const card = this.cards[newest];
    if (card) {
      card.container.setScale(1.6).setAlpha(0).setAngle(-12);
      scene.tweens.add({ targets: card.container, scale: 1, alpha: 1, angle: 0, delay: 300, duration: 450, ease: "Back.easeOut" });
      if (earned) {
        card.star.setScale(0);
        scene.tweens.add({ targets: card.star, scale: 1, delay: 850, duration: 350, ease: "Back.easeOut" });
        scene.tweens.add({ targets: this.badgeLine, alpha: 1, delay: 1000, duration: 300 });
      }
    }
  }

  protected layout(view: Rect) {
    const portrait = view.height > view.width;
    const width = Math.min(view.width - 40, 1300);
    const columns = portrait ? 2 : 4;
    const rows = Math.ceil(this.cards.length / columns);
    const cardWidth = (width - 60 - (columns - 1) * 24) / columns;
    const cardHeight = Math.min(150, cardWidth * 0.55);
    const height = 120 + rows * cardHeight + (rows - 1) * 28 + 50;
    const cx = view.x + view.width / 2;
    const top = view.y + Math.max(20, (view.height - height - 70) / 2);
    const g = this.board.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(cx - width / 2 + 8, top + 12, width, height, 18);
    g.fillStyle(CORK_EDGE, 1).fillRoundedRect(cx - width / 2, top, width, height, 18);
    g.fillStyle(CORK, 1).fillRoundedRect(cx - width / 2 + 14, top + 14, width - 28, height - 28, 10);
    this.title.setPosition(cx, top + 64);
    fitText(this.title, width - 60, 70, 52, 24);

    this.cards.forEach((card, i) => {
      const row = Math.floor(i / columns);
      const inRow = Math.min(columns, this.cards.length - row * columns);
      const left = cx - (inRow * cardWidth + (inRow - 1) * 24) / 2;
      const x = left + (i % columns) * (cardWidth + 24) + cardWidth / 2;
      const y = top + 120 + row * (cardHeight + 28) + cardHeight / 2;
      const solved = this.entries[i].solved;
      // A paper card with a red pin, a little askew like notes on a board
      card.shape
        .clear()
        .fillStyle(0x000000, 0.25)
        .fillRect(-cardWidth / 2 + 5, -cardHeight / 2 + 7, cardWidth, cardHeight)
        .fillStyle(solved ? PAPER : 0xd9ccb0, 1)
        .fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight)
        .fillStyle(RED, 1)
        .fillCircle(0, -cardHeight / 2 + 14, 9);
      card.container.setPosition(x, y);
      if (!this.scene.tweens.isTweening(card.container)) card.container.setAngle(((i * 37) % 7) - 3);
      fitText(card.text, cardWidth - 24, cardHeight - 40, 30, 14);
      card.star.setPosition(cardWidth / 2 - 22, cardHeight / 2 - 22);
    });
    this.badgeLine.setPosition(cx, top + height + 44);
    fitText(this.badgeLine, view.width - 40, 60, 34, 16);
  }
}
