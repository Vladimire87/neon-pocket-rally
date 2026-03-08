export function createStateMachine(initialState, transitions = {}) {
  let state = initialState;
  const listeners = new Set();

  function canTransition(nextState) {
    const allowed = transitions[state];
    return !allowed || allowed.includes(nextState);
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    transition(nextState, payload = {}) {
      if (state === nextState) {
        listeners.forEach((listener) => listener({ from: state, to: nextState, payload, repeated: true }));
        return true;
      }

      if (!canTransition(nextState)) {
        throw new Error(`Invalid state transition: ${state} -> ${nextState}`);
      }

      const previous = state;
      state = nextState;
      listeners.forEach((listener) => listener({ from: previous, to: nextState, payload, repeated: false }));
      return true;
    },
  };
}
