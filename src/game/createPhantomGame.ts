import Phaser from "phaser";
import { getPixelRatio } from "./pixelRatio";
import { GameScene } from "./scenes/GameScene";
import { PreloadScene } from "./scenes/PreloadScene";
import type { PhantomRuntime } from "./types";

type PhantomGameSize = {
  width: number;
  height: number;
  zoom: number;
};

export function getPhantomGameSizeForContainer(parent: HTMLElement): PhantomGameSize {
  const bounds = parent.getBoundingClientRect();
  const cssWidth = bounds.width || parent.clientWidth;
  const cssHeight = bounds.height || parent.clientHeight;
  const pixelRatio = getPixelRatio();

  return {
    width: Math.max(1, Math.round((cssWidth || 1440) * pixelRatio)),
    height: Math.max(1, Math.round((cssHeight || 1024) * pixelRatio)),
    zoom: 1 / pixelRatio,
  };
}

export function createPhantomGame(options: {
  parent: HTMLElement;
  gameApi: PhantomRuntime["gameApi"];
}) {
  const layout = getPhantomGameSizeForContainer(options.parent);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: layout.width,
    height: layout.height,
    transparent: true,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      zoom: layout.zoom,
    },
    callbacks: {
      postBoot(phaserGame: Phaser.Game) {
        phaserGame.registry.set("preloadComplete", false);
      },
    },
  });

  game.scene.add("PreloadScene", PreloadScene, false);
  game.scene.add("GameScene", GameScene, false);

  return game;
}
