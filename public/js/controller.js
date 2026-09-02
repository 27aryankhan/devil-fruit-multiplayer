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
const THROTTLE_MS = 8; // ~125 updates/sec ultra-smooth streaming

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
    if (tz.includes('Berlin') || tz.includes('Frankfurt')) return 'DE';
    if (tz.includes('Paris')) return 'FR';
    if (tz.includes('Rome')) return 'IT';
    if (tz.includes('Madrid')) return 'ES';
    if (tz.includes('Amsterdam')) return 'NL';
    if (tz.includes('Zurich')) return 'CH';
    if (tz.includes('Stockholm')) return 'SE';
    if (tz.includes('Oslo')) return 'NO';
    if (tz.includes('Copenhagen')) return 'DK';
    if (tz.includes('Helsinki')) return 'FI';
    if (tz.includes('Warsaw')) return 'PL';
    if (tz.includes('Vienna')) return 'AT';
    if (tz.includes('Brussels')) return 'BE';
    if (tz.includes('Dublin')) return 'IE';
    if (tz.includes('Lisbon')) return 'PT';
    if (tz.includes('Athens')) return 'GR';
    if (tz.includes('Istanbul')) return 'TR';
    if (tz.includes('Kyiv')) return 'UA';
    if (tz.includes('Moscow')) return 'RU';
    if (tz.includes('Shanghai') || tz.includes('Beijing') || tz.includes('Chongqing')) return 'CN';
    if (tz.includes('Singapore')) return 'SG';
    if (tz.includes('Seoul')) return 'KR';
    if (tz.includes('Jakarta')) return 'ID';
    if (tz.includes('Karachi')) return 'PK';
    if (tz.includes('Dhaka')) return 'BD';
    if (tz.includes('Ho_Chi_Minh') || tz.includes('Hanoi')) return 'VN';
    if (tz.includes('Manila')) return 'PH';
    if (tz.includes('Bangkok')) return 'TH';
    if (tz.includes('Kuala_Lumpur')) return 'MY';
    if (tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Brisbane')) return 'AU';
    if (tz.includes('Auckland') || tz.includes('Wellington')) return 'NZ';
    if (tz.includes('Colombo')) return 'LK';
    if (tz.includes('Kathmandu')) return 'NP';
    if (tz.includes('Toronto') || tz.includes('Vancouver') || tz.includes('Montreal')) return 'CA';
    if (tz.includes('Sao_Paulo')) return 'BR';
    if (tz.includes('Mexico_City')) return 'MX';
    if (tz.includes('Buenos_Aires')) return 'AR';
    if (tz.includes('Santiago')) return 'CL';
    if (tz.includes('Bogota')) return 'CO';
    if (tz.includes('Lima')) return 'PE';
    if (tz.includes('Dubai')) return 'AE';
    if (tz.includes('Riyadh')) return 'SA';
    if (tz.includes('Qatar')) return 'QA';
    if (tz.includes('Kuwait')) return 'KW';
    if (tz.includes('Jerusalem') || tz.includes('Tel_Aviv')) return 'IL';
    if (tz.includes('Cairo')) return 'EG';
    if (tz.includes('Lagos')) return 'NG';
    if (tz.includes('Johannesburg')) return 'ZA';
    if (tz.includes('Nairobi')) return 'KE';
    if (tz.includes('Casablanca')) return 'MA';
    if (tz.includes('Accra')) return 'GH';
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

  // Live input validation feedback
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const errorHint = document.getElementById('name-error-hint');
      const parts = nameInput.value.trim().split(/\s+/).filter(p => p.length > 0);
      if (parts.length >= 2 && parts[0].length >= 2 && parts[1].length >= 2) {
        if (errorHint) errorHint.style.display = 'none';
        nameInput.style.borderColor = '#33ff66';
      } else {
        nameInput.style.borderColor = '';
      }
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

    startHeartbeat();
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

        case 'pong':
          // Heartbeat keep-alive response
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
    if (heartbeatInterval) clearInterval(heartbeatInterval);
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

let heartbeatInterval = null;
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, 15000);
}

// Reconnect instantly when returning from phone lock or background tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    }
  }
});
window.addEventListener('focus', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connectWebSocket();
  }
});

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
  
  if (nameInput) {
    nameInput.placeholder = 'e.g. John Doe';
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
  updateStatus('error', data.message || 'All 4 player slots are occupied. Please wait for an open slot.');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.innerText = 'Lobby Full (4/4)';
  }
}

function requestJoin() {
  const nameErrorHint = document.getElementById('name-error-hint');
  const chosenName = nameInput ? nameInput.value.trim() : '';

  // VALIDATION: Any valid name (at least 2 characters)
  if (!chosenName || chosenName.length < 2) {
    if (nameErrorHint) {
      nameErrorHint.innerText = '⚠️ Please enter your name (at least 2 letters)';
      nameErrorHint.style.display = 'block';
    }
    if (nameInput) {
      nameInput.style.borderColor = '#ff3366';
      nameInput.focus();
    }
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.innerText = '⚔️ ENTER GAME';
    }
    if (navigator.vibrate) {
      navigator.vibrate([80, 50, 80]);
    }
    return;
  }

  // Clear any error state
  if (nameErrorHint) nameErrorHint.style.display = 'none';
  if (nameInput) nameInput.style.borderColor = '#33ff66';

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

  const chosenCountry = countrySelect ? countrySelect.value : detectUserCountry();

  // Register with the server
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'register',
      role: 'controller',
      playerName: chosenName,
      country: chosenCountry
    }));
    socket.send(JSON.stringify({
      type: 'startGame'
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

  // Trigger game start on main screen upon joining
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'startGame'
    }));
  }

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

// --- GO BACK TO LOBBY / SETUP ---
function requestGoBack() {
  vibrateTap();
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if (hudContainer) hudContainer.classList.add('hidden');
  if (overlaySetup) overlaySetup.classList.remove('hidden');

  // Reset join button state
  if (joinBtn) {
    joinBtn.disabled = false;
    joinBtn.innerText = '⚔️ ENTER GAME';
  }

  isRegistered = false;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'leaveGame'
    }));
    socket.send(JSON.stringify({
      type: 'returnToLobby'
    }));
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

  // Helper to map touch coordinates ergonomics
  const getNormalizedCoords = (clientX, clientY) => {
    const isPortrait = window.innerHeight > window.innerWidth;
    const normX = Math.max(0, Math.min(1, clientX / window.innerWidth));
    // In portrait mode, expand vertical reach so comfortable thumb movement covers the entire screen
    let normY = isPortrait 
      ? (clientY / window.innerHeight - 0.08) / 0.78
      : clientY / window.innerHeight;
    normY = Math.max(0, Math.min(1, normY));
    return { x: normX, y: normY };
  };

  // Touch Handlers
  touchPad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isRegistered) return;
    requestWakeLock();

    isTouching = true;
    const touch = e.touches[0];
    const coords = getNormalizedCoords(touch.clientX, touch.clientY);

    lastX = coords.x;
    lastY = coords.y;
    lastTime = Date.now();

    sendTouchEvent('touchStart', coords.x, coords.y, 0, 0, 0);
    spawnRipple(touch.clientX, touch.clientY);
  }, { passive: false });

  touchPad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isRegistered || !isTouching) return;

    const touch = e.touches[0];
    const now = Date.now();
    
    // Throttle WebSocket messages for smooth 120 fps streaming
    if (now - lastSocketSentTime < THROTTLE_MS) {
      return;
    }

    const coords = getNormalizedCoords(touch.clientX, touch.clientY);
    const dt = (now - lastTime) || 1;
    const vx = (coords.x - lastX) / dt;
    const vy = (coords.y - lastY) / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    sendTouchEvent('touchMove', coords.x, coords.y, vx, vy, speed);
    
    // Periodically spawn small trail ripples
    if (Math.random() < 0.35) {
      spawnRipple(touch.clientX, touch.clientY, true);
    }

    lastX = coords.x;
    lastY = coords.y;
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

// Immediately notify server and free player slot when user leaves or closes tab
const notifyExit = () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'leaveGame' }));
      socket.close(1000, 'User Navigated Away');
    } catch (e) {}
  }
};

window.addEventListener('pagehide', notifyExit);
window.addEventListener('beforeunload', notifyExit);
