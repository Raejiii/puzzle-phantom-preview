import Phaser from "phaser";
import { pickOther } from "./logic";

export const audioUrl = (key: string) => `assets/audio/${key}.mp3`;

// The original plays the puzzle music well under the voices (-5 to -10 dB)
const MUSIC_VOLUME = 0.35;

/**
 * The level's sounds: one voice line at a time, a music loop under the puzzle, and short effects.
 * A sound that didn't load is skipped, and anything waiting on it carries on after a moment.
 */
export class LevelAudio {
  private voice: Phaser.Sound.BaseSound | null = null;
  private music: Phaser.Sound.BaseSound | null = null;
  private lastPick = new Map<string[], string>();

  constructor(private scene: Phaser.Scene) {}

  private has(key?: string): key is string {
    return !!key && this.scene.cache.audio.exists(key);
  }

  /** Plays a voice line (stopping the one before); `onEnd` runs when it finishes, not when it is stopped. */
  playVoice(key: string | undefined, onEnd?: () => void) {
    this.stopVoice();
    if (!this.has(key)) {
      if (onEnd) this.scene.time.delayedCall(700, onEnd);
      return;
    }
    const sound = this.scene.sound.add(key);
    this.voice = sound;
    sound.once(Phaser.Sound.Events.COMPLETE, () => {
      if (this.voice === sound) this.voice = null;
      sound.destroy();
      onEnd?.();
    });
    sound.play();
  }

  stopVoice() {
    const sound = this.voice;
    this.voice = null;
    if (!sound) return;
    sound.removeAllListeners(Phaser.Sound.Events.COMPLETE);
    sound.stop();
    sound.destroy();
  }

  /** A short effect, played over anything else. */
  playEffect(key: string | undefined, onEnd?: () => void) {
    if (!this.has(key)) {
      if (onEnd) this.scene.time.delayedCall(300, onEnd);
      return;
    }
    const sound = this.scene.sound.add(key);
    sound.once(Phaser.Sound.Events.COMPLETE, () => {
      sound.destroy();
      onEnd?.();
    });
    sound.play();
  }

  /** One of the list at random, never the same one twice in a row. */
  playOneOf(list: string[] | undefined) {
    if (!list?.length) return;
    const key = pickOther(list, this.lastPick.get(list));
    this.lastPick.set(list, key);
    this.playEffect(key);
  }

  playMusic(key: string | undefined) {
    this.stopMusic();
    if (!this.has(key)) return;
    this.music = this.scene.sound.add(key, { loop: true, volume: MUSIC_VOLUME });
    this.music.play();
  }

  pauseMusic() {
    this.music?.pause();
  }

  resumeMusic() {
    this.music?.resume();
  }

  stopMusic() {
    this.music?.stop();
    this.music?.destroy();
    this.music = null;
  }

  stopAll() {
    this.stopVoice();
    this.stopMusic();
    this.scene.sound.stopAll();
  }
}
