export function createAnalytics({ appVersion, enabled = true, logger }) {
  const events = [];

  function track(event, payload = {}) {
    if (!enabled) return;
    const entry = {
      event,
      timestamp: new Date().toISOString(),
      appVersion,
      ...payload,
    };
    events.push(entry);
    logger?.info?.(`analytics:${event}`, entry);
  }

  return {
    track,
    getEvents() {
      return [...events];
    },
  };
}
