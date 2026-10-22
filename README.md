# The Puzzle Phantom of Willowbrook

A detective story game for kids: help Detective Riley and Sam follow the Puzzle
Phantom's notes across Willowbrook, solving word, science, map, maths and
planet puzzles before midnight.

This is a standalone preview of the game from
[keytabdev/rahul-games](https://github.com/keytabdev/rahul-games)
(`puzzle-phantom-phaser`). It deploys to Vercel as a plain Vite build
(`npm run build`, output `dist`).

React + Phaser port of *The Puzzle Phantom of Willowbrook*, the Godot detective
story game in [keytabdev/shounak-games](https://github.com/keytabdev/shounak-games)
(`tppowb/`).

## Status

This project uses the shared ekshell + Phaser structure from the other games in
this repo. The shell provides the start, level select and complete screens and
the title + level/timer strip; the game's own menus, pause screen and save
system from the Godot version are not ported.

## How It Plays

The Puzzle Phantom has stolen the Golden Owl Trophy. Detective Riley and Sam
follow the Phantom's notes across Willowbrook, one level per puzzle in the
original:

| Level | Puzzle | How it plays |
| ----- | ------ | ------------ |
| 1-3 | Unscramble ALERN, DIMTHNIG, YRARLIB | Tap two letter tiles to swap them, or drag one onto another |
| 4 | The science of matter | Four spoken questions on the clue box |
| 5 | The compass rose | Draw the path on the town map from G by following the directions (drag or tap block by block) |
| 6 | The learning cake | Five spoken maths questions from the recipe card |
| 7 | The planet door | Drag (or tap, then tap a slot) each planet into its place from the Sun |

- The story is the original's, word for word, with its voice-over: each line
  types out while its clip plays. Tap while it types to show the whole line
  (this stops the voice, as in the original), and tap again to go on. Place
  titles type to the original's typewriter sound. The timer is paused during
  the story.
- Each puzzle loops its music from the original, and plays the original's
  right and wrong sounds. The quizzes read each question aloud and answer
  "Correct!" or "Try again!" with the original clips.
- The **Hint** button shows the original's hint cards. The word, map and
  planet puzzles go through theirs in turn and then say "YOU'RE OUT OF
  HINTS"; each quiz question has its own. **How to** plays the original's
  how-to clip for that puzzle (the shell's "How to play" plays all five
  joined together), and the timer waits while it's open.
- Characters blink with the original's three frames, and the speaker bobs
  gently while their line is read. The 🔊 button replays the line.
- **Auto** (next to Skip story) turns on auto-advance: each line moves on by
  itself once its voice has finished. It's off by default and remembered on
  the device.
- The Phantom's notes appear on the original's pictures of them, zoomed to
  the writing, with the text at the original's tilt.

### Added for the web version

- **The race to midnight:** each level opens on a clock whose hands sweep
  on from the last level's time (8:00 PM at the start, 11:30 PM by the
  planet door), with how long is left until midnight. Times are each
  level's `clock`.
- **Case board:** after each level its clue (`clue`) pins onto Riley's
  board, next to the ones already solved.
- **Detective badge:** a level solved without opening a hint earns a gold
  star on its case-board card. Badges are remembered on the device and
  don't change the score.

## Audio

`public/assets/audio/` holds the original's voice-over (`dia-*.mp3`, mono
40 kbps, loudness-matched), music (mono 64 kbps) and sounds: about 5 MB,
down from about 20 MB. `public/assets/video/` holds the five how-to clips
(960 px wide) and them joined: about 0.8 MB. That is over the 1 MB the
other games keep `public/` to, so the tests budget images and config at
1 MB and audio and video at 7 MB. Each level loads only its own sounds.
Backgrounds are 1100 px wide to keep the images inside their 1 MB.

`audio.background` points at a second of silence: the shell otherwise plays
its own music loop for the whole level, over the voice-over.

## Differences From the Godot Version

- One level per puzzle: the story scenes before and after each puzzle play
  as that level's intro and outro.
- The shell provides the start, level select and complete screens, pause and
  mute, so the original's main menu (and its menu music), pause menu, save
  system and "Thanks for playing!" popup are not ported.
- Added for the web version: the **Skip story**, **Auto** and 🔊 buttons,
  the gold name tag on each line, the speaker's bob, confetti, the clock,
  case board and badges above, and tap controls alongside drag.
- The original loops each character's blink constantly; here they blink
  every few seconds.
- The word, quiz and map boards are drawn in code rather than placed over
  the original's boards, so their layout differs from the original's (see
  its how-to clips) while the text and sounds are the same. The planet door
  follows the original's layout and art.

## Configuring Levels

Each level in `public/config.json` has an `instruction`, a puzzle `background`
and `music`, `intro` and `outro` story beats, and a `puzzle`:

- Story beat: `{ "background": "office", "speaker": "kid", "text": "...", "audio": "dia-6" }`.
  Leave out `speaker` for narration; add `"style": "place"` for a location
  title, or `"style": "note"` with a `noteImage` and the `noteArea` its
  text goes in (in the original's 1536-wide pixels, with a `rotation` in
  radians). A `sound` plays before the line. Speakers are `detective`,
  `kid`, `baker` and `phantom`.
- Each level also has a `howToVideo`, a `clock` time ("h:mm", evening) and
  a `clue` for the case board.
- `unscramble`: `word`, its `letters` in starting order, and `hints`.
- `quiz`: `questions`, each with `text`, `options` (2-4), the `correct` index,
  a `hint`, and its `audio`, `correctAudio` and `wrongAudio`.
- `map`: grid `columns`/`rows`, lettered `places`, the `start` letter and the
  `steps` (`direction` N/E/S/W and `blocks`), plus the `title`,
  `directions` card and `legendOrder` as written in the original.
- `order`: image `items` in the right order with their `labels`, and `hints`.
- `map` and `order` take `rightSounds` and `wrongSounds`.

Audio keys name files in `public/assets/audio/`. The tests check every level
can be played, every story line is voiced, and only shipped images and
sounds are used. `passingScorePercent` is 0 because every level is finished
by solving it.

## File Map

- `src/Game.tsx`: React bridge between ekshell and Phaser.
- `src/game/createPhantomGame.ts`: Phaser bootstrap and responsive sizing.
- `src/game/logic.ts`: level checks, story cast, map walking and scoring ids.
- `src/game/art.ts`: landscape and portrait layouts, colours and image keys.
- `src/game/ui.ts`: panels, buttons and text fitting shared by the views.
- `src/game/StoryView.ts`: narration, dialogue, notes and place titles.
- `src/game/audio.ts`: voice-over, music and sound playback.
- `src/game/CaseOverlays.ts`: the midnight clock and the case board.
- `src/game/prefs.ts`: the auto-advance switch and badges, kept on the device.
- `src/game/puzzles/`: the four puzzle views.
- `src/game/scenes/PreloadScene.ts`: loads the images and fonts (each level loads its own audio).
- `src/game/scenes/GameScene.ts`: story → puzzle → story flow, hints and scoring.
- `src/game/types.ts`: config and runtime types.
- `src/defaultConfig.ts`: fallback shell config.

## Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```
