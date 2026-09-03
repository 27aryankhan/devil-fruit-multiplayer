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

// Controller Mode ('touch' | 'motion')
let controllerMode = 'motion';
let motionSensitivity = 'normal'; // 'normal' (threshold: 18) | 'high' (threshold: 13)
let motionThreshold = 18;
let lastSwingTime = 0;
const SWING_COOLDOWN_MS = 260;
let hasMotionPermission = false;
let isMotionListening = false;
let currentDeviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
let peakGaugeValue = 0;

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

// Setup screen mode choices
const setupChoiceMotion = document.getElementById('setup-choice-motion');
const setupChoiceTouch = document.getElementById('setup-choice-touch');

const overlaySetup = document.getElementById('overlay-setup');
const hudContainer = document.getElementById('hud-container');
const gameOverOverlay = document.getElementById('game-over-overlay');

// Mode Switch & Motion Panel Elements
const btnModeTouch = document.getElementById('btn-mode-touch');
const btnModeMotion = document.getElementById('btn-mode-motion');
const motionPanel = document.getElementById('motion-katana-panel');
const motionPermBanner = document.getElementById('motion-perm-banner');
const katanaBladeVisual = document.getElementById('katana-blade-visual');
const swingDirectionHint = document.getElementById('swing-direction-hint');
const swingGaugeFill = document.getElementById('swing-gauge-fill');
const btnSensitivity = document.getElementById('btn-sensitivity');
const sensitivityVal = document.getElementById('sensitivity-val');
const swipeHint = document.getElementById('swipe-hint');

// Setup Screen Mode Switcher
function setInitialMode(mode) {
  vibrateTap();
  controllerMode = mode;
  if (setupChoiceMotion) setupChoiceMotion.classList.toggle('active', mode === 'motion');
  if (setupChoiceTouch) setupChoiceTouch.classList.toggle('active', mode === 'touch');
}

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

  // If user selected Motion Katana, request iOS Safari motion permission directly on this tap gesture!
  if (controllerMode === 'motion' && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && !hasMotionPermission) {
    requestMotionPermission();
  }

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
  if (katanaBladeVisual) {
    katanaBladeVisual.style.color = playerColor;
  }

  // Switch Screens: hide setup overlay, show active HUD
  if (overlaySetup) overlaySetup.classList.add('hidden');
  if (hudContainer) hudContainer.classList.remove('hidden');

  // Immediately activate selected controller mode (shows motion katana panel & starts sensors)
  setControllerMode(controllerMode);

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

  const leavingPlayerId = playerId;
  isRegistered = false;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'leaveGame',
      playerId: leavingPlayerId
    }));
    socket.send(JSON.stringify({
      type: 'returnToLobby'
    }));
  }

  try {
    if (navigator.sendBeacon && leavingPlayerId) {
      const beaconData = new Blob([JSON.stringify({ playerId: leavingPlayerId })], { type: 'application/json' });
      navigator.sendBeacon('/api/leave', beaconData);
    }
  } catch (e) {}
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
    // STRICT: In Motion Katana mode, touchscreen slicing is completely removed!
    if (controllerMode === 'motion') return;

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
    // STRICT: In Motion Katana mode, touchscreen slicing is completely removed!
    if (controllerMode === 'motion') return;

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
    if (controllerMode === 'motion') {
      isTouching = false;
      return;
    }
    if (e) e.preventDefault();
    if (!isRegistered || !isTouching) return;

    isTouching = false;
    sendTouchEvent('touchEnd', lastX, lastY, 0, 0, 0);
  };

  touchPad.addEventListener('touchend', handleTouchEnd, { passive: false });
  touchPad.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  // Mouse Handlers (Enables testing on Laptop / Desktop browsers as well as touchscreen)
  touchPad.addEventListener('mousedown', (e) => {
    if (controllerMode === 'motion') return;
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
    if (controllerMode === 'motion') return;
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
    if (controllerMode === 'motion') {
      isTouching = false;
      return;
    }
    if (!isRegistered || !isTouching) return;
    isTouching = false;
    sendTouchEvent('touchEnd', lastX, lastY, 0, 0, 0);
  });
}

function sendTouchEvent(type, x, y, vx, vy, speed) {
  // STRICT: When in Motion Katana mode, touchscreen slicing is completely DISABLED!
  // Slices only trigger through physical 3D arm swings in the air.
  if (controllerMode === 'motion') return;

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

// Circular glow ripple on user touch (Only active in Touchpad mode)
function spawnRipple(clientX, clientY, isMini = false) {
  if (controllerMode === 'motion' || !touchPad) return;
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

function notifyExit() {
  if (!isRegistered) return;
  const leavingPlayerId = playerId;
  isRegistered = false;

  // 1. Send WebSocket leave packet and immediately close socket
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({
        type: 'leaveGame',
        playerId: leavingPlayerId
      }));
      socket.close(1000, 'User Exited');
    } catch (e) {}
  }

  // 2. Mobile Browser Guaranteed Beacon (flushes immediately even if OS background-freezes tab)
  try {
    if (navigator.sendBeacon && leavingPlayerId) {
      const beaconData = new Blob([JSON.stringify({ playerId: leavingPlayerId })], { type: 'application/json' });
      navigator.sendBeacon('/api/leave', beaconData);
    }
  } catch (e) {}
}

window.addEventListener('pagehide', notifyExit);
window.addEventListener('beforeunload', notifyExit);
window.addEventListener('unload', notifyExit);

// Handle mobile backgrounding, app-switching, screen lock, and return
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    notifyExit();
  } else if (document.visibilityState === 'visible') {
    // When user returns to tab, ensure a clean fresh connection
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      isRegistered = false;
      if (hudContainer) hudContainer.classList.add('hidden');
      if (overlaySetup) overlaySetup.classList.remove('hidden');
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.innerText = '⚔️ ENTER GAME';
      }
      connectWebSocket();
    }
  }
});

// ============================================================
// 3D MOTION KATANA ENGINE (Accelerometer & Gyroscope)
// ============================================================

function setControllerMode(mode) {
  vibrateTap();
  controllerMode = mode;

  if (btnModeTouch) btnModeTouch.classList.toggle('active', mode === 'touch');
  if (btnModeMotion) btnModeMotion.classList.toggle('active', mode === 'motion');

  if (mode === 'motion') {
    document.body.classList.add('mode-motion-active');
    document.body.classList.remove('mode-touch-active');

    if (touchPad) touchPad.style.pointerEvents = 'none';
    if (motionPanel) motionPanel.classList.remove('hidden');
    if (swipeHint) swipeHint.innerText = '⚔️ Motion Katana: Swing phone in air to slice!';
    
    // Check if iOS Safari permission is needed
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && !hasMotionPermission) {
      if (motionPermBanner) motionPermBanner.classList.remove('hidden');
    } else {
      if (motionPermBanner) motionPermBanner.classList.add('hidden');
      startMotionListeners();
    }
  } else {
    document.body.classList.remove('mode-motion-active');
    document.body.classList.add('mode-touch-active');

    if (touchPad) touchPad.style.pointerEvents = 'auto';
    if (motionPanel) motionPanel.classList.add('hidden');
    if (swipeHint) swipeHint.innerText = '🗡️ Touchpad: Swipe anywhere on screen to slash!';
    stopMotionListeners();
  }

  // Notify server and game screen of controller mode
  if (socket && socket.readyState === WebSocket.OPEN && isRegistered) {
    socket.send(JSON.stringify({
      type: 'controllerMode',
      mode: mode
    }));
  }
}

// Request permission on iOS 13+ (must be triggered from button tap)
function requestMotionPermission() {
  vibrateTap();
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') {
          hasMotionPermission = true;
          if (motionPermBanner) motionPermBanner.classList.add('hidden');
          startMotionListeners();
          if (navigator.vibrate) navigator.vibrate([40, 30, 60]);
        } else {
          if (motionPermBanner) motionPermBanner.classList.remove('hidden');
        }
      })
      .catch((err) => {
        console.warn('DeviceMotionEvent permission error:', err);
        if (motionPermBanner) motionPermBanner.classList.remove('hidden');
      });
  } else {
    startMotionListeners();
  }
}

// Toggle sensitivity between NORMAL (18 m/s²) and HIGH (13 m/s²)
function toggleSensitivity() {
  vibrateTap();
  if (motionSensitivity === 'normal') {
    motionSensitivity = 'high';
    motionThreshold = 13;
  } else {
    motionSensitivity = 'normal';
    motionThreshold = 18;
  }
  if (sensitivityVal) {
    sensitivityVal.innerText = motionSensitivity.toUpperCase();
    sensitivityVal.style.color = motionSensitivity === 'high' ? '#33ff66' : '#ffaa00';
  }
}

let gaugeAnimationId = null;
function startMotionListeners() {
  if (isMotionListening) return;

  window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
  window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
  isMotionListening = true;

  // Power gauge smooth decay loop
  function updateGauge() {
    peakGaugeValue = Math.max(0, peakGaugeValue - 3.5);
    if (swingGaugeFill) {
      swingGaugeFill.style.width = `${peakGaugeValue}%`;
    }
    if (isMotionListening) {
      gaugeAnimationId = requestAnimationFrame(updateGauge);
    }
  }
  gaugeAnimationId = requestAnimationFrame(updateGauge);
}

function stopMotionListeners() {
  if (!isMotionListening) return;
  window.removeEventListener('devicemotion', handleDeviceMotion);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  isMotionListening = false;
  if (gaugeAnimationId) {
    cancelAnimationFrame(gaugeAnimationId);
    gaugeAnimationId = null;
  }
  if (swingGaugeFill) {
    swingGaugeFill.style.width = '0%';
  }
}

// Track orientation for visual katana blade tilt
function handleDeviceOrientation(e) {
  if (!e) return;
  currentDeviceOrientation.alpha = e.alpha || 0;
  currentDeviceOrientation.beta = e.beta || 0;
  currentDeviceOrientation.gamma = e.gamma || 0;

  if (katanaBladeVisual) {
    // Allow blade to rotate smoothly with device roll (gamma) up to 90 degrees
    const gamma = e.gamma || 0;
    const tilt = Math.max(-90, Math.min(90, gamma));
    katanaBladeVisual.style.transform = `rotateZ(${tilt}deg)`;
  }
}

// Main Acceleration & Katana Swing Detection
function handleDeviceMotion(e) {
  if (!isRegistered || !e) return;

  // Rotation rates from gyroscope if available
  const rot = e.rotationRate || {};
  const rotRate = {
    alpha: rot.alpha || 0,
    beta: rot.beta || 0,
    gamma: rot.gamma || 0
  };

  // Prefer acceleration without gravity if provided, else filter gravity out
  let ax = 0, ay = 0, az = 0, netMag = 0;

  if (e.acceleration && e.acceleration.x !== null) {
    ax = e.acceleration.x || 0;
    ay = e.acceleration.y || 0;
    az = e.acceleration.z || 0;
    netMag = Math.sqrt(ax * ax + ay * ay + az * az);
  } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x !== null) {
    ax = e.accelerationIncludingGravity.x || 0;
    ay = e.accelerationIncludingGravity.y || 0;
    az = e.accelerationIncludingGravity.z || 0;
    const rawMag = Math.sqrt(ax * ax + ay * ay + az * az);
    netMag = Math.max(0, rawMag - 9.8);
  }

  // Update real-time swing power gauge
  const currentPct = Math.min(100, Math.round((netMag / 30) * 100));
  if (currentPct > peakGaugeValue) {
    peakGaugeValue = currentPct;
  }

  // Detect Katana Swing spike
  const now = Date.now();
  if (netMag >= motionThreshold && (now - lastSwingTime >= SWING_COOLDOWN_MS)) {
    lastSwingTime = now;
    triggerMotionSlash(ax, ay, az, netMag, rotRate);
  }
}

// ============================================================
// PHONE SPEAKER AUDIO SYNTHESIZER (Wii-style Hand Sound)
// ============================================================
let phoneAudioCtx = null;
function initPhoneAudio() {
  if (phoneAudioCtx) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      phoneAudioCtx = new AudioCtx();
    }
  } catch (e) {}
}

function playPhoneKatanaSwish(speed = 20) {
  if (!phoneAudioCtx) initPhoneAudio();
  if (!phoneAudioCtx) return;
  try {
    if (phoneAudioCtx.state === 'suspended') {
      phoneAudioCtx.resume();
    }
    const now = phoneAudioCtx.currentTime;
    const osc = phoneAudioCtx.createOscillator();
    const gain = phoneAudioCtx.createGain();

    const pitch = Math.min(2.2, Math.max(0.75, speed / 18));
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(580 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(phoneAudioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  } catch (e) {}
}

// Unlock audio context on any user tap
window.addEventListener('touchstart', () => initPhoneAudio(), { once: true, passive: true });
window.addEventListener('mousedown', () => initPhoneAudio(), { once: true, passive: true });

function triggerMotionSlash(ax, ay, az, magnitude, rotRate = {}) {
  const gammaDeg = currentDeviceOrientation.gamma || 0;
  const betaDeg = currentDeviceOrientation.beta || 0;
  const gammaRad = gammaDeg * (Math.PI / 180);
  const betaRad = betaDeg * (Math.PI / 180);

  // Detect screen orientation if device is rotated into landscape (0, 90, 180, 270)
  let screenAngle = 0;
  if (window.screen && window.screen.orientation && window.screen.orientation.angle !== undefined) {
    screenAngle = window.screen.orientation.angle;
  } else if (window.orientation !== undefined) {
    screenAngle = window.orientation;
  }
  const screenAngleRad = screenAngle * (Math.PI / 180);

  // Effective roll: physical tilt + screen orientation
  const effectiveRoll = (screenAngle !== 0) ? screenAngleRad : gammaRad;

  // 1. Transform (ax, ay) through roll rotation matrix into user's horizontal frame
  const cosRoll = Math.cos(effectiveRoll);
  const sinRoll = Math.sin(effectiveRoll);

  const xRoll = ax * cosRoll - ay * sinRoll;
  const yRoll = ax * sinRoll + ay * cosRoll;

  // 2. Account for pitch tilt (beta):
  // When upright (beta ~ 90), vertical movement is along yRoll.
  // When flat (beta ~ 0), vertical movement is along -az.
  const sinBeta = Math.sin(betaRad);
  const cosBeta = Math.cos(betaRad);

  const userHoriz = xRoll;
  const userVert = yRoll * sinBeta - az * cosBeta;

  const absH = Math.abs(userHoriz);
  const absV = Math.abs(userVert);

  // Is device oriented horizontally (landscape or tilted > 35 deg)?
  const isHeldHorizontal = Math.abs(gammaDeg) > 35 || Math.abs(screenAngle) === 90 || Math.abs(screenAngle) === 270;

  // Gyroscope angular velocity checks:
  // Downward pitch rotation (rotRate.beta) is negative when wrist flicks down
  const isHeavyDownPitch = rotRate.beta < -85;

  let from, to, dirLabel;
  const randomJitter = (Math.random() - 0.5) * 0.08;

  // Real-time Pitch Aiming for Horizontal Slices (aiming hand up cuts top, aiming down cuts bottom)
  // betaDeg ranges: >70 (aim high), 45-70 (aim mid), <45 (aim low)
  const aimY = Math.max(0.18, Math.min(0.82, 0.50 - (betaDeg - 55) * 0.008 + randomJitter));

  // Real-time Roll/Yaw Aiming for Vertical Chops (aiming hand left cuts left, aiming right cuts right)
  const aimX = Math.max(0.18, Math.min(0.82, 0.50 + (gammaDeg / 60) * 0.25 + randomJitter));

  // ACCURATE DIRECTION DISCRIMINATION:
  // 1. Deliberate Vertical Downward Chop
  if ((userVert < -3.8 && absV > absH * 1.22) || (isHeavyDownPitch && absH < 4.5)) {
    from = { x: aimX, y: 0.05 };
    to = { x: aimX - randomJitter * 0.5, y: 0.95 };
    dirLabel = 'Downward Chop ⬇';
  }
  // 2. Deliberate Vertical Upward Cut
  else if (userVert > 3.8 && absV > absH * 1.3) {
    from = { x: aimX, y: 0.95 };
    to = { x: aimX + randomJitter * 0.5, y: 0.05 };
    dirLabel = 'Upward Cut ⬆';
  }
  // 3. Guaranteed Horizontal Slash (Left <-> Right)
  // Fires when swinging side-to-side or holding phone horizontally
  else if (isHeldHorizontal || absH >= absV * 0.75) {
    if (userHoriz >= 0) {
      from = { x: 0.05, y: aimY };
      to = { x: 0.95, y: aimY + randomJitter * 0.5 };
      dirLabel = 'Horizontal Slash ➔';
    } else {
      from = { x: 0.95, y: aimY };
      to = { x: 0.05, y: aimY + randomJitter * 0.5 };
      dirLabel = 'Horizontal Slash ⬅';
    }
  }
  // 4. True Diagonal Slash
  else {
    const isMovingRight = userHoriz >= 0;
    const isMovingDown = userVert <= 0;

    if (isMovingRight && isMovingDown) {
      from = { x: 0.08, y: Math.max(0.1, aimY - 0.35) };
      to = { x: 0.92, y: Math.min(0.9, aimY + 0.35) };
      dirLabel = 'Diagonal Slash ↘';
    } else if (isMovingRight && !isMovingDown) {
      from = { x: 0.08, y: Math.min(0.9, aimY + 0.35) };
      to = { x: 0.92, y: Math.max(0.1, aimY - 0.35) };
      dirLabel = 'Diagonal Slash ↗';
    } else if (!isMovingRight && isMovingDown) {
      from = { x: 0.92, y: Math.max(0.1, aimY - 0.35) };
      to = { x: 0.08, y: Math.min(0.9, aimY + 0.35) };
      dirLabel = 'Diagonal Slash ↙';
    } else {
      from = { x: 0.92, y: Math.min(0.9, aimY + 0.35) };
      to = { x: 0.08, y: Math.max(0.1, aimY - 0.35) };
      dirLabel = 'Diagonal Slash ↖';
    }
  }

  // Broadcast motion slash over WebSocket
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'motionSlash',
      playerId,
      color: playerColor,
      from,
      to,
      speed: Math.round(magnitude * 10) / 10,
      direction: dirLabel
    }));
  }

  // Visual & Haptic feedback on phone
  if (katanaBladeVisual) {
    katanaBladeVisual.classList.add('slash-active');
    setTimeout(() => {
      if (katanaBladeVisual) katanaBladeVisual.classList.remove('slash-active');
    }, 180);
  }

  if (swingDirectionHint) {
    swingDirectionHint.innerText = `⚔️ ${dirLabel}!`;
    swingDirectionHint.classList.add('slashed');
    setTimeout(() => {
      if (swingDirectionHint) {
        swingDirectionHint.classList.remove('slashed');
        swingDirectionHint.innerText = 'Ready! Swing phone in air';
      }
    }, 450);
  }

  // Phone speaker sword whoosh sound
  playPhoneKatanaSwish(magnitude);

  // Phone haptic rumble
  if (navigator.vibrate) {
    navigator.vibrate([30, 20, 45]);
  }
}

