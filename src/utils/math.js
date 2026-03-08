export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

export function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}
