export function createToast(element) {
  let timer = null;

  function show(message, tone = 'info', duration = 1800) {
    if (!element) return;
    element.textContent = message;
    element.dataset.tone = tone;
    element.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.add('hidden'), duration);
  }

  return { show };
}
