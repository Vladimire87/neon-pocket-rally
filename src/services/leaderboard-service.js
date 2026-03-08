import { BOARD_SCOPES } from '../app/constants.js';

function normalizeEntries(entries = [], source = 'remote') {
  return entries
    .filter((entry) => entry && Number.isFinite(Number(entry.score)))
    .map((entry, index) => ({
      rank: index + 1,
      name: entry.name || 'Unknown driver',
      score: Number(entry.score) || 0,
      source,
      scope: entry.scope || BOARD_SCOPES.ALL_TIME,
      isCurrentUser: Boolean(entry.isCurrentUser),
    }));
}

export function createLeaderboardService({ apiClient, storage, config, logger }) {
  let remoteConfig = null;

  async function loadConfig() {
    if (remoteConfig) return remoteConfig;
    try {
      remoteConfig = await apiClient.getJson(config.configUrl);
      return remoteConfig;
    } catch (error) {
      logger?.warn?.('leaderboard_config_unavailable', error);
      remoteConfig = {};
      return remoteConfig;
    }
  }

  async function fetchBoard(scope = BOARD_SCOPES.ALL_TIME) {
    const cfg = await loadConfig();
    const fetchUrl = cfg.fetchUrl;
    if (!fetchUrl) {
      return {
        entries: [],
        modeLabel: 'local board · endpoint empty',
        remoteAvailable: false,
      };
    }

    const url = new URL(fetchUrl, window.location.href);
    url.searchParams.set('scope', scope);
    url.searchParams.set('limit', String(config.limit));

    try {
      const response = await apiClient.getJson(url.toString());
      const entries = normalizeEntries(response.entries || [], 'remote').map((entry) => ({ ...entry, scope }));
      storage.update((state) => {
        state.leaderboardCache[scope] = entries;
        state.leaderboardCache.fetchedAt = new Date().toISOString();
        state.leaderboardCache.modeLabel = 'cloud board online';
        return state;
      });
      return { entries, modeLabel: 'cloud board online', remoteAvailable: true };
    } catch (error) {
      logger?.warn?.('leaderboard_fetch_failed', { scope, error });
      const cached = storage.read().leaderboardCache?.[scope] || [];
      return {
        entries: cached,
        modeLabel: navigator.onLine ? 'local board · cloud offline' : 'offline · cached board',
        remoteAvailable: false,
      };
    }
  }

  function pushLocalEntry({ name, score }) {
    return storage.update((state) => {
      const localEntry = {
        name,
        score,
        source: 'local',
        scope: BOARD_SCOPES.ALL_TIME,
        at: new Date().toISOString(),
      };
      state.leaderboardCache[BOARD_SCOPES.ALL_TIME] = [...(state.leaderboardCache[BOARD_SCOPES.ALL_TIME] || []), localEntry]
        .sort((a, b) => b.score - a.score)
        .slice(0, config.limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
      return state;
    }).leaderboardCache[BOARD_SCOPES.ALL_TIME];
  }

  return {
    loadConfig,
    fetchBoard,
    pushLocalEntry,
  };
}
