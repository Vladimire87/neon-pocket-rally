import { APP_CONFIG } from './config.js';
import { APP_STATES, BOARD_SCOPES } from './constants.js';
import {
  buildChallengeContext,
  evaluateChallenge,
  evaluateMission,
  formatChallengeText,
  getDailyMission,
  getFirstRunMessage,
} from './product-layer.js';
import { createStateMachine } from './state-machine.js';
import { createGameEngine } from '../game/game-engine.js';
import { getDifficultyPhase } from '../game/balance.js';
import { createScoringSystem } from '../game/scoring.js';
import { createSessionRun } from '../game/session-run.js';
import { createHud } from '../ui/hud.js';
import { createScreens } from '../ui/screens.js';
import { createToast } from '../ui/toast.js';
import { createLogger } from '../services/logger.js';
import { createAnalytics } from '../services/analytics.js';
import { createStorage } from '../services/storage.js';
import { createApiClient } from '../services/api-client.js';
import { createLeaderboardService } from '../services/leaderboard-service.js';
import { createRunService } from '../services/run-service.js';
import { createTelegramApp } from '../telegram/telegram-app.js';
import { formatDurationMs } from '../utils/format.js';

export async function bootstrap() {
  const logger = createLogger('npr');
  const telegram = createTelegramApp();
  telegram.init();

  const storage = createStorage({ logger });
  let persisted = storage.read();
  const analytics = createAnalytics({
    appVersion: APP_CONFIG.appVersion,
    enabled: persisted.settings.analyticsEnabled,
    logger,
  });
  const apiClient = createApiClient({ timeoutMs: APP_CONFIG.leaderboard.requestTimeoutMs });
  const leaderboardService = createLeaderboardService({
    apiClient,
    storage,
    config: APP_CONFIG.leaderboard,
    logger,
  });
  const runService = createRunService({
    apiClient,
    leaderboardService,
    config: APP_CONFIG.run,
    analytics,
    logger,
  });
  const sessionRun = createSessionRun();
  let currentBoardScope = BOARD_SCOPES.ALL_TIME;
  let currentChallenge = null;

  const machine = createStateMachine(APP_STATES.BOOT, {
    [APP_STATES.BOOT]: [APP_STATES.MENU, APP_STATES.ERROR],
    [APP_STATES.MENU]: [APP_STATES.PLAYING, APP_STATES.OFFLINE, APP_STATES.ERROR],
    [APP_STATES.PLAYING]: [APP_STATES.GAMEOVER, APP_STATES.PAUSED, APP_STATES.ERROR],
    [APP_STATES.PAUSED]: [APP_STATES.PLAYING, APP_STATES.MENU, APP_STATES.GAMEOVER],
    [APP_STATES.GAMEOVER]: [APP_STATES.PLAYING, APP_STATES.SUBMIT_PENDING, APP_STATES.MENU],
    [APP_STATES.SUBMIT_PENDING]: [APP_STATES.GAMEOVER, APP_STATES.ERROR],
    [APP_STATES.OFFLINE]: [APP_STATES.MENU, APP_STATES.PLAYING],
    [APP_STATES.ERROR]: [APP_STATES.MENU],
  });

  const elements = {
    canvas: document.getElementById('gameCanvas'),
    hud: document.getElementById('hud'),
    scoreValue: document.getElementById('scoreValue'),
    bestValue: document.getElementById('bestValue'),
    speedValue: document.getElementById('speedValue'),
    phaseValue: document.getElementById('phaseValue'),
    comboValue: document.getElementById('comboValue'),
    startScreen: document.getElementById('startScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    pauseScreen: document.getElementById('pauseScreen'),
    startBestValue: document.getElementById('startBestValue'),
    playerName: document.getElementById('playerName'),
    leaderboardList: document.getElementById('leaderboardList'),
    boardTabAllTime: document.getElementById('boardTabAllTime'),
    boardTabDaily: document.getElementById('boardTabDaily'),
    boardMode: document.getElementById('boardMode'),
    finalScoreValue: document.getElementById('finalScoreValue'),
    finalBestValue: document.getElementById('finalBestValue'),
    submitStatus: document.getElementById('submitStatus'),
    challengeBanner: document.getElementById('challengeBanner'),
    missionSlot: document.getElementById('missionSlot'),
    missionProgress: document.getElementById('missionProgress'),
    versionStamp: document.getElementById('versionStamp'),
    boardUpdatedAt: document.getElementById('boardUpdatedAt'),
    heroBadge: document.getElementById('heroBadge'),
    heroSubtitle: document.getElementById('heroSubtitle'),
    pauseReason: document.getElementById('pauseReason'),
    gameOverSubtitle: document.getElementById('gameOverSubtitle'),
    runSummaryValue: document.getElementById('runSummaryValue'),
    paceSummary: document.getElementById('paceSummary'),
    missionResult: document.getElementById('missionResult'),
    challengeResult: document.getElementById('challengeResult'),
    toast: document.getElementById('toast'),
    startButton: document.getElementById('startButton'),
    shareButton: document.getElementById('shareButton'),
    shareButtonGameOver: document.getElementById('shareButtonGameOver'),
    backToMenuButton: document.getElementById('backToMenuButton'),
    submitScoreButton: document.getElementById('submitScoreButton'),
  };

  const ctx = elements.canvas.getContext('2d');
  const hud = createHud(elements);
  const screens = createScreens(elements);
  const toast = createToast(elements.toast);
  const scoring = createScoringSystem();

  function renderLiveHud(view = engine.getViewModel()) {
    if (machine.getState() !== APP_STATES.PLAYING) return;
    const best = storage.read().bests.local;
    hud.render({ ...view, best });
  }

  function isSameUtcDay(left, right) {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  function getStoredRuns(store = storage.read()) {
    return Array.isArray(store.runs) ? store.runs : [];
  }

  function getDailyMissionProgress(store = storage.read()) {
    const mission = getDailyMission();
    const today = new Date();
    const todayRuns = getStoredRuns(store)
      .filter((run) => run?.at && isSameUtcDay(new Date(run.at), today))
      .map((run) => evaluateMission(run.summary, today));

    if (!todayRuns.length) {
      return {
        missionText: mission.title,
        progressText: 'No attempt yet today.',
        completed: false,
      };
    }

    const bestAttempt = todayRuns
      .sort((left, right) => Number(right.completed) - Number(left.completed) || right.progress - left.progress)[0];

    return {
      missionText: mission.title,
      progressText: bestAttempt.completed ? `Completed today · ${bestAttempt.progressLabel}` : `Progress · ${bestAttempt.progressLabel}`,
      completed: bestAttempt.completed,
    };
  }

  function buildLocalEntries(store, scope) {
    const now = new Date();
    const runs = getStoredRuns(store)
      .filter((run) => run?.summary?.score >= 0)
      .filter((run) => scope !== BOARD_SCOPES.DAILY || (run.at && isSameUtcDay(new Date(run.at), now)))
      .sort((left, right) => right.summary.score - left.summary.score)
      .slice(0, APP_CONFIG.leaderboard.limit)
      .map((run, index) => ({
        rank: index + 1,
        name: store.profile.name || 'Guest Driver',
        score: run.summary.score,
        source: 'local',
        label: scope === BOARD_SCOPES.DAILY ? `Today · ${formatDurationMs(run.summary.durationMs)}` : `Run · ${new Date(run.at).toLocaleDateString()}`,
        isCurrentUser: true,
      }));

    if (runs.length) return runs;

    if (scope === BOARD_SCOPES.ALL_TIME && store.bests.local > 0) {
      return [
        {
          rank: 1,
          name: store.profile.name || 'Guest Driver',
          score: store.bests.local,
          source: 'local',
          label: 'Your best',
          isCurrentUser: true,
        },
      ];
    }

    return [];
  }

  function buildVisibleBoard(store, scope = currentBoardScope) {
    const remoteEntries = Array.isArray(store.leaderboardCache?.[scope]) ? store.leaderboardCache[scope] : [];
    if (remoteEntries.length) {
      return remoteEntries.map((entry) => ({
        ...entry,
        label: entry.label || (entry.source === 'remote' ? (scope === BOARD_SCOPES.DAILY ? 'Cloud today' : 'Cloud board') : 'Local run'),
      }));
    }

    return buildLocalEntries(store, scope);
  }

  function boardUpdatedText(store) {
    if (!store.leaderboardCache?.fetchedAt) return 'Board ready for local play.';
    return `Updated ${new Date(store.leaderboardCache.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  const engine = createGameEngine({
    canvas: elements.canvas,
    ctx,
    road: APP_CONFIG.road,
    scoring,
    onCrash(summary) {
      const best = Math.max(persisted.bests.local, summary.score);
      persisted = storage.update((state) => {
        state.bests.local = best;
        state.bests.daily = Math.max(state.bests.daily || 0, summary.score);
        state.profile.lastSeenAt = new Date().toISOString();
        state.runs = [
          {
            at: new Date().toISOString(),
            summary,
          },
          ...(Array.isArray(state.runs) ? state.runs : []),
        ].slice(0, 24);
        return state;
      });
      analytics.track('run_crash', {
        telegram: telegram.isAvailable,
        score: summary.score,
        duration: summary.durationMs,
      });
      telegram.haptic('error');
      machine.transition(APP_STATES.GAMEOVER);
      render();
    },
    onNearMiss({ combo, bonus }) {
      toast.show(combo > 2 ? `COMBO x${combo} +${bonus}` : `NEAR MISS +${bonus}`, 'success');
      telegram.haptic('impact');
    },
    onMilestone({ elapsed, phase }) {
      if (elapsed % 15 === 0) toast.show(`${phase.label.toUpperCase()} · ${elapsed}s`, 'info', 1000);
    },
    onFrame(view) {
      renderLiveHud(view);
    },
  });

  function render() {
    const view = engine.getViewModel();
    const best = storage.read().bests.local;
    hud.render({ ...view, best });
    screens.applyState(machine.getState());
    if (machine.getState() === APP_STATES.MENU) {
      const store = storage.read();
      const mission = getDailyMissionProgress(store);
      const boardEntries = buildVisibleBoard(store).slice(0, window.innerWidth <= 430 ? 4 : APP_CONFIG.leaderboard.limit);
      const hasRuns = getStoredRuns(store).length > 0 || store.bests.local > 0;
      screens.renderMenu({
        playerName: store.profile.name,
        best: store.bests.local,
        boardMode: `${currentBoardScope === BOARD_SCOPES.DAILY ? 'today' : 'all-time'} · ${store.leaderboardCache.modeLabel}`,
        leaderboardEntries: boardEntries,
        challengeText: formatChallengeText(currentChallenge, store.profile.name),
        missionText: mission.missionText,
        missionProgressText: mission.progressText,
        appVersion: APP_CONFIG.appVersion,
        heroBadge: getFirstRunMessage(hasRuns),
        heroSubtitle: currentChallenge
          ? `Challenge target: ${currentChallenge.targetScore}. Beat it, then send the rematch.`
          : 'Fast Telegram score attack. Dodge traffic, take near misses, restart instantly.',
        boardUpdatedAt: boardUpdatedText(store),
        activeBoardScope: currentBoardScope,
      });
      elements.startButton.textContent = hasRuns ? 'Start' : 'Start first run';
      elements.shareButton.textContent = currentChallenge ? 'Rematch' : 'Challenge';
      hud.hide();
    } else if (machine.getState() === APP_STATES.PLAYING) {
      screens.hideOverlays();
      hud.show();
      renderLiveHud(view);
    } else if (machine.getState() === APP_STATES.PAUSED) {
      screens.renderPause({ reason: 'Telegram/app backgrounded. Tap restart or resume.' });
      hud.hide();
    } else if ([APP_STATES.GAMEOVER, APP_STATES.SUBMIT_PENDING].includes(machine.getState())) {
      const submitted = Boolean(sessionRun.get()?.submitted);
      const isSubmitPending = machine.getState() === APP_STATES.SUBMIT_PENDING;
      const summary = engine.getSummary();
      const missionState = evaluateMission(summary);
      const challengeState = evaluateChallenge(summary, currentChallenge);
      const phase = getDifficultyPhase(summary.durationMs / 1000);
      screens.renderGameOver({
        score: summary.score,
        best,
        boardStatus: elements.submitStatus.textContent,
        submitted,
        summaryText: `${formatDurationMs(summary.durationMs)} · ${summary.nearMissCount} near misses`,
        paceText: `${phase.label} · avg speed x${summary.averageSpeedBucket}`,
        missionResult: missionState.completed ? `Mission cleared · ${missionState.progressLabel}` : `Mission progress · ${missionState.progressLabel}`,
        challengeResult: challengeState.headline,
        subtitle:
          summary.score >= best && summary.score > 0
            ? 'New best pace logged. Lock it in, then throw the challenge back.'
            : 'Restart is instant. Tighten the line and take another shot.',
      });
      elements.shareButtonGameOver.textContent = currentChallenge && challengeState.cleared ? 'Share victory' : 'Challenge friend';
      elements.submitScoreButton.textContent = submitted ? 'Score sent' : 'Submit score';
      elements.submitScoreButton.disabled = submitted || isSubmitPending;
      elements.shareButtonGameOver.disabled = isSubmitPending;
      elements.backToMenuButton.disabled = isSubmitPending;
      hud.hide();
    }

    syncTelegramButtons();
  }

  function syncTelegramButtons() {
    const state = machine.getState();
    if (!telegram.isAvailable) return;

    if (state === APP_STATES.MENU) {
      telegram.setMainButton({ text: 'Start run', visible: true, active: true, onClick: startRun });
      telegram.setBackButton({ visible: false });
      return;
    }
    if (state === APP_STATES.GAMEOVER) {
      const submitted = Boolean(sessionRun.get()?.submitted);
      telegram.setMainButton({
        text: submitted ? 'Play again' : 'Submit score',
        visible: true,
        active: true,
        onClick: submitted ? startRun : submitScore,
      });
      telegram.setBackButton({ visible: false });
      return;
    }
    if (state === APP_STATES.SUBMIT_PENDING) {
      telegram.setMainButton({ text: 'Submitting…', visible: true, active: false });
      telegram.setBackButton({ visible: false });
      return;
    }
    telegram.setMainButton({ visible: false });
    telegram.setBackButton({ visible: false });
  }

  async function hydrateProfile() {
    const user = telegram.getUser();
    persisted = storage.update((state) => {
      state.profile.name = user?.first_name || state.profile.name || 'Guest Driver';
      state.profile.telegramId = user?.id || null;
      return state;
    });
    document.documentElement.style.setProperty('--tg-bg', telegram.getTheme().bg_color || '#0f1620');
    document.documentElement.style.setProperty('--app-height', `${telegram.viewportHeight()}px`);
  }

  function readChallengeText() {
    const params = new URLSearchParams(window.location.search);
    const challenge = params.get('challenge') || params.get('startapp');
    currentChallenge = buildChallengeContext(challenge);
    if (!currentChallenge) return '';
    analytics.track('challenge_open', { challenge });
    return currentChallenge.raw;
  }

  async function refreshBoard() {
    const responses = await Promise.all(APP_CONFIG.leaderboard.scopes.map((scope) => leaderboardService.fetchBoard(scope)));
    const result = responses.find((entry) => entry.remoteAvailable) || responses[0];
    persisted = storage.read();
    persisted = storage.update((state) => {
      state.leaderboardCache.modeLabel = result.modeLabel;
      if (!navigator.onLine) state.profile.lastSeenAt = new Date().toISOString();
      return state;
    });
    return result;
  }

  async function startRun() {
    analytics.track('run_start', { telegram: telegram.isAvailable, deviceBucket: window.innerWidth < 430 ? 'mobile' : 'desktop' });
    const localRun = runService.createLocalRun();
    sessionRun.set(localRun);
    engine.reset();
    elements.submitStatus.textContent = 'Run active. Submit unlocks after crash.';
    machine.transition(APP_STATES.PLAYING);
    telegram.haptic('selectionChanged');
    toast.show('Run live', 'info', 700);
    render();

    runService
      .start({ initData: telegram.getInitData(), appVersion: APP_CONFIG.appVersion, fallbackRun: localRun })
      .then((run) => {
        sessionRun.replaceIfCurrent(localRun.runId, run);
      })
      .catch((error) => {
        logger.warn('run_start_background_failed', error);
      });
  }

  function openMenu() {
    machine.transition(APP_STATES.MENU);
    render();
  }

  async function submitScore() {
    const run = sessionRun.get();
    if (!run || run.submitted) {
      toast.show('This run is already closed.', 'warning');
      return;
    }

    machine.transition(APP_STATES.SUBMIT_PENDING);
    elements.submitStatus.textContent = 'Submitting score…';
    render();
    analytics.track('score_submit_attempt', { score: engine.getSummary().score });
    sessionRun.markSubmitAttempt();

    try {
      const response = await runService.finish({
        initData: telegram.getInitData(),
        run,
        summary: engine.getSummary(),
        appVersion: APP_CONFIG.appVersion,
      });
      sessionRun.markSubmitted();
      telegram.sendData({ type: 'score_submit', score: engine.getSummary().score, accepted: Boolean(response.accepted) });
      elements.submitStatus.textContent = response.accepted
        ? `Score accepted${response.rank ? ` · rank #${response.rank}` : ''}`
        : 'Saved locally. Backend not ready.';
      analytics.track(response.accepted ? 'score_submit_success' : 'score_submit_fail', {
        score: engine.getSummary().score,
        fallback: Boolean(response.fallback),
      });
      telegram.haptic(response.accepted ? 'success' : 'warning');
      machine.transition(APP_STATES.GAMEOVER);
    } catch (error) {
      logger.error('submit_failed', error);
      elements.submitStatus.textContent = 'Submit failed. Score kept locally.';
      analytics.track('score_submit_fail', { score: engine.getSummary().score, fallback: true });
      machine.transition(APP_STATES.GAMEOVER);
      telegram.haptic('warning');
    }

    render();
  }

  async function shareScore() {
    const summaryScore = machine.getState() === APP_STATES.GAMEOVER ? engine.getSummary().score : storage.read().bests.local;
    const targetScore = Math.max(summaryScore, currentChallenge?.targetScore || 0, 100);
    const url = new URL(window.location.href);
    url.searchParams.set('challenge', String(targetScore));
    analytics.track('share_attempt', { score: targetScore });
    const text = `Beat my Neon Pocket Rally score: ${targetScore}.`;
    if (navigator.share) {
      navigator.share({ title: 'Neon Pocket Rally', text, url: url.toString() }).catch(() => {});
      return;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(`${text} ${url.toString()}`);
        toast.show('Challenge link copied.', 'success');
        return;
      } catch {
        logger.warn('clipboard_share_failed');
      }
    }
    telegram.showPopup({ title: 'Share challenge', message: `${text} ${url.toString()}`, buttons: [{ type: 'ok' }] });
  }

  function bindSteering(button, direction) {
    const onDown = (event) => {
      event.preventDefault();
      engine.setInput(direction, true);
      if (machine.getState() !== APP_STATES.PLAYING) startRun();
      engine.nudgeLane(direction);
    };
    const onUp = (event) => {
      event.preventDefault();
      engine.setInput(direction, false);
    };
    button.addEventListener('pointerdown', onDown);
    button.addEventListener('pointerup', onUp);
    button.addEventListener('pointercancel', onUp);
    button.addEventListener('pointerleave', onUp);
  }

  bindSteering(document.getElementById('touchLeft'), 'left');
  bindSteering(document.getElementById('touchRight'), 'right');
  document.getElementById('touchBoost').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (machine.getState() !== APP_STATES.PLAYING) startRun();
  });
  document.getElementById('startButton').addEventListener('click', startRun);
  document.getElementById('restartButton').addEventListener('click', startRun);
  document.getElementById('restartButtonPaused').addEventListener('click', startRun);
  document.getElementById('submitScoreButton').addEventListener('click', submitScore);
  document.getElementById('shareButton').addEventListener('click', shareScore);
  document.getElementById('shareButtonGameOver').addEventListener('click', shareScore);
  document.getElementById('backToMenuButton').addEventListener('click', openMenu);
  elements.boardTabAllTime.addEventListener('click', () => {
    currentBoardScope = BOARD_SCOPES.ALL_TIME;
    render();
  });
  elements.boardTabDaily.addEventListener('click', () => {
    currentBoardScope = BOARD_SCOPES.DAILY;
    render();
  });
  document.getElementById('resumeButton').addEventListener('click', () => {
    engine.resume();
    machine.transition(APP_STATES.PLAYING);
    render();
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (['ArrowLeft', 'a', 'A'].includes(event.key)) {
      engine.setInput('left', true);
      if (machine.getState() !== APP_STATES.PLAYING) startRun();
      engine.nudgeLane('left');
    }
    if (['ArrowRight', 'd', 'D'].includes(event.key)) {
      engine.setInput('right', true);
      if (machine.getState() !== APP_STATES.PLAYING) startRun();
      engine.nudgeLane('right');
    }
    if ([' ', 'Enter'].includes(event.key) && machine.getState() !== APP_STATES.PLAYING) startRun();
    if (event.key.toLowerCase() === 'p' && machine.getState() === APP_STATES.PLAYING) {
      engine.pause();
      machine.transition(APP_STATES.PAUSED);
      render();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'a', 'A'].includes(event.key)) engine.setInput('left', false);
    if (['ArrowRight', 'd', 'D'].includes(event.key)) engine.setInput('right', false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && machine.getState() === APP_STATES.PLAYING) {
      engine.pause();
      machine.transition(APP_STATES.PAUSED);
      render();
    }
  });

  window.addEventListener('online', async () => {
    toast.show('Back online. Refreshing board.', 'info');
    await refreshBoard();
    render();
  });

  window.addEventListener('offline', () => {
    toast.show('Offline mode. Local runs still work.', 'warning');
    render();
  });

  analytics.track('app_open', { telegram: telegram.isAvailable, deviceBucket: window.innerWidth < 430 ? 'mobile' : 'desktop' });
  analytics.track('telegram_context_detected', { telegram: telegram.isAvailable });
  await hydrateProfile();
  readChallengeText();
  await refreshBoard();
  machine.transition(APP_STATES.MENU);
  render();
  requestAnimationFrame((timestamp) => {
    engine.state.lastTime = timestamp;
    requestAnimationFrame(engine.tick);
  });

  window.__NPR = {
    machine,
    analytics,
    storage,
    engine,
    sessionRun,
    startRun,
    submitScore,
  };
}
