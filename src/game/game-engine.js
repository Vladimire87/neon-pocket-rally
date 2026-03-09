import { clamp, easeOutQuad, lerp, randomFrom } from '../utils/math.js';
import { GAME_BALANCE, getDifficultyPhase, nextSpawnInterval } from './balance.js';

const TRAFFIC_PALETTES = [
  ['#ffd88b', '#be6c33', '#fff2cc'],
  ['#7fd7ff', '#2f68b3', '#d8f3ff'],
  ['#ff9aa2', '#b8425c', '#ffe1e4'],
  ['#b8ff9f', '#4b9b58', '#eefede'],
  ['#d6b3ff', '#6a4cc4', '#f4eaff'],
];

export function createGameEngine({ canvas, ctx, road, scoring, onCrash, onNearMiss, onMilestone }) {
  const state = {
    mode: 'idle',
    elapsed: 0,
    score: 0,
    speed: GAME_BALANCE.baseSpeed,
    roadOffset: 0,
    spawnTimer: 1.1,
    traffic: [],
    particles: [],
    lastTime: 0,
    input: { left: false, right: false },
    combo: 1,
    comboTimer: 0,
    nearMissCount: 0,
    distance: 0,
    crashCount: 0,
    lastMilestoneSecond: 0,
    player: {
      lane: 1,
      x: canvas.width * 0.5,
      y: canvas.height - 118,
      width: 74,
      height: 122,
      bob: 0,
    },
  };

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
    const laneT = lerp(road.lanePositions[leftLane], road.lanePositions[rightLane], blend);
    const roadWidth = roadWidthAt(y) - road.lanePadding * 2;
    const left = roadCenterXAt(y) - roadWidth / 2;
    return left + roadWidth * laneT;
  }
  function trafficScaleAt(y) {
    return lerp(0.52, 1.08, easeOutQuad(roadProgressAt(y)));
  }
  function playerTargetX() {
    return laneCenterAt(state.player.lane, state.player.y + 10);
  }

  function addParticle(x, y, speed, size, alpha = 1, hue = 'rgba(255,232,140,') {
    if (state.particles.length >= GAME_BALANCE.particles.maxActive) return;
    state.particles.push({ x, y, speed, size, alpha, hue });
  }

  function canSpawnInLane(lane) {
    return !state.traffic.some((car) => {
      const sameLane = car.lane === lane && car.y < 260;
      const adjacentLane = Math.abs(car.lane - lane) === 1 && car.y < 170;
      return sameLane || adjacentLane;
    });
  }

  function spawnTraffic() {
    const candidates = [0, 1, 2].filter(canSpawnInLane);
    if (!candidates.length) return;
    const lane = randomFrom(candidates);
    const startY = road.horizonY - 92 + Math.random() * 18;
    const scale = trafficScaleAt(startY);
    state.traffic.push({
      lane,
      y: startY,
      width: 56 * scale,
      height: 102 * scale,
      speed: state.speed * (0.42 + Math.random() * 0.18),
      colors: randomFrom(TRAFFIC_PALETTES),
      passed: false,
      nearMissed: false,
      sway: (Math.random() - 0.5) * 3,
    });
  }

  function reset() {
    state.mode = 'playing';
    state.elapsed = 0;
    state.score = 0;
    state.speed = GAME_BALANCE.baseSpeed;
    state.roadOffset = 0;
    state.spawnTimer = 0.65;
    state.traffic = [];
    state.particles = [];
    state.combo = 1;
    state.comboTimer = 0;
    state.nearMissCount = 0;
    state.distance = 0;
    state.crashCount = 0;
    state.lastMilestoneSecond = 0;
    state.player.lane = 1;
    state.player.x = playerTargetX();
    state.player.bob = 0;
    spawnTraffic();
    for (let i = 0; i < 8; i += 1) {
      addParticle(
        state.player.x + (Math.random() - 0.5) * 18,
        state.player.y + 34 + Math.random() * 26,
        80 + Math.random() * 120,
        2 + Math.random() * 2,
        0.9,
        'rgba(255, 214, 122,'
      );
    }
  }

  function pause() {
    if (state.mode === 'playing') state.mode = 'paused';
  }

  function resume() {
    if (state.mode === 'paused') state.mode = 'playing';
  }

  function crash() {
    if (state.mode !== 'playing') return;
    state.crashCount += 1;
    for (let i = 0; i < GAME_BALANCE.particles.crashCount; i += 1) {
      addParticle(
        state.player.x + (Math.random() - 0.5) * 24,
        state.player.y + 6,
        120 + Math.random() * 240,
        2 + Math.random() * 5,
        1,
        i % 2 === 0 ? 'rgba(255, 207, 110,' : 'rgba(255, 120, 120,'
      );
    }
    state.mode = 'crashed';
    onCrash?.(getSummary());
  }

  function updateTraffic(dt) {
    state.traffic.forEach((car) => {
      car.y += car.speed * dt;
      const scale = trafficScaleAt(car.y);
      car.width = 56 * scale;
      car.height = 102 * scale;
      car.x = laneCenterAt(car.lane, car.y) + car.sway;

      const dx = Math.abs(car.x - state.player.x);
      const dy = Math.abs(car.y - state.player.y);
      const hitW = (car.width + state.player.width) * GAME_BALANCE.collision.widthFactor;
      const hitH = (car.height + state.player.height) * GAME_BALANCE.collision.heightFactor;
      const nearMissDx = hitW + GAME_BALANCE.nearMissWindowPx * 0.16;
      const nearMissDy = hitH + GAME_BALANCE.nearMissWindowPx;

      if (!car.nearMissed && !car.passed && dy < nearMissDy && dx < nearMissDx && dx > hitW * 0.78) {
        car.nearMissed = true;
        state.nearMissCount += 1;
        state.combo = Math.min(state.combo + 1, GAME_BALANCE.comboMultiplierCap);
        state.comboTimer = GAME_BALANCE.comboWindowSec;
        const bonus = scoring.nearMissBonus(state.combo - 1 || 1);
        state.score += bonus;
        onNearMiss?.({ combo: state.combo, bonus, lane: car.lane });
      }

      if (!car.passed && car.y > state.player.y + 36) {
        car.passed = true;
        state.score += 30;
      }

      if (dx < hitW && dy < hitH) {
        crash();
      }
    });

    state.traffic = state.traffic.filter((car) => car.y < canvas.height + 180);
  }

  function update(dt) {
    if (state.mode !== 'playing') return;

    state.elapsed += dt;
    state.distance += state.speed * dt;
    state.speed += dt * GAME_BALANCE.speedGrowthPerSecond;
    state.score += scoring.baseScoreGain(dt, state.elapsed);
    state.player.bob += dt * 8;
    state.roadOffset += dt * state.speed;
    state.spawnTimer -= dt;
    state.comboTimer = Math.max(0, state.comboTimer - dt);

    if (state.comboTimer <= 0) state.combo = 1;
    if (state.spawnTimer <= 0) {
      spawnTraffic();
      state.spawnTimer = nextSpawnInterval(state.elapsed);
    }

    if (state.input.left) state.player.lane -= dt * 5.4;
    if (state.input.right) state.player.lane += dt * 5.4;
    state.player.lane = clamp(state.player.lane, 0, 2);
    state.player.x += (playerTargetX() - state.player.x) * Math.min(1, dt * 10);

    updateTraffic(dt);

    state.particles.forEach((particle) => {
      particle.y += particle.speed * dt;
      particle.alpha -= dt * 1.35;
    });
    state.particles = state.particles.filter((particle) => particle.alpha > 0);

    const elapsedWhole = Math.floor(state.elapsed);
    if (elapsedWhole > 0 && elapsedWhole % 15 === 0 && elapsedWhole !== state.lastMilestoneSecond) {
      state.lastMilestoneSecond = elapsedWhole;
      onMilestone?.({ elapsed: elapsedWhole, phase: getDifficultyPhase(state.elapsed) });
    }
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
    fillRoundedRect(-width * 0.24, -height * 0.34, width * 0.18, height * 0.1, radius * 0.4, 'rgba(255,255,255,0.22)');
    fillRoundedRect(-width * 0.58, -height * 0.3, width * 0.16, height * 0.22, 5, '#101215');
    fillRoundedRect(width * 0.42, -height * 0.3, width * 0.16, height * 0.22, 5, '#101215');
    fillRoundedRect(-width * 0.58, height * 0.1, width * 0.16, height * 0.22, 5, '#101215');
    fillRoundedRect(width * 0.42, height * 0.1, width * 0.16, height * 0.22, 5, '#101215');
    fillRoundedRect(-width * 0.3, -height * 0.47, width * 0.2, height * 0.06, 4, isPlayer ? '#fff6ab' : '#ffd58a');
    fillRoundedRect(width * 0.1, -height * 0.47, width * 0.2, height * 0.06, 4, isPlayer ? '#fff6ab' : '#ffd58a');
    fillRoundedRect(-width * 0.3, height * 0.39, width * 0.2, height * 0.06, 4, isPlayer ? '#ff8d8d' : '#ff9c9c');
    fillRoundedRect(width * 0.1, height * 0.39, width * 0.2, height * 0.06, 4, isPlayer ? '#ff8d8d' : '#ff9c9c');
    if (isPlayer) {
      ctx.strokeStyle = state.combo > 1 ? 'rgba(142, 255, 187, 0.9)' : 'rgba(255, 244, 170, 0.8)';
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
      const dashY = y + (state.roadOffset % 58);
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
      const stripeY = y + ((state.roadOffset * 0.82) % 46);
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
    state.traffic.slice().sort((a, b) => a.y - b.y).forEach((car) => drawCar(car.x, car.y, car.width, car.height, car.colors));
    const playerPulse = Math.sin(state.player.bob) * 2.5;
    drawCar(state.player.x, state.player.y + playerPulse, state.player.width, state.player.height, ['#ffe483', '#c46d36', '#fff5cf'], true);
    state.particles.forEach((p) => {
      ctx.fillStyle = `${p.hue}${p.alpha})`;
      ctx.fillRect(p.x, p.y, p.size, p.size * 1.8);
    });
    if (state.mode === 'paused') {
      ctx.fillStyle = 'rgba(4, 7, 12, 0.42)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function tick(timestamp) {
    const dt = Math.min((timestamp - state.lastTime) / 1000 || 0, 0.033);
    state.lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  function getViewModel() {
    return {
      score: state.score,
      speed: state.speed / GAME_BALANCE.baseSpeed,
      combo: state.combo,
      phaseLabel: getDifficultyPhase(state.elapsed).label,
      elapsed: state.elapsed,
    };
  }

  function getSummary() {
    return {
      score: Math.floor(state.score),
      durationMs: Math.floor(state.elapsed * 1000),
      distance: Math.floor(state.distance),
      nearMissCount: state.nearMissCount,
      collisionCount: state.crashCount,
      averageSpeedBucket: Math.round(state.speed / GAME_BALANCE.baseSpeed),
    };
  }

  return {
    state,
    reset,
    pause,
    resume,
    tick,
    getViewModel,
    getSummary,
    nudgeLane(direction) {
      state.player.lane = clamp(state.player.lane + (direction === 'left' ? -0.9 : 0.9), 0, 2);
    },
    setInput(direction, active) {
      state.input[direction] = active;
    },
  };
}
