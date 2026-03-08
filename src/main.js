const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreValue = document.getElementById('scoreValue');
const bestValue = document.getElementById('bestValue');
const speedValue = document.getElementById('speedValue');
const startBestValue = document.getElementById('startBestValue');
const finalScoreValue = document.getElementById('finalScoreValue');
const finalBestValue = document.getElementById('finalBestValue');
const playerNameLabel = document.getElementById('playerName');
const leaderboardList = document.getElementById('leaderboardList');
const boardModeLabel = document.getElementById('boardMode');

const STORAGE_KEY = 'neon-pocket-rally-state';
const DEFAULT_STATE = {
  localBest: 0,
  leaderboard: [],
};

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
  document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color || '#0d120d');
}

const playerName = tg?.initDataUnsafe?.user?.first_name || 'Guest Driver';
playerNameLabel.textContent = playerName;

const state = loadState();
let remoteConfig = null;

const game = {
  mode: 'idle',
  elapsed: 0,
  score: 0,
  speed: 280,
  intensity: 1,
  roadOffset: 0,
  spawnTimer: 0,
  nearMissTimer: 0,
  lanes: [0.27, 0.5, 0.73],
  input: { left: false, right: false },
  player: {
    lane: 1,
    x: canvas.width * 0.5,
    y: canvas.height - 130,
    width: 62,
    height: 100,
    bob: 0,
  },
  traffic: [],
  particles: [],
  lastTime: 0,
};

function loadState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncLabels() {
  bestValue.textContent = `${state.localBest}`;
  startBestValue.textContent = `${state.localBest}`;
  finalBestValue.textContent = `${state.localBest}`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function laneX(index) {
  const clampedIndex = clamp(index, 0, game.lanes.length - 1);
  const leftLane = Math.floor(clampedIndex);
  const rightLane = Math.ceil(clampedIndex);
  const blend = clampedIndex - leftLane;
  const leftX = game.lanes[leftLane];
  const rightX = game.lanes[rightLane];

  return canvas.width * (leftX + (rightX - leftX) * blend);
}

function resetRun() {
  game.mode = 'playing';
  game.elapsed = 0;
  game.score = 0;
  game.speed = 280;
  game.intensity = 1;
  game.roadOffset = 0;
  game.spawnTimer = 0.15;
  game.nearMissTimer = 0;
  game.traffic = [];
  game.particles = [];
  game.player.lane = 1;
  game.player.x = laneX(1);
  game.player.bob = 0;

  hud.classList.remove('hidden');
  startScreen.classList.add('hidden');
  startScreen.classList.remove('visible');
  gameOverScreen.classList.add('hidden');
  gameOverScreen.classList.remove('visible');
  updateHud();
}

function updateHud() {
  scoreValue.textContent = `${Math.floor(game.score)}`;
  bestValue.textContent = `${state.localBest}`;
  speedValue.textContent = `${(game.speed / 280).toFixed(1)}x`;
}

function openStart() {
  game.mode = 'idle';
  hud.classList.add('hidden');
  startScreen.classList.remove('hidden');
  startScreen.classList.add('visible');
  gameOverScreen.classList.add('hidden');
  gameOverScreen.classList.remove('visible');
  renderBoard();
  syncLabels();
}

function openGameOver() {
  game.mode = 'gameover';
  finalScoreValue.textContent = `${Math.floor(game.score)}`;
  finalBestValue.textContent = `${state.localBest}`;
  gameOverScreen.classList.remove('hidden');
  gameOverScreen.classList.add('visible');
  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
}

function addParticle(x, y, speed, size, alpha = 1) {
  game.particles.push({ x, y, speed, size, alpha });
}

function spawnTraffic() {
  const lane = Math.floor(Math.random() * 3);
  const palette = [
    ['#9cff98', '#3e6f41'],
    ['#fffb8d', '#816f32'],
    ['#95d7ff', '#285777'],
    ['#ff9d94', '#6d3131'],
  ][Math.floor(Math.random() * 4)];

  game.traffic.push({
    lane,
    x: laneX(lane),
    y: -120,
    width: 58 + Math.random() * 10,
    height: 94 + Math.random() * 16,
    speed: game.speed * (0.72 + Math.random() * 0.4),
    color: palette,
    passed: false,
  });
}

function crash() {
  for (let i = 0; i < 24; i += 1) {
    addParticle(game.player.x, game.player.y + 10, 140 + Math.random() * 220, 2 + Math.random() * 4, 1);
  }

  if (game.score > state.localBest) {
    state.localBest = Math.floor(game.score);
  }

  pushLocalScore(Math.floor(game.score));
  syncLabels();
  saveState();
  openGameOver();
}

function pushLocalScore(score) {
  const entry = {
    name: playerName,
    score,
    source: 'local',
    at: new Date().toISOString(),
  };

  state.leaderboard = [...state.leaderboard, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  renderBoard();
}

function renderBoard() {
  const entries = state.leaderboard.length
    ? state.leaderboard
    : [{ name: 'No runs yet', score: 0, source: 'local' }];

  leaderboardList.innerHTML = entries
    .map(
      (entry) => `<li><span>${escapeHtml(entry.name)}${entry.source === 'remote' ? ' ☁' : ''}</span><strong>${entry.score}</strong></li>`,
    )
    .join('');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function submitScore() {
  const score = Math.floor(game.score);
  if (!score) return;

  pushLocalScore(score);
  saveState();

  if (remoteConfig?.submitUrl) {
    fetch(remoteConfig.submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: playerName,
        score,
        telegramId: tg?.initDataUnsafe?.user?.id || null,
        authDate: tg?.initDataUnsafe?.auth_date || null,
      }),
    }).catch(() => {
      boardModeLabel.textContent = 'local only · cloud submit failed';
    });
  }

  if (tg) {
    tg.HapticFeedback?.notificationOccurred('success');
    tg.MainButton.setText(`Score ${score}`);
    tg.sendData(JSON.stringify({ type: 'score', score }));
  }
}

function update(dt) {
  if (game.mode !== 'playing') return;

  game.elapsed += dt;
  game.speed += dt * 10;
  game.intensity = 1 + game.elapsed / 18;
  game.score += dt * 18 * game.intensity;
  game.player.bob += dt * 8;
  game.roadOffset += dt * game.speed * 0.9;
  game.spawnTimer -= dt;
  game.nearMissTimer = Math.max(0, game.nearMissTimer - dt);

  if (game.spawnTimer <= 0) {
    spawnTraffic();
    game.spawnTimer = clamp(0.88 - game.elapsed * 0.02, 0.34, 0.88);
  }

  if (game.input.left) game.player.lane -= dt * 6.4;
  if (game.input.right) game.player.lane += dt * 6.4;
  game.player.lane = clamp(game.player.lane, 0, 2);

  const targetPlayerX = laneX(game.player.lane);
  if (!Number.isFinite(game.player.x)) {
    game.player.x = targetPlayerX;
  } else {
    game.player.x += (targetPlayerX - game.player.x) * Math.min(1, dt * 12);
  }

  game.traffic.forEach((car) => {
    car.y += car.speed * dt;

    if (!car.passed && car.y > game.player.y + 40) {
      car.passed = true;
      game.score += 45;
      if (game.nearMissTimer <= 0) {
        game.nearMissTimer = 0.4;
        for (let i = 0; i < 6; i += 1) addParticle(car.x, car.y + 30, 80 + Math.random() * 80, 1 + Math.random() * 2, 0.7);
      }
    }

    const dx = Math.abs(car.x - game.player.x);
    const dy = Math.abs(car.y - game.player.y);
    if (dx < (car.width + game.player.width) * 0.42 && dy < (car.height + game.player.height) * 0.42) {
      crash();
    }
  });

  game.traffic = game.traffic.filter((car) => car.y < canvas.height + 160);

  game.particles.forEach((p) => {
    p.y += p.speed * dt;
    p.alpha -= dt * 1.2;
  });
  game.particles = game.particles.filter((p) => p.alpha > 0);

  if (game.score > state.localBest) {
    state.localBest = Math.floor(game.score);
    saveState();
  }

  updateHud();
}

function drawRoundedRect(x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawCar(x, y, width, height, colors, isPlayer = false) {
  const [light, dark] = colors;
  drawRoundedRect(x - width / 2, y - height / 2, width, height, 14, dark);
  drawRoundedRect(x - width * 0.38, y - height * 0.3, width * 0.76, height * 0.55, 12, light);
  drawRoundedRect(x - width * 0.16, y - height * 0.16, width * 0.32, height * 0.26, 8, '#ecffe4');
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(x - width * 0.52, y - height * 0.34, width * 0.14, height * 0.22);
  ctx.fillRect(x + width * 0.38, y - height * 0.34, width * 0.14, height * 0.22);
  ctx.fillRect(x - width * 0.52, y + height * 0.12, width * 0.14, height * 0.22);
  ctx.fillRect(x + width * 0.38, y + height * 0.12, width * 0.14, height * 0.22);

  if (isPlayer) {
    ctx.strokeStyle = 'rgba(205,255,177,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - width / 2 - 4, y - height / 2 - 4, width + 8, height + 8);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#142014');
  gradient.addColorStop(1, '#090c09');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#c9ffb7' : '#99d596';
    ctx.fillRect(18 * (i % 24), 0, 1, canvas.height);
  }
  ctx.restore();

  const roadTop = 70;
  const roadBottom = canvas.height;
  const roadWidthTop = 150;
  const roadWidthBottom = 320;
  const roadCenter = canvas.width / 2;

  ctx.beginPath();
  ctx.moveTo(roadCenter - roadWidthTop / 2, roadTop);
  ctx.lineTo(roadCenter + roadWidthTop / 2, roadTop);
  ctx.lineTo(roadCenter + roadWidthBottom / 2, roadBottom);
  ctx.lineTo(roadCenter - roadWidthBottom / 2, roadBottom);
  ctx.closePath();
  ctx.fillStyle = '#232b23';
  ctx.fill();

  ctx.strokeStyle = 'rgba(210, 255, 190, 0.2)';
  ctx.lineWidth = 3;
  ctx.stroke();

  for (let y = -60; y < canvas.height + 80; y += 72) {
    const dashY = y + (game.roadOffset % 72);
    const t = clamp((dashY - roadTop) / (roadBottom - roadTop), 0, 1);
    const width = 6 + t * 12;
    const height = 16 + t * 26;
    const laneSpread = 24 + t * 38;
    ctx.fillStyle = 'rgba(233, 255, 222, 0.58)';
    ctx.fillRect(roadCenter - laneSpread - width / 2, dashY, width, height);
    ctx.fillRect(roadCenter + laneSpread - width / 2, dashY, width, height);
  }

  for (let y = -40; y < canvas.height + 60; y += 56) {
    const stripeY = y + (game.roadOffset * 1.2 % 56);
    const t = clamp((stripeY - roadTop) / (roadBottom - roadTop), 0, 1);
    const sideX = roadCenter - (roadWidthTop / 2 + t * ((roadWidthBottom - roadWidthTop) / 2));
    const stripeW = 8 + t * 6;
    const stripeH = 14 + t * 18;
    ctx.fillStyle = '#5d785d';
    ctx.fillRect(sideX - 22, stripeY, stripeW, stripeH);
    ctx.fillRect(canvas.width - sideX + 14, stripeY, stripeW, stripeH);
  }

  game.traffic.forEach((car) => drawCar(car.x, car.y, car.width, car.height, car.color));

  const playerPulse = Math.sin(game.player.bob) * 3;
  drawCar(game.player.x, game.player.y + playerPulse, game.player.width, game.player.height, ['#efffb0', '#7cb55d'], true);

  game.particles.forEach((p) => {
    ctx.fillStyle = `rgba(210,255,184,${p.alpha})`;
    ctx.fillRect(p.x, p.y, p.size, p.size * 2);
  });

  ctx.fillStyle = 'rgba(204,255,180,0.08)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function loop(timestamp) {
  const dt = Math.min((timestamp - game.lastTime) / 1000 || 0, 0.033);
  game.lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function bindSteering(button, direction, isDown) {
  const downHandler = (event) => {
    event.preventDefault();
    game.input[direction] = true;
    if (game.mode !== 'playing') resetRun();
  };
  const upHandler = (event) => {
    event.preventDefault();
    game.input[direction] = false;
  };
  button.addEventListener('pointerdown', downHandler);
  button.addEventListener('pointerup', upHandler);
  button.addEventListener('pointercancel', upHandler);
  button.addEventListener('pointerleave', upHandler);
}

bindSteering(document.getElementById('touchLeft'), 'left');
bindSteering(document.getElementById('touchRight'), 'right');
document.getElementById('touchBoost').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (game.mode !== 'playing') resetRun();
});

document.getElementById('startButton').addEventListener('click', resetRun);
document.getElementById('restartButton').addEventListener('click', resetRun);
document.getElementById('submitScoreButton').addEventListener('click', submitScore);
document.getElementById('shareButton').addEventListener('click', () => {
  const text = `I just raced Neon Pocket Rally. Local best: ${state.localBest}.`;
  if (tg?.shareToStory) {
    tg.showPopup({ title: 'Share', message: text, buttons: [{ id: 'ok', type: 'ok' }] });
  } else if (navigator.share) {
    navigator.share({ title: 'Neon Pocket Rally', text }).catch(() => {});
  }
});

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'a', 'A'].includes(event.key)) {
    game.input.left = true;
    if (game.mode !== 'playing') resetRun();
  }
  if (['ArrowRight', 'd', 'D'].includes(event.key)) {
    game.input.right = true;
    if (game.mode !== 'playing') resetRun();
  }
  if ([' ', 'Enter'].includes(event.key) && game.mode !== 'playing') {
    resetRun();
  }
});

window.addEventListener('keyup', (event) => {
  if (['ArrowLeft', 'a', 'A'].includes(event.key)) game.input.left = false;
  if (['ArrowRight', 'd', 'D'].includes(event.key)) game.input.right = false;
});

async function loadRemoteBoard() {
  try {
    const response = await fetch('./public/leaderboard-config.json');
    if (!response.ok) throw new Error('No config');
    remoteConfig = await response.json();
  } catch {
    boardModeLabel.textContent = 'local board';
    renderBoard();
    return;
  }

  if (!remoteConfig.fetchUrl) {
    boardModeLabel.textContent = 'local board · endpoint empty';
    renderBoard();
    return;
  }

  try {
    const response = await fetch(remoteConfig.fetchUrl);
    const data = await response.json();
    const remoteEntries = Array.isArray(data?.entries) ? data.entries : [];
    state.leaderboard = [...state.leaderboard, ...remoteEntries.map((entry) => ({ ...entry, source: 'remote' }))]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    boardModeLabel.textContent = 'local + cloud';
    renderBoard();
  } catch {
    boardModeLabel.textContent = 'local only · cloud offline';
    renderBoard();
  }
}

syncLabels();
renderBoard();
openStart();
loadRemoteBoard();
requestAnimationFrame(loop);
