import { clamp } from '../utils/math.js';

export const GAME_BALANCE = {
  baseSpeed: 190,
  speedGrowthPerSecond: 5.6,
  scorePerSecond: 18,
  spawnInterval: {
    phase1: { min: 1.06, max: 1.42 },
    phase2: { min: 0.84, max: 1.12 },
    phase3: { min: 0.62, max: 0.9 },
  },
  nearMissWindowPx: 72,
  nearMissBonus: 60,
  comboWindowSec: 2.8,
  comboMultiplierCap: 4,
  collision: {
    widthFactor: 0.24,
    heightFactor: 0.27,
  },
  particles: {
    crashCount: 22,
    maxActive: 80,
  },
};

export function getDifficultyPhase(elapsed) {
  if (elapsed < 18) return { name: 'onboarding', label: 'phase 1', intensity: 1 };
  if (elapsed < 42) return { name: 'pressure', label: 'phase 2', intensity: 1.35 };
  return { name: 'panic', label: 'phase 3', intensity: 1.75 };
}

export function nextSpawnInterval(elapsed) {
  const phase = getDifficultyPhase(elapsed).name;
  const range = GAME_BALANCE.spawnInterval[phase];
  const ramp = clamp(elapsed / 75, 0, 1);
  return clamp(range.max - (range.max - range.min) * ramp, range.min, range.max);
}
