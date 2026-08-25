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

// Controller State Variables
let socket = null;
let reconnectTimer = null;
let playerId = null;
let playerColor = '#ffffff';
let playerName = '';
let playerCountry = 'IN';
let isRegistered = false;
let offeredPlayerId = null;
let defaultPlayerName = '';
let currentGameState = 'LOBBY';

// Touch state variables
let isTouching = false;
let lastX = 0;
let lastY = 0;
let lastTime = 0;
let lastSocketSentTime = 0;
const THROTTLE_MS = 12; // ~83 updates/sec

// DOM Elements
const touchPad = document.getElementById('touch-pad');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const statusLabel = document.getElementById('status-label');
const joinBtn = document.getElementById('btn-join');
const nameInput = document.getElementById('name-input');
const countrySelect = document.getElementById('country-select');
const setupForm = document.getElementById('setup-form');

const overlaySetup = document.getElementById('overlay-setup');
const hudContainer = document.getElementById('hud-container');
const gameOverOverlay = document.getElementById('game-over-overlay');

// HUD elements
const hudScore = document.getElementById('hud-score');
const hudTimer = document.getElementById('hud-timer');
const hudMode = document.getElementById('hud-mode');
const badgeDot = document.getElementById('badge-dot');
const playerNameDisplay = document.getElementById('player-name');
const playerFlagDisplay = document.getElementById('player-flag');
const finalScoreVal = document.getElementById('final-score-val');

// Helper: Convert 2-letter country code to flag emoji
function countryCodeToFlagEmoji(cc) {
  if (!cc || typeof cc !== 'string' || cc.length !== 2) return '🌐';
  const upper = cc.toUpperCase();
  const codePoints = [...upper].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

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

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  setupTouchpad();
  
  // Pre-select detected country
  const detected = detectUserCountry();
  if (countrySelect) {
    countrySelect.value = detected;
  }

  // Bind form submit
  if (setupForm) {
    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      requestJoin();
    });
  }

  // Connect to Dojo Server WebSocket
  connectWebSocket();
});

// --- WEBSOCKET CONNECTION LIFECYCLE ---
function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${window.location.host}`;

  updateStatus('connecting', 'Connecting to Dojo Server...');

  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    console.error('WebSocket creation error:', err);
    updateStatus('error', 'Connection error. Retrying...');
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    console.log('Connected to Dojo WebSocket Server at', wsUrl);
    updateStatus('connected', 'Connected! Waiting for slot...');
    
    // If already registered before reconnect, re-register
    if (isRegistered && playerId && playerName) {
      socket.send(JSON.stringify({
        type: 'register',
        role: 'controller',
        playerName: playerName,
        country: playerCountry
      }));
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'slotOffer':
          handleSlotOffer(data);
          break;
          
        case 'lobbyFull':
          handleLobbyFull(data);
          break;

        case 'registered':
          handleRegistration(data);
          break;
          
        case 'gameSync':
          handleGameSync(data);
          break;
          
        case 'vibrate':
          if (navigator.vibrate) {
            navigator.vibrate(data.pattern || 40);
          }
          break;
          
        case 'error':
          updateStatus('error', data.message || 'An error occurred');
          if (joinBtn) joinBtn.disabled = true;
          break;
      }
    } catch (e) {
      console.error('Error handling server message:', e);
    }
  };

  socket.onclose = () => {
    console.warn('Socket closed. Scheduling reconnect...');
    if (!isRegistered) {
      updateStatus('error', 'Lost connection to Dojo. Reconnecting...');
      if (joinBtn) joinBtn.disabled = true;
    }
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.warn('Socket encountered error:', err);
    updateStatus('error', 'Connection failed. Reconnecting...');
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 2000);
}

function updateStatus(state, message) {
  if (!statusText) return;
  statusText.className = 'status-msg';
  if (state === 'connected') {
    statusText.classList.add('connected');
  } else if (state === 'error') {
    statusText.classList.add('error');
  }
  if (statusLabel) {
    statusLabel.innerText = message;
  } else {
    statusText.innerText = message;
  }
}

// --- SLOT OFFER & JOIN FLOW ---
function handleSlotOffer(data) {
  offeredPlayerId = data.playerId;
  defaultPlayerName = data.placeholderName || `Ninja ${offeredPlayerId}`;
  
  if (nameInput) {
    nameInput.placeholder = `e.g. ${defaultPlayerName}`;
    nameInput.disabled = false;
  }
  
  if (joinBtn) {
    joinBtn.disabled = false;
    joinBtn.innerText = '⚔️ ENTER GAME';
  }

  const slotColors = { 1: 'Red', 2: 'Green', 3: 'Blue', 4: 'Yellow' };
  const slotName = slotColors[offeredPlayerId] || `Slot ${offeredPlayerId}`;
  updateStatus('connected', `🟢 Ready! Joined as ${slotName} Sword`);
}

function handleLobbyFull(data) {
  updateStatus('error', data.message || 'Lobby full (4/4 players)');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.innerText = 'Lobby Full';
  }
}

function requestJoin() {
  if (joinBtn && joinBtn.disabled) return;
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.innerText = '⚔️ Entering...';
  }
  vibrateTap();
  
  // Try to go fullscreen for immersive sword controller feel
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    docEl.requestFullscreen().catch(() => {});
  } else if (docEl.webkitRequestFullscreen) {
    docEl.webkitRequestFullscreen().catch(() => {});
  }

  let chosenName = nameInput ? nameInput.value.trim() : '';
  if (!chosenName) {
    chosenName = defaultPlayerName || `Ninja ${offeredPlayerId || 1}`;
  }

  const chosenCountry = countrySelect ? countrySelect.value : detectUserCountry();

  // Register with the server
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'register',
      role: 'controller',
      playerName: chosenName,
      country: chosenCountry
    }));
    updateStatus('connected', '⚔️ Forging sword & entering Dojo...');
  } else {
    updateStatus('error', 'Reconnecting to Dojo... please wait.');
    connectWebSocket();
  }
}

function handleRegistration(data) {
  playerId = data.playerId;
  playerColor = data.color;
  playerName = data.name;
  playerCountry = data.country || 'IN';
  isRegistered = true;

  // Visual styling modifications
  if (touchPad) {
    touchPad.style.color = playerColor;
    touchPad.classList.add('player-active');
  }
  
  if (badgeDot) {
    badgeDot.style.color = playerColor;
    badgeDot.style.backgroundColor = playerColor;
  }
  if (playerNameDisplay) {
    playerNameDisplay.innerText = playerName;
    playerNameDisplay.style.color = playerColor;
  }
  if (playerFlagDisplay) {
    playerFlagDisplay.innerText = countryCodeToFlagEmoji(playerCountry);
  }

  // Switch Screens: hide setup overlay, show active HUD
  if (overlaySetup) overlaySetup.classList.add('hidden');
  if (hudContainer) hudContainer.classList.remove('hidden');

  // Request screen wake lock
  requestWakeLock();
}

// --- PLAY AGAIN FROM PHONE ---
function requestPlayAgain() {
  vibrateTap();
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if (hudContainer) hudContainer.classList.remove('hidden');

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'startGame'
    }));
  } else {
    location.reload();
  }
}

// --- REAL-TIME SCORE & TIMER SYNC ---
function handleGameSync(data) {
  if (!isRegistered) return;

  currentGameState = data.gameState || (data.gameOver ? 'GAMEOVER' : 'PLAYING');

  // Sync mode tags
  if (hudMode && data.mode) {
    hudMode.innerText = data.mode.toUpperCase();
  }
  if (hudTimer) {
    hudTimer.classList.toggle('hidden', data.mode !== 'zen');
  }
  const livesEl = document.getElementById('hud-lives');
  if (livesEl) {
    livesEl.classList.toggle('hidden', data.mode === 'zen');
  }

  // Update timer display
  if (data.mode === 'zen' && hudTimer && data.timer !== undefined) {
    hudTimer.innerText = `${data.timer}s`;
  }

  // Find this specific player's score from sync packet
  if (data.players && Array.isArray(data.players)) {
    const activePlayerSync = data.players.find(p => p.id === playerId);
    if (activePlayerSync && hudScore) {
      hudScore.innerText = activePlayerSync.score;
    }
  }

  // Sync Lives display (Classic)
  if (data.mode === 'classic' && data.lives !== undefined) {
    const livesLeft = data.lives;
    const h1 = document.getElementById('heart-1');
    const h2 = document.getElementById('heart-2');
    const h3 = document.getElementById('heart-3');
    if (h1) h1.classList.toggle('lost', livesLeft < 1);
    if (h2) h2.classList.toggle('lost', livesLeft < 2);
    if (h3) h3.classList.toggle('lost', livesLeft < 3);
  }

  // Handle Game Over
  if (data.gameOver || data.gameState === 'GAMEOVER') {
    if (gameOverOverlay) gameOverOverlay.classList.remove('hidden');
    if (hudContainer) hudContainer.classList.add('hidden');
    
    let finalScore = '0';
    if (data.players && Array.isArray(data.players)) {
      const activePlayer = data.players.find(p => p.id === playerId);
      if (activePlayer) finalScore = activePlayer.score;
    }
    if (finalScoreVal) finalScoreVal.innerText = finalScore;
  } else {
    if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
    if (hudContainer) hudContainer.classList.remove('hidden');
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
  if (!touchPad) return;

  // Touch Handlers
  touchPad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isRegistered) return;
    requestWakeLock();

    isTouching = true;
    const touch = e.touches[0];
    
    const x = Math.max(0, Math.min(1, touch.clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, touch.clientY / window.innerHeight));

    lastX = x;
    lastY = y;
    lastTime = Date.now();

    sendTouchEvent('touchStart', x, y, 0, 0, 0);
    spawnRipple(touch.clientX, touch.clientY);
  }, { passive: false });

  touchPad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isRegistered || !isTouching) return;

    const touch = e.touches[0];
    const x = Math.max(0, Math.min(1, touch.clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, touch.clientY / window.innerHeight));
    const now = Date.now();
    
    // Throttle WebSocket messages for smooth 80-90 fps streaming
    if (now - lastSocketSentTime < THROTTLE_MS) {
      return;
    }

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
  if (!touchPad) return;
  const ripple = document.createElement('div');
  ripple.classList.add('ripple');
  
  const size = isMini ? 35 : 70;
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${clientX - size / 2}px`;
  ripple.style.top = `${clientY - size / 2}px`;
  ripple.style.color = playerColor;
  
  touchPad.appendChild(ripple);
  
  setTimeout(() => {
    ripple.remove();
  }, 400);
}

// Light vibration tap helper
function vibrateTap() {
  if (navigator.vibrate) {
    navigator.vibrate(35);
  }
}
