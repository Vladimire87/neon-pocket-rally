export function createSessionRun() {
  let current = null;

  return {
    set(run) {
      current = { ...run, submitted: false, submitAttempts: 0 };
      return current;
    },
    replaceIfCurrent(expectedRunId, nextRun) {
      if (!current || current.runId !== expectedRunId || current.submitted) return current;
      current = {
        ...current,
        ...nextRun,
        submitted: current.submitted,
        submitAttempts: current.submitAttempts,
      };
      return current;
    },
    get() {
      return current;
    },
    markSubmitAttempt() {
      if (!current) return null;
      current.submitAttempts += 1;
      return current.submitAttempts;
    },
    markSubmitted() {
      if (!current) return;
      current.submitted = true;
    },
    reset() {
      current = null;
    },
  };
}
