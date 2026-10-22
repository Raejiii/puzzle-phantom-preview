import Phaser from "phaser";
import { GOLD, NAVY } from "./art";

export const STORY_FONT = '"Special Elite", "Courier New", monospace';
export const UI_FONT = "Fredoka, Arial Rounded MT Bold, Arial, sans-serif";

/** Navy panel with a gold frame, drawn centred on (0, 0) of the graphics. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  options: { fill?: number; border?: number; alpha?: number; radius?: number; line?: number } = {},
) {
  const { fill = NAVY, border = GOLD, alpha = 0.94, radius = 22, line = 5 } = options;
  g.clear();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-width / 2 + 6, -height / 2 + 10, width, height, radius);
  g.fillStyle(fill, alpha).fillRoundedRect(-width / 2, -height / 2, width, height, radius);
  g.lineStyle(line, border, 1).strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
  return g;
}

/** Shrinks a text's font until it fits the box. Word wrap follows the width. */
export function fitText(text: Phaser.GameObjects.Text, width: number, height: number, size: number, minSize = 14) {
  let fontSize = size;
  text.setWordWrapWidth(width, true);
  text.setFontSize(fontSize);
  while ((text.height > height || text.width > width) && fontSize > minSize) {
    fontSize -= 2;
    text.setFontSize(fontSize);
  }
  return fontSize;
}

export type Button = {
  container: Phaser.GameObjects.Container;
  shape: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  width: number;
  height: number;
  setSize(width: number, height: number, fontSize?: number): void;
  setColors(fill: number, border?: number): void;
  setEnabled(enabled: boolean): void;
};

/** A rounded button that presses down when tapped. */
export function makeButton(
  scene: Phaser.Scene,
  text: string,
  onTap: () => void,
  options: { fill?: number; border?: number; color?: string; font?: string } = {},
): Button {
  const shape = scene.add.graphics();
  const label = scene.add
    .text(0, 0, text, {
      fontFamily: options.font ?? UI_FONT,
      fontSize: "32px",
      fontStyle: "600",
      color: options.color ?? "#ffffff",
      align: "center",
      resolution: 2,
    })
    .setOrigin(0.5);
  const container = scene.add.container(0, 0, [shape, label]);
  let fill = options.fill ?? NAVY;
  let border = options.border ?? GOLD;
  let enabled = true;

  const button: Button = {
    container,
    shape,
    label,
    width: 200,
    height: 80,
    setSize(width, height, fontSize) {
      button.width = width;
      button.height = height;
      drawPanel(shape, width, height, { fill, border, alpha: 1, radius: Math.min(24, height / 2) });
      if (fontSize) label.setFontSize(fontSize);
      fitText(label, width - 28, height - 12, Number(label.style.fontSize.toString().replace("px", "")), 14);
      container.setSize(width, height);
      container.input?.hitArea?.setTo?.(0, 0, width, height);
    },
    setColors(nextFill, nextBorder) {
      fill = nextFill;
      border = nextBorder ?? border;
      button.setSize(button.width, button.height);
    },
    setEnabled(next) {
      enabled = next;
      container.setAlpha(next ? 1 : 0.55);
    },
  };

  button.setSize(button.width, button.height);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event?.stopPropagation();
    if (!enabled) return;
    scene.tweens.add({ targets: container, scale: 0.94, duration: 70, yoyo: true });
    onTap();
  });
  return button;
}
