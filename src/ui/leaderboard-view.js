import { escapeHtml, formatScore } from '../utils/format.js';

export function renderLeaderboard(listElement, entries = []) {
  if (!entries.length) {
    listElement.innerHTML = `
      <li class="leaderboard-empty">
        <strong>Board waiting</strong>
        <div>Run once to seed a local board, or open from Telegram for cloud competition.</div>
      </li>
    `;
    return;
  }

  listElement.innerHTML = entries
    .map(
      (entry, index) =>
        `<li class="leaderboard-row${entry.isCurrentUser ? ' is-current-user' : ''}">
          <div class="leaderboard-rank">#${entry.rank || index + 1}</div>
          <div class="leaderboard-meta">
            <strong>${escapeHtml(entry.name)}</strong>
            <small>${escapeHtml(entry.label || (entry.source === 'remote' ? 'Cloud board' : 'Local run'))}</small>
          </div>
          <span class="leaderboard-score">${formatScore(entry.score)}</span>
        </li>`,
    )
    .join('');
}
