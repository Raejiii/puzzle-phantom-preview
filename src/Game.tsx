import { useEffect, useRef, type MutableRefObject } from "react";
import type { GameComponentProps } from "@ekgamer/game-shell";
import type Phaser from "phaser";
import "./index.css";
import {
  createPhantomGame,
  getPhantomGameSizeForContainer,
} from "./game/createPhantomGame";
import { getLevelConfigByIndex } from "./game/logic";
import { GameScene } from "./game/scenes/GameScene";
import type { PhantomLevel } from "./game/types";

export default function Game(props: GameComponentProps) {
  const { gameApi, level, levelConfig, config, gameId } = props;
  const phaserContainerRef = useRef<HTMLDivElement | null>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const scene = () =>
      phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined;

    // Pausing the scene doesn't stop sounds, so the voice-over and music pause with it
    const unsubPause = gameApi.onPause(() => {
      scene()?.scene.pause();
      phaserGameRef.current?.sound.pauseAll();
    });
    const unsubResume = gameApi.onResume(() => {
      scene()?.scene.resume();
      phaserGameRef.current?.sound.resumeAll();
    });
    const unsubMute = gameApi.onMuteChange((muted: boolean) => {
      if (phaserGameRef.current) {
        phaserGameRef.current.sound.mute = muted;
      }
    });
    const unsubReset = gameApi.onReset(() => scene()?.scene.restart());

    return () => {
      unsubPause();
      unsubResume();
      unsubMute();
      unsubReset();
    };
  }, [gameApi]);

  useEffect(() => {
    const container = phaserContainerRef.current;
    if (!container) return;

    const totalLevels = config?.levels?.length ?? 1;
    const currentLevelConfig = (
      levelConfig ?? getLevelConfigByIndex(config, level)
    ) as PhantomLevel | undefined;

    if (!phaserGameRef.current) {
      gameApi.freezeTimer();
      phaserGameRef.current = createPhantomGame({
        parent: container,
        gameApi,
      });
      phaserGameRef.current.registry.set("phantomRuntime", {
        gameApi,
        gameId,
        level,
        levelConfig: currentLevelConfig,
        config,
        totalLevels,
      });
      phaserGameRef.current.scene.start("PreloadScene");
      return;
    }

    gameApi.freezeTimer();
    phaserGameRef.current.registry.set("phantomRuntime", {
      gameApi,
      gameId,
      level,
      levelConfig: currentLevelConfig,
      config,
      totalLevels,
    });

    if (phaserGameRef.current.registry.get("preloadComplete")) {
      phaserGameRef.current.scene.start("GameScene");
    } else {
      phaserGameRef.current.scene.start("PreloadScene");
    }
  }, [gameApi, level, levelConfig, config, gameId]);

  useEffect(() => {
    return () => {
      phaserGameRef.current?.destroy(true);
      phaserGameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = phaserContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const phaserGame = phaserGameRef.current;
      if (!phaserGame) return;

      const nextSize = getPhantomGameSizeForContainer(container);
      if (
        phaserGame.scale.width !== nextSize.width ||
        phaserGame.scale.height !== nextSize.height
      ) {
        phaserGame.scale.setGameSize(nextSize.width, nextSize.height);
      }

      if (phaserGame.scale.zoom !== nextSize.zoom) {
        phaserGame.scale.setZoom(nextSize.zoom);
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={(element: HTMLDivElement | null) => {
        (gameApi.gameGridRef as MutableRefObject<HTMLDivElement | null>).current =
          element;
      }}
      className="game-screen"
    >
      <div ref={phaserContainerRef} className="phaser-container" />
    </div>
  );
}
