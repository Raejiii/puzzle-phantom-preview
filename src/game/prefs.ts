// Small things remembered on this device: the auto-advance switch and the detective badges.
// Storage can be missing or blocked (private windows, embeds), so every read and write is guarded
// and the game plays the same without it.

const AUTO_KEY = "puzzle-phantom:auto-advance";
const BADGES_KEY = "puzzle-phantom:badges";

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; fine
  }
}

/** Auto-advance starts off: the original waits for a tap after every line. */
export function loadAutoAdvance() {
  return read(AUTO_KEY) === "on";
}

export function saveAutoAdvance(on: boolean) {
  write(AUTO_KEY, on ? "on" : "off");
}

/** Level ids solved without opening a hint. */
export function loadBadges(): Set<string> {
  try {
    const list = JSON.parse(read(BADGES_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Keeps a badge once earned, even if the level is later replayed with hints. */
export function addBadge(levelId: string) {
  const badges = loadBadges();
  badges.add(levelId);
  write(BADGES_KEY, JSON.stringify([...badges]));
}
