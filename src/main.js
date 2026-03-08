import { bootstrap } from './app/bootstrap.js';

bootstrap().catch((error) => {
  console.error('[npr] bootstrap_failed', error);
  const fallback = document.getElementById('toast');
  if (fallback) {
    fallback.textContent = 'Boot failed. Reload and try again.';
    fallback.classList.remove('hidden');
    fallback.dataset.tone = 'error';
  }
});
