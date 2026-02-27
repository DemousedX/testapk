// ═══════════════════════════════════════════════
//  NITRO RUSH — game.js
// ═══════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ─── CONSTANTS ─────────────────────────────────
const LANES      = 3;
const BASE_SPEED = 5;
const MAX_SPEED  = 16;

// ─── STATE ─────────────────────────────────────
const state = {
  phase: 'MENU',         // MENU | PLAYING | GAMEOVER
  score:       0,
  record:      0,
  coins:       0,        // earned this run
  totalCoins:  0,        // persistent wallet
  xp:          0,
  xpMult:      1,
  pendingBoosts: { xp2x: false, shield: false, magnet: false },
  activeBoosts:  { xp2x: false, shield: false, magnet: false },
};

// ─── GEOMETRY (recalculated on resize) ─────────
let W, H, ROAD_X, ROAD_W, LANE_W, PLAYER_Y;

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  ROAD_W   = Math.min(380, W);
  LANE_W   = ROAD_W / LANES;
  ROAD_X   = (W - ROAD_W) / 2;
  PLAYER_Y = H * 0.64;
}
resize();
window.addEventListener('resize', () => {
  resize();
  if (state.phase === 'PLAYING') snapPlayer();
});

// ─── GAME OBJECTS ──────────────────────────────
let player, rival, obstacles, coins, particles;
let gameSpeed, scrollY, spawnT, coinT;
let rivalGap;     // pixels rival is behind player (positive = behind)
let shakeAmt;
let menuScroll = 0;

function laneX(lane) { return ROAD_X + lane * LANE_W + LANE_W * 0.5; }

function snapPlayer() {
  if (!player) return;
  player.tx = laneX(player.lane);
}

// ─── INIT ───────────────────────────────────────
function initGame() {
  gameSpeed = BASE_SPEED;
  scrollY   = 0;
  spawnT    = 60;
  coinT     = 50;
  obstacles = [];
  coins     = [];
  particles = [];
  rivalGap  = 300;
  shakeAmt  = 0;

  state.score  = 0;
  state.coins  = 0;
  state.xp     = 0;
  state.xpMult = state.pendingBoosts.xp2x ? 2 : 1;
  state.activeBoosts = { ...state.pendingBoosts };
  state.pendingBoosts = { xp2x: false, shield: false, magnet: false };

  player = {
    lane: 1,
    x:  laneX(1),
    tx: laneX(1),
    y:  PLAYER_Y,
    w:  LANE_W * 0.48,
    h:  LANE_W * 0.78,
    crashed:    false,
    crashTimer: 0,
    shieldHits: state.activeBoosts.shield ? 1 : 0,
    // visual flicker phase
    blink: 0,
  };

  rival = {
    x:  laneX(1),
    tx: laneX(1),
    lane: 1,
    changeLaneT: 0,
    w: LANE_W * 0.48,
    h: LANE_W * 0.78,
  };

  updateHUD();
}

// ─── INPUT ──────────────────────────────────────
function moveLeft()  { if (player && player.lane > 0 && !player.crashed)       { player.lane--; player.tx = laneX(player.lane); } }
function moveRight() { if (player && player.lane < LANES-1 && !player.crashed) { player.lane++; player.tx = laneX(player.lane); } }

let touchX0 = null, touchY0 = null;

canvas.addEventListener('touchstart', e => {
  if (state.phase !== 'PLAYING') return;
  touchX0 = e.touches[0].clientX;
  touchY0 = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', e => {
  if (state.phase !== 'PLAYING') return;
  const dx = e.changedTouches[0].clientX - touchX0;
  const dy = e.changedTouches[0].clientY - touchY0;
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
    // tap
    e.changedTouches[0].clientX < W * 0.5 ? moveLeft() : moveRight();
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    dx < 0 ? moveLeft() : moveRight();
  }
}, { passive: true });

window.addEventListener('keydown', e => {
  if (state.phase !== 'PLAYING') return;
  if (e.key === 'ArrowLeft'  || e.key === 'a') moveLeft();
  if (e.key === 'ArrowRight' || e.key === 'd') moveRight();
});

canvas.addEventListener('click', e => {
  if (state.phase !== 'PLAYING') return;
  e.clientX < W * 0.5 ? moveLeft() : moveRight();
});

// ─── SPAWN ──────────────────────────────────────
function spawnObstacle() {
  const count = Math.random() < 0.28 ? 2 : 1;
  const lanes = shuffle([0,1,2]).slice(0, count);
  lanes.forEach(lane => {
    obstacles.push({
      lane,
      x: laneX(lane),
      y: -LANE_W,
      w: LANE_W * 0.46,
      h: LANE_W * 0.74,
      type: Math.random() < 0.65 ? 'car' : 'barrier',
      color: rndColor(),
    });
  });
}

function spawnCoins() {
  const lane  = Math.floor(Math.random() * LANES);
  const count = Math.floor(Math.random() * 4) + 1;
  for (let i = 0; i < count; i++) {
    coins.push({ lane, x: laneX(lane), y: -90 - i * 44, r: 13, done: false });
  }
}

const CAR_COLORS = ['#e74c3c','#2ecc71','#3498db','#f39c12','#9b59b6','#e8e8e8','#ff6b6b'];
function rndColor() { return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]; }
function shuffle(a) {
  const b = [...a];
  for (let i = b.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [b[i],b[j]]=[b[j],b[i]];
  }
  return b;
}

// ─── PARTICLES ──────────────────────────────────
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 6;
    particles.push({
      x, y,
      vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
      r:  3 + Math.random()*5,
      color, life: 1,
      decay: 0.025 + Math.random()*0.03,
    });
  }
}

// ─── COLLISION ──────────────────────────────────
function checkCollisions() {
  if (!player || player.crashed) return;
  const px = player.x, py = player.y;
  const pw = player.w * 0.55, ph = player.h * 0.55;

  for (let o of obstacles) {
    if (Math.abs(o.x - px) < pw + o.w*0.5 && Math.abs(o.y - py) < ph + o.h*0.5) {
      onCrash(o.x, o.y); return;
    }
  }

  const MAGNET_RANGE = state.activeBoosts.magnet ? LANE_W * 1.8 : 0;
  for (let c of coins) {
    if (c.done) continue;
    const dist = Math.hypot(c.x - px, c.y - py);
    if (dist < pw + c.r + MAGNET_RANGE) {
      c.done = true;
      state.coins++;
      state.totalCoins++;
      burst(c.x, c.y, '#ffd700', 6);
      updateHUD();
    }
  }
}

function onCrash(ox, oy) {
  if (player.shieldHits > 0) {
    player.shieldHits--;
    burst(ox, oy, '#00f5ff', 22);
    shakeAmt = 8;
    return;
  }
  player.crashed    = true;
  player.crashTimer = 130;
  player.blink      = 0;
  shakeAmt = 18;
  burst(player.x, player.y, '#ff4422', 22);
}

// ─── UPDATE ─────────────────────────────────────
function update() {
  if (state.phase !== 'PLAYING') return;

  // Speed ramp-up
  gameSpeed = Math.min(MAX_SPEED, gameSpeed + 0.0018);

  const spd = player.crashed ? gameSpeed * 0.28 : gameSpeed;
  scrollY += spd;

  // Player glide
  player.x += (player.tx - player.x) * 0.14;

  // Crash countdown
  if (player.crashed) {
    player.crashTimer--;
    player.blink++;
    if (player.crashTimer <= 0) player.crashed = false;
  }

  // Score / XP
  const pts = (player.crashed ? 0.08 : 0.5) * state.xpMult;
  state.score += pts;
  state.xp    += pts * 0.6;

  // Rival logic
  if (player.crashed) {
    rivalGap -= 3.8;
  } else {
    rivalGap += 0.25;
    if (rivalGap > 320) rivalGap = 320;
  }
  // Rival lane wander
  rival.changeLaneT--;
  if (rival.changeLaneT <= 0) {
    rival.lane = Math.floor(Math.random() * LANES);
    rival.tx   = laneX(rival.lane);
    rival.changeLaneT = 40 + Math.floor(Math.random() * 60);
  }
  rival.x += (rival.tx - rival.x) * 0.06;

  // GAME OVER if rival overtakes
  if (rivalGap < -player.h * 1.1) { endGame(); return; }

  // Spawn obstacles
  spawnT--;
  if (spawnT <= 0) {
    spawnObstacle();
    spawnT = Math.max(38, Math.floor(100 - gameSpeed * 2.8));
  }
  // Spawn coins
  coinT--;
  if (coinT <= 0) {
    spawnCoins();
    coinT = 55 + Math.floor(Math.random() * 35);
  }

  // Move obstacles
  obstacles.forEach(o => { o.y += spd; });
  obstacles = obstacles.filter(o => o.y < H + 120);

  // Move coins + magnet pull
  coins.forEach(c => {
    if (c.done) return;
    c.y += spd;
    if (state.activeBoosts.magnet) {
      const dx = player.x - c.x, dy = player.y - c.y;
      if (Math.hypot(dx,dy) < LANE_W * 2) { c.x += dx*0.09; c.y += dy*0.09; }
    }
  });
  coins = coins.filter(c => c.y < H + 60 && !c.done);

  // Particles
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.18; p.vx *= 0.94;
    p.r  *= 0.97; p.life -= p.decay;
  });
  particles = particles.filter(p => p.life > 0);

  shakeAmt *= 0.82;

  checkCollisions();
  updateHUD();
}

// ─── DRAW ───────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  if (state.phase === 'MENU' || state.phase === 'GAMEOVER') {
    drawMenuBg(); return;
  }
  if (state.phase !== 'PLAYING') return;

  const sx = shakeAmt > 1 ? (Math.random()-0.5)*shakeAmt : 0;
  const sy = shakeAmt > 1 ? (Math.random()-0.5)*shakeAmt : 0;
  if (shakeAmt > 1) { ctx.save(); ctx.translate(sx, sy); }

  drawRoad();
  drawCoins();
  drawObstacles();
  drawRivalCar();
  drawPlayerCar();
  drawParticles();

  if (shakeAmt > 1) ctx.restore();

  // Danger vignette
  const danger = Math.max(0, 1 - rivalGap / 320);
  if (danger > 0.05) {
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.28, W/2, H/2, H*0.85);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, `rgba(255,0,30,${danger * 0.38})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}

// ─── ROAD ───────────────────────────────────────
function drawRoad() {
  // Base road
  ctx.fillStyle = '#0b0b17';
  ctx.fillRect(ROAD_X, 0, ROAD_W, H);

  // Ambient glow edges
  let g = ctx.createLinearGradient(ROAD_X - 30, 0, ROAD_X + 14, 0);
  g.addColorStop(0, 'transparent');
  g.addColorStop(1, 'rgba(0,245,255,0.12)');
  ctx.fillStyle = g; ctx.fillRect(ROAD_X - 30, 0, 44, H);

  g = ctx.createLinearGradient(ROAD_X+ROAD_W-14, 0, ROAD_X+ROAD_W+30, 0);
  g.addColorStop(0, 'rgba(0,245,255,0.12)');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g; ctx.fillRect(ROAD_X+ROAD_W-14, 0, 44, H);

  // Hard border strips
  ctx.fillStyle = 'rgba(0,245,255,0.9)';
  ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 10;
  ctx.fillRect(ROAD_X - 3, 0, 3, H);
  ctx.fillRect(ROAD_X + ROAD_W, 0, 3, H);
  ctx.shadowBlur = 0;

  // Lane dashes
  const DASH = 55, GAP = 38, PER = DASH + GAP;
  const off = scrollY % PER;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH, GAP]);
  ctx.lineDashOffset = -off;
  for (let l = 1; l < LANES; l++) {
    const lx = ROAD_X + l * LANE_W;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── CAR DRAWING ────────────────────────────────
function drawTopDownCar(x, y, w, h, bodyCol, winCol, isPlayer, flashing, shielded, facing='up') {
  ctx.save();
  ctx.translate(x, y);
  if (flashing && Math.floor(Date.now()/80)%2===0) { ctx.globalAlpha = 0.45; }
  if (!isPlayer) ctx.rotate(Math.PI); // opponent faces up too (we see their back)

  const hw = w*0.5, hh = h*0.5;

  // Exhaust / engine glow
  if (isPlayer && !flashing) {
    const grad = ctx.createLinearGradient(0, hh, 0, hh+34);
    grad.addColorStop(0, 'rgba(0,180,255,0.6)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(-hw*0.35, hh, hw*0.7, 34);
  }

  // Shadow
  ctx.shadowColor = bodyCol;
  ctx.shadowBlur = isPlayer ? 22 : 12;

  // Main body
  ctx.fillStyle = bodyCol;
  roundRect(ctx, -hw, -hh, w, h, 7);
  ctx.fill();

  // Hood panel
  ctx.fillStyle = shadeColor(bodyCol, -30);
  roundRect(ctx, -hw+4, -hh+4, w-8, h*0.38, 5);
  ctx.fill();

  // Windshield
  ctx.fillStyle = winCol;
  ctx.globalAlpha *= 0.75;
  roundRect(ctx, -hw*0.65, -hh*0.55, w*0.65, h*0.22, 3);
  ctx.fill();
  ctx.globalAlpha = isPlayer && flashing && Math.floor(Date.now()/80)%2===0 ? 0.45 : 1;

  ctx.shadowBlur = 18;

  // Headlights
  const hlCol = isPlayer ? '#00f5ff' : '#ffcc00';
  ctx.shadowColor = hlCol;
  ctx.fillStyle   = hlCol;
  ctx.fillRect(-hw+5,  -hh+5, hw*0.28, 7);
  ctx.fillRect( hw-5 - hw*0.28, -hh+5, hw*0.28, 7);

  // Rear lights
  const rlCol = '#ff2200';
  ctx.shadowColor = rlCol;
  ctx.fillStyle   = rlCol;
  ctx.fillRect(-hw+5,  hh-12, hw*0.28, 7);
  ctx.fillRect( hw-5 - hw*0.28, hh-12, hw*0.28, 7);

  // Shield ring
  if (shielded) {
    ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 30;
    ctx.strokeStyle = 'rgba(0,245,255,0.8)';
    ctx.lineWidth = 3;
    roundRect(ctx, -hw-8, -hh-8, w+16, h+16, 12);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayerCar() {
  if (!player) return;
  drawTopDownCar(
    player.x, player.y,
    player.w, player.h,
    '#0077bb', '#00f5ff',
    true,
    player.crashed,
    player.shieldHits > 0
  );
}

function drawRivalCar() {
  if (!rival) return;
  const ry = player.y + rivalGap;
  if (ry > H + rival.h * 2) return;

  drawTopDownCar(rival.x, ry, rival.w, rival.h, '#aa0000', '#ff6644', false, false, false);

  // Warning label
  if (rivalGap < 160) {
    const t   = (160 - rivalGap) / 160;
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 120);
    ctx.globalAlpha = t * pulse;
    ctx.fillStyle = '#ff073a';
    ctx.shadowColor = '#ff073a';
    ctx.shadowBlur = 24;
    ctx.font = `900 ${Math.round(11 + t*7)}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠ НЕБЕЗПЕКА!', W * 0.5, ry - rival.h * 0.9);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

function drawObstacles() {
  obstacles.forEach(o => {
    if (o.type === 'barrier') drawBarrier(o);
    else drawTopDownCar(o.x, o.y, o.w, o.h, o.color, '#e0e0e0', false, false, false);
  });
}

function drawBarrier(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  const hw = o.w*0.5, hh = o.h*0.3;
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#cc6600';
  ctx.fillRect(-hw, -hh, o.w, hh*2);
  // stripes
  ctx.fillStyle = '#eeeeee';
  const sw = o.w / 5;
  for (let i = 0; i < 3; i += 2) ctx.fillRect(-hw + i*sw, -hh, sw, hh*2);
  ctx.restore();
}

// ─── COINS ──────────────────────────────────────
function drawCoins() {
  const t = Date.now() * 0.003;
  coins.forEach(c => {
    if (c.done) return;
    ctx.save();
    ctx.translate(c.x, c.y);
    const sx = Math.abs(Math.cos(t + c.x * 0.05));
    ctx.scale(sx, 1);
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#cc9900';
    ctx.font = `900 ${c.r}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  });
}

// ─── PARTICLES ──────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ─── MENU BACKGROUND ────────────────────────────
function drawMenuBg() {
  menuScroll += 2.5;
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);

  const rw = Math.min(380, W);
  const rx = (W - rw) / 2;

  // Perspective road effect
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(rx, 0, rw, H);

  const DASH = 55, GAP = 38, PER = DASH+GAP;
  const off = menuScroll % PER;
  ctx.strokeStyle = 'rgba(0,245,255,0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH, GAP]);
  ctx.lineDashOffset = -off;
  for (let l = 1; l < 3; l++) {
    const lx = rx + l * (rw/3);
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Edge glow
  ctx.fillStyle = 'rgba(0,245,255,0.7)';
  ctx.fillRect(rx-2, 0, 2, H);
  ctx.fillRect(rx+rw, 0, 2, H);

  // Animated ghost cars
  const t = Date.now() * 0.0005;
  const ghostY = ((menuScroll * 0.8) % (H + 200)) - 100;
  ctx.globalAlpha = 0.12;
  drawTopDownCar(rx + rw*0.18, ghostY,       rw*0.22, rw*0.36, '#0077bb', '#00f5ff', false, false, false);
  drawTopDownCar(rx + rw*0.82, ghostY + 180, rw*0.22, rw*0.36, '#aa0000', '#ff4444', false, false, false);
  ctx.globalAlpha = 1;
}

// ─── HUD ────────────────────────────────────────
function updateHUD() {
  document.getElementById('score-display').textContent  = Math.floor(state.score);
  document.getElementById('record-hud-val').textContent = Math.floor(state.record);
  document.getElementById('coins-display').textContent  = '🪙 ' + state.coins;

  const xpEl = document.getElementById('xp-multiplier');
  state.xpMult > 1 ? xpEl.classList.remove('hidden') : xpEl.classList.add('hidden');

  // Rival bar (0 = danger/red, 100 = safe)
  const pct = Math.max(0, Math.min(100, (rivalGap / 320) * 100));
  document.getElementById('rival-bar-fill').style.width = pct + '%';
}

function updateMenuUI() {
  document.getElementById('menu-record').textContent = Math.floor(state.record);
  document.getElementById('menu-coins').textContent  = state.totalCoins;
}

// ─── GAME FLOW ──────────────────────────────────
function startGame() {
  initGame();
  state.phase = 'PLAYING';
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('rival-bar-container').classList.remove('hidden');
}

function endGame() {
  state.phase = 'GAMEOVER';
  const isNew = state.score > state.record;
  if (isNew) state.record = state.score;
  save();

  document.getElementById('hud').classList.add('hidden');
  document.getElementById('rival-bar-container').classList.add('hidden');

  document.getElementById('final-score').textContent = Math.floor(state.score);
  document.getElementById('final-record').textContent = Math.floor(state.record);
  document.getElementById('final-coins').textContent = '🪙 ' + state.coins;
  document.getElementById('final-xp').textContent = '+' + Math.floor(state.xp);

  document.getElementById('new-record-badge').classList.toggle('hidden', !isNew);
  document.getElementById('gameover-screen').classList.remove('hidden');
}

function showMenu() {
  state.phase = 'MENU';
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('rival-bar-container').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
  updateMenuUI();
}

// ─── SHOP ───────────────────────────────────────
function showShop() {
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('shop-screen').classList.remove('hidden');
  refreshShop();
}
function hideShop() {
  document.getElementById('shop-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
}
function refreshShop() {
  document.getElementById('shop-coin-count').textContent = state.totalCoins;
  const map = { 'buy-xp': 'xp2x', 'buy-shield': 'shield', 'buy-magnet': 'magnet' };
  Object.entries(map).forEach(([id, key]) => {
    const btn = document.getElementById(id);
    if (state.pendingBoosts[key]) {
      btn.textContent = '✓ КУПЛЕНО';
      btn.classList.add('purchased');
      btn.disabled = true;
    } else {
      btn.classList.remove('purchased');
      btn.disabled = false;
    }
  });
  // Active boosts list
  const el = document.getElementById('active-boosts-list');
  const labels = { xp2x: '⚡ 2× XP', shield: '🛡️ Щит', magnet: '🧲 Магніт' };
  const tags = Object.entries(state.pendingBoosts)
    .filter(([,v]) => v)
    .map(([k]) => `<span class="boost-tag">${labels[k]}</span>`)
    .join('');
  el.innerHTML = tags || '<span class="boost-empty">Немає активних бустів</span>';
}

function buyItem(btnId, cost, key) {
  if (state.pendingBoosts[key]) return;
  if (state.totalCoins < cost) {
    const btn = document.getElementById(btnId);
    btn.classList.remove('no-coins');
    void btn.offsetWidth; // reflow
    btn.classList.add('no-coins');
    return;
  }
  state.totalCoins -= cost;
  state.pendingBoosts[key] = true;
  save(); refreshShop();
}

// ─── SAVE / LOAD ────────────────────────────────
function save() {
  try {
    localStorage.setItem('nitro_rush_v2', JSON.stringify({
      record:     state.record,
      totalCoins: state.totalCoins,
    }));
  } catch(e) {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('nitro_rush_v2') || '{}');
    state.record     = d.record     || 0;
    state.totalCoins = d.totalCoins || 0;
  } catch(e) {}
}

// ─── UTILS ──────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);     ctx.arcTo(x+w, y,   x+w, y+r,   r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x + r, y + h);     ctx.arcTo(x, y+h,   x, y+h-r,   r);
    ctx.lineTo(x, y + r);         ctx.arcTo(x, y,     x+r, y,      r);
    ctx.closePath();
  }
}

function shadeColor(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + pct));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + pct));
  const b = Math.max(0, Math.min(255, (n & 0xff) + pct));
  return `rgb(${r},${g},${b})`;
}

// ─── BUTTON WIRING ──────────────────────────────
document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('shop-btn').addEventListener('click', showShop);
document.getElementById('shop-back').addEventListener('click', hideShop);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', showMenu);

document.getElementById('buy-xp').addEventListener('click', () => buyItem('buy-xp', 20, 'xp2x'));
document.getElementById('buy-shield').addEventListener('click', () => buyItem('buy-shield', 30, 'shield'));
document.getElementById('buy-magnet').addEventListener('click', () => buyItem('buy-magnet', 25, 'magnet'));

// ─── MAIN LOOP ──────────────────────────────────
let lastT = 0;

function loop(ts) {
  lastT = ts;
  update();
  draw();
  requestAnimationFrame(loop);
}

// ─── BOOT ───────────────────────────────────────
load();
updateMenuUI();
requestAnimationFrame(loop);
