// ==========================================
// SECURITY: Client-Side Anti-Tamper & Blackout Shield
// ==========================================
function triggerSecurityLockdown(reason) {
  console.warn('[SECURITY ALERT] Client tampering detected:', reason);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close(1008, 'Security Violation');
  }
  // Black out screen
  document.body.innerHTML = `
    <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000000;color:#ff3366;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;z-index:999999;text-align:center;padding:20px;">
      <h1 style="font-size:2.2rem;margin-bottom:10px;letter-spacing:3px;">🚫 SECURITY LOCKDOWN</h1>
      <p style="color:#ffffff;font-size:1.1rem;max-width:500px;line-height:1.6;">
        Unusual activity or client tampering was detected. Connection terminated.
      </p>
      <div style="margin-top:20px;padding:8px 16px;background:#111;border:1px solid #333;border-radius:6px;color:#888;font-size:0.85rem;">
        Shield Status: ACTIVE | Access Blocked
      </div>
    </div>
  `;
}

// Game State Variables
let gameState = 'LOBBY'; // LOBBY, PLAYING, GAMEOVER

// SECURITY: HTML entity escaping to prevent XSS when inserting user-supplied text
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// SECURITY: Validate a CSS hex color string
function safeColor(color) {
  if (typeof color !== 'string') return '#ffffff';
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ffffff';
}
let gameMode = 'classic'; // classic, zen
let canvas, ctx;
let audio = new GameAudio();
let socket;

// Player slots data (matches server configuration)
const players = {}; 
const swipeTrails = {}; // playerId -> array of {x, y, age}
const activePointers = {}; // playerId -> {x, y, color}
const playerScores = {}; // playerId -> score
const playerSlashes = {}; // playerId -> { points: [], color }

// Game lists
let fruits = [];
let slicedFruits = [];
let bombs = [];
let particles = [];
let backgroundSplats = [];
let floatingTexts = [];

// Game statistics
let score = 0;
let lives = 3;
let gameTimer = 90; // for Zen Mode
let timerInterval = null;
let spawnInterval = null;
let lastTime = 0;
let screenShake = 0;

// Leaderboard & Match tracking
let currentLeaderboardMode = 'classic';
let matchStartTime = 0;
let matchFruitsSliced = 0;
const maxCombosAchieved = {};

// Spawning difficulty controls
let fruitSpawnRate = 1800; // ms between spawns
let baseGravity = 0.35;

// --- GLOBAL LEADERBOARD FUNCTIONS ---

function switchLeaderboardTab(mode) {
  currentLeaderboardMode = mode;
  const tabClassic = document.getElementById('lb-tab-classic');
  const tabZen = document.getElementById('lb-tab-zen');
  if (tabClassic) tabClassic.classList.toggle('active', mode === 'classic');
  if (tabZen) tabZen.classList.toggle('active', mode === 'zen');
  fetchLeaderboard(mode);
}

function fetchLeaderboard(mode = currentLeaderboardMode) {
  const isFile = window.location.protocol === 'file:';
  const apiBase = isFile ? 'http://localhost:3000' : '';
  
  fetch(`${apiBase}/api/leaderboard?mode=${mode}`)
    .then(res => res.json())
    .then(data => {
      renderLeaderboard(data.leaderboard, data.stats);
    })
    .catch(err => {
      console.warn('Leaderboard fetch notice:', err);
      const list = document.getElementById('lb-list');
      if (list) {
        list.innerHTML = '<div class="lb-empty">⚔️ Global Leaderboard Active</div>';
      }
    });
}

function renderLeaderboard(items, stats) {
  if (stats) {
    const matchesEl = document.getElementById('stat-matches');
    const fruitsEl = document.getElementById('stat-fruits');
    if (matchesEl) matchesEl.innerText = stats.totalMatches || 0;
    if (fruitsEl) fruitsEl.innerText = stats.totalFruitsSliced || 0;
  }

  const list = document.getElementById('lb-list');
  if (!list) return;
  list.innerHTML = '';

  if (!items || items.length === 0) {
    list.innerHTML = '<div class="lb-empty">No records yet. Be the first!</div>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = `lb-row rank-${item.rank}`;

    const playerInfo = document.createElement('div');
    playerInfo.className = 'lb-player-info';

    const rankSpan = document.createElement('span');
    rankSpan.className = 'lb-rank';
    rankSpan.textContent = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

    const flagSpan = document.createElement('span');
    flagSpan.className = 'lb-flag';
    flagSpan.textContent = item.flag || '🌐';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'lb-name';
    nameSpan.textContent = item.name;

    playerInfo.appendChild(rankSpan);
    playerInfo.appendChild(flagSpan);
    playerInfo.appendChild(nameSpan);

    const scoreInfo = document.createElement('div');
    scoreInfo.className = 'lb-score-info';

    if (item.combo && item.combo > 1) {
      const comboSpan = document.createElement('span');
      comboSpan.className = 'lb-combo';
      comboSpan.textContent = `${item.combo}x`;
      scoreInfo.appendChild(comboSpan);
    }

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'lb-score';
    scoreSpan.textContent = `${item.score} pts`;
    scoreInfo.appendChild(scoreSpan);

    row.appendChild(playerInfo);
    row.appendChild(scoreInfo);
    list.appendChild(row);
  });
}

// Player colors mapping (same as server.js)
const PLAYER_COLORS = {
  1: '#ff3366', // Neon Pink/Red
  2: '#33ff66', // Neon Green
  3: '#3399ff', // Neon Blue
  4: '#ffcc33'  // Neon Yellow
};

// Fruit Types Definition
const FRUIT_TYPES = {
  watermelon: {
    name: 'watermelon',
    radius: 54,
    skinColor: '#204010',
    fleshColor: '#ff2d55',
    juiceColor: '#ff2d55',
    points: 1,
    drawType: 'watermelon'
  },
  orange: {
    name: 'orange',
    radius: 42,
    skinColor: '#ff9500',
    fleshColor: '#ffa726',
    juiceColor: '#ff9500',
    points: 1,
    drawType: 'orange'
  },
  lemon: {
    name: 'lemon',
    radius: 36,
    skinColor: '#ffe600',
    fleshColor: '#ffee55',
    juiceColor: '#ffe600',
    points: 1,
    drawType: 'lemon'
  },
  strawberry: {
    name: 'strawberry',
    radius: 30,
    skinColor: '#ff3b30',
    fleshColor: '#ff4d6d',
    juiceColor: '#ff3b30',
    points: 2,
    drawType: 'strawberry'
  },
  pineapple: {
    name: 'pineapple',
    radius: 46,
    skinColor: '#8b5a2b',
    fleshColor: '#ffd700',
    juiceColor: '#ffd700',
    points: 3,
    drawType: 'pineapple'
  }
};

// --- INITIALIZATION ---

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Initialize game lists with dummy elements for background ambient lobby
  startLobbyAnimations();

  // Load connection details
  const isFileProtocol = window.location.protocol === 'file:';
  const apiHost = isFileProtocol ? 'http://localhost:3000' : '';

  function tryConnect() {
    fetch(`${apiHost}/api/connection-info`)
      .then(res => res.json())
      .then(data => {
        const isLiveDomain = window.location.hostname && 
                             window.location.hostname !== 'localhost' && 
                             window.location.hostname !== '127.0.0.1';
        const controllerUrl = isLiveDomain ? `${window.location.origin}/controller.html` : data.controllerUrl;

        const connUrlEl = document.getElementById('connection-url');
        if (connUrlEl) connUrlEl.innerText = controllerUrl;
        const qrLoaderEl = document.getElementById('qr-loader');
        if (qrLoaderEl) qrLoaderEl.style.display = 'none';

        // Toggle UI panels
        const onlineInst = document.getElementById('online-instructions');
        if (onlineInst) onlineInst.style.display = 'block';
        const offlineInst = document.getElementById('offline-instructions');
        if (offlineInst) offlineInst.style.display = 'none';

        // Draw QR Code
        const qrCanvas = document.getElementById('qr-canvas');
        if (qrCanvas) {
          new QRious({
            element: qrCanvas,
            value: controllerUrl,
            size: 300,
            background: '#ffffff',
            foreground: '#000000',
            level: 'M'
          });
        }

        // Connect to WebSocket Server
        initWebSocket(data.localIp);
      })
      .catch(err => {
        console.warn('Dojo server offline, retrying in 2 seconds...');
        const connUrlEl = document.getElementById('connection-url');
        if (connUrlEl) connUrlEl.innerText = 'http://loading...';
        const qrLoaderEl = document.getElementById('qr-loader');
        if (qrLoaderEl) {
          qrLoaderEl.innerText = 'Offline - Waiting for Dojo Server...';
          qrLoaderEl.style.display = 'block';
        }
        
        // Toggle UI panels
        const onlineInst = document.getElementById('online-instructions');
        if (onlineInst) onlineInst.style.display = 'none';
        const offlineInst = document.getElementById('offline-instructions');
        if (offlineInst) offlineInst.style.display = 'block';
        
        // Retry connection info fetch after 2 seconds
        setTimeout(tryConnect, 2000);
      });
  }

  tryConnect();
  setupDesktopInput();
  fetchLeaderboard('classic');

  // Start Animation Loop
  requestAnimationFrame(gameLoop);
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// --- WEBSOCKET CLIENT ---

function initWebSocket(hostIp) {
  const isFile = window.location.protocol === 'file:';
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsHost;
  if (isFile) {
    wsHost = 'localhost:3000';
  } else if (window.location.host) {
    wsHost = window.location.host;
  } else {
    wsHost = `${hostIp || 'localhost'}:3000`;
  }
  const wsUrl = `${wsProto}//${wsHost}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Connected to game server WebSocket at', wsUrl);
    // Register as the display screen — server will replay all playerJoined for existing controllers
    socket.send(JSON.stringify({ type: 'register', role: 'screen' }));
    setWsStatus('connected');
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'playerJoined':
          registerPlayer(data.playerId, data.color, data.name, data.country);
          break;
        case 'playerLeft':
          unregisterPlayer(data.playerId);
          break;
        case 'touchStart':
          handleTouchStart(data);
          break;
        case 'touchMove':
          handleTouchMove(data);
          break;
        case 'touchEnd':
          handleTouchEnd(data);
          break;
        case 'startGame':
          if (gameState === 'LOBBY' && Object.keys(players).length > 0) {
            startGame();
          }
          break;
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  };

  socket.onclose = () => {
    console.warn('WebSocket connection lost. Reconnecting...');
    setWsStatus('disconnected');
    setTimeout(() => initWebSocket(hostIp), 2000);
  };

  socket.onerror = () => {
    setWsStatus('disconnected');
  };
}

// Update the WS connection status dot in the lobby
function setWsStatus(state) {
  const dot = document.getElementById('ws-status-dot');
  const label = document.getElementById('ws-status-label');
  if (!dot || !label) return;
  if (state === 'connected') {
    dot.style.background = '#33ff66';
    dot.style.boxShadow = '0 0 8px #33ff66';
    label.innerText = 'Server Connected';
  } else {
    dot.style.background = '#ff3366';
    dot.style.boxShadow = '0 0 8px #ff3366';
    label.innerText = 'Reconnecting...';
  }
}

// Re-register the screen to force server to replay all playerJoined events
// Fixes the race condition where the phone joined before the screen was ready
function resyncScreen() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'register', role: 'screen' }));
    const btn = document.getElementById('btn-sync');
    if (btn) {
      btn.innerText = '↻ Syncing...';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerText = '↻ Sync Players';
        btn.disabled = false;
      }, 1500);
    }
  }
}

// Auto-sync: if we're in lobby with 0 players, re-register every 3s
// This silently catches the race condition automatically
setInterval(() => {
  if (gameState === 'LOBBY' && Object.keys(players).length === 0) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'register', role: 'screen' }));
    }
  }
}, 3000);

// --- MULTIPLAYER LOBBY HUB ---

function countryCodeToFlagEmoji(cc) {
  if (!cc || typeof cc !== 'string' || cc.length !== 2 || cc === 'GLOBAL' || cc === 'XX') return '🌐';
  const upper = cc.toUpperCase();
  const codePoints = [...upper].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function registerPlayer(id, color, name, country) {
  const pCountry = country || 'IN';
  players[id] = {
    id,
    color,
    name,
    country: pCountry,
    score: 0,
    activeCombo: [],
    comboTimer: null
  };
  
  playerScores[id] = 0;
  swipeTrails[id] = [];
  
  // Update Lobby Slot UI with Country Flag
  const slot = document.querySelector(`.player-slot[data-slot="${id}"]`);
  if (slot) {
    slot.classList.remove('empty');
    slot.classList.add('active');
    slot.style.color = color;
    const flag = countryCodeToFlagEmoji(pCountry);
    slot.querySelector('.slot-text').innerText = `${flag} ${name}`;
  }

  // Count active players
  const count = Object.keys(players).length;
  document.getElementById('player-count').innerText = count;

  // Enable Start Button if at least 1 player connected
  const startBtn = document.getElementById('btn-start');
  if (count > 0) {
    startBtn.disabled = false;
    startBtn.innerText = 'Enter the Dojo';
  }

  // Sync back score setup if in game
  if (gameState === 'PLAYING') {
    syncGameState();
  }
}

function unregisterPlayer(id) {
  delete players[id];
  delete playerScores[id];
  delete swipeTrails[id];
  delete activePointers[id];

  // Update Lobby Slot UI
  const slot = document.querySelector(`.player-slot[data-slot="${id}"]`);
  if (slot) {
    slot.classList.add('empty');
    slot.classList.remove('active');
    slot.style.color = '';
    slot.querySelector('.slot-text').innerText = `Player ${id} (Waiting...)`;
  }

  const count = Object.keys(players).length;
  document.getElementById('player-count').innerText = count;

  if (count === 0) {
    const startBtn = document.getElementById('btn-start');
    startBtn.disabled = true;
    startBtn.innerText = 'Connect Phone to Play';
    if (gameState === 'PLAYING') {
      endGame();
    }
  }
}

// --- INPUT EVENT HANDLING & COORDINATE MAPPING ---

function handleTouchStart(data) {
  const pId = data.playerId;
  // Auto-register player if not yet in players map (defensive)
  if (!players[pId] && data.color) {
    registerPlayer(pId, data.color, `Player ${pId}`);
  }
  if (!players[pId]) return;

  const canvasX = data.x * canvas.width;
  const canvasY = data.y * canvas.height;

  activePointers[pId] = { x: canvasX, y: canvasY, color: data.color };
  swipeTrails[pId] = [{ x: canvasX, y: canvasY, age: 0 }];

  // Initialize playerSlashes[pId]
  playerSlashes[pId] = { points: [{ x: data.x, y: data.y }], color: data.color };

  // Reset player combo tracking
  players[pId].activeCombo = [];
  if (players[pId].comboTimer) {
    clearTimeout(players[pId].comboTimer);
    players[pId].comboTimer = null;
  }

  // Check if finger landed directly on a fruit (tap-to-slice)
  if (gameState === 'PLAYING') {
    checkProximityCollisions(pId, canvasX, canvasY);
  }

  audio.playSwish();
}

function handleTouchMove(data) {
  const pId = data.playerId;
  // Auto-register player if not yet in players map (defensive)
  if (!players[pId] && data.color) {
    registerPlayer(pId, data.color, `Player ${pId}`);
  }
  if (!players[pId]) return;

  const canvasX = data.x * canvas.width;
  const canvasY = data.y * canvas.height;

  // CRITICAL: ensure swipeTrails[pId] exists in the object — never use a detached array
  if (!swipeTrails[pId]) {
    swipeTrails[pId] = [];
  }
  const trail = swipeTrails[pId]; // reference to the STORED array, not a copy
  const prevPoint = trail[trail.length - 1];

  trail.push({ x: canvasX, y: canvasY, age: 0 });
  if (trail.length > 12) trail.shift(); // Keep trail length limited

  activePointers[pId] = { x: canvasX, y: canvasY, color: data.color };

  // Update playerSlashes
  if (!playerSlashes[pId]) {
    playerSlashes[pId] = { points: [], color: data.color };
  }
  playerSlashes[pId].points.push({ x: data.x, y: data.y });
  if (playerSlashes[pId].points.length > 12) {
    playerSlashes[pId].points.shift();
  }

  // Trigger swish audio at intervals during swipe
  if (Math.random() < 0.12) {
    audio.playSwish();
  }

  // Detect Collisions along segment (prevPoint -> currentPoint)
  // Interpolate fast swipes: subdivide large gaps to prevent skipping over fruits
  if (prevPoint && gameState === 'PLAYING') {
    const dx = canvasX - prevPoint.x;
    const dy = canvasY - prevPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const STEP_SIZE = 30; // max pixels between collision checks

    if (dist > STEP_SIZE) {
      const steps = Math.ceil(dist / STEP_SIZE);
      let fromPt = prevPoint;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const toPt = { x: prevPoint.x + dx * t, y: prevPoint.y + dy * t };
        checkCollisions(pId, fromPt, toPt);
        fromPt = toPt;
      }
    } else {
      checkCollisions(pId, prevPoint, { x: canvasX, y: canvasY });
    }
  }
}

function handleTouchEnd(data) {
  const pId = data.playerId;
  if (!players[pId]) return;

  delete activePointers[pId];

  // Clear slash data — collision was already handled per-segment in handleTouchMove
  delete playerSlashes[pId];

  // Process potential combos after swipe ends
  checkCombo(pId);

  // Don't delete the trail immediately — let age-out in updatePhysics handle the fade
  // This ensures the visual trail lingers for a moment after lifting finger
}

function checkSlashCollisions(playerId, slash) {
  if (!slash || !slash.points || slash.points.length < 2) return;
  const points = slash.points;
  
  for (let j = 1; j < points.length; j++) {
    const p1 = { x: points[j - 1].x * canvas.width, y: points[j - 1].y * canvas.height };
    const p2 = { x: points[j].x * canvas.width, y: points[j].y * canvas.height };
    
    // Check fruit collisions
    for (let i = fruits.length - 1; i >= 0; i--) {
      const fruit = fruits[i];
      if (checkLineCircleCollision(p1, p2, fruit, fruit.radius)) {
        sliceFruit(fruit, playerId, p2);
        fruits.splice(i, 1);
      }
    }

    // Check bomb collisions
    for (let i = bombs.length - 1; i >= 0; i--) {
      const bomb = bombs[i];
      if (checkLineCircleCollision(p1, p2, bomb, bomb.radius)) {
        triggerBombExplosion(bomb, playerId);
        bombs.splice(i, 1);
      }
    }
  }
}

// --- COLLISION DETECTION ENGINE ---

function checkCollisions(playerId, p1, p2) {
  const player = players[playerId];
  if (!player) return;

  // BLADE_WIDTH: the swipe blade is not an infinitely thin line — it has physical width.
  // This is the most important factor for making slicing feel responsive.
  const BLADE_WIDTH = 25; // pixels of blade thickness added to hit radius
  const HIT_FORGIVENESS = 1.5; // also scale the fruit's own radius for network latency

  // 1. Check fruit collisions
  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    const effectiveRadius = fruit.radius * HIT_FORGIVENESS + BLADE_WIDTH;
    if (checkLineCircleCollision(p1, p2, fruit, effectiveRadius)) {
      sliceFruit(fruit, playerId, p2);
      fruits.splice(i, 1);
    }
  }

  // 2. Check bomb collisions (slightly less forgiving — bombs should be harder to hit accidentally)
  for (let i = bombs.length - 1; i >= 0; i--) {
    const bomb = bombs[i];
    const effectiveRadius = bomb.radius * 1.2 + BLADE_WIDTH * 0.5;
    if (checkLineCircleCollision(p1, p2, bomb, effectiveRadius)) {
      triggerBombExplosion(bomb, playerId);
      bombs.splice(i, 1);
    }
  }
}

// Proximity-based collision: simple point-to-circle check.
// Catches fruits that move INTO the finger position between network messages.
function checkProximityCollisions(playerId, px, py) {
  const player = players[playerId];
  if (!player) return;

  const BLADE_WIDTH = 25;
  const PROXIMITY_FORGIVENESS = 1.6;

  // Check fruits
  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    const dx = px - fruit.x;
    const dy = py - fruit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectiveRadius = fruit.radius * PROXIMITY_FORGIVENESS + BLADE_WIDTH;
    if (dist <= effectiveRadius) {
      sliceFruit(fruit, playerId, { x: px, y: py });
      fruits.splice(i, 1);
    }
  }

  // Check bombs
  for (let i = bombs.length - 1; i >= 0; i--) {
    const bomb = bombs[i];
    const dx = px - bomb.x;
    const dy = py - bomb.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectiveRadius = bomb.radius * 1.2 + BLADE_WIDTH * 0.5;
    if (dist <= effectiveRadius) {
      triggerBombExplosion(bomb, playerId);
      bombs.splice(i, 1);
    }
  }
}

// Line Segment to Circle distance/intersection algorithm
function checkLineCircleCollision(p1, p2, circle, radius) {
  const v = { x: p2.x - p1.x, y: p2.y - p1.y };
  const w = { x: circle.x - p1.x, y: circle.y - p1.y };
  
  const c1 = w.x * v.x + w.y * v.y;
  if (c1 <= 0) {
    const d2 = w.x * w.x + w.y * w.y;
    return d2 <= radius * radius;
  }
  
  const c2 = v.x * v.x + v.y * v.y;
  if (c2 <= c1) {
    const d2 = (p2.x - circle.x) * (p2.x - circle.x) + (p2.y - circle.y) * (p2.y - circle.y);
    return d2 <= radius * radius;
  }
  
  const b = c1 / c2;
  const pb = { x: p1.x + b * v.x, y: p1.y + b * v.y };
  const d2 = (pb.x - circle.x) * (pb.x - circle.x) + (pb.y - circle.y) * (pb.y - circle.y);
  return d2 <= radius * radius;
}

// --- GAME LOGIC MECHANICS ---

function setMode(mode) {
  gameMode = mode;
  document.getElementById('btn-classic').classList.toggle('active', mode === 'classic');
  document.getElementById('btn-zen').classList.toggle('active', mode === 'zen');
  
  document.getElementById('hud-mode').innerText = mode.toUpperCase();
  document.getElementById('hud-timer').classList.toggle('hidden', mode !== 'zen');
  document.getElementById('lives-panel').classList.toggle('hidden', mode === 'zen');
}

function toggleAudio() {
  const isMuted = audio.toggleMute();
  const audioBtn = document.getElementById('btn-audio');
  if (isMuted) {
    audioBtn.innerHTML = '<span class="audio-icon">🔇</span> Enable Sounds';
    audioBtn.classList.add('muted');
  } else {
    audioBtn.innerHTML = '<span class="audio-icon">🔊</span> Sounds Active';
    audioBtn.classList.remove('muted');
  }
}

function startGame() {
  gameState = 'PLAYING';
  score = 0;
  lives = 3;
  gameTimer = 90;
  fruits = [];
  slicedFruits = [];
  bombs = [];
  particles = [];
  backgroundSplats = [];
  floatingTexts = [];
  
  // Leaderboard Match Stats
  matchStartTime = Date.now();
  matchFruitsSliced = 0;

  // Reset player scores and re-initialize per-player trail trackers
  Object.keys(players).forEach(pId => {
    players[pId].score = 0;
    playerScores[pId] = 0;
    delete playerSlashes[pId];
    players[pId].activeCombo = [];
    maxCombosAchieved[pId] = 0;
    if (players[pId].comboTimer) {
      clearTimeout(players[pId].comboTimer);
      players[pId].comboTimer = null;
    }
    swipeTrails[pId] = [];
    delete activePointers[pId];
  });

  // Hide Lobby, Show HUD
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('game-over').classList.add('hidden');

  // Reset Lives Display
  document.getElementById('life-1').classList.remove('lost');
  document.getElementById('life-2').classList.remove('lost');
  document.getElementById('life-3').classList.remove('lost');

  updateHUD();

  // --- SOUND EFFECTS (Synthesized via Web Audio API) ---
  audio.init();
  audio.resumeContext();
  audio.startMusic();

  // Difficulty parameters based on active player count
  const playerCount = Math.max(1, Object.keys(players).length);
  fruitSpawnRate = Math.max(1200, 2000 - playerCount * 200);

  // Clear any existing intervals
  if (spawnInterval) clearInterval(spawnInterval);
  if (timerInterval) clearInterval(timerInterval);

  // Set Spawner Intervals
  spawnInterval = setInterval(spawnWave, fruitSpawnRate);

  // Trigger immediate first wave so action starts right away
  setTimeout(() => {
    if (gameState === 'PLAYING') {
      spawnWave();
    }
  }, 250);

  if (gameMode === 'zen') {
    document.getElementById('hud-timer').innerText = `${gameTimer}s`;
    timerInterval = setInterval(() => {
      gameTimer--;
      document.getElementById('hud-timer').innerText = `${gameTimer}s`;
      if (gameTimer <= 0) {
        endGame();
      }
      syncGameState();
    }, 1000);
  }

  syncGameState();
}

function restartGame() {
  document.getElementById('game-over').classList.add('hidden');
  startGame();
}

function returnToLobby() {
  gameState = 'LOBBY';
  document.getElementById('game-over').classList.add('hidden');
  document.getElementById('lobby').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  audio.stopMusic();
  fetchLeaderboard(gameMode);
}

function endGame() {
  if (gameState === 'GAMEOVER') return;
  gameState = 'GAMEOVER';
  clearInterval(spawnInterval);
  if (timerInterval) clearInterval(timerInterval);
  
  audio.stopMusic();
  audio.playGameOver();

  // Show Game Over panel
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('game-over').classList.remove('hidden');
  document.getElementById('final-mode-subtitle').innerText = `${gameMode.toUpperCase()} MODE`;

  // Reset high score banner
  const recordBanner = document.getElementById('new-record-banner');
  const recordText = document.getElementById('record-text');
  if (recordBanner) recordBanner.classList.add('hidden');

  // Display Scoreboard
  const table = document.getElementById('results-table');
  table.innerHTML = '';

  const sortedPlayers = Object.values(players).sort((a, b) => {
    const scoreA = playerScores[a.id] || 0;
    const scoreB = playerScores[b.id] || 0;
    return scoreB - scoreA;
  });
  
  if (sortedPlayers.length === 0) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'result-row';
    emptyRow.style.justifyContent = 'center';
    emptyRow.style.color = '#8a94a6';
    emptyRow.textContent = 'No connected players';
    table.appendChild(emptyRow);
  } else {
    sortedPlayers.forEach((p, idx) => {
      const medal = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⚔️';
      const pScore = playerScores[p.id] || 0;
      const validColor = safeColor(p.color);

      const row = document.createElement('div');
      row.className = 'result-row';
      row.style.borderLeft = `4px solid ${validColor}`;

      const playerDiv = document.createElement('div');
      playerDiv.className = 'result-player';
      playerDiv.style.color = validColor;

      const medalSpan = document.createElement('span');
      medalSpan.textContent = medal;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name; // textContent is XSS-safe

      playerDiv.appendChild(medalSpan);
      playerDiv.appendChild(nameSpan);

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'result-score';
      scoreDiv.textContent = `${pScore} pts`;

      row.appendChild(playerDiv);
      row.appendChild(scoreDiv);
      table.appendChild(row);
    });

    // Submit match scores to Global Leaderboard
    const matchDuration = Math.max(1, Math.round((Date.now() - matchStartTime) / 1000));
    const isFile = window.location.protocol === 'file:';
    const apiBase = isFile ? 'http://localhost:3000' : '';

    sortedPlayers.forEach(p => {
      const pScore = playerScores[p.id] || 0;
      if (pScore > 0) {
        fetch(`${apiBase}/api/leaderboard/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: p.name,
            score: pScore,
            combo: maxCombosAchieved[p.id] || 0,
            mode: gameMode,
            duration: matchDuration,
            fruitsSliced: matchFruitsSliced,
            country: p.country || 'IN'
          })
        })
        .then(res => res.json())
        .then(resData => {
          if (resData.success && resData.isTop10) {
            if (recordBanner && recordText) {
              recordText.innerText = resData.isNewRecord 
                ? `👑 NEW #1 GLOBAL RECORD! (${pScore} pts)` 
                : `🏆 NEW GLOBAL TOP 10 RECORD! (Rank #${resData.rank})`;
              recordBanner.classList.remove('hidden');
            }
            audio.playHighscoreFanfare();
            fetchLeaderboard(gameMode);
          }
        })
        .catch(err => console.warn('Score submission notice:', err));
      }
    });
  }

  // Notify controllers
  syncGameState();
}

// Sync Game HUD display
function updateHUD() {
  const scoresPanel = document.getElementById('scores-panel');
  scoresPanel.innerHTML = '';

  Object.values(players).forEach(p => {
    const pScore = playerScores[p.id] || 0;
    const validColor = safeColor(p.color);

    const hudDiv = document.createElement('div');
    hudDiv.className = 'player-score-hud';
    hudDiv.style.borderLeft = `4px solid ${validColor}`;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'hud-score-label';
    labelSpan.style.color = validColor;
    labelSpan.textContent = p.name; // textContent is XSS-safe

    const valueSpan = document.createElement('span');
    valueSpan.className = 'hud-score-value';
    valueSpan.style.color = validColor;
    valueSpan.textContent = pScore;

    hudDiv.appendChild(labelSpan);
    hudDiv.appendChild(valueSpan);
    scoresPanel.appendChild(hudDiv);
  });
}

// Send current status of score + lives to controller clients via WebSocket
function syncGameState() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const playerScoresSync = Object.values(players).map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: playerScores[p.id] || 0
  }));

  socket.send(JSON.stringify({
    type: 'gameSync',
    score: score, // combined total or base
    lives: lives,
    gameOver: gameState === 'GAMEOVER',
    mode: gameMode,
    timer: gameTimer,
    players: playerScoresSync
  }));
}

// Trigger mobile haptic vibration
function requestVibrate(playerId, pattern) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: 'triggerVibrate',
    playerId: playerId,
    pattern: pattern
  }));
}

// --- ENTITY SPAWNING AND PHYSICS ---

function spawnWave() {
  if (gameState !== 'PLAYING') return;

  const playerCount = Math.max(1, Object.keys(players).length);
  // Spawn between 2 and 4 items per wave (up to 5 for multiplayers)
  const count = Math.floor(Math.random() * (playerCount > 1 ? 3 : 2)) + (playerCount > 1 ? 2 : 1);
  const bombChance = gameMode === 'zen' ? 0 : 0.22;

  let bombSpawned = false;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      if (gameState !== 'PLAYING') return;
      if (!bombSpawned && Math.random() < bombChance) {
        spawnBomb();
        bombSpawned = true;
      } else {
        spawnFruit();
      }
    }, i * 160); // Stagger launch slightly in the wave
  }
}

function spawnFruit() {
  const types = Object.keys(FRUIT_TYPES);
  const randomType = types[Math.floor(Math.random() * types.length)];
  const config = FRUIT_TYPES[randomType];

  // Spawn position across bottom width
  const margin = canvas.width * 0.12;
  const x = Math.random() * (canvas.width - margin * 2) + margin;
  const y = canvas.height + config.radius;

  // Calculate target peak Y (reach between 15% and 42% of screen height)
  const targetPeakY = canvas.height * (Math.random() * 0.27 + 0.15);
  const launchDistance = y - targetPeakY;
  const vy = -Math.sqrt(2 * baseGravity * launchDistance);

  // Direct horizontal velocity toward center with some spread
  const centerDiff = (canvas.width * 0.5 - x) / (canvas.width * 0.5);
  const vx = centerDiff * (Math.random() * 3 + 1.5) + (Math.random() - 0.5) * 2.5;

  fruits.push({
    ...config,
    x,
    y,
    vx,
    vy,
    angle: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.08
  });
}

function spawnBomb() {
  const radius = 40;
  const margin = canvas.width * 0.18;
  const x = Math.random() * (canvas.width - margin * 2) + margin;
  const y = canvas.height + radius;

  const targetPeakY = canvas.height * (Math.random() * 0.22 + 0.22);
  const launchDistance = y - targetPeakY;
  const vy = -Math.sqrt(2 * baseGravity * launchDistance);

  const centerDiff = (canvas.width * 0.5 - x) / (canvas.width * 0.5);
  const vx = centerDiff * (Math.random() * 2.5 + 1) + (Math.random() - 0.5) * 2;

  bombs.push({
    x,
    y,
    vx,
    vy,
    radius,
    angle: 0,
    rotationSpeed: 0.03,
    fusePhase: 0
  });
}

// Slicing logic
function sliceFruit(fruit, playerId, position) {
  const player = players[playerId];
  if (!player) return;

  // Add to player's score and match fruits total
  matchFruitsSliced++;
  player.score += fruit.points;
  playerScores[playerId] = (playerScores[playerId] || 0) + fruit.points;
  audio.playSplat();

  // Queue for combo verification
  player.activeCombo.push(fruit.name);
  if (player.comboTimer) clearTimeout(player.comboTimer);
  player.comboTimer = setTimeout(() => checkCombo(playerId), 250);

  // Haptic tap on phone
  requestVibrate(playerId, [35]);

  // Update HUD values
  updateHUD();
  syncGameState();

  // Create floating points visual
  floatingTexts.push({
    text: `+${fruit.points}`,
    x: fruit.x,
    y: fruit.y - 10,
    color: fruit.juiceColor,
    size: 26,
    opacity: 1,
    vy: -2
  });

  // Background splat on canvas
  backgroundSplats.push({
    x: fruit.x,
    y: fruit.y,
    color: fruit.juiceColor,
    radius: fruit.radius * (Math.random() * 0.4 + 0.6),
    opacity: 0.5,
    rotation: Math.random() * Math.PI
  });

  // Spawn juice particles
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 8 + 3;
    particles.push({
      x: fruit.x,
      y: fruit.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: fruit.juiceColor,
      radius: Math.random() * 5 + 3,
      opacity: 1,
      decay: 0.02
    });
  }

  // Split fruit halves
  // Half A (left)
  slicedFruits.push({
    ...fruit,
    vx: fruit.vx - 3,
    vy: fruit.vy - 1,
    angle: fruit.angle,
    rotationSpeed: -0.07,
    half: 'left'
  });

  // Half B (right)
  slicedFruits.push({
    ...fruit,
    vx: fruit.vx + 3,
    vy: fruit.vy - 1,
    angle: fruit.angle,
    rotationSpeed: 0.07,
    half: 'right'
  });
}

function checkCombo(playerId) {
  const player = players[playerId];
  if (!player || player.activeCombo.length < 3) return;

  const count = player.activeCombo.length;
  maxCombosAchieved[playerId] = Math.max(maxCombosAchieved[playerId] || 0, count);
  const comboBonus = count; // bonus points equal to combo size
  player.score += comboBonus;
  playerScores[playerId] = (playerScores[playerId] || 0) + comboBonus;
  
  audio.playCombo();
  requestVibrate(playerId, [30, 40, 30]);

  // Visual combo notification
  floatingTexts.push({
    text: `${count} FRUIT COMBO! +${comboBonus}`,
    x: canvas.width / 2,
    y: canvas.height * 0.35,
    color: player.color,
    size: 48,
    opacity: 1,
    vy: -0.8
  });

  player.activeCombo = [];
  updateHUD();
  syncGameState();
}

function triggerBombExplosion(bomb, playerId) {
  audio.playExplosion();
  screenShake = 24;

  // Request long vibration pulse on controller
  requestVibrate(playerId, [300, 100, 300]);

  // Spawn visual shockwave and fire particles
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 14 + 4;
    particles.push({
      x: bomb.x,
      y: bomb.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: Math.random() < 0.5 ? '#ffaa00' : '#ff3300',
      radius: Math.random() * 12 + 6,
      opacity: 1,
      decay: 0.015
    });
  }

  // Flash white/orange overlay
  ctx.fillStyle = 'rgba(255, 200, 100, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (gameMode === 'classic') {
    // Bomb instantly terminates game in classic mode
    lives = 0;
    document.getElementById('life-1').classList.add('lost');
    document.getElementById('life-2').classList.add('lost');
    document.getElementById('life-3').classList.add('lost');
    
    setTimeout(endGame, 400);
  } else {
    // Zen Mode: subtract 10 points
    const player = players[playerId];
    if (player) {
      player.score = Math.max(0, player.score - 10);
      playerScores[playerId] = Math.max(0, (playerScores[playerId] || 0) - 10);
      floatingTexts.push({
        text: `-10 BOMB HIT`,
        x: bomb.x,
        y: bomb.y - 20,
        color: '#ff3300',
        size: 32,
        opacity: 1,
        vy: -2
      });
      updateHUD();
      syncGameState();
    }
  }
}

// --- RENDERING & CANVAS DRAWING HELPERS ---

function gameLoop(timestamp) {
  if (lastTime === 0) lastTime = timestamp;
  const elapsed = timestamp - lastTime;
  lastTime = timestamp;

  updatePhysics();
  drawScene();

  requestAnimationFrame(gameLoop);
}

function updatePhysics() {
  // 1. Update fruits position & gravitation
  for (let i = fruits.length - 1; i >= 0; i--) {
    const f = fruits[i];
    f.x += f.vx;
    f.vy += baseGravity;
    f.y += f.vy;
    f.angle += f.rotationSpeed;

    // Drop below screen: penalize life in classic mode
    if (f.y > canvas.height + f.radius && f.vy > 0) {
      if (gameState === 'PLAYING' && gameMode === 'classic' && lives > 0) {
        lives--;
        // Update crosses
        const crossId = `life-${3 - lives}`;
        const cross = document.getElementById(crossId);
        if (cross) cross.classList.add('lost');
        
        if (lives <= 0) {
          endGame();
        }
        syncGameState();
      }
      fruits.splice(i, 1);
    }
  }

  // 2. Update sliced fruit halves
  for (let i = slicedFruits.length - 1; i >= 0; i--) {
    const sf = slicedFruits[i];
    sf.x += sf.vx;
    sf.vy += baseGravity;
    sf.y += sf.vy;
    sf.angle += sf.rotationSpeed;

    if (sf.y > canvas.height + sf.radius) {
      slicedFruits.splice(i, 1);
    }
  }

  // 3. Update bombs
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.x += b.vx;
    b.vy += baseGravity;
    b.y += b.vy;
    b.fusePhase += 0.15;

    if (b.y > canvas.height + b.radius && b.vy > 0) {
      bombs.splice(i, 1);
    }
  }

  // 4. Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.opacity -= p.decay;

    if (p.opacity <= 0) {
      particles.splice(i, 1);
    }
  }

  // 5. Update floating score labels
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.opacity -= 0.015;

    if (ft.opacity <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  // 6. Slowly age background splats
  for (let i = backgroundSplats.length - 1; i >= 0; i--) {
    const splat = backgroundSplats[i];
    splat.opacity -= 0.0003; // very slow fade
    if (splat.opacity <= 0) {
      backgroundSplats.splice(i, 1);
    }
  }

  // 7. Update swipe trails age
  Object.keys(swipeTrails).forEach(pId => {
    const trail = swipeTrails[pId];
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].age += 1;
      if (trail[i].age > 10) {
        trail.splice(i, 1);
      }
    }
  });

  // Apply screen shake decay
  if (screenShake > 0) {
    screenShake *= 0.9;
    if (screenShake < 0.5) screenShake = 0;
  }

  // 8. Per-frame proximity check: catch fruits that fly INTO an active swipe path
  // between network messages. Only checks active pointers (finger currently down),
  // using a simple point-to-circle distance — very lightweight.
  if (gameState === 'PLAYING') {
    Object.keys(activePointers).forEach(pId => {
      const ptr = activePointers[pId];
      if (!ptr) return;
      checkProximityCollisions(pId, ptr.x, ptr.y);
    });
  }
}

function drawScene() {
  ctx.save();
  
  // Screen shake support
  if (screenShake > 0) {
    const dx = (Math.random() - 0.5) * screenShake;
    const dy = (Math.random() - 0.5) * screenShake;
    ctx.translate(dx, dy);
  }

  // Clear Canvas (background is custom radial gradient via style.css)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw static background splats
  backgroundSplats.forEach(splat => {
    drawJuiceSplat(ctx, splat.x, splat.y, splat.radius, splat.color, splat.opacity, splat.rotation);
  });

  // 2. Draw active whole fruits
  fruits.forEach(f => {
    drawFruitModel(ctx, f, false);
  });

  // 3. Draw sliced fruit halves
  slicedFruits.forEach(sf => {
    drawFruitModel(ctx, sf, true);
  });

  // 4. Draw bombs
  bombs.forEach(b => {
    drawBombModel(ctx, b);
  });

  // 5. Draw particles (juice & fuse sparks)
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 6. Draw swipe sword slash trails (multiplayer + desktop)
  Object.keys(swipeTrails).forEach(pId => {
    const trail = swipeTrails[pId];
    if (!trail || trail.length < 2) return;
    
    const color = (players[pId] && players[pId].color) || PLAYER_COLORS[pId] || '#ff3366';

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < trail.length; i++) {
      const pStart = trail[i - 1];
      const pEnd = trail[i];
      const ageAlpha = Math.max(0, 1 - (pEnd.age || 0) / 12);
      const widthPct = i / trail.length;
      
      // Outer colored neon blade glow
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.lineWidth = Math.max(2, widthPct * 14 * ageAlpha);
      ctx.strokeStyle = `rgba(${hexToRgb(color)}, ${0.85 * ageAlpha})`;
      ctx.stroke();

      // Inner intense white core
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.lineWidth = Math.max(1, widthPct * 4 * ageAlpha);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * ageAlpha})`;
      ctx.stroke();
    }
    ctx.restore();
  });

  // 7. Draw real-time player pointer indicators
  Object.values(activePointers).forEach(ptr => {
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = ptr.color;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ptr.x, ptr.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 8. Draw floating score labels (+1, +3, Combo)
  floatingTexts.forEach(ft => {
    ctx.save();
    ctx.globalAlpha = ft.opacity;
    ctx.fillStyle = ft.color;
    ctx.font = `900 ${ft.size}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });

  ctx.restore();
}

// Helper to translate color codes for alpha mapping
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
    : '255, 255, 255';
}

// Render juice splats on the floor/wall
function drawJuiceSplat(ctx, cx, cy, radius, color, opacity, rotation) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  
  ctx.beginPath();
  // Draw an organic starburst splat
  const points = 12;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const len = radius * (0.6 + Math.random() * 0.5);
    const x = Math.cos(angle) * len;
    const y = Math.sin(angle) * len;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  
  // Draw some extra nearby splat droplets
  for (let i = 0; i < 4; i++) {
    const dropAngle = Math.random() * Math.PI * 2;
    const dist = radius * (1.1 + Math.random() * 0.7);
    const dropSize = radius * (0.1 + Math.random() * 0.2);
    ctx.beginPath();
    ctx.arc(Math.cos(dropAngle) * dist, Math.sin(dropAngle) * dist, dropSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Procedural high quality vector drawing of fruit models (whole & halves)
function drawFruitModel(ctx, fruit, isSliced) {
  ctx.save();
  ctx.translate(fruit.x, fruit.y);
  ctx.rotate(fruit.angle);

  // Setup radial gradient shading for 3D sphere volume feel
  const radGrad = ctx.createRadialGradient(
    -fruit.radius * 0.2, -fruit.radius * 0.2, fruit.radius * 0.1,
    0, 0, fruit.radius
  );
  
  if (isSliced) {
    // Sliced fruits are split down the center axis
    // Clip drawing to only draw half
    ctx.beginPath();
    if (fruit.half === 'left') {
      ctx.rect(-fruit.radius * 1.5, -fruit.radius * 1.5, fruit.radius * 1.5, fruit.radius * 3);
    } else {
      ctx.rect(0, -fruit.radius * 1.5, fruit.radius * 1.5, fruit.radius * 3);
    }
    ctx.clip();
  }

  // Draw Specific Fruit Types
  switch (fruit.drawType) {
    case 'watermelon':
      // Skin Outline
      ctx.fillStyle = fruit.skinColor;
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner rind (light green)
      ctx.fillStyle = '#bce682';
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius * 0.88, 0, Math.PI * 2);
      ctx.fill();

      // Flesh (red)
      ctx.fillStyle = fruit.fleshColor;
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius * 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Watermelon Seeds
      ctx.fillStyle = '#000000';
      const seedCoords = [
        { x: -16, y: -8 }, { x: 16, y: -8 },
        { x: 0, y: -20 }, { x: -8, y: 16 }, { x: 8, y: 16 }
      ];
      seedCoords.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x * (fruit.radius / 54), c.y * (fruit.radius / 54), 3, 0, Math.PI * 2);
        ctx.fill();
      });
      break;

    case 'orange':
      // Skin Outline
      ctx.fillStyle = fruit.skinColor;
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius, 0, Math.PI * 2);
      ctx.fill();

      // Rind (white)
      ctx.fillStyle = '#fff4e6';
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Inside pulp segments (wedge segments)
      ctx.fillStyle = fruit.fleshColor;
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius * 0.82, 0, Math.PI * 2);
      ctx.fill();

      // Wedges dividers (draw white lines)
      ctx.strokeStyle = '#fff4e6';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const wAngle = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(wAngle) * fruit.radius * 0.82, Math.sin(wAngle) * fruit.radius * 0.82);
        ctx.stroke();
      }
      // Center pulp dot
      ctx.fillStyle = '#fff4e6';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'lemon':
      // Lemon is drawn as a slightly elongated capsule shape
      ctx.fillStyle = fruit.skinColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, fruit.radius * 1.15, fruit.radius * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rind (white)
      ctx.fillStyle = '#ffffe0';
      ctx.beginPath();
      ctx.ellipse(0, 0, fruit.radius * 1.03, fruit.radius * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pulp
      ctx.fillStyle = fruit.fleshColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, fruit.radius * 0.95, fruit.radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      // dividers
      ctx.strokeStyle = '#ffffe0';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const wAngle = (i / 6) * Math.PI * 2;
        ctx.lineTo(Math.cos(wAngle) * fruit.radius * 0.95, Math.sin(wAngle) * fruit.radius * 0.7);
        ctx.stroke();
      }
      break;

    case 'strawberry':
      // Strawberry is drawn as heart shape or tapered triangle
      ctx.fillStyle = fruit.skinColor;
      ctx.beginPath();
      ctx.moveTo(0, -fruit.radius);
      ctx.bezierCurveTo(fruit.radius, -fruit.radius, fruit.radius, fruit.radius * 0.4, 0, fruit.radius * 1.25);
      ctx.bezierCurveTo(-fruit.radius, fruit.radius * 0.4, -fruit.radius, -fruit.radius, 0, -fruit.radius);
      ctx.fill();

      // Strawberry seeds (little yellow dots)
      ctx.fillStyle = '#ffdf7e';
      const sSeeds = [
        { x: -10, y: -4 }, { x: 10, y: -4 }, { x: 0, y: 12 },
        { x: -5, y: 6 }, { x: 5, y: 6 }, { x: -8, y: -16 }, { x: 8, y: -16 }
      ];
      sSeeds.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x * (fruit.radius / 30), s.y * (fruit.radius / 30), 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Stem leaf (green cap at top)
      ctx.fillStyle = '#4cd964';
      ctx.beginPath();
      ctx.moveTo(0, -fruit.radius * 0.85);
      ctx.lineTo(-fruit.radius * 0.45, -fruit.radius * 1.15);
      ctx.lineTo(-fruit.radius * 0.15, -fruit.radius * 0.95);
      ctx.lineTo(0, -fruit.radius * 1.3);
      ctx.lineTo(fruit.radius * 0.15, -fruit.radius * 0.95);
      ctx.lineTo(fruit.radius * 0.45, -fruit.radius * 1.15);
      ctx.closePath();
      ctx.fill();
      break;

    case 'pineapple':
      // Pineapple drawn with hexagonal pattern
      ctx.fillStyle = fruit.skinColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, fruit.radius * 0.85, fruit.radius * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Yellow core grid details
      ctx.strokeStyle = fruit.fleshColor;
      ctx.lineWidth = 2.5;
      
      // Draw cross-hatching to represent pineapple scale segments
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, fruit.radius * 0.8, fruit.radius * 1.1, 0, 0, Math.PI * 2);
      ctx.clip();
      
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-fruit.radius, i * 20 - fruit.radius);
        ctx.lineTo(fruit.radius, i * 20 + fruit.radius);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(fruit.radius, i * 20 - fruit.radius);
        ctx.lineTo(-fruit.radius, i * 20 + fruit.radius);
        ctx.stroke();
      }
      ctx.restore();

      // Spiky Leaf Cap (green crown at top)
      ctx.fillStyle = '#2f5c1d';
      ctx.beginPath();
      ctx.moveTo(-fruit.radius * 0.3, -fruit.radius * 1.05);
      ctx.lineTo(-fruit.radius * 0.5, -fruit.radius * 1.6);
      ctx.lineTo(-fruit.radius * 0.15, -fruit.radius * 1.3);
      ctx.lineTo(0, -fruit.radius * 1.85); // central tallest leaf
      ctx.lineTo(fruit.radius * 0.15, -fruit.radius * 1.3);
      ctx.lineTo(fruit.radius * 0.5, -fruit.radius * 1.6);
      ctx.lineTo(fruit.radius * 0.3, -fruit.radius * 1.05);
      ctx.closePath();
      ctx.fill();
      break;
  }

  // Draw 3D Shading Glare Overlay
  radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  radGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
  radGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.25)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  if (fruit.drawType === 'pineapple') {
    ctx.ellipse(0, 0, fruit.radius * 0.85, fruit.radius * 1.15, 0, 0, Math.PI * 2);
  } else if (fruit.drawType === 'lemon') {
    ctx.ellipse(0, 0, fruit.radius * 1.15, fruit.radius * 0.88, 0, 0, Math.PI * 2);
  } else if (fruit.drawType === 'strawberry') {
    ctx.moveTo(0, -fruit.radius);
    ctx.bezierCurveTo(fruit.radius, -fruit.radius, fruit.radius, fruit.radius * 0.4, 0, fruit.radius * 1.25);
    ctx.bezierCurveTo(-fruit.radius, fruit.radius * 0.4, -fruit.radius, -fruit.radius, 0, -fruit.radius);
  } else {
    ctx.arc(0, 0, fruit.radius, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.restore();
}

function drawBombModel(ctx, bomb) {
  ctx.save();
  ctx.translate(bomb.x, bomb.y);
  
  // 1. Draw burning spark trail (fuse particles)
  if (gameState === 'PLAYING') {
    particles.push({
      x: bomb.x + Math.cos(bomb.fusePhase) * 14 + 18,
      y: bomb.y - bomb.radius - 8 + Math.sin(bomb.fusePhase) * 6,
      vx: (Math.random() - 0.5) * 2,
      vy: -Math.random() * 2 - 1,
      color: Math.random() < 0.6 ? '#ffcc00' : '#ff3300',
      radius: Math.random() * 3 + 1,
      opacity: 1,
      decay: 0.03
    });
  }

  // 2. Draw rope fuse curve
  ctx.strokeStyle = '#a48c7c';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, -bomb.radius + 6);
  ctx.quadraticCurveTo(12, -bomb.radius - 12, 18, -bomb.radius - 8);
  ctx.stroke();

  // 3. Draw metal core sphere
  const metallicGrad = ctx.createRadialGradient(
    -bomb.radius * 0.25, -bomb.radius * 0.25, bomb.radius * 0.1,
    0, 0, bomb.radius
  );
  metallicGrad.addColorStop(0, '#697689'); // light grey specular
  metallicGrad.addColorStop(0.3, '#2a313d'); // steel blue
  metallicGrad.addColorStop(0.85, '#0f1218'); // dark body
  metallicGrad.addColorStop(1, '#05070a');

  ctx.fillStyle = metallicGrad;
  ctx.beginPath();
  ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2);
  ctx.fill();

  // 4. Draw warning neon logo (red danger bones or circle skull)
  ctx.strokeStyle = 'rgba(255, 51, 102, 0.7)';
  ctx.shadowColor = '#ff3366';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  // Draw an X warning pattern
  ctx.moveTo(-10, -10);
  ctx.lineTo(10, 10);
  ctx.moveTo(10, -10);
  ctx.lineTo(-10, 10);
  ctx.stroke();

  ctx.restore();
}

// --- AMBIENT FLOATING FRUITS FOR LOBBY BACKGROUND ---

let lobbyInterval = null;
function startLobbyAnimations() {
  // Spawn ambient floating fruits behind the lobby card
  lobbyInterval = setInterval(() => {
    if (gameState !== 'LOBBY') {
      clearInterval(lobbyInterval);
      return;
    }
    if (fruits.length < 5) {
      const types = Object.keys(FRUIT_TYPES);
      const randomType = types[Math.floor(Math.random() * types.length)];
      const config = FRUIT_TYPES[randomType];

      fruits.push({
        ...config,
        x: Math.random() * canvas.width,
        y: canvas.height + config.radius,
        vx: (Math.random() - 0.5) * 2,
        vy: -(Math.random() * 3 + 10), // slow drift
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02
      });
    }
  }, 2500);
}

// --- DESKTOP MOUSE & TOUCH SLICING SUPPORT ---
let desktopIsSlashing = false;
let desktopLastPoint = null;

function setupDesktopInput() {
  const handleDown = (clientX, clientY) => {
    audio.resumeContext();
    
    // Auto-register local player 1 if no players in lobby
    const pId = Object.keys(players)[0] || 1;
    if (!players[pId]) {
      registerPlayer(pId, PLAYER_COLORS[1], 'Blade Master');
    }

    desktopIsSlashing = true;
    const pt = { x: clientX, y: clientY, age: 0 };
    desktopLastPoint = pt;

    if (!swipeTrails[pId]) swipeTrails[pId] = [];
    swipeTrails[pId].push(pt);
    activePointers[pId] = { x: clientX, y: clientY, color: (players[pId] && players[pId].color) || PLAYER_COLORS[1] };

    if (gameState === 'PLAYING') {
      checkProximityCollisions(pId, clientX, clientY);
    }
    audio.playSwish();
  };

  const handleMove = (clientX, clientY) => {
    if (!desktopIsSlashing) return;
    const pId = Object.keys(players)[0] || 1;
    const pt = { x: clientX, y: clientY, age: 0 };

    if (!swipeTrails[pId]) swipeTrails[pId] = [];
    swipeTrails[pId].push(pt);
    if (swipeTrails[pId].length > 14) swipeTrails[pId].shift();

    activePointers[pId] = { x: clientX, y: clientY, color: (players[pId] && players[pId].color) || PLAYER_COLORS[1] };

    if (desktopLastPoint && gameState === 'PLAYING') {
      checkCollisions(pId, desktopLastPoint, pt);
    }
    desktopLastPoint = pt;

    if (Math.random() < 0.14) {
      audio.playSwish();
    }
  };

  const handleUp = () => {
    if (!desktopIsSlashing) return;
    const pId = Object.keys(players)[0] || 1;
    desktopIsSlashing = false;
    desktopLastPoint = null;
    delete activePointers[pId];
    checkCombo(pId);
  };

  window.addEventListener('mousedown', (e) => {
    // Only slice if not clicking on UI buttons
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      handleDown(e.clientX, e.clientY);
    }
  });

  window.addEventListener('mousemove', (e) => {
    handleMove(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', handleUp);

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0 && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      const t = e.touches[0];
      handleDown(t.clientX, t.clientY);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0 && desktopIsSlashing) {
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
    }
  }, { passive: true });

  window.addEventListener('touchend', handleUp);
}
