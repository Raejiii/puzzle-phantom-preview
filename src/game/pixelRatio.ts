/** Device pixels per CSS pixel, never below 1. The canvas is sized with this, so layout in CSS pixels uses it too. */
export function getPixelRatio() {
  return Math.max(1, window.devicePixelRatio || 1);
}
