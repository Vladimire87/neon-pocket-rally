const DAILY_MISSIONS = [
  {
    id: 'survive-45',
    title: 'Survive 45s',
    description: 'Hold the lane long enough to settle into the pressure phase.',
    evaluate(summary) {
      return {
        progress: Math.min(summary.durationMs, 45000),
        target: 45000,
        completed: summary.durationMs >= 45000,
        progressLabel: `${Math.min(Math.floor(summary.durationMs / 1000), 45)}/45s`,
      };
    },
  },
  {
    id: 'score-1800',
    title: 'Score 1800+',
    description: 'Push a clean, fast run with one strong late-game stretch.',
    evaluate(summary) {
      return {
        progress: Math.min(summary.score, 1800),
        target: 1800,
        completed: summary.score >= 1800,
        progressLabel: `${Math.min(summary.score, 1800)}/1800`,
      };
    },
  },
  {
    id: 'near-miss-3',
    title: 'Chain 3 near misses',
    description: 'Drive close enough to score real risk instead of safe clears.',
    evaluate(summary) {
      return {
        progress: Math.min(summary.nearMissCount, 3),
        target: 3,
        completed: summary.nearMissCount >= 3,
        progressLabel: `${Math.min(summary.nearMissCount, 3)}/3`,
      };
    },
  },
];

function getDaySeed(date = new Date()) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

export function getDailyMission(date = new Date()) {
  const missionIndex = Math.abs(
    Array.from(getDaySeed(date)).reduce((sum, char) => sum + char.charCodeAt(0), 0),
  ) % DAILY_MISSIONS.length;
  return DAILY_MISSIONS[missionIndex];
}

export function evaluateMission(summary, date = new Date()) {
  const mission = getDailyMission(date);
  return {
    ...mission,
    ...mission.evaluate(summary),
  };
}

export function buildChallengeContext(rawChallenge) {
  if (!rawChallenge) return null;

  const normalized = String(rawChallenge).replace('challenge_', '').trim();
  const targetScore = Number(normalized);
  if (!Number.isFinite(targetScore) || targetScore <= 0) return null;

  return {
    raw: rawChallenge,
    targetScore: Math.floor(targetScore),
  };
}

export function formatChallengeText(challenge, playerName) {
  if (!challenge) {
    return 'Start a tight run, then send a one-tap score target to a friend.';
  }

  const challenger = playerName || 'your friend';
  return `Challenge live: beat ${challenger}'s ${challenge.targetScore} and send it back.`;
}

export function evaluateChallenge(summary, challenge) {
  if (!challenge) {
    return {
      headline: 'Share a score target to challenge a friend.',
      cleared: false,
    };
  }

  const delta = summary.score - challenge.targetScore;
  if (delta >= 0) {
    return {
      headline: `Challenge cleared by +${delta}.`,
      cleared: true,
    };
  }

  return {
    headline: `${Math.abs(delta)} short of the challenge line.`,
    cleared: false,
  };
}

export function getFirstRunMessage(hasRuns) {
  return hasRuns ? 'Telegram rally build' : 'First run takes about 10 seconds';
}
