import { escapeHtml } from '../utils/format.js';

export function renderLeaderboard(listElement, entries = []) {
  const safeEntries = entries.length
    ? entries
    : [{ name: 'No runs yet', score: 0, source: 'local' }];

  listElement.innerHTML = safeEntries
    .map(
      (entry, index) =>
        `<li><span>#${entry.rank || index + 1} ${escapeHtml(entry.name)}${entry.source === 'remote' ? ' ☁' : ''}</span><strong>${entry.score}</strong></li>`,
    )
    .join('');
}
