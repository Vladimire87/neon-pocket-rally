import { APP_VERSION } from './version.js';
import { BOARD_SCOPES } from './constants.js';

export const STORAGE_SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'neon-pocket-rally-state';

export const DEFAULT_STORAGE_STATE = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  profile: {
    name: 'Guest Driver',
    telegramId: null,
    lastSeenAt: null,
  },
  settings: {
    analyticsEnabled: true,
  },
  bests: {
    local: 0,
    daily: 0,
  },
  leaderboardCache: {
    [BOARD_SCOPES.ALL_TIME]: [],
    [BOARD_SCOPES.DAILY]: [],
    fetchedAt: null,
    modeLabel: 'local board',
  },
  runs: [],
};

export const APP_CONFIG = {
  appVersion: APP_VERSION,
  canvas: {
    width: 420,
    height: 740,
  },
  road: {
    horizonY: 126,
    baseY: 750,
    widthTop: 126,
    widthBottom: 318,
    shoulderTop: 16,
    shoulderBottom: 34,
    lanePadding: 28,
    lanePositions: [0.2, 0.5, 0.8],
  },
  leaderboard: {
    limit: 8,
    configUrl: './public/leaderboard-config.json',
    scopes: [BOARD_SCOPES.ALL_TIME, BOARD_SCOPES.DAILY],
    requestTimeoutMs: 4000,
  },
  run: {
    submitRetryLimit: 1,
    runExpiryMs: 5 * 60 * 1000,
  },
  share: {
    challengeFallbackBaseUrl: 'https://t.me/',
  },
};
