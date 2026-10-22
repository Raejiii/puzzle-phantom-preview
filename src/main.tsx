import { createRoot, type Root } from "react-dom/client";
import { createElement, StrictMode } from "react";
import { defineGame } from "@ekgamer/game-shell";
import type { GameComponentProps } from "@ekgamer/game-shell";
import Game from "./Game";
import { defaultConfig } from "./defaultConfig";

const CONFIG_FILE_NAME = "config.json";

let root: Root | null = null;
let rootContainer: HTMLElement | null = null;

function mount(container: HTMLElement, ctx: GameComponentProps) {
  if (root && rootContainer !== container) {
    root.unmount();
    root = null;
    rootContainer = null;
  }

  if (!root) {
    root = createRoot(container);
    rootContainer = container;
  }

  root.render(createElement(StrictMode, null, createElement(Game, ctx)));
}

defineGame({
  configFileName: CONFIG_FILE_NAME,
  defaultConfig,
  defaultTitle: "The Puzzle Phantom of Willowbrook",
  allowPortrait: true,
  preventHeaderOverlap: false,

  init(container: HTMLElement, ctx: GameComponentProps) {
    mount(container, ctx);
  },

  destroy() {
    root?.unmount();
    root = null;
    rootContainer = null;
  },

  onLevelChange(container: HTMLElement, ctx: GameComponentProps) {
    mount(container, ctx);
  },
});
