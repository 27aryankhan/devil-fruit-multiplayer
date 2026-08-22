const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(path.join(__dirname, 'public'));

// ============================================================
// SECURITY: Input Sanitization
// ============================================================

// Strip all HTML/script tags and limit to safe characters
function sanitizePlayerName(name) {
  if (typeof name !== 'string') return 'Ninja';
  // Remove any HTML tags
  let clean = name.replace(/<[^>]*>/g, '');
  // Remove dangerous characters (keep alphanumeric, spaces, hyphens, underscores, emojis)
  clean = clean.replace(/[^\w\s\-_.\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/gu, '');
  // Trim and limit length
  clean = clean.trim().substring(0, 16);
  return clean || 'Ninja';
}

// Validate that a value is a finite number within a range
function isValidCoord(val) {
  return typeof val === 'number' && isFinite(val) && val >= -1 && val <= 2;
}

function isValidSpeed(val) {
  return typeof val === 'number' && isFinite(val);
}

// ============================================================
// SECURITY: Rate Limiting for WebSocket
// ============================================================

const RATE_LIMIT_WINDOW_MS = 1000; // 1 second window
const RATE_LIMIT_MAX_MESSAGES = 100; // max messages per window

function createRateLimiter() {
  return {
    count: 0,
    windowStart: Date.now(),
    check() {
      const now = Date.now();
      if (now - this.windowStart > RATE_LIMIT_WINDOW_MS) {
        this.count = 0;
        this.windowStart = now;
      }
      this.count++;
      return this.count <= RATE_LIMIT_MAX_MESSAGES;
    }
  };
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

// Detect local IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Connection details are dynamically resolved per-request to handle network changes.

// Store active connections
let activeScreen = null;
const controllers = new Map(); // ws -> player info
const playerSlots = [
  { id: 1, color: '#ff3366', name: 'Red Player', occupied: false, ws: null },    // Neon Pink/Red
  { id: 2, color: '#33ff66', name: 'Green Player', occupied: false, ws: null },  // Neon Green
  { id: 3, color: '#3399ff', name: 'Blue Player', occupied: false, ws: null },   // Neon Blue
  { id: 4, color: '#ffcc33', name: 'Yellow Player', occupied: false, ws: null }  // Neon Yellow
];

// ============================================================
// SECURITY: HTTP Headers applied to all responses
// ============================================================

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:;"
};

function setSecurityHeaders(res) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

// Server request handler
const server = http.createServer((req, res) => {
  // Apply security headers to every response
  setSecurityHeaders(res);

  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // API endpoint for screen/controller info
  if (filePath.startsWith('/api/connection-info')) {
    const currentIp = getLocalIp();
    const currentLocalUrl = `http://${currentIp}:${PORT}`;
    const currentControllerUrl = `http://${currentIp}:${PORT}/controller.html`;
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      localUrl: currentLocalUrl,
      controllerUrl: currentControllerUrl,
      localIp: currentIp
    }));
    return;
  }
  
  // Strip query parameters
  const queryIndex = filePath.indexOf('?');
  if (queryIndex !== -1) {
    filePath = filePath.substring(0, queryIndex);
  }

  // Decode URL-encoded characters and normalize path
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(filePath);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }

  const fullPath = path.resolve(path.join(PUBLIC_DIR, decodedPath));
  
  // SECURITY: Ensure resolved path is inside PUBLIC_DIR (prevents path traversal + symlink attacks)
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Check if path is a directory — return 404 instead of 500
  fs.stat(fullPath, (statErr, stats) => {
    if (statErr) {
      if (statErr.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    // SECURITY: Block directory requests
    if (stats.isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // Resolve symlinks and re-check the real path is still within PUBLIC_DIR
    fs.realpath(fullPath, (realpathErr, resolvedPath) => {
      if (realpathErr || !resolvedPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      fs.readFile(resolvedPath, (readErr, data) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
          return;
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
  });
});

// Setup WebSocket server on top of HTTP server
// SECURITY: Limit max WebSocket message payload to 4KB to prevent memory exhaustion attacks
const wss = new WebSocket.Server({ server, maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection established');

  // SECURITY: Attach rate limiter to each connection
  ws._rateLimiter = createRateLimiter();

  // Disable Nagle's algorithm for immediate packet delivery (real-time responsiveness)
  if (req.socket) {
    req.socket.setNoDelay(true);
  }

  // Find first unoccupied slot and offer it
  const initialSlotIndex = playerSlots.findIndex(s => !s.occupied);
  if (initialSlotIndex !== -1) {
    ws.send(JSON.stringify({
      type: 'slotOffer',
      playerId: playerSlots[initialSlotIndex].id,
      placeholderName: `Ninja ${playerSlots[initialSlotIndex].id}`
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'lobbyFull',
      message: 'Lobby full. Maximum 4 players allowed.'
    }));
  }

  ws.on('message', (message) => {
    // SECURITY: Rate limiting — disconnect clients that send too many messages
    if (!ws._rateLimiter.check()) {
      console.warn('Rate limit exceeded, closing connection');
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    try {
      const data = JSON.parse(message);

      // SECURITY: Validate message type is a string
      if (typeof data.type !== 'string') return;
      
      switch (data.type) {
        case 'register':
          if (data.role === 'screen') {
            console.log('Game screen registered');
            activeScreen = ws;
            
            // Notify screen of any already connected controllers
            playerSlots.forEach(slot => {
              if (slot.occupied) {
                ws.send(JSON.stringify({
                  type: 'playerJoined',
                  playerId: slot.id,
                  color: slot.color,
                  name: slot.name
                }));
              }
            });
          } else if (data.role === 'controller') {
            // Check if this WebSocket connection is ALREADY registered to a slot
            let slot = controllers.get(ws);
            
            if (slot) {
              // Update name on existing slot instead of taking a new slot
              if (data.playerName) {
                const safeName = sanitizePlayerName(data.playerName);
                slot.name = safeName;
              }
            } else {
              // Assign a new player slot if available
              const slotIndex = playerSlots.findIndex(s => !s.occupied);
              if (slotIndex !== -1) {
                slot = playerSlots[slotIndex];
                slot.occupied = true;
                slot.ws = ws;
                
                if (data.playerName) {
                  const safeName = sanitizePlayerName(data.playerName);
                  if (safeName.startsWith('Ninja ') && safeName !== `Ninja ${slot.id}`) {
                    slot.name = `Ninja ${slot.id}`;
                  } else {
                    slot.name = safeName;
                  }
                }
                
                controllers.set(ws, slot);
              } else {
                // No slots available
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Lobby full. Maximum 4 players allowed.'
                }));
                ws.close();
                return;
              }
            }

            console.log(`Controller registered as Player ${slot.id} (${slot.color}) with name ${slot.name}`);
            
            // Confirm registration to controller
            ws.send(JSON.stringify({
              type: 'registered',
              playerId: slot.id,
              color: slot.color,
              name: slot.name
            }));

            // Notify the screen
            if (activeScreen && activeScreen.readyState === WebSocket.OPEN) {
              activeScreen.send(JSON.stringify({
                type: 'playerJoined',
                playerId: slot.id,
                color: slot.color,
                name: slot.name
              }));
            }
          }
          break;

        case 'touchStart':
        case 'touchMove':
        case 'touchEnd': {
          // SECURITY: Validate touch coordinates and velocity are valid numbers
          if (!isValidCoord(data.x) || !isValidCoord(data.y)) break;
          if (data.vx !== undefined && !isValidSpeed(data.vx)) break;
          if (data.vy !== undefined && !isValidSpeed(data.vy)) break;
          if (data.speed !== undefined && !isValidSpeed(data.speed)) break;

          // Forward touch events from controller to screen
          const controllerInfo = controllers.get(ws);
          if (controllerInfo && activeScreen && activeScreen.readyState === WebSocket.OPEN) {
            activeScreen.send(JSON.stringify({
              type: data.type,
              playerId: controllerInfo.id,
              color: controllerInfo.color,
              x: data.x,
              y: data.y,
              vx: data.vx || 0,
              vy: data.vy || 0,
              speed: data.speed || 0
            }));
          }
          break;
        }

        case 'startGame':
          // Forward start game request to screen
          if (activeScreen && activeScreen.readyState === WebSocket.OPEN) {
            activeScreen.send(JSON.stringify({
              type: 'startGame',
              mode: data.mode
            }));
          }
          break;

        case 'gameSync':
          // The screen sends state updates (score, lives, etc.) to sync with all controllers
          controllers.forEach((slot, controllerWs) => {
            if (controllerWs.readyState === WebSocket.OPEN) {
              controllerWs.send(JSON.stringify({
                type: 'gameSync',
                score: data.score,
                lives: data.lives,
                gameOver: data.gameOver,
                mode: data.mode,
                timer: data.timer,
                players: data.players // list of scores/colors if multiplayer
              }));
            }
          });
          break;

        case 'triggerVibrate': {
          // Screen requests vibration for a specific player
          const targetPlayerId = data.playerId;
          const targetSlot = playerSlots.find(s => s.id === targetPlayerId);
          if (targetSlot && targetSlot.ws && targetSlot.ws.readyState === WebSocket.OPEN) {
            targetSlot.ws.send(JSON.stringify({
              type: 'vibrate',
              pattern: data.pattern
            }));
          }
          break;
        }

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Connection closed');
    if (ws === activeScreen) {
      activeScreen = null;
      console.log('Active game screen disconnected');
    } else if (controllers.has(ws)) {
      const slot = controllers.get(ws);
      console.log(`Player ${slot.id} (${slot.name}) disconnected`);
      
      // Free slot
      slot.occupied = false;
      slot.ws = null;
      const defaultNames = ['Red Player', 'Green Player', 'Blue Player', 'Yellow Player'];
      slot.name = defaultNames[slot.id - 1] || `Player ${slot.id}`;
      controllers.delete(ws);

      // Notify game screen of player departure
      if (activeScreen && activeScreen.readyState === WebSocket.OPEN) {
        activeScreen.send(JSON.stringify({
          type: 'playerLeft',
          playerId: slot.id
        }));
      }
    }
  });
});

server.listen(PORT, () => {
  const currentIp = getLocalIp();
  console.log(`====================================================`);
  console.log(`Devil Fruits Multiplayer Server Running!`);
  console.log(`Desktop Game: http://${currentIp}:${PORT}`);
  console.log(`Mobile Controller: http://${currentIp}:${PORT}/controller.html`);
  console.log(`====================================================`);
});
 