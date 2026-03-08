export function createLogger(scope) {
  return {
    info(message, meta) {
      console.info(`[${scope}] ${message}`, meta || '');
    },
    warn(message, meta) {
      console.warn(`[${scope}] ${message}`, meta || '');
    },
    error(message, meta) {
      console.error(`[${scope}] ${message}`, meta || '');
    },
  };
}
