import Phaser from "phaser";
import { RUNTIME_IMAGES } from "../art";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    this.registry.set("preloadComplete", false);
    RUNTIME_IMAGES.forEach((key) => this.load.image(key, `assets/${key}.webp`));
  }

  async create() {
    // Text is drawn to canvas, so the web fonts have to be ready before the first scene renders it
    await Promise.all([
      document.fonts?.load('400 40px "Special Elite"'),
      document.fonts?.load('700 52px "Fredoka"'),
      document.fonts?.load('600 52px "Fredoka"'),
      document.fonts?.load('500 38px "Fredoka"'),
    ]).catch(() => undefined);

    this.registry.set("preloadComplete", true);
    this.scene.start("GameScene");
  }
}
