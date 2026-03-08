export function createTelegramApp() {
  const tg = window.Telegram?.WebApp || null;

  function safeCall(method, ...args) {
    try {
      return method?.(...args);
    } catch {
      return null;
    }
  }

  function init() {
    if (!tg) return;
    safeCall(tg.ready?.bind(tg));
    safeCall(tg.expand?.bind(tg));
    safeCall(tg.enableClosingConfirmation?.bind(tg));
  }

  function setMainButton({ text, visible = true, active = true, onClick } = {}) {
    if (!tg?.MainButton) return;
    tg.MainButton.offClick?.(setMainButton._handler);
    setMainButton._handler = onClick;
    if (text) tg.MainButton.setText(text);
    active ? tg.MainButton.enable() : tg.MainButton.disable();
    visible ? tg.MainButton.show() : tg.MainButton.hide();
    if (onClick) tg.MainButton.onClick(onClick);
  }

  function setBackButton({ visible = false, onClick } = {}) {
    if (!tg?.BackButton) return;
    tg.BackButton.offClick?.(setBackButton._handler);
    setBackButton._handler = onClick;
    visible ? tg.BackButton.show() : tg.BackButton.hide();
    if (visible && onClick) tg.BackButton.onClick(onClick);
  }

  return {
    raw: tg,
    isAvailable: Boolean(tg),
    init,
    getInitData() {
      return tg?.initData || '';
    },
    getUser() {
      return tg?.initDataUnsafe?.user || null;
    },
    getTheme() {
      return tg?.themeParams || {};
    },
    viewportHeight() {
      return tg?.viewportHeight || window.innerHeight;
    },
    setMainButton,
    setBackButton,
    haptic(kind = 'selectionChanged') {
      if (!tg?.HapticFeedback) return;
      if (kind === 'error' || kind === 'success' || kind === 'warning') {
        tg.HapticFeedback.notificationOccurred(kind);
        return;
      }
      if (kind === 'impact') {
        tg.HapticFeedback.impactOccurred('light');
        return;
      }
      tg.HapticFeedback.selectionChanged();
    },
    sendData(payload) {
      safeCall(tg?.sendData?.bind(tg), JSON.stringify(payload));
    },
    showPopup(payload) {
      return safeCall(tg?.showPopup?.bind(tg), payload);
    },
  };
}
