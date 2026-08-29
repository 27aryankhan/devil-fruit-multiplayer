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
  if (typeof name !== 'string') return 'Player';
  // Remove any HTML tags
  let clean = name.replace(/<[^>]*>/g, '');
  // Remove dangerous characters (keep alphanumeric, spaces, hyphens, underscores, emojis)
  clean = clean.replace(/[^\w\s\-_.\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/gu, '');
  // Normalize whitespace (single spaces between names) and limit length
  clean = clean.replace(/\s+/g, ' ').trim().substring(0, 26);
  return clean || 'Player';
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
  '.webmanifest': 'application/manifest+json',
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

// Helper to identify private LAN/Docker IPs vs public domains
function isPrivateHost(host) {
  if (!host) return true;
  const hostname = host.split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && !parts.some(isNaN)) {
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
  }
  return false;
}

// ============================================================
// SECURITY: Threat Intelligence & IP Auto-Ban / Shield
// ============================================================

const BANNED_IPS = new Map(); // ip -> unbanTimestamp
const BAN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours auto-ban
const ACTIVE_IP_CONNECTIONS = new Map(); // ip -> count
const MAX_WS_PER_IP = 8; // Max concurrent WS connections from a single IP

// Extract client IP through Cloudflare / Render reverse proxy
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
}

function isIpBanned(ip) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === 'localhost') return false;
  if (!BANNED_IPS.has(ip)) return false;
  const unbanTime = BANNED_IPS.get(ip);
  if (Date.now() > unbanTime) {
    BANNED_IPS.delete(ip);
    return false;
  }
  return true;
}

function banIp(ip, reason) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === 'localhost') return;
  BANNED_IPS.set(ip, Date.now() + BAN_DURATION_MS);
  console.warn(`[SECURITY SHIELD] 🚫 Auto-banned IP ${ip} for 2 hours. Reason: ${reason}`);
}

// Patterns of malicious probing / fuzzing / AI exploit bots
const MALICIOUS_PATTERNS = [
  /\.\./,                  // Path traversal
  /%2e%2e/i,              // Encoded path traversal
  /\.env/i,                // Environment secrets probe
  /\.git/i,                // Git folder probe
  /\.php/i,                // PHP probes
  /wp-admin/i,             // WordPress exploit scanners
  /wp-content/i,
  /wp-includes/i,
  /xmlrpc\.php/i,
  /eval\(/i,               // Code execution payloads
  /base64_/i,
  /<script/i,              // Raw script injection in URLs
  /\.aws/i,                // Cloud credential probes
  /\.ssh/i,
  /\.config/i,
  /actuator/i,             // Spring Boot actuator probes
  /cgi-bin/i,
  /shell\.php/i,
  /cmd=/i,
  /etc\/passwd/i,
  /%00/                    // Null byte injection
];

function isMaliciousUrl(url) {
  if (!url || typeof url !== 'string') return true;
  return MALICIOUS_PATTERNS.some(pattern => pattern.test(url));
}

// ============================================================
// ============================================================
// GLOBAL LEADERBOARD & PERSISTENCE
// ============================================================
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

const DEFAULT_LEADERBOARD = {
  classic: [],
  zen: [],
  stats: {
    totalMatches: 0,
    totalFruitsSliced: 0
  }
};

let leaderboardData = { classic: [], zen: [], stats: { totalMatches: 0, totalFruitsSliced: 0 } };

function loadLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        leaderboardData.classic = Array.isArray(parsed.classic) ? parsed.classic : [];
        leaderboardData.zen = Array.isArray(parsed.zen) ? parsed.zen : [];
        leaderboardData.stats = parsed.stats || { totalMatches: 0, totalFruitsSliced: 0 };
      }
    } else {
      leaderboardData = { classic: [], zen: [], stats: { totalMatches: 0, totalFruitsSliced: 0 } };
      saveLeaderboard();
    }
  } catch (err) {
    console.error('Error loading leaderboard.json:', err);
    leaderboardData = { classic: [], zen: [], stats: { totalMatches: 0, totalFruitsSliced: 0 } };
  }
}

function saveLeaderboard() {
  try {
    fs.writeFile(LEADERBOARD_FILE, JSON.stringify(leaderboardData, null, 2), 'utf8', (err) => {
      if (err) console.error('Error saving leaderboard.json:', err);
    });
  } catch (err) {
    console.error('Error in saveLeaderboard:', err);
  }
}

// Broadcast updated leaderboard to active screens
function broadcastLeaderboardUpdate(mode) {
  const targetMode = mode === 'zen' ? 'zen' : 'classic';
  const list = (leaderboardData[targetMode] || []).map((entry, idx) => ({
    rank: idx + 1,
    name: entry.name,
    score: entry.score,
    combo: entry.combo || 0,
    country: entry.country || 'GLOBAL',
    flag: countryCodeToFlag(entry.country),
    date: entry.date
  }));

  const payload = JSON.stringify({
    type: 'leaderboardUpdate',
    mode: targetMode,
    leaderboard: list,
    stats: leaderboardData.stats || { totalMatches: 0, totalFruitsSliced: 0 }
  });

  if (activeScreen && activeScreen.readyState === WebSocket.OPEN) {
    activeScreen.send(payload);
  }
}

// Initial load
loadLeaderboard();

// Convert 2-letter country code to Unicode Flag Emoji
function countryCodeToFlag(cc) {
  if (!cc || typeof cc !== 'string' || cc.length !== 2 || cc === 'GLOBAL' || cc === 'XX') return '🌐';
  const upper = cc.toUpperCase();
  const codePoints = [...upper].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function getClientCountry(req) {
  return req.headers['cf-ipcountry'] || 
         req.headers['x-country-code'] || 
         req.headers['geoip-country-code'] || 
         'GLOBAL';
}

// Server request handler
const server = http.createServer((req, res) => {
  const clientIp = getClientIp(req);

  // 1. Instantly drop banned IPs
  if (isIpBanned(clientIp)) {
    req.socket.destroy();
    return;
  }

  // 2. HTTP Method Filtering (Allow GET, HEAD, and POST for leaderboard submissions)
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, HEAD, POST' });
    res.end('405 Method Not Allowed');
    return;
  }

  // 3. Detect and ban automated scanners / malicious probes
  if (isMaliciousUrl(req.url)) {
    banIp(clientIp, `Malicious probe detected: ${req.url.substring(0, 50)}`);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden - Access Denied');
    req.socket.destroy();
    return;
  }

  // Apply security headers to every response
  setSecurityHeaders(res);

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  
  // Health check / ping endpoint for keep-alive monitoring (e.g. UptimeRobot / cron-job.org)
  if (filePath === '/health' || filePath === '/ping') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  
  // API endpoint for screen/controller info
  if (filePath.startsWith('/api/connection-info')) {
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME;
    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
    const isRenderCloud = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_ID || !!process.env.RENDER_INSTANCE_ID || req.headers['x-forwarded-proto'] === 'https';

    let currentLocalUrl, currentControllerUrl, currentIp;

    if (renderUrl) {
      currentLocalUrl = renderUrl.replace(/\/$/, '');
      currentControllerUrl = `${currentLocalUrl}/controller.html`;
      currentIp = renderHost || 'cloud';
    } else if (forwardedHost) {
      currentLocalUrl = `${proto}://${forwardedHost}`;
      currentControllerUrl = `${proto}://${forwardedHost}/controller.html`;
      currentIp = forwardedHost.split(':')[0];
    } else if (hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1') && !isPrivateHost(hostHeader)) {
      currentLocalUrl = `${proto}://${hostHeader}`;
      currentControllerUrl = `${proto}://${hostHeader}/controller.html`;
      currentIp = hostHeader.split(':')[0];
    } else if (isRenderCloud) {
      const publicDomain = 'devil-fruit-multiplayer.onrender.com';
      currentLocalUrl = `https://${publicDomain}`;
      currentControllerUrl = `https://${publicDomain}/controller.html`;
      currentIp = publicDomain;
    } else {
      currentIp = getLocalIp();
      currentLocalUrl = `http://${currentIp}:${PORT}`;
      currentControllerUrl = `http://${currentIp}:${PORT}/controller.html`;
    }

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

  // API: Get Leaderboard
  if (filePath.startsWith('/api/leaderboard') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const mode = urlObj.searchParams.get('mode') === 'zen' ? 'zen' : 'classic';
    const list = (leaderboardData[mode] || []).map((entry, idx) => ({
      rank: idx + 1,
      name: entry.name,
      score: entry.score,
      combo: entry.combo || 0,
      country: entry.country || 'GLOBAL',
      flag: countryCodeToFlag(entry.country),
      date: entry.date
    }));

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      mode,
      leaderboard: list,
      stats: leaderboardData.stats || { totalMatches: 0, totalFruitsSliced: 0 }
    }));
    return;
  }

  // API: Submit High Score
  if (filePath === '/api/leaderboard/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2048) { // Security: 2KB max payload
        req.socket.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const name = sanitizePlayerName(payload.name);
        const score = parseInt(payload.score, 10);
        const combo = parseInt(payload.combo, 10) || 0;
        const mode = payload.mode === 'zen' ? 'zen' : 'classic';
        const duration = Math.max(1, parseInt(payload.duration, 10) || 1);
        const fruitsSliced = parseInt(payload.fruitsSliced, 10) || 0;

        // Anti-Cheat: Validate realistic score range
        if (isNaN(score) || score < 0 || score > 3500) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid score' }));
          return;
        }

        // Anti-Cheat: Max slice rate cannot exceed 25 fruits/sec
        if (score / duration > 25 && score > 50) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Abnormal score rate' }));
          return;
        }

        const country = payload.country || getClientCountry(req);
        const newEntry = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
          name,
          score,
          combo,
          country,
          date: new Date().toISOString().split('T')[0]
        };

        if (!leaderboardData[mode]) leaderboardData[mode] = [];
        
        // Find existing record by player name to keep personal best
        const existingIdx = leaderboardData[mode].findIndex(
          e => e.name.trim().toLowerCase() === name.toLowerCase()
        );

        if (existingIdx !== -1) {
          if (score >= leaderboardData[mode][existingIdx].score) {
            leaderboardData[mode][existingIdx] = newEntry;
          }
        } else {
          leaderboardData[mode].push(newEntry);
        }

        leaderboardData[mode].sort((a, b) => b.score - a.score);

        // Update overall stats
        leaderboardData.stats = leaderboardData.stats || { totalMatches: 0, totalFruitsSliced: 0 };
        leaderboardData.stats.totalMatches = (leaderboardData.stats.totalMatches || 0) + 1;
        leaderboardData.stats.totalFruitsSliced = (leaderboardData.stats.totalFruitsSliced || 0) + Math.max(0, fruitsSliced);

        saveLeaderboard();
        broadcastLeaderboardUpdate(mode);

        const rank = leaderboardData[mode].findIndex(e => e.name.trim().toLowerCase() === name.toLowerCase()) + 1;
        const isTop10 = rank > 0 && rank <= 10;
        const isNewRecord = rank === 1;

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          rank,
          isTop10,
          isNewRecord,
          flag: countryCodeToFlag(country)
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Bad Request' }));
      }
    });
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
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400'
        });
        res.end(data);
      });
    });
  });
});

// Setup WebSocket server on top of HTTP server
// SECURITY: Limit max WebSocket message payload to 4KB to prevent memory exhaustion attacks
const wss = new WebSocket.Server({ server, maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req);

  // SECURITY: Block banned IPs from connecting to WebSocket
  if (isIpBanned(clientIp)) {
    ws.close(1008, 'Access Denied - Banned');
    return;
  }

  // SECURITY: Prevent WebSocket connection flooding from a single IP
  const currentConns = (ACTIVE_IP_CONNECTIONS.get(clientIp) || 0) + 1;
  if (currentConns > MAX_WS_PER_IP) {
    console.warn(`[SECURITY] Connection flood from ${clientIp}: ${currentConns} sockets. Terminating.`);
    ws.close(1008, 'Too Many Connections');
    return;
  }
  ACTIVE_IP_CONNECTIONS.set(clientIp, currentConns);

  console.log(`New WebSocket connection established from ${clientIp}`);

  // SECURITY: Attach rate limiter to each connection
  ws._rateLimiter = createRateLimiter();
  ws._violationCount = 0;

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
    // SECURITY: Rate limiting — disconnect and auto-ban clients that flood messages
    if (!ws._rateLimiter.check()) {
      ws._violationCount = (ws._violationCount || 0) + 1;
      if (ws._violationCount > 3) {
        banIp(clientIp, 'Excessive WebSocket message flooding');
      }
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
                  slot.name = safeName;
                }
                
                slot.country = data.country || getClientCountry(req);
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

            console.log(`Controller registered as Player ${slot.id} (${slot.color}) with name ${slot.name} [${slot.country}]`);
            
            // Confirm registration to controller
            ws.send(JSON.stringify({
              type: 'registered',
              playerId: slot.id,
              color: slot.color,
              name: slot.name,
              country: slot.country
            }));

            // Notify the screen
            if (activeScreen && activeScreen.readyState === WebSocket.OPEN) {
              activeScreen.send(JSON.stringify({
                type: 'playerJoined',
                playerId: slot.id,
                color: slot.color,
                name: slot.name,
                country: slot.country
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

        case 'ping':
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
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
    // Decrement active connection counter for this IP
    const c = ACTIVE_IP_CONNECTIONS.get(clientIp) || 1;
    if (c <= 1) {
      ACTIVE_IP_CONNECTIONS.delete(clientIp);
    } else {
      ACTIVE_IP_CONNECTIONS.set(clientIp, c - 1);
    }

    console.log(`Connection closed for ${clientIp}`);
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

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
    console.error(`💡 Tip: Run 'lsof -Pi :${PORT} -sTCP:LISTEN' or restart the server.\n`);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, () => {
  const currentIp = getLocalIp();
  console.log(`====================================================`);
  console.log(`Devil Fruits Multiplayer Server Running!`);
  console.log(`Desktop Game: http://${currentIp}:${PORT}`);
  console.log(`Mobile Controller: http://${currentIp}:${PORT}/controller.html`);
  console.log(`====================================================`);
});
 