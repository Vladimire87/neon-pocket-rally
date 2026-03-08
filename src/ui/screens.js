import { APP_STATES } from '../app/constants.js';
import { formatScore } from '../utils/format.js';
import { renderLeaderboard } from './leaderboard-view.js';

export function createScreens(elements) {
  function showOnly(target) {
    [elements.startScreen, elements.gameOverScreen, elements.pauseScreen].forEach((element) => {
      if (!element) return;
      if (element === target) {
        element.classList.remove('hidden');
        element.classList.add('visible');
      } else {
        element.classList.add('hidden');
        element.classList.remove('visible');
      }
    });
  }

  return {
    renderMenu({ playerName, best, boardMode, leaderboardEntries, challengeText, missionText, appVersion }) {
      elements.playerName.textContent = playerName;
      elements.startBestValue.textContent = formatScore(best);
      elements.boardMode.textContent = boardMode;
      elements.challengeBanner.textContent = challengeText || 'Open from Telegram for challenge links and cloud boards.';
      elements.missionSlot.textContent = missionText || 'Daily mission: survive 45s without a crash.';
      elements.versionStamp.textContent = `v${appVersion}`;
      renderLeaderboard(elements.leaderboardList, leaderboardEntries);
      showOnly(elements.startScreen);
    },
    renderGameOver({ score, best, boardStatus, submitted }) {
      elements.finalScoreValue.textContent = formatScore(score);
      elements.finalBestValue.textContent = formatScore(best);
      elements.submitStatus.textContent = boardStatus || (submitted ? 'Score submitted.' : 'Ready to submit score.');
      showOnly(elements.gameOverScreen);
    },
    renderPause({ reason }) {
      if (elements.pauseReason) elements.pauseReason.textContent = reason || 'Game paused';
      showOnly(elements.pauseScreen);
    },
    hideOverlays() {
      showOnly(null);
    },
    applyState(state) {
      if (state === APP_STATES.MENU) showOnly(elements.startScreen);
      if (state === APP_STATES.GAMEOVER || state === APP_STATES.SUBMIT_PENDING) showOnly(elements.gameOverScreen);
      if (state === APP_STATES.PAUSED) showOnly(elements.pauseScreen);
      if (state === APP_STATES.PLAYING) showOnly(null);
    },
  };
}
