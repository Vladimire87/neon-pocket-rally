import { DEFAULT_STORAGE_STATE, STORAGE_KEY, STORAGE_SCHEMA_VERSION } from '../app/config.js';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, incoming) {
  if (!isObject(base) || !isObject(incoming)) return incoming ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    result[key] = isObject(value) && isObject(base[key]) ? mergeDeep(base[key], value) : value;
  }
  return result;
}

function migrateState(raw) {
  if (!isObject(raw)) return { ...DEFAULT_STORAGE_STATE };

  const legacyBest = Number(raw.localBest || 0);
  const legacyBoard = Array.isArray(raw.leaderboard) ? raw.leaderboard : [];

  const migrated = mergeDeep(DEFAULT_STORAGE_STATE, {
    ...raw,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    bests: {
      local: Number(raw?.bests?.local ?? legacyBest) || 0,
      daily: Number(raw?.bests?.daily ?? 0) || 0,
    },
    leaderboardCache: {
      ...DEFAULT_STORAGE_STATE.leaderboardCache,
      ...(raw.leaderboardCache || {}),
      all_time: raw?.leaderboardCache?.all_time || legacyBoard,
    },
  });

  return migrated;
}

export function createStorage({ logger }) {
  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return migrateState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      logger?.warn?.('storage_read_failed', error);
      const fallback = { ...DEFAULT_STORAGE_STATE };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
  }

  function write(state) {
    const nextState = migrateState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return nextState;
  }

  return {
    read,
    write,
    update(mutator) {
      const current = read();
      const nextState = mutator(structuredClone(current));
      return write(nextState);
    },
  };
}
