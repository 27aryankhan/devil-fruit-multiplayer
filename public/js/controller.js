// ==========================================
// SECURITY: Client-Side Anti-Tamper & Blackout Shield
// ==========================================
function triggerSecurityLockdown(reason) {
  console.warn('[SECURITY ALERT] Controller tampering detected:', reason);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close(1008, 'Security Violation');
  }
  // Black out screen
  document.body.innerHTML = `
    <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000000;color:#ff3366;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;z-index:999999;text-align:center;padding:20px;">
      <h1 style="font-size:1.8rem;margin-bottom:10px;letter-spacing:2px;">🚫 CONTROLLER LOCKED</h1>
      <p style="color:#ffffff;font-size:1rem;max-width:320px;line-height:1.5;">
        Security policy violation or script tampering detected.
      </p>
      <div style="margin-top:18px;padding:6px 14px;background:#111;border:1px solid #333;border-radius:6px;color:#888;font-size:0.8rem;">
        Shield Status: ACTIVE | Disconnected
      </div>
    </div>
  `;
}

let socket;
let playerId = null;
let playerColor = '#ffffff';
let playerName = '';
let isRegistered = false;
let offeredPlayerId = null;
let defaultPlayerName = '';

// Touch state variables
let isTouching = false;
let lastX = 0;
let lastY = 0;
let lastTime = 0;

const touchPad = document.getElementById('touch-pad');
const statusText = document.getElementById('status-text');
const joinBtn = document.getElementById('btn-join');
const overlaySetup = document.getElementById('overlay-setup');
const hudContainer = document.getElementById('hud-container');
const gameOverOverlay = document.getElementById('game-over-overlay');

// HUD elements
const hudScore = document.getElementById('hud-score');
const hudTimer = document.getElementById('hud-timer');
const hudMode = document.getElementById('hud-mode');
const badgeDot = document.getElementById('badge-dot');
const playerNameDisplay = document.getElementById('player-name');

// --- AUTO-DETECT COUNTRY ---
function detectUserCountry() {
  try {
    const lang = navigator.language || (navigator.languages && navigator.languages[0]) || '';
    if (lang.includes('-')) {
      const region = lang.split('-')[1].toUpperCase();
      if (region.length === 2 && region !== 'UN') return region;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) return 'IN';
    if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles') || tz.includes('Denver')) return 'US';
    if (tz.includes('Tokyo')) return 'JP';
    if (tz.includes('London')) return 'GB';
    if (tz.includes('Berlin')) return 'DE';
    if (tz.includes('Paris')) return 'FR';
    if (tz.includes('Dubai')) return 'AE';
    if (tz.includes('Singapore')) return 'SG';
    if (tz.includes('Seoul')) return 'KR';
    if (tz.includes('Toronto') || tz.includes('Vancouver')) return 'CA';
    if (tz.includes('Sydney') || tz.includes('Melbourne')) return 'AU';
  } catch (e) {}
  return 'IN';
}

window.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  setupTouchpad();
  
  // Pre-select detected country
  const detected = detectUserCountry();
  const selectEl = document.getElementById('country-select');
  if (selectEl) {
    selectEl.value = detected;
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', requestJoin);
  }
});

function handleSlotOffer(data) {
  offeredPlayerId = data.playerId;
  defaultPlayerName = data.placeholderName;
  
  const nameInput = document.getElementById('name-input');
  if (nameInput) {
    nameInput.placeholder = defaultPlayerName;
  }
  
  joinBtn.disabled = false;
  statusText.innerText = 'Connected! Enter your name to play.';
}

function handleLobbyFull(data) {
  statusText.innerText = data.message;
  joinBtn.disabled = true;
}

function requestJoin() {
  if (joinBtn) joinBtn.disabled = true;
  vibrateTap();
  
  // Try to go fullscreen for full immersive console feel (and to allow Safari/Chrome vibration & locks)
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    docEl.requestFullscreen().catch(() => {});
  } else if (docEl.webkitRequestFullscreen) {
    docEl.webkitRequestFullscreen().catch(() => {});
  }

  const nameInput = document.getElementById('name-input');
  let chosenName = nameInput ? nameInput.value.trim() : '';
  if (!chosenName) {
    chosenName = defaultPlayerName || 'Ninja';
  }

  const countrySelect = document.getElementById('country-select');
  const chosenCountry = countrySelect ? countrySelect.value : detectUserCountry();

  // Register with the server
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'register',
      role: 'controller',
      playerName: chosenName,
      country: chosenCountry
    }));
    statusText.innerText = 'Forging sword...';
  }
}

function handleRegistration(data) {
  playerId = data.playerId;
  playerColor = data.color;
  playerName = data.name;
  isRegistered = true;

  // Visual modifications
  touchPad.style.color = playerColor;
  touchPad.classList.add('player-active');
  
  badgeDot.style.color = playerColor;
  badgeDot.style.backgroundColor = playerColor;
  playerNameDisplay.innerText = playerName;
  playerNameDisplay.style.color = playerColor;

  // Switch Screens
  overlaySetup.classList.add('hidden');
  hudContainer.classList.remove('hidden');
}

// --- REAL-TIME SCORE & TIMER SYNC ---

function handleGameSync(data) {
  if (!isRegistered) return;

  // Sync mode tags
  hudMode.innerText = data.mode.toUpperCase();
  hudTimer.classList.toggle('hidden', data.mode !== 'zen');
  document.getElementById('hud-lives').classList.toggle('hidden', data.mode === 'zen');

  // Update timer display
  if (data.mode === 'zen') {
    hudTimer.innerText = `${data.timer}s`;
  }

  // Find this specific player's score from sync packet
  const activePlayerSync = data.players.find(p => p.id === playerId);
  if (activePlayerSync) {
    hudScore.innerText = activePlayerSync.score;
  }

  // Sync Lives display (Classic)
  if (data.mode === 'classic') {
    const livesLeft = data.lives;
    document.getElementById('heart-1').classList.toggle('lost', livesLeft < 1);
    document.getElementById('heart-2').classList.toggle('lost', livesLeft < 2);
    document.getElementById('heart-3').classList.toggle('lost', livesLeft < 3);
  }

  // Handle Game Over
  if (data.gameOver) {
    gameOverOverlay.classList.remove('hidden');
    hudContainer.classList.add('hidden');
    document.getElementById('final-score-val').innerText = activePlayerSync ? activePlayerSync.score : '0';
  } else {
    gameOverOverlay.classList.add('hidden');
  }
}

// --- TOUCH & MOUSE INTERFACE & RIPPLE ---

// Request Screen WakeLock to prevent phone screen sleep
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.log('Wake Lock error:', err);
  }
}

function setupTouchpad() {
  // Touch Handlers
  touchPad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isRegistered) return;
    requestWakeLock();

    isTouching = true;
    const touch = e.touches[0];
    
    // Normalize coordinates [0, 1]
    const x = Math.max(0, Math.min(1, touch.clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, touch.clientY / window.innerHeight));

    lastX = x;
    lastY = y;
    lastTime = Date.now();

    sendTouchEvent('touchStart', x, y, 0, 0, 0);
    spawnRipple(touch.clientX, touch.clientY);
  }, { passive: false });

  let lastSocketSentTime = 0;
  const THROTTLE_MS = 12; // ~83 updates/sec for responsive swipe data

  touchPad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isRegistered || !isTouching) return;

    const touch = e.touches[0];
    const x = Math.max(0, Math.min(1, touch.clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, touch.clientY / window.innerHeight));
    const now = Date.now();
    
    // Throttle WebSocket messages
    if (now - lastSocketSentTime < THROTTLE_MS) {
      return;
    }

    // Calculate swipe velocity over the throttled window
    const dt = (now - lastTime) || 1;
    const vx = (x - lastX) / dt;
    const vy = (y - lastY) / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    sendTouchEvent('touchMove', x, y, vx, vy, speed);
    
    // Periodically spawn small trail ripples
    if (Math.random() < 0.35) {
      spawnRipple(touch.clientX, touch.clientY, true);
    }

    lastX = x;
    lastY = y;
    lastTime = now;
    lastSocketSentTime = now;
  }, { passive: false });

  const handleTouchEnd = (e) => {
    if (e) e.preventDefault();
    if (!isRegistered || !isTouching) return;

    isTouching = false;
    sendTouchEvent('touchEnd', lastX, lastY, 0, 0, 0);
  };

  touchPad.addEventListener('touchend', handleTouchEnd, { passive: false });
  touchPad.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  // Mouse Handlers (Enables testing on Laptop / Desktop browsers as well as touchscreen)
  touchPad.addEventListener('mousedown', (e) => {
    if (!isRegistered) return;
    isTouching = true;

    const x = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, e.clientY / window.innerHeight));

    lastX = x;
    lastY = y;
    lastTime = Date.now();

    sendTouchEvent('touchStart', x, y, 0, 0, 0);
    spawnRipple(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isRegistered || !isTouching) return;

    const x = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, e.clientY / window.innerHeight));
    const now = Date.now();

    if (now - lastSocketSentTime < THROTTLE_MS) {
      return;
    }

    const dt = (now - lastTime) || 1;
    const vx = (x - lastX) / dt;
    const vy = (y - lastY) / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    sendTouchEvent('touchMove', x, y, vx, vy, speed);

    if (Math.random() < 0.35) {
      spawnRipple(e.clientX, e.clientY, true);
    }

    lastX = x;
    lastY = y;
    lastTime = now;
    lastSocketSentTime = now;
  });

  window.addEventListener('mouseup', () => {
    if (!isRegistered || !isTouching) return;
    isTouching = false;
    sendTouchEvent('touchEnd', lastX, lastY, 0, 0, 0);
  });
}

function sendTouchEvent(type, x, y, vx, vy, speed) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type,
      playerId,
      color: playerColor,
      x,
      y,
      vx,
      vy,
      speed
    }));
  }
}

// Circular glow ripple on user touch
function spawnRipple(clientX, clientY, isMini = false) {
  const ripple = document.createElement('div');
  ripple.classList.add('ripple');
  
  const size = isMini ? 35 : 70;
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${clientX - size / 2}px`;
  ripple.style.top = `${clientY - size / 2}px`;
  ripple.style.color = playerColor;
  
  touchPad.appendChild(ripple);
  
  // Remove element after transition ends
  setTimeout(() => {
    ripple.remove();
  }, 400);
}

// Light vibration tap helper
function vibrateTap() {
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}
