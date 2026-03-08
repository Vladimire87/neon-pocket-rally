import { APP_CONFIG } from './config.js';
import { APP_STATES, BOARD_SCOPES } from './constants.js';
import { createStateMachine } from './state-machine.js';
import { createGameEngine } from '../game/game-engine.js';
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
    boardMode: document.getElementById('boardMode'),
    finalScoreValue: document.getElementById('finalScoreValue'),
    finalBestValue: document.getElementById('finalBestValue'),
    submitStatus: document.getElementById('submitStatus'),
    challengeBanner: document.getElementById('challengeBanner'),
    missionSlot: document.getElementById('missionSlot'),
    versionStamp: document.getElementById('versionStamp'),
    pauseReason: document.getElementById('pauseReason'),
    toast: document.getElementById('toast'),
  };

  const ctx = elements.canvas.getContext('2d');
  const hud = createHud(elements);
  const screens = createScreens(elements);
  const toast = createToast(elements.toast);
  const scoring = createScoringSystem();

  const engine = createGameEngine({
    canvas: elements.canvas,
    ctx,
    road: APP_CONFIG.road,
    scoring,
    onCrash(summary) {
      const best = Math.max(persisted.bests.local, summary.score);
      persisted = storage.update((state) => {
        state.bests.local = best;
        state.profile.lastSeenAt = new Date().toISOString();
        return state;
      });
      leaderboardService.pushLocalEntry({ name: persisted.profile.name, score: summary.score });
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
  });

  function render() {
    const view = engine.getViewModel();
    const best = storage.read().bests.local;
    hud.render({ ...view, best });
    screens.applyState(machine.getState());
    if (machine.getState() === APP_STATES.MENU) {
      const store = storage.read();
      screens.renderMenu({
        playerName: store.profile.name,
        best: store.bests.local,
        boardMode: store.leaderboardCache.modeLabel,
        leaderboardEntries: store.leaderboardCache[BOARD_SCOPES.ALL_TIME],
        challengeText: readChallengeText(),
        missionText: 'Daily mission: survive 45s and chain 2 near misses.',
        appVersion: APP_CONFIG.appVersion,
      });
      hud.hide();
    } else if (machine.getState() === APP_STATES.PLAYING) {
      screens.hideOverlays();
      hud.show();
    } else if (machine.getState() === APP_STATES.PAUSED) {
      screens.renderPause({ reason: 'Telegram/app backgrounded. Tap restart or resume.' });
      hud.hide();
    } else if ([APP_STATES.GAMEOVER, APP_STATES.SUBMIT_PENDING].includes(machine.getState())) {
      const submitted = Boolean(sessionRun.get()?.submitted);
      screens.renderGameOver({
        score: engine.getSummary().score,
        best,
        boardStatus: elements.submitStatus.textContent,
        submitted,
      });
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
    if (!challenge) return '';
    analytics.track('challenge_open', { challenge });
    return `Challenge loaded: beat target ${challenge.replace('challenge_', '')}.`;
  }

  async function refreshBoard() {
    const result = await leaderboardService.fetchBoard(BOARD_SCOPES.ALL_TIME);
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
    const run = await runService.start({ initData: telegram.getInitData(), appVersion: APP_CONFIG.appVersion });
    sessionRun.set(run);
    engine.reset();
    elements.submitStatus.textContent = 'Run active. Submit unlocks after crash.';
    machine.transition(APP_STATES.PLAYING);
    telegram.haptic('selectionChanged');
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

  function shareScore() {
    analytics.track('share_attempt', { score: storage.read().bests.local });
    const text = `Beat my Neon Pocket Rally best: ${storage.read().bests.local}.`;
    if (navigator.share) {
      navigator.share({ title: 'Neon Pocket Rally', text, url: window.location.href }).catch(() => {});
      return;
    }
    telegram.showPopup({ title: 'Share challenge', message: text, buttons: [{ type: 'ok' }] });
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
