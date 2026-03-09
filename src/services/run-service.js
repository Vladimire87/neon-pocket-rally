export function createRunService({ apiClient, leaderboardService, config, analytics, logger }) {
  let runSequence = 0;

  function createLocalRun() {
    runSequence += 1;
    const localRunId = `local-${Date.now()}-${runSequence}`;
    return {
      runId: localRunId,
      runToken: `guest-${localRunId}`,
      source: 'local',
      startedAt: Date.now(),
      expiresInMs: config.runExpiryMs,
    };
  }

  async function start({ initData, appVersion, fallbackRun = createLocalRun() }) {
    const remoteConfig = await leaderboardService.loadConfig();

    const startUrl = remoteConfig.startUrl || remoteConfig.runStartUrl;
    if (!startUrl) {
      return fallbackRun;
    }

    try {
      const response = await apiClient.postJson(startUrl, { initData, appVersion });
      analytics.track('run_token_acquired', { source: 'remote' });
      return { ...response, source: 'remote', startedAt: Date.now() };
    } catch (error) {
      logger?.warn?.('run_start_remote_failed', error);
      analytics.track('run_token_fallback', { source: 'local' });
      return fallbackRun;
    }
  }

  async function finish({ initData, run, summary, appVersion }) {
    const remoteConfig = await leaderboardService.loadConfig();
    const finishUrl = remoteConfig.finishUrl || remoteConfig.submitUrl;
    if (!finishUrl) {
      return {
        accepted: false,
        fallback: true,
        approvedScore: summary.score,
      };
    }

    return apiClient.postJson(finishUrl, {
      initData,
      runId: run.runId,
      runToken: run.runToken,
      appVersion,
      ...summary,
    });
  }

  return {
    createLocalRun,
    start,
    finish,
  };
}
