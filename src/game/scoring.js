import { GAME_BALANCE, getDifficultyPhase } from './balance.js';

export function createScoringSystem() {
  return {
    baseScoreGain(dt, elapsed) {
      const phase = getDifficultyPhase(elapsed);
      return dt * GAME_BALANCE.scorePerSecond * phase.intensity;
    },
    nearMissBonus(combo) {
      return GAME_BALANCE.nearMissBonus * Math.min(combo, GAME_BALANCE.comboMultiplierCap);
    },
  };
}
