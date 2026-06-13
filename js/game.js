(function () {
  'use strict';

  const CONFIG = {
    WORLD_RADIUS: 3000,
    FOOD_COUNT: 800,
    BOT_COUNT: 15,
    SEGMENT_SPACING: 8,
    BASE_SPEED: 2.8,
    BOOST_SPEED: 5.5,
    BOOST_COST: 0.15,
    TURN_SPEED: 0.08,
    HEAD_RADIUS: 12,
    BODY_RADIUS: 10,
    FOOD_RADIUS: 4,
    BIG_FOOD_RADIUS: 8,
    SPAWN_LENGTH: 15,
    MIN_LENGTH: 8,
    GRID_SIZE: 60,
  };

  const BOT_NAMES = [
    'WążKing', 'NeonSlither', 'ViperX', 'GlowWorm', 'SnakeLord',
    'PythonPro', 'CobraKid', 'SlitherBot', 'Wormy', 'NoodleNinja',
    'Serpent', 'HissMaster', 'CoilKing', 'TailChaser', 'ScaleRunner',
    'FangFury', 'SlimeSnake', 'RainbowWorm', 'DarkViper', 'TurboWąż',
  ];

  const FOOD_COLORS = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6b9d',
    '#c8a2ff', '#00d2ff', '#ff9f43', '#a29bfe', '#fd79a8',
  ];

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas.getContext('2d');

  const startScreen = document.getElementById('start-screen');
  const deathScreen = document.getElementById('death-screen');
  const hud = document.getElementById('hud');
  const nicknameInput = document.getElementById('nickname');
  const playBtn = document.getElementById('play-btn');
  const restartBtn = document.getElementById('restart-btn');
  const scoreEl = document.getElementById('score');
  const finalScoreEl = document.getElementById('final-score');
  const deathMessageEl = document.getElementById('death-message');
  const leaderboardList = document.getElementById('leaderboard-list');
  const boostBar = document.getElementById('boost-bar');

  let width, height;
  let mouseX = 0, mouseY = 0;
  let boosting = false;
  let running = false;
  let player = null;
  let snakes = [];
  let foods = [];
  let camera = { x: 0, y: 0 };
  let animId = null;

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function randColor() {
    const h = randInt(0, 360);
    return {
      main: `hsl(${h}, 75%, 55%)`,
      dark: `hsl(${h}, 70%, 35%)`,
      light: `hsl(${h}, 80%, 70%)`,
    };
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clampInWorld(x, y) {
    const d = dist(0, 0, x, y);
    if (d > CONFIG.WORLD_RADIUS - 20) {
      const angle = Math.atan2(y, x);
      return {
        x: Math.cos(angle) * (CONFIG.WORLD_RADIUS - 20),
        y: Math.sin(angle) * (CONFIG.WORLD_RADIUS - 20),
      };
    }
    return { x, y };
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    minimapCanvas.width = 160;
    minimapCanvas.height = 160;
  }

  function createFood(x, y, value, color) {
    return {
      x: x ?? rand(-CONFIG.WORLD_RADIUS + 50, CONFIG.WORLD_RADIUS - 50),
      y: y ?? rand(-CONFIG.WORLD_RADIUS + 50, CONFIG.WORLD_RADIUS - 50),
      value: value ?? 1,
      color: color ?? pick(FOOD_COLORS),
      radius: value > 1 ? CONFIG.BIG_FOOD_RADIUS : CONFIG.FOOD_RADIUS,
      pulse: rand(0, Math.PI * 2),
    };
  }

  function spawnFoods() {
    foods = [];
    for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
      const pos = clampInWorld(
        rand(-CONFIG.WORLD_RADIUS + 100, CONFIG.WORLD_RADIUS - 100),
        rand(-CONFIG.WORLD_RADIUS + 100, CONFIG.WORLD_RADIUS - 100)
      );
      foods.push(createFood(pos.x, pos.y));
    }
  }

  function findSafeSpawn(existingSnakes) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = rand(0, Math.PI * 2);
      const spawnDist = rand(400, CONFIG.WORLD_RADIUS - 500);
      const x = Math.cos(angle) * spawnDist;
      const y = Math.sin(angle) * spawnDist;
      let ok = true;
      for (const other of existingSnakes) {
        if (!other.alive) continue;
        const oh = getHead(other);
        if (dist(x, y, oh.x, oh.y) < 350) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y, angle };
    }
    const angle = rand(0, Math.PI * 2);
    const spawnDist = rand(400, CONFIG.WORLD_RADIUS - 500);
    return {
      x: Math.cos(angle) * spawnDist,
      y: Math.sin(angle) * spawnDist,
      angle,
    };
  }

  function createSnake(name, isPlayer, existingSnakes) {
    const spawn = findSafeSpawn(existingSnakes || snakes);
    const { x, y, angle } = spawn;
    const color = isPlayer
      ? { main: '#7cfc00', dark: '#4a9a00', light: '#b8ff60' }
      : randColor();

    const segments = [];
    for (let i = 0; i < CONFIG.SPAWN_LENGTH; i++) {
      segments.push({
        x: x - Math.cos(angle) * i * CONFIG.SEGMENT_SPACING,
        y: y - Math.sin(angle) * i * CONFIG.SEGMENT_SPACING,
      });
    }

    return {
      name,
      isPlayer,
      alive: true,
      segments,
      angle,
      targetAngle: angle,
      color,
      length: CONFIG.SPAWN_LENGTH,
      score: CONFIG.SPAWN_LENGTH,
      boosting: false,
      spawnProtection: isPlayer ? 120 : 45,
      ai: isPlayer ? null : {
        aggression: rand(0.6, 1),
        huntTimer: 0,
        huntTarget: null,
      },
    };
  }

  function spawnBots() {
    const usedNames = new Set();
    for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
      let name;
      do {
        name = pick(BOT_NAMES);
      } while (usedNames.has(name));
      usedNames.add(name);
      snakes.push(createSnake(name, false, snakes));
    }
  }

  function growSnake(snake, amount) {
    snake.length += amount;
    snake.score = Math.floor(snake.length);
    const tail = snake.segments[snake.segments.length - 1];
    for (let i = 0; i < amount; i++) {
      snake.segments.push({ x: tail.x, y: tail.y });
    }
  }

  function dropFoodFromSnake(snake) {
    const step = Math.max(1, Math.floor(snake.segments.length / 20));
    for (let i = 0; i < snake.segments.length; i += step) {
      const seg = snake.segments[i];
      foods.push(createFood(
        seg.x + rand(-10, 10),
        seg.y + rand(-10, 10),
        rand(1, 3),
        pick(FOOD_COLORS)
      ));
    }
  }

  function killSnake(snake, killer) {
    if (!snake.alive) return;
    snake.alive = false;
    dropFoodFromSnake(snake);

    if (snake.isPlayer) {
      let message = 'Zginąłeś!';
      if (killer === null) message = 'Uderzyłeś w krawędź mapy!';
      else message = `Zabity przez ${killer.name}!`;
      endGame(message);
    }
  }

  function getHead(snake) {
    return snake.segments[0];
  }

  function getSpeed(snake) {
    return snake.boosting ? CONFIG.BOOST_SPEED : CONFIG.BASE_SPEED;
  }

  function updatePlayerInput(snake) {
    const head = getHead(snake);
    const worldMouseX = mouseX + camera.x - width / 2;
    const worldMouseY = mouseY + camera.y - height / 2;
    snake.targetAngle = Math.atan2(worldMouseY - head.y, worldMouseX - head.x);
    snake.boosting = boosting && snake.length > CONFIG.MIN_LENGTH;
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function angleDiff(from, to) {
    return normalizeAngle(to - from);
  }

  function predictPoint(snake, frames) {
    const head = getHead(snake);
    const speed = getSpeed(snake);
    return {
      x: head.x + Math.cos(snake.angle) * speed * frames,
      y: head.y + Math.sin(snake.angle) * speed * frames,
    };
  }

  function findHuntTarget(snake) {
    let best = null;
    let bestScore = -Infinity;
    const head = getHead(snake);

    for (const other of snakes) {
      if (other === snake || !other.alive) continue;
      const oh = getHead(other);
      const d = dist(head.x, head.y, oh.x, oh.y);
      if (d > 750) continue;

      const sizeRatio = snake.length / other.length;
      if (sizeRatio < 0.78) continue;

      const priority = other.isPlayer ? 1.35 : 1;
      const value = priority * sizeRatio * (750 - d);
      if (value > bestScore) {
        bestScore = value;
        best = other;
      }
    }
    return best;
  }

  function computeCutoffPoint(hunter, prey) {
    const ph = getHead(prey);
    const leadFrames = 16 + hunter.ai.aggression * 28;
    const lead = predictPoint(prey, leadFrames);
    const toPrey = Math.atan2(ph.y - getHead(hunter).y, ph.x - getHead(hunter).x);
    const perp = angleDiff(prey.angle, toPrey);

    if (Math.abs(perp) > 0.35) {
      const side = perp > 0 ? -1 : 1;
      const cutDist = 60 + hunter.ai.aggression * 50;
      return {
        x: ph.x + Math.cos(prey.angle + side * 0.75) * cutDist,
        y: ph.y + Math.sin(prey.angle + side * 0.75) * cutDist,
      };
    }
    return lead;
  }

  function scoreDirection(snake, angle) {
    const head = getHead(snake);
    let score = 0;
    const samples = [40, 90, 150, 220, 300];

    for (const ahead of samples) {
      const px = head.x + Math.cos(angle) * ahead;
      const py = head.y + Math.sin(angle) * ahead;
      const wallDist = CONFIG.WORLD_RADIUS - dist(0, 0, px, py);
      if (wallDist < 120) score -= (120 - wallDist) * 6;
      if (wallDist < 40) score -= 500;

      for (const other of snakes) {
        if (other === snake || !other.alive) continue;
        for (let i = 1; i < other.segments.length; i++) {
          const seg = other.segments[i];
          const d = dist(px, py, seg.x, seg.y);
          if (d < 45) score -= (45 - d) * 4;
        }
        const oh = getHead(other);
        const hd = dist(px, py, oh.x, oh.y);
        if (hd < 35 && snake.length <= other.length) score -= (35 - hd) * 6;
      }
    }

    const centerAngle = Math.atan2(-head.y, -head.x);
    const centerDist = dist(0, 0, head.x, head.y);
    if (centerDist > CONFIG.WORLD_RADIUS - 250) {
      const centerDiff = Math.abs(angleDiff(angle, centerAngle));
      score += Math.max(0, 60 - centerDiff * 50);
    }

    let nearestFood = null;
    let nearestFoodDist = Infinity;
    for (const food of foods) {
      const d = dist(head.x, head.y, food.x, food.y);
      if (d < nearestFoodDist && d < 550) {
        nearestFoodDist = d;
        nearestFood = food;
      }
    }
    if (nearestFood) {
      const foodAngle = Math.atan2(nearestFood.y - head.y, nearestFood.x - head.x);
      const diff = Math.abs(angleDiff(angle, foodAngle));
      score += Math.max(0, 55 - diff * 70 - nearestFoodDist * 0.02);
    }

    const prey = findHuntTarget(snake);
    if (prey) {
      const cut = computeCutoffPoint(snake, prey);
      const huntAngle = Math.atan2(cut.y - head.y, cut.x - head.x);
      const huntDiff = Math.abs(angleDiff(angle, huntAngle));
      const distToPrey = dist(head.x, head.y, getHead(prey).x, getHead(prey).y);
      const preyBonus = prey.isPlayer ? 140 : 90;
      score += Math.max(0, preyBonus - huntDiff * 90 - distToPrey * 0.03);
    } else {
      for (const other of snakes) {
        if (other === snake || !other.alive) continue;
        if (snake.length >= other.length * 0.95) continue;
        const oh = getHead(other);
        const d = dist(head.x, head.y, oh.x, oh.y);
        if (d < 400) {
          const fleeAngle = Math.atan2(head.y - oh.y, head.x - oh.x);
          const fleeDiff = Math.abs(angleDiff(angle, fleeAngle));
          score += Math.max(0, 110 - fleeDiff * 75);
        }
      }
    }

    return score;
  }

  function pickBestAngle(snake, baseAngle, spread, steps) {
    let bestAngle = baseAngle;
    let bestScore = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const a = baseAngle + (t - 0.5) * spread * 2;
      const s = scoreDirection(snake, a);
      if (s > bestScore) {
        bestScore = s;
        bestAngle = a;
      }
    }
    return { angle: bestAngle, score: bestScore };
  }

  function updateBotAI(snake) {
    const head = getHead(snake);
    const prey = findHuntTarget(snake);

    if (prey) {
      snake.ai.huntTimer = 90;
      snake.ai.huntTarget = prey;
    } else if (snake.ai.huntTimer > 0) {
      snake.ai.huntTimer--;
    }

    let baseAngle = snake.angle;
    const activePrey = snake.ai.huntTarget && snake.ai.huntTarget.alive && snake.ai.huntTimer > 0
      ? snake.ai.huntTarget
      : prey;

    if (activePrey && snake.length >= activePrey.length * 0.78) {
      const cut = computeCutoffPoint(snake, activePrey);
      baseAngle = Math.atan2(cut.y - head.y, cut.x - head.x);
    } else {
      snake.ai.huntTarget = null;
      let nearest = null;
      let nearestDist = Infinity;
      for (const food of foods) {
        const d = dist(head.x, head.y, food.x, food.y);
        if (d < nearestDist && d < 500) {
          nearestDist = d;
          nearest = food;
        }
      }
      if (nearest) {
        baseAngle = Math.atan2(nearest.y - head.y, nearest.x - head.x);
      } else if (dist(0, 0, head.x, head.y) > CONFIG.WORLD_RADIUS - 300) {
        baseAngle = Math.atan2(-head.y, -head.x);
      }
    }

    const danger = pickBestAngle(snake, snake.angle, Math.PI * 0.95, 16);
    const planned = pickBestAngle(snake, baseAngle, Math.PI / 2.5, 14);
    const chosen = planned.score > danger.score - 20 ? planned : danger;

    snake.targetAngle = chosen.angle;

    const urgent = danger.score < -40;
    const hunting = activePrey && snake.ai.huntTimer > 0
      && snake.length >= activePrey.length * 0.82
      && dist(head.x, head.y, getHead(activePrey).x, getHead(activePrey).y) < 450;
    snake.boosting = snake.length > CONFIG.MIN_LENGTH + 8 && (urgent || hunting);
  }

  function moveSnake(snake) {
    if (!snake.alive) return;

    let diff = snake.targetAngle - snake.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = snake.isPlayer
      ? CONFIG.TURN_SPEED
      : CONFIG.TURN_SPEED * (snake.ai && snake.ai.huntTimer > 0 ? 1.2 : 1.05);
    snake.angle += diff * turnRate;

    const speed = getSpeed(snake);
    const head = getHead(snake);
    let newX = head.x + Math.cos(snake.angle) * speed;
    let newY = head.y + Math.sin(snake.angle) * speed;

    const clamped = clampInWorld(newX, newY);
    newX = clamped.x;
    newY = clamped.y;

    if (dist(0, 0, newX, newY) >= CONFIG.WORLD_RADIUS - 15) {
      killSnake(snake, null);
      return;
    }

    head.x = newX;
    head.y = newY;

    for (let i = 1; i < snake.segments.length; i++) {
      const prev = snake.segments[i - 1];
      const curr = snake.segments[i];
      const segDist = dist(prev.x, prev.y, curr.x, curr.y);
      if (segDist > CONFIG.SEGMENT_SPACING) {
        const t = (segDist - CONFIG.SEGMENT_SPACING) / segDist;
        curr.x += (prev.x - curr.x) * t;
        curr.y += (prev.y - curr.y) * t;
      }
    }

    const targetSegCount = Math.floor(snake.length);
    while (snake.segments.length < targetSegCount) {
      const tail = snake.segments[snake.segments.length - 1];
      snake.segments.push({ x: tail.x, y: tail.y });
    }
    while (snake.segments.length > targetSegCount) {
      snake.segments.pop();
    }

    if (snake.boosting) {
      snake.length = Math.max(CONFIG.MIN_LENGTH, snake.length - CONFIG.BOOST_COST);
      snake.score = Math.floor(snake.length);
      if (snake.length <= CONFIG.MIN_LENGTH) {
        snake.boosting = false;
      }
    }

    if (snake.spawnProtection > 0) snake.spawnProtection--;
  }

  function checkFoodCollisions(snake) {
    const head = getHead(snake);
    const eatRadius = CONFIG.HEAD_RADIUS + CONFIG.FOOD_RADIUS;

    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      if (dist(head.x, head.y, food.x, food.y) < eatRadius + food.radius) {
        growSnake(snake, food.value);
        foods.splice(i, 1);
        if (foods.length < CONFIG.FOOD_COUNT * 0.7) {
          foods.push(createFood());
        }
      }
    }
  }

  function headBodyHitDist() {
    return CONFIG.HEAD_RADIUS + CONFIG.BODY_RADIUS - 2;
  }

  function checkSnakeCollisions() {
    const hitDist = headBodyHitDist();
    const headHitDist = CONFIG.HEAD_RADIUS * 2 - 1;

    for (let si = 0; si < snakes.length; si++) {
      const a = snakes[si];
      if (!a.alive) continue;
      const aHead = getHead(a);

      for (let sj = si + 1; sj < snakes.length; sj++) {
        const b = snakes[sj];
        if (!b.alive) continue;

        const bHead = getHead(b);
        const hhDist = dist(aHead.x, aHead.y, bHead.x, bHead.y);
        if (hhDist >= headHitDist) continue;

        const aVuln = a.spawnProtection === 0;
        const bVuln = b.spawnProtection === 0;
        if (!aVuln && !bVuln) continue;
        if (aVuln && !bVuln) { killSnake(a, b); continue; }
        if (!aVuln && bVuln) { killSnake(b, a); continue; }

        if (Math.abs(a.length - b.length) < 3) {
          killSnake(a, b);
          killSnake(b, a);
        } else if (a.length < b.length) {
          killSnake(a, b);
        } else {
          killSnake(b, a);
        }
      }
    }

    for (const snake of snakes) {
      if (!snake.alive) continue;
      const head = getHead(snake);

      for (const other of snakes) {
        if (other === snake || !other.alive) continue;

        for (let i = 1; i < other.segments.length; i++) {
          const seg = other.segments[i];
          if (dist(head.x, head.y, seg.x, seg.y) < hitDist) {
            killSnake(snake, other);
            break;
          }
        }
        if (!snake.alive) break;
      }
    }
  }

  function drawPlayGrid(cx, cy, radius) {
    const offsetX = camera.x % CONFIG.GRID_SIZE;
    const offsetY = camera.y % CONFIG.GRID_SIZE;

    ctx.strokeStyle = 'rgba(80, 60, 130, 0.18)';
    ctx.lineWidth = 1;

    for (let x = cx - radius - offsetX; x < cx + radius + width; x += CONFIG.GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, cy - radius - height);
      ctx.lineTo(x, cy + radius + height);
      ctx.stroke();
    }
    for (let y = cy - radius - offsetY; y < cy + radius + height; y += CONFIG.GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(cx - radius - width, y);
      ctx.lineTo(cx + radius + width, y);
      ctx.stroke();
    }
  }

  function drawVoidZone(cx, cy, radius) {
    ctx.save();

    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);

    const voidGrad = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + 800);
    voidGrad.addColorStop(0, 'rgba(30, 8, 45, 0.98)');
    voidGrad.addColorStop(0.35, 'rgba(10, 2, 18, 0.99)');
    voidGrad.addColorStop(1, 'rgba(2, 0, 6, 1)');
    ctx.fillStyle = voidGrad;
    ctx.fill('evenodd');

    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.clip('evenodd');

    const time = Date.now() * 0.0004;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2 + time;
      const r = radius + 40 + (i % 5) * 18;
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r;
      ctx.fillStyle = `rgba(180, 80, 255, ${0.1 + (i % 3) * 0.05})`;
      ctx.fillRect(sx, sy, 2, 2);
    }

    for (let i = 0; i < 12; i++) {
      const a = time * 0.5 + (i / 12) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(80, 30, 120, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.lineTo(cx + Math.cos(a) * (radius + 250), cy + Math.sin(a) * (radius + 250));
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBackground() {
    const cx = width / 2 - camera.x;
    const cy = height / 2 - camera.y;
    const R = CONFIG.WORLD_RADIUS;

    ctx.fillStyle = '#030108';
    ctx.fillRect(0, 0, width, height);

    drawVoidZone(cx, cy, R);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const arenaGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    arenaGrad.addColorStop(0, '#16132e');
    arenaGrad.addColorStop(0.65, '#0e0c1c');
    arenaGrad.addColorStop(0.92, '#120e22');
    arenaGrad.addColorStop(1, '#1a1235');
    ctx.fillStyle = arenaGrad;
    ctx.fillRect(cx - R - 10, cy - R - 10, R * 2 + 20, R * 2 + 20);

    drawPlayGrid(cx, cy, R);

    const edgeWarn = R - 100;
    ctx.beginPath();
    ctx.arc(cx, cy, edgeWarn, 0, Math.PI * 2);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.fillStyle = 'rgba(255, 60, 100, 0.04)';
    ctx.fill('evenodd');

    ctx.restore();
  }

  function drawWorldBoundary() {
    const cx = width / 2 - camera.x;
    const cy = height / 2 - camera.y;
    const R = CONFIG.WORLD_RADIUS;

    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 14;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#c8a2ff';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(200, 120, 255, 0.9)';
    ctx.shadowBlur = 25;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 80, 140, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx - camera.x + width / 2,
      y: wy - camera.y + height / 2,
    };
  }

  function isOnScreen(wx, wy, margin) {
    const s = worldToScreen(wx, wy);
    return s.x > -margin && s.x < width + margin && s.y > -margin && s.y < height + margin;
  }

  function drawFoods() {
    const time = Date.now() / 1000;
    for (const food of foods) {
      if (!isOnScreen(food.x, food.y, 20)) continue;

      const s = worldToScreen(food.x, food.y);
      const pulse = 1 + Math.sin(time * 3 + food.pulse) * 0.15;
      const r = food.radius * pulse;

      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = food.color + '33';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = food.color;
      ctx.shadowColor = food.color;
      ctx.shadowBlur = 8;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x - r * 0.25, s.y - r * 0.25, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSnake(snake) {
    if (!snake.alive) return;

    const segments = snake.segments;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (!isOnScreen(seg.x, seg.y, 30)) continue;

      const s = worldToScreen(seg.x, seg.y);
      const t = i / segments.length;
      const radius = i === 0
        ? CONFIG.HEAD_RADIUS
        : CONFIG.BODY_RADIUS * (0.7 + 0.3 * (1 - t * 0.5));

      ctx.save();

      ctx.beginPath();
      ctx.arc(s.x, s.y, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = snake.color.dark;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(
        s.x - radius * 0.3, s.y - radius * 0.3, 0,
        s.x, s.y, radius
      );
      grad.addColorStop(0, snake.color.light);
      grad.addColorStop(1, snake.color.main);
      ctx.fillStyle = grad;
      ctx.shadowColor = snake.color.main;
      ctx.shadowBlur = snake.boosting ? 15 : 6;
      ctx.fill();

      if (i === 0) {
        drawEyes(s.x, s.y, snake.angle, radius);
        if (snake.spawnProtection > 0) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${0.3 + Math.sin(Date.now() / 100) * 0.2})`;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    if (isOnScreen(segments[0].x, segments[0].y, 50)) {
      const headScreen = worldToScreen(segments[0].x, segments[0].y);
      ctx.save();
      ctx.font = 'bold 13px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(snake.name, headScreen.x, headScreen.y - CONFIG.HEAD_RADIUS - 10);
      ctx.fillText(snake.name, headScreen.x, headScreen.y - CONFIG.HEAD_RADIUS - 10);
      ctx.restore();
    }
  }

  function drawEyes(sx, sy, angle, radius) {
    const eyeOffset = radius * 0.45;
    const eyeRadius = radius * 0.35;
    const perpAngle = angle + Math.PI / 2;

    for (const side of [-1, 1]) {
      const ex = sx + Math.cos(angle) * eyeOffset + Math.cos(perpAngle) * eyeRadius * side * 0.8;
      const ey = sy + Math.sin(angle) * eyeOffset + Math.sin(perpAngle) * eyeRadius * side * 0.8;

      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 0;
      ctx.fill();

      const pupilX = ex + Math.cos(angle) * eyeRadius * 0.4;
      const pupilY = ey + Math.sin(angle) * eyeRadius * 0.4;
      ctx.beginPath();
      ctx.arc(pupilX, pupilY, eyeRadius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
    }
  }

  function drawMinimap() {
    const mSize = 160;
    const scale = mSize / (CONFIG.WORLD_RADIUS * 2.2);

    minimapCtx.fillStyle = 'rgba(2, 0, 6, 0.95)';
    minimapCtx.fillRect(0, 0, mSize, mSize);

    minimapCtx.save();
    minimapCtx.beginPath();
    minimapCtx.arc(mSize / 2, mSize / 2, mSize / 2 - 2, 0, Math.PI * 2);
    minimapCtx.clip();

    minimapCtx.fillStyle = 'rgba(14, 12, 28, 0.95)';
    minimapCtx.beginPath();
    minimapCtx.arc(mSize / 2, mSize / 2, CONFIG.WORLD_RADIUS * scale, 0, Math.PI * 2);
    minimapCtx.fill();

    minimapCtx.strokeStyle = 'rgba(200, 120, 255, 0.7)';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    minimapCtx.arc(mSize / 2, mSize / 2, CONFIG.WORLD_RADIUS * scale, 0, Math.PI * 2);
    minimapCtx.stroke();

    for (const food of foods) {
      if (Math.random() > 0.02) continue;
      const fx = mSize / 2 + food.x * scale;
      const fy = mSize / 2 + food.y * scale;
      minimapCtx.fillStyle = food.color + '88';
      minimapCtx.fillRect(fx, fy, 1, 1);
    }

    for (const snake of snakes) {
      if (!snake.alive) continue;
      const head = getHead(snake);
      const hx = mSize / 2 + head.x * scale;
      const hy = mSize / 2 + head.y * scale;
      minimapCtx.beginPath();
      minimapCtx.arc(hx, hy, snake.isPlayer ? 3 : 2, 0, Math.PI * 2);
      minimapCtx.fillStyle = snake.isPlayer ? '#7cfc00' : snake.color.main;
      minimapCtx.fill();
    }

    if (player && player.alive) {
      const vx = mSize / 2 + (camera.x - width / 2) * scale;
      const vy = mSize / 2 + (camera.y - height / 2) * scale;
      const vw = width * scale;
      const vh = height * scale;
      minimapCtx.strokeStyle = 'rgba(255,255,255,0.3)';
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(vx, vy, vw, vh);
    }

    minimapCtx.restore();
  }

  function updateLeaderboard() {
    const sorted = snakes
      .filter(s => s.alive)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    leaderboardList.innerHTML = sorted.map((s, i) =>
      `<li class="${s.isPlayer ? 'player-entry' : ''}">
        <span class="rank">${i + 1}.</span>
        <span class="name">${s.name}</span>
        <span class="pts">${s.score}</span>
      </li>`
    ).join('');
  }

  function updateCamera() {
    if (!player || !player.alive) return;
    const head = getHead(player);
    camera.x += (head.x - camera.x) * 0.12;
    camera.y += (head.y - camera.y) * 0.12;
  }

  function updateHUD() {
    if (!player) return;
    scoreEl.textContent = player.score;
    const boostPct = Math.max(0, ((player.length - CONFIG.MIN_LENGTH) / (CONFIG.SPAWN_LENGTH * 3)) * 100);
    boostBar.style.width = `${Math.min(100, boostPct)}%`;
  }

  function gameLoop() {
    if (!running) return;

    for (const snake of snakes) {
      if (!snake.alive) continue;
      if (snake.isPlayer) {
        updatePlayerInput(snake);
      } else {
        updateBotAI(snake);
      }
      moveSnake(snake);
      checkFoodCollisions(snake);
    }

    checkSnakeCollisions();

    if (snakes.some(s => !s.isPlayer && !s.alive)) {
      snakes = snakes.filter(s => s.alive || s.isPlayer);
      while (snakes.filter(s => !s.isPlayer).length < CONFIG.BOT_COUNT) {
        snakes.push(createSnake(pick(BOT_NAMES), false, snakes));
      }
    }

    updateCamera();

    drawBackground();
    drawWorldBoundary();
    drawFoods();

    const sortedSnakes = [...snakes].sort((a, b) => {
      if (a.isPlayer) return 1;
      if (b.isPlayer) return -1;
      return a.score - b.score;
    });
    for (const snake of sortedSnakes) {
      drawSnake(snake);
    }

    drawMinimap();
    updateLeaderboard();
    updateHUD();

    animId = requestAnimationFrame(gameLoop);
  }

  function startGame() {
    const name = nicknameInput.value.trim() || 'Gracz';
    running = true;
    boosting = false;
    snakes = [];
    player = createSnake(name, true, []);
    snakes.push(player);
    spawnBots();
    spawnFoods();
    camera.x = getHead(player).x;
    camera.y = getHead(player).y;
    mouseX = width / 2 + Math.cos(player.angle) * 100;
    mouseY = height / 2 + Math.sin(player.angle) * 100;

    startScreen.classList.add('hidden');
    deathScreen.classList.add('hidden');
    hud.classList.remove('hidden');

    if (animId) cancelAnimationFrame(animId);
    gameLoop();
  }

  function endGame(message) {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    deathMessageEl.textContent = message;
    finalScoreEl.textContent = player ? player.score : 0;
    deathScreen.classList.remove('hidden');
  }

  playBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });

  function setPointer(clientX, clientY) {
    mouseX = clientX;
    mouseY = clientY;
  }

  canvas.addEventListener('mousemove', (e) => setPointer(e.clientX, e.clientY));
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    setPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    setPointer(e.touches[0].clientX, e.touches[0].clientY);
    boosting = true;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { boosting = false; });

  window.addEventListener('mousedown', (e) => {
    if (running && e.button === 0) boosting = true;
  });
  window.addEventListener('mouseup', () => { boosting = false; });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      boosting = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      boosting = false;
    }
  });

  window.addEventListener('resize', resize);
  resize();

  nicknameInput.focus();
})();
