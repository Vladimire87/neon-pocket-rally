import { formatScore } from '../utils/format.js';

export function createHud(elements) {
  return {
    show() {
      elements.hud.classList.remove('hidden');
    },
    hide() {
      elements.hud.classList.add('hidden');
    },
    render({ score, best, speed, phaseLabel, combo }) {
      elements.scoreValue.textContent = formatScore(score);
      elements.bestValue.textContent = formatScore(best);
      elements.speedValue.textContent = `${speed.toFixed(1)}x`;
      if (elements.phaseValue) elements.phaseValue.textContent = phaseLabel;
      if (elements.comboValue) elements.comboValue.textContent = combo > 1 ? `x${combo}` : '—';
    },
  };
}
