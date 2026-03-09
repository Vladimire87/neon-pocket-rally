import { APP_STATES } from '../app/constants.js';
import { formatDurationMs, formatScore } from '../utils/format.js';
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
    renderMenu({
      playerName,
      best,
      boardMode,
      leaderboardEntries,
      challengeText,
      missionText,
      missionProgressText,
      appVersion,
      heroBadge,
      heroSubtitle,
      boardUpdatedAt,
      activeBoardScope,
    }) {
      elements.playerName.textContent = playerName;
      elements.startBestValue.textContent = formatScore(best);
      elements.boardMode.textContent = boardMode;
      elements.challengeBanner.textContent = challengeText || 'Open from Telegram for challenge links and cloud boards.';
      elements.missionSlot.textContent = missionText || 'Daily mission: survive 45s without a crash.';
      if (elements.missionProgress) elements.missionProgress.textContent = missionProgressText || 'Fresh mission every day.';
      elements.versionStamp.textContent = `v${appVersion}`;
      if (elements.heroBadge) elements.heroBadge.textContent = heroBadge || 'Telegram rally build';
      if (elements.heroSubtitle) elements.heroSubtitle.textContent = heroSubtitle || 'Fast Telegram score attack.';
      if (elements.boardUpdatedAt) elements.boardUpdatedAt.textContent = boardUpdatedAt || 'Board ready.';
      if (elements.boardTabAllTime) elements.boardTabAllTime.classList.toggle('is-active', activeBoardScope !== 'daily');
      if (elements.boardTabDaily) elements.boardTabDaily.classList.toggle('is-active', activeBoardScope === 'daily');
      renderLeaderboard(elements.leaderboardList, leaderboardEntries);
      showOnly(elements.startScreen);
    },
    renderGameOver({ score, best, boardStatus, submitted, summaryText, paceText, missionResult, challengeResult, subtitle }) {
      elements.finalScoreValue.textContent = formatScore(score);
      elements.finalBestValue.textContent = formatScore(best);
      elements.submitStatus.textContent = boardStatus || (submitted ? 'Score submitted.' : 'Ready to submit score.');
      if (elements.runSummaryValue) elements.runSummaryValue.textContent = summaryText || `${formatDurationMs(0)} · 0 near misses`;
      if (elements.paceSummary) elements.paceSummary.textContent = paceText || 'Phase 1';
      if (elements.missionResult) elements.missionResult.textContent = missionResult || 'Mission waiting';
      if (elements.challengeResult) elements.challengeResult.textContent = challengeResult || 'Share a score target to challenge a friend.';
      if (elements.gameOverSubtitle) elements.gameOverSubtitle.textContent = subtitle || 'You pushed too hard into the traffic stream.';
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
