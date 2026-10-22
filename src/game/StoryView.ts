import Phaser from "phaser";
import { CHARACTERS, GOLD, GOLD_TEXT, INK, NAVY_DARK, PAPER, SOURCE_WIDTH, type Layout, type Rect } from "./art";
import type { LevelAudio } from "./audio";
import { SPEAKER_NAMES, castFor } from "./logic";
import { FRAME_WIDTH, IDLE_FPS, IDLE_FRAMES, type CastMember, type StageFrame } from "./stage";
import type { Speaker, StoryBeat } from "./types";
import { STORY_FONT, UI_FONT, drawPanel, fitText, makeButton, type Button } from "./ui";

// Typing speeds from the original: place titles type slower, to the typewriter sound
const TYPE_MS = 50;
const PLACE_TYPE_MS = 80;
/** Characters stand just in front of the background, so the bakery counter can go in front of the baker. */
export const CAST_DEPTH = -9;
// Pause after a line before auto-advance moves on
const AUTO_PAUSE_MS = 700;

/**
 * Plays story beats one tap at a time, as the original does: each line types out while its
 * voice-over plays. A tap while it types shows the whole line and stops the voice; the next tap
 * moves on. With auto-advance on, the next line follows once the voice has finished.
 * The room's characters stand where the original put them, looping their frames nonstop as it does.
 * Narration and dialogue sit in the caption panel, the Phantom's notes on the original's pictures
 * of them, and new places get a title card.
 */
export class StoryView {
  private beats: StoryBeat[] = [];
  private index = 0;
  private onDone: (() => void) | null = null;
  private typing: Phaser.Time.TimerEvent | null = null;
  private autoTimer: Phaser.Time.TimerEvent | null = null;
  /** The text object the current beat types into. */
  private target: Phaser.GameObjects.Text | null = null;
  private fullText = "";
  private shown = 0;
  private voiceDone = true;
  private layout!: Layout;
  private view!: Rect;
  private active = false;
  private autoAdvance = false;

  private characters = new Map<Speaker, Phaser.GameObjects.Sprite>();
  private cast: CastMember[] = [];
  private captionPanel: Phaser.GameObjects.Graphics;
  private nameTag: Phaser.GameObjects.Container;
  private nameShape: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private tapHint: Phaser.GameObjects.Text;
  private noteImage: Phaser.GameObjects.Image;
  private notePaper: Phaser.GameObjects.Graphics;
  private noteText: Phaser.GameObjects.Text;
  private shade: Phaser.GameObjects.Rectangle;
  private placeText: Phaser.GameObjects.Text;
  private replay: Button;
  private tapZone: Phaser.GameObjects.Zone;

  constructor(
    private scene: Phaser.Scene,
    private audio: LevelAudio,
    private setBackground: (key: string) => void,
    /** Where the original's view lies on the current background. */
    private stage: () => StageFrame | null,
  ) {
    for (const key of CHARACTERS as Speaker[]) {
      const idle = `${key}-idle`;
      if (!scene.anims.exists(idle)) {
        scene.anims.create({
          key: idle,
          frames: IDLE_FRAMES(key).map((frame) => ({ key: frame })),
          frameRate: IDLE_FPS[key],
          repeat: -1,
        });
      }
      this.characters.set(key, scene.add.sprite(0, 0, key).setVisible(false).play(idle));
    }
    this.shade = scene.add.rectangle(0, 0, 10, 10, NAVY_DARK, 0.55).setDepth(6).setVisible(false);
    this.captionPanel = scene.add.graphics().setDepth(7);
    this.nameShape = scene.add.graphics();
    this.nameText = scene.add
      .text(0, 0, "", { fontFamily: UI_FONT, fontSize: "30px", fontStyle: "700", color: "#1b2150", resolution: 2 })
      .setOrigin(0.5);
    this.nameTag = scene.add.container(0, 0, [this.nameShape, this.nameText]).setDepth(8);
    this.body = scene.add
      .text(0, 0, "", { fontFamily: STORY_FONT, fontSize: "36px", color: "#ffffff", lineSpacing: 8, resolution: 2 })
      .setOrigin(0, 0)
      .setDepth(8);
    this.tapHint = scene.add
      .text(0, 0, "Tap to continue", { fontFamily: UI_FONT, fontSize: "24px", fontStyle: "500", color: GOLD_TEXT, resolution: 2 })
      .setOrigin(1, 1)
      .setDepth(8);
    this.noteImage = scene.add.image(0, 0, "note-1").setDepth(7);
    this.notePaper = scene.add.graphics().setDepth(7);
    // Notes and titles type into a box as wide as the finished text, so lines don't shift as they grow
    this.noteText = scene.add
      .text(0, 0, "", { fontFamily: STORY_FONT, fontSize: "30px", color: INK, lineSpacing: 4, resolution: 2 })
      .setOrigin(0.5, 0)
      .setDepth(8);
    this.placeText = scene.add
      .text(0, 0, "", {
        fontFamily: STORY_FONT,
        fontSize: "76px",
        color: "#ffffff",
        align: "center",
        stroke: "#10142f",
        strokeThickness: 10,
        lineSpacing: 14,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(8);
    // Hear the line again
    this.replay = makeButton(scene, "🔊", () => this.replayLine(), { fill: 0x2b3275 });
    this.replay.container.setDepth(9);
    this.tapZone = scene.add.zone(0, 0, 10, 10).setDepth(4).setInteractive();
    this.tapZone.on("pointerdown", () => this.tap());
    this.hideAll();
  }

  get isActive() {
    return this.active;
  }

  setAutoAdvance(on: boolean) {
    this.autoAdvance = on;
    if (on) this.armAuto();
    else this.cancelAuto();
  }

  play(beats: StoryBeat[], onDone: () => void) {
    this.beats = beats;
    this.onDone = onDone;
    this.active = beats.length > 0;
    if (!this.active) {
      onDone();
      return;
    }
    this.tapZone.setInteractive();
    this.show(0);
  }

  /** Jumps past the rest of the story. */
  skip() {
    if (!this.active) return;
    this.setBackground(this.beats[this.beats.length - 1].background);
    this.finish();
  }

  private tap() {
    if (!this.active) return;
    if (this.shown < this.fullText.length) {
      this.revealAll();
      this.audio.stopVoice();
      this.voiceEnded();
      return;
    }
    this.next();
  }

  private next() {
    this.cancelAuto();
    if (this.index + 1 < this.beats.length) this.show(this.index + 1);
    else this.finish();
  }

  private finish() {
    this.active = false;
    this.stopTyping();
    this.cancelAuto();
    this.audio.stopVoice();
    this.tapZone.disableInteractive();
    this.hideAll();
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  private hideAll() {
    this.characters.forEach((image) => image.setVisible(false));
    this.scene.tweens.killTweensOf(this.tapHint);
    [this.shade, this.captionPanel, this.nameTag, this.body, this.tapHint, this.noteImage, this.notePaper, this.noteText, this.placeText].forEach(
      (item) => item.setVisible(false),
    );
    this.replay.container.setVisible(false);
  }

  private stopTyping() {
    this.typing?.remove();
    this.typing = null;
  }

  private cancelAuto() {
    this.autoTimer?.remove();
    this.autoTimer = null;
  }

  /** With auto-advance on, moves on once the line has typed out and its voice has finished. */
  private armAuto() {
    this.cancelAuto();
    if (!this.autoAdvance || !this.active || !this.voiceDone || this.shown < this.fullText.length) return;
    this.autoTimer = this.scene.time.delayedCall(AUTO_PAUSE_MS, () => this.next());
  }

  private voiceEnded() {
    this.voiceDone = true;
    this.armAuto();
  }

  private playLine(beat: StoryBeat) {
    this.voiceDone = !beat.audio;
    this.audio.playVoice(beat.audio, () => this.voiceEnded());
    if (!beat.audio) this.armAuto();
  }

  private replayLine() {
    if (!this.active) return;
    const beat = this.beats[this.index];
    this.cancelAuto();
    this.revealAll();
    this.playLine(beat);
  }

  private show(index: number) {
    this.index = index;
    const beat = this.beats[index];
    // Scenes cut from one to the next, as in the original
    this.setBackground(beat.background);
    this.cast = castFor(beat);
    this.hideAll();
    this.stopTyping();
    this.cancelAuto();
    this.audio.stopVoice();
    this.fullText = beat.text;
    this.shown = 0;
    this.voiceDone = false;

    if (beat.style === "place") {
      this.shade.setVisible(true);
      this.target = this.placeText;
    } else if (beat.style === "note") {
      this.shade.setVisible(true);
      const picture = beat.noteImage && this.scene.textures.exists(beat.noteImage) ? beat.noteImage : null;
      if (picture) {
        this.noteImage.setTexture(picture).setVisible(true);
      } else {
        this.notePaper.setVisible(true);
      }
      this.target = this.noteText;
    } else {
      this.captionPanel.setVisible(true);
      this.target = this.body;
      if (beat.speaker) {
        this.nameTag.setVisible(true);
        this.nameText.setText(SPEAKER_NAMES[beat.speaker]);
        this.cast.forEach((member, i) => this.characters.get(member.speaker)!.setVisible(true).setDepth(CAST_DEPTH + i * 0.1));
      }
    }
    this.target.setVisible(true).setText("");
    this.replay.container.setVisible(!!beat.audio && beat.style !== "place");
    this.place(this.layout, this.view);

    const start = () => {
      if (!this.active || this.beats[this.index] !== beat) return;
      this.typing = this.scene.time.addEvent({
        delay: beat.style === "place" ? PLACE_TYPE_MS : TYPE_MS,
        loop: true,
        callback: () => this.typeNext(),
      });
      this.playLine(beat);
    };
    // A sound that belongs to the moment (the box unlocking) plays first, then the line
    if (beat.sound) this.audio.playEffect(beat.sound, start);
    else start();
  }

  private typeNext() {
    this.shown = Math.min(this.fullText.length, this.shown + 1);
    this.target?.setText(this.fullText.slice(0, this.shown));
    if (this.shown >= this.fullText.length) this.revealAll();
  }

  private revealAll() {
    this.stopTyping();
    this.shown = this.fullText.length;
    this.target?.setText(this.fullText);
    this.showTapHint();
    this.armAuto();
  }

  /** "Tap to continue" blinks as the original's does: fading out and back in, 0.4 s each way. */
  private showTapHint() {
    if (this.tapHint.visible) return;
    this.scene.tweens.killTweensOf(this.tapHint);
    this.tapHint.setVisible(true).setAlpha(1);
    this.scene.tweens.add({ targets: this.tapHint, alpha: 0, duration: 400, yoyo: true, repeat: -1 });
  }

  /** Sizes a text for its whole line, then puts back what has typed so far. */
  private fitWhole(text: Phaser.GameObjects.Text, width: number, height: number, size: number, minSize: number) {
    const typed = text.text;
    text.setFixedSize(0, 0).setText(this.fullText);
    fitText(text, width, height, size, minSize);
    const fullHeight = text.height;
    text.setText(typed);
    return fullHeight;
  }

  /** Lays out for the layout; `view` is the part of the design space on screen, under the shell's header. */
  place(layout: Layout, view: Rect) {
    this.layout = layout;
    this.view = view;
    if (!layout) return;
    this.tapZone.setPosition(view.x + view.width / 2, view.y + view.height / 2).setSize(view.width * 2, view.height * 2);
    this.tapZone.input?.hitArea?.setTo?.(0, 0, view.width * 2, view.height * 2);
    this.shade.setPosition(view.x + view.width / 2, view.y + view.height / 2).setSize(view.width * 2, view.height * 4);
    if (!this.active) return;
    const beat = this.beats[this.index];
    const caption = layout.caption;
    const bottom = view.y + view.height;
    this.replay.setSize(64, 64, 30);

    // Characters, where the original stood them in this room
    const frame = this.stage();
    let speakerX = caption.x + 160;
    if (frame) {
      this.cast.forEach((member) => {
        const image = this.characters.get(member.speaker)!;
        image
          .setPosition(frame.x(member.x), frame.y(member.y))
          .setScale((member.scale * FRAME_WIDTH * frame.k) / image.width)
          .setFlipX(!!member.flip);
        if (member.speaker === beat.speaker) speakerX = image.x;
      });
    }

    // Caption panel, with the speaker's name on a gold tag
    drawPanel(this.captionPanel, caption.width, caption.height).setPosition(caption.x + caption.width / 2, caption.y + caption.height / 2);
    const padding = 36;
    const nameWidth = Math.max(220, this.nameText.width + 60);
    this.nameShape.clear().fillStyle(GOLD, 1).fillRoundedRect(-nameWidth / 2, -28, nameWidth, 56, 28);
    this.nameTag.setPosition(
      Phaser.Math.Clamp(speakerX, caption.x + nameWidth / 2 + 20, caption.x + caption.width - nameWidth / 2 - 110),
      caption.y,
    );
    const top = caption.y + (beat.speaker ? 42 : 30);
    this.body.setPosition(caption.x + padding, top);
    this.fitWhole(this.body, caption.width - padding * 2 - 70, caption.y + caption.height - 46 - top, layout.width > layout.height ? 36 : 34, 20);
    this.tapHint.setPosition(caption.x + caption.width - 24, caption.y + caption.height - 12);
    this.replay.container.setPosition(caption.x + caption.width - 50, caption.y + 8);

    if (beat.style === "note") this.placeNote(beat, view, bottom);

    if (beat.style === "place") {
      const width = view.width - 60;
      const textHeight = this.fitWhole(this.placeText, width, 400, layout.place.size, 30);
      this.placeText.setFixedSize(width, 0).setPosition(layout.place.x, layout.place.y - textHeight / 2);
      this.tapHint.setPosition(layout.place.x + 160, layout.place.y + 200);
    }
  }

  /**
   * The note's picture, scaled so its writing area is comfortably large and centred on screen, with
   * the text written into that area at the original's tilt.
   */
  private placeNote(beat: StoryBeat, view: Rect, bottom: number) {
    const cx = view.x + view.width / 2;
    const cy = view.y + (view.height - 60) / 2;
    this.tapHint.setPosition(view.x + view.width - 30, bottom - 14);
    this.replay.container.setPosition(view.x + view.width - 70, bottom - 90);

    if (!this.noteImage.visible || !beat.noteArea) {
      // No picture for this note: plain paper in the middle of the screen
      const width = Math.min(view.width - 60, 900);
      const height = view.height - 140;
      this.notePaper.clear().fillStyle(PAPER, 1).fillRoundedRect(cx - width / 2, cy - height / 2, width, height, 16);
      const textHeight = this.fitWhole(this.noteText, width * 0.86, height * 0.88, 32, 14);
      this.noteText.setRotation(0).setFixedSize(width * 0.86, 0).setPosition(cx, cy - textHeight / 2);
      return;
    }

    const toImage = this.noteImage.width / SOURCE_WIDTH;
    const area = beat.noteArea;
    const areaWidth = area.width * toImage;
    const areaHeight = area.height * toImage;
    const scale = Math.min((view.width * 0.92) / areaWidth, ((view.height - 60) * 0.86) / areaHeight);
    const rotation = area.rotation ?? 0;
    // Where the area's centre lands on the picture, relative to the picture's centre
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corner = { x: area.x * toImage - this.noteImage.width / 2, y: area.y * toImage - this.noteImage.height / 2 };
    const centre = {
      x: corner.x + (areaWidth / 2) * cos - (areaHeight / 2) * sin,
      y: corner.y + (areaWidth / 2) * sin + (areaHeight / 2) * cos,
    };
    this.noteImage.setScale(scale).setPosition(cx - centre.x * scale, cy - centre.y * scale);

    const textWidth = areaWidth * scale * 0.9;
    const textHeight = this.fitWhole(this.noteText, textWidth, areaHeight * scale * 0.9, 32, 12);
    // The text's top edge, centred in the area, measured along the tilted area
    const down = -textHeight / 2;
    this.noteText
      .setRotation(rotation)
      .setFixedSize(textWidth, 0)
      .setPosition(cx - down * sin, cy + down * cos);
  }

  destroy() {
    this.stopTyping();
    this.cancelAuto();
    this.characters.forEach((image) => image.destroy());
    [
      this.shade,
      this.captionPanel,
      this.nameTag,
      this.body,
      this.tapHint,
      this.noteImage,
      this.notePaper,
      this.noteText,
      this.placeText,
      this.tapZone,
    ].forEach((item) => item.destroy());
    this.replay.container.destroy();
  }
}
