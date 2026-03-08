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
  document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color || '#0f1620');
}

const playerName = tg?.initDataUnsafe?.user?.first_name || 'Guest Driver';
playerNameLabel.textContent = playerName;

const state = loadState();
let remoteConfig = null;

const road = {
  horizonY: 126,
  baseY: canvas.height + 10,
  widthTop: 126,
  widthBottom: 318,
  shoulderTop: 16,
  shoulderBottom: 34,
  lanePadding: 28,
  lanePositions: [0.2, 0.5, 0.8],
};

const game = {
  mode: 'idle',
  elapsed: 0,
  score: 0,
  speed: 190,
  intensity: 1,
  roadOffset: 0,
  spawnTimer: 0,
  nearMissTimer: 0,
  input: { left: false, right: false },
  player: {
    lane: 1,
    x: canvas.width * 0.5,
    y: canvas.height - 118,
    width: 74,
    height: 122,
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function roadProgressAt(y) {
  return clamp((y - road.horizonY) / (road.baseY - road.horizonY), 0, 1);
}

function roadWidthAt(y) {
  return lerp(road.widthTop, road.widthBottom, easeOutQuad(roadProgressAt(y)));
}

function roadShoulderAt(y) {
  return lerp(road.shoulderTop, road.shoulderBottom, easeOutQuad(roadProgressAt(y)));
}

function roadCenterXAt() {
  return canvas.width * 0.5;
}

function roadEdgesAt(y) {
  const center = roadCenterXAt(y);
  const half = roadWidthAt(y) / 2;
  return { left: center - half, right: center + half, center };
}

function laneCenterAt(laneIndex, y) {
  const clampedLane = clamp(laneIndex, 0, road.lanePositions.length - 1);
  const leftLane = Math.floor(clampedLane);
  const rightLane = Math.ceil(clampedLane);
  const blend = clampedLane - leftLane;
  const leftT = road.lanePositions[leftLane];
  const rightT = road.lanePositions[rightLane];
  const laneT = lerp(leftT, rightT, blend);
  const roadWidth = roadWidthAt(y) - road.lanePadding * 2;
  const left = roadCenterXAt(y) - roadWidth / 2;
  return left + roadWidth * laneT;
}

function trafficScaleAt(y) {
  const t = roadProgressAt(y);
  return lerp(0.52, 1.08, easeOutQuad(t));
}

function playerX() {
  return laneCenterAt(game.player.lane, game.player.y + 10);
}

function resetRun() {
  game.mode = 'playing';
  game.elapsed = 0;
  game.score = 0;
  game.speed = 190;
  game.intensity = 1;
  game.roadOffset = 0;
  game.spawnTimer = 1.15;
  game.nearMissTimer = 0;
  game.traffic = [];
  game.particles = [];
  game.player.lane = 1;
  game.player.x = playerX();
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
  speedValue.textContent = `${(game.speed / 190).toFixed(1)}x`;
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

function addParticle(x, y, speed, size, alpha = 1, hue = 'rgba(255, 232, 140,') {
  game.particles.push({ x, y, speed, size, alpha, hue });
}

function canSpawnInLane(lane) {
  return !game.traffic.some((car) => {
    const sameLane = car.lane === lane && car.y < 250;
    const adjacentLane = Math.abs(car.lane - lane) === 1 && car.y < 180;
    return sameLane || adjacentLane;
  });
}

function spawnTraffic() {
  const candidateLanes = [0, 1, 2].filter(canSpawnInLane);
  if (!candidateLanes.length) return;

  const lane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
  const palette = [
    ['#ffd88b', '#be6c33', '#fff2cc'],
    ['#7fd7ff', '#2f68b3', '#d8f3ff'],
    ['#ff9aa2', '#b8425c', '#ffe1e4'],
    ['#b8ff9f', '#4b9b58', '#eefede'],
    ['#d6b3ff', '#6a4cc4', '#f4eaff'],
  ][Math.floor(Math.random() * 5)];

  const roofSeed = Math.random();
  const startY = road.horizonY - 92 + Math.random() * 18;
  const scale = trafficScaleAt(startY);

  game.traffic.push({
    lane,
    y: startY,
    width: 56 * scale,
    height: 102 * scale,
    speed: game.speed * (0.44 + Math.random() * 0.14),
    colors: palette,
    passed: false,
    sway: (roofSeed - 0.5) * 3,
  });
}

function crash() {
  for (let i = 0; i < 26; i += 1) {
    addParticle(
      game.player.x + (Math.random() - 0.5) * 24,
      game.player.y + 6,
      120 + Math.random() * 240,
      2 + Math.random() * 5,
      1,
      i % 2 === 0 ? 'rgba(255, 207, 110,' : 'rgba(255, 120, 120,'
    );
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

function updateTraffic(dt) {
  game.traffic.forEach((car) => {
    car.y += car.speed * dt;
    const scale = trafficScaleAt(car.y);
    car.width = 56 * scale;
    car.height = 102 * scale;
    car.x = laneCenterAt(car.lane, car.y) + car.sway;

    if (!car.passed && car.y > game.player.y + 36) {
      car.passed = true;
      game.score += 45;
      if (game.nearMissTimer <= 0) {
        game.nearMissTimer = 0.4;
        for (let i = 0; i < 8; i += 1) {
          addParticle(car.x, car.y + 24, 70 + Math.random() * 90, 1 + Math.random() * 2, 0.65, 'rgba(215, 243, 255,');
        }
      }
    }

    const dx = Math.abs(car.x - game.player.x);
    const dy = Math.abs(car.y - game.player.y);
    const hitW = (car.width + game.player.width) * 0.28;
    const hitH = (car.height + game.player.height) * 0.31;
    if (dx < hitW && dy < hitH) {
      crash();
    }
  });

  game.traffic = game.traffic.filter((car) => car.y < canvas.height + 180);
}

function update(dt) {
  if (game.mode !== 'playing') return;

  game.elapsed += dt;
  game.speed += dt * 6.5;
  game.intensity = 1 + game.elapsed / 18;
  game.score += dt * 18 * game.intensity;
  game.player.bob += dt * 8;
  game.roadOffset += dt * game.speed;
  game.spawnTimer -= dt;
  game.nearMissTimer = Math.max(0, game.nearMissTimer - dt);

  if (game.spawnTimer <= 0) {
    spawnTraffic();
    game.spawnTimer = clamp(1.34 - game.elapsed * 0.016, 0.72, 1.34);
  }

  if (game.input.left) game.player.lane -= dt * 5.4;
  if (game.input.right) game.player.lane += dt * 5.4;
  game.player.lane = clamp(game.player.lane, 0, 2);

  const targetPlayerX = playerX();
  game.player.x += (targetPlayerX - game.player.x) * Math.min(1, dt * 10);

  updateTraffic(dt);

  game.particles.forEach((p) => {
    p.y += p.speed * dt;
    p.alpha -= dt * 1.35;
  });
  game.particles = game.particles.filter((p) => p.alpha > 0);

  if (game.score > state.localBest) {
    state.localBest = Math.floor(game.score);
    saveState();
  }

  updateHud();
}

function roundedRectPath(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fillRoundedRect(x, y, width, height, radius, fill) {
  roundedRectPath(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawCar(x, y, width, height, colors, isPlayer = false) {
  const [bodyLight, bodyDark, glass] = colors;
  const radius = Math.max(10, width * 0.18);

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, height * 0.45, width * 0.56, height * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  fillRoundedRect(-width / 2, -height / 2, width, height, radius, bodyDark);
  fillRoundedRect(-width * 0.4, -height * 0.28, width * 0.8, height * 0.58, radius * 0.7, bodyLight);
  fillRoundedRect(-width * 0.18, -height * 0.11, width * 0.36, height * 0.24, radius * 0.5, glass);

  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  fillRoundedRect(-width * 0.24, -height * 0.34, width * 0.18, height * 0.1, radius * 0.4, 'rgba(255,255,255,0.22)');

  ctx.fillStyle = '#101215';
  fillRoundedRect(-width * 0.58, -height * 0.3, width * 0.16, height * 0.22, 5, '#101215');
  fillRoundedRect(width * 0.42, -height * 0.3, width * 0.16, height * 0.22, 5, '#101215');
  fillRoundedRect(-width * 0.58, height * 0.1, width * 0.16, height * 0.22, 5, '#101215');
  fillRoundedRect(width * 0.42, height * 0.1, width * 0.16, height * 0.22, 5, '#101215');

  fillRoundedRect(-width * 0.3, -height * 0.47, width * 0.2, height * 0.06, 4, isPlayer ? '#fff6ab' : '#ffd58a');
  fillRoundedRect(width * 0.1, -height * 0.47, width * 0.2, height * 0.06, 4, isPlayer ? '#fff6ab' : '#ffd58a');
  fillRoundedRect(-width * 0.3, height * 0.39, width * 0.2, height * 0.06, 4, isPlayer ? '#ff8d8d' : '#ff9c9c');
  fillRoundedRect(width * 0.1, height * 0.39, width * 0.2, height * 0.06, 4, isPlayer ? '#ff8d8d' : '#ff9c9c');

  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255, 244, 170, 0.8)';
    ctx.lineWidth = 2.5;
    roundedRectPath(-width / 2 - 4, -height / 2 - 4, width + 8, height + 8, radius + 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#172235');
  sky.addColorStop(0.36, '#25375a');
  sky.addColorStop(0.37, '#33456e');
  sky.addColorStop(1, '#0b1119');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(canvas.width * 0.5, 134, 12, canvas.width * 0.5, 134, 210);
  glow.addColorStop(0, 'rgba(255, 214, 132, 0.35)');
  glow.addColorStop(0.5, 'rgba(255, 181, 118, 0.12)');
  glow.addColorStop(1, 'rgba(255, 181, 118, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 32; i += 1) {
    const x = (i * 53) % canvas.width;
    const y = 26 + ((i * 37) % 150);
    const alpha = 0.18 + (i % 4) * 0.08;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }

  ctx.fillStyle = '#16202c';
  for (let i = 0; i < 6; i += 1) {
    const w = 34 + i * 16;
    const h = 52 + (i % 3) * 28;
    const x = 12 + i * 66;
    ctx.fillRect(x, road.horizonY - h + 6, w, h);
  }
}

function drawRoad() {
  const topEdges = roadEdgesAt(road.horizonY);
  const bottomEdges = roadEdgesAt(road.baseY);
  const topShoulder = roadShoulderAt(road.horizonY);
  const bottomShoulder = roadShoulderAt(road.baseY);

  ctx.fillStyle = '#27452d';
  ctx.fillRect(0, road.horizonY, canvas.width, canvas.height - road.horizonY);

  ctx.beginPath();
  ctx.moveTo(topEdges.left - topShoulder, road.horizonY);
  ctx.lineTo(topEdges.right + topShoulder, road.horizonY);
  ctx.lineTo(bottomEdges.right + bottomShoulder, road.baseY);
  ctx.lineTo(bottomEdges.left - bottomShoulder, road.baseY);
  ctx.closePath();
  ctx.fillStyle = '#567044';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(topEdges.left, road.horizonY);
  ctx.lineTo(topEdges.right, road.horizonY);
  ctx.lineTo(bottomEdges.right, road.baseY);
  ctx.lineTo(bottomEdges.left, road.baseY);
  ctx.closePath();
  ctx.fillStyle = '#2f3642';
  ctx.fill();

  const asphaltShade = ctx.createLinearGradient(0, road.horizonY, 0, road.baseY);
  asphaltShade.addColorStop(0, 'rgba(255,255,255,0.02)');
  asphaltShade.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = asphaltShade;
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 236, 187, 0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(topEdges.left + 2, road.horizonY);
  ctx.lineTo(bottomEdges.left + 4, road.baseY);
  ctx.moveTo(topEdges.right - 2, road.horizonY);
  ctx.lineTo(bottomEdges.right - 4, road.baseY);
  ctx.stroke();

  for (let y = road.horizonY + 10; y < canvas.height + 80; y += 58) {
    const dashY = y + (game.roadOffset % 58);
    const t = roadProgressAt(dashY);
    const dashH = lerp(10, 26, t);
    const dashW = lerp(3, 8, t);

    [0.35, 0.65].forEach((laneMark) => {
      const innerWidth = roadWidthAt(dashY) - road.lanePadding * 2;
      const x = roadCenterXAt(dashY) - innerWidth / 2 + innerWidth * laneMark - dashW / 2;
      ctx.fillStyle = 'rgba(245, 245, 235, 0.85)';
      ctx.fillRect(x, dashY, dashW, dashH);
    });
  }

  for (let y = road.horizonY + 6; y < canvas.height + 80; y += 46) {
    const stripeY = y + ((game.roadOffset * 0.82) % 46);
    const t = roadProgressAt(stripeY);
    const stripeW = lerp(6, 12, t);
    const stripeH = lerp(10, 18, t);
    const edges = roadEdgesAt(stripeY);
    const shoulder = roadShoulderAt(stripeY);
    ctx.fillStyle = '#7dc06c';
    ctx.fillRect(edges.left - shoulder * 0.72, stripeY, stripeW, stripeH);
    ctx.fillRect(edges.right + shoulder * 0.1, stripeY, stripeW, stripeH);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawRoad();

  game.traffic
    .slice()
    .sort((a, b) => a.y - b.y)
    .forEach((car) => drawCar(car.x, car.y, car.width, car.height, car.colors));

  const playerPulse = Math.sin(game.player.bob) * 2.5;
  drawCar(game.player.x, game.player.y + playerPulse, game.player.width, game.player.height, ['#ffe483', '#c46d36', '#fff5cf'], true);

  game.particles.forEach((p) => {
    ctx.fillStyle = `${p.hue}${p.alpha})`;
    ctx.fillRect(p.x, p.y, p.size, p.size * 1.8);
  });

  if (game.mode === 'playing') {
    ctx.fillStyle = 'rgba(255, 245, 201, 0.025)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - game.lastTime) / 1000 || 0, 0.033);
  game.lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function nudgeLane(direction) {
  const delta = direction === 'left' ? -0.9 : 0.9;
  game.player.lane = clamp(game.player.lane + delta, 0, 2);
}

function bindSteering(button, direction) {
  const downHandler = (event) => {
    event.preventDefault();
    game.input[direction] = true;
    if (game.mode !== 'playing') resetRun();
    nudgeLane(direction);
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
  if (event.repeat) return;

  if (['ArrowLeft', 'a', 'A'].includes(event.key)) {
    game.input.left = true;
    if (game.mode !== 'playing') resetRun();
    nudgeLane('left');
  }
  if (['ArrowRight', 'd', 'D'].includes(event.key)) {
    game.input.right = true;
    if (game.mode !== 'playing') resetRun();
    nudgeLane('right');
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
window.__NPR = { game, state, road };
requestAnimationFrame(loop);
