<div align="center">

# DOJO BLADE: DEVIL FRUITS

### *Real-Time Multiplayer Fruit Slicing Game with Smartphone Sword Controllers*

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![WebSocket](https://img.shields.io/badge/WebSocket-Realtime%2060FPS-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://github.com/websockets/ws)
[![Canvas 2D](https://img.shields.io/badge/HTML5-Canvas%202D-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Online%20on%20Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://devil-fruit-multiplayer.onrender.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

<p align="center">
  <b>Transform your smartphone into a wireless katana.</b><br>
  Scan the QR code from any browser, slash across your phone screen, and slice fruits in real-time on your laptop display with multi-device haptic feedback!
</p>

<p align="center">
  🎮 <b>Live Game:</b> <a href="https://devil-fruit-multiplayer.onrender.com">https://devil-fruit-multiplayer.onrender.com</a>
</p>

</div>

---

## Key Features

- **Zero-Install Smartphone Controller**: Simply scan the on-screen QR code with your iPhone or Android camera to instantly pair your phone as a high-speed sword controller.
- **4-Player Real-time Multiplayer**: Supports up to 4 simultaneous slayers with distinct neon identities (Neon Pink, Neon Green, Neon Blue, Neon Yellow), custom player tags, and a live synchronized HUD.
- **Ultra-Low Latency WebSocket Engine**: Real-time packet streaming (60+ updates/sec) with sub-pixel swipe interpolation (`STEP_SIZE`) so high-speed slashes never skip a fruit.
- **Procedural 3D Vector Fruit Models**: Dynamic rendering of Watermelons, Pineapples, Oranges, Lemons, and Strawberries with seeds, rinds, pulp segments, and split-half rotational physics upon impact.
- **Explosive Particle & Splat VFX**: Starburst juice splatters on background arena walls, glowing blade trails with intense white energy cores, spark fuse animations, and screen shake.
- **Mobile Haptic Feedback**: Vibrates physically in your hand via `navigator.vibrate` when slicing fruits, landing 3+ fruit combos, or striking hazard bombs.
- **Procedural Web Audio Synthesizer**: Pure math-based Web Audio synthesizer generating real-time blade swishes, squishy fruit crunches, bomb blasts, and ambient pentatonic background music (0 external audio dependencies).
- **Production-Grade Security**: Built-in Content Security Policy (CSP), XSS input sanitization, WebSocket payload caps (4KB), per-connection rate limiting, and path traversal defenses.

---

## Game Modes

| Mode | Rules & Mechanics |
| :--- | :--- |
| **Classic Mode** | 3 Lives. Dropping whole fruits costs 1 life. Hazard bombs terminate the game immediately. High stakes, pure adrenaline. |
| **Zen Mode** | 90-Second timer. No falling fruit penalties. Bomb strikes deduct 10 points instead of ending the game. Pure slicing frenzy. |

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │              Node.js Server                  │
                      │  - Dynamic Local IP / Host Detection         │
                      │  - Low-Latency WebSocket Hub (ws)            │
                      │  - Rate Limiting & Input Sanitization        │
                      │  - 4-Player Slot State Manager               │
                      └──────────────────────┬───────────────────────┘
                                             │
                       WebSocket (LAN/WAN) ──┴── WebSocket (LAN/WAN)
                       ┌──────────────────────┐  ┌──────────────────────┐
                       │   Main Display Screen│  │  Mobile Controllers  │
                       │  - Canvas 2D Engine  │  │ - Fullscreen Touchpad│
                       │  - Physics & Combos  │  │ - Motion Throttle    │
                       │  - Procedural Audio  │  │ - Haptic Vibration   │
                       │  (Laptop / Monitor)  │  │ (Up to 4 Smartphones)│
                       └──────────────────────┘  └──────────────────────┘
```

---

## Quickstart & Installation

### 1. Clone the repository
```bash
git clone https://github.com/27aryankhan/dojo-blade.git
cd dojo-blade
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the game server
```bash
npm start
```

### 4. Play!
1. Open `http://localhost:3000` in your desktop browser.
2. Connect your mobile phone to the same Wi-Fi network and scan the on-screen QR code (or visit the URL shown on screen).
3. Enter your Slayer Name and tap **Sync Sword** to enter the Dojo!

---

## Technology Stack

- **Backend**: Node.js, `ws` (WebSockets), `http`, `os`, `fs`, `path`
- **Frontend Display**: HTML5 Canvas 2D, Vanilla JavaScript (ES6+), CSS Glassmorphism
- **Mobile Controller**: Pointer & Touch Event API, Web Vibration API, Screen WakeLock API
- **Audio Engine**: Web Audio API (Sub-bass oscillators, Biquad filters, White noise buffers)
- **QR Generator**: QRious.js

---

## Project Structure

```text
├── public/
│   ├── index.html            # Main desktop game arena & lobby display
│   ├── controller.html       # Mobile smartphone controller interface
│   ├── css/
│   │   ├── style.css         # Main screen glassmorphism styling
│   │   └── controller.css    # Touchpad HUD & mobile responsive layout
│   └── js/
│       ├── game.js           # Canvas 2D physics, slice engine & rendering
│       ├── controller.js     # Touch tracking, throttle & haptic streaming
│       ├── audio.js          # Procedural Web Audio API sound synthesizer
│       └── qrious.min.js     # QR code generator library
├── server.js                 # HTTP server, WebSocket hub & security filters
├── package.json              # Project dependencies & scripts
├── .gitignore                # Security protection for logs, secrets & OS files
└── README.md                 # Project documentation
```

---

## Deployment

### 🌐 Live Deployment
The game is currently deployed and running live:
- **Main Arena Display**: [https://devil-fruit-multiplayer.onrender.com](https://devil-fruit-multiplayer.onrender.com)
- **Mobile Controller**: [https://devil-fruit-multiplayer.onrender.com/controller.html](https://devil-fruit-multiplayer.onrender.com/controller.html)

### 🚀 Deploy Your Own
This project is pre-configured with WebSocket support for easy cloud deployment:

- **[Render.com](https://render.com)**: Create a **Web Service**, connect your GitHub repo, set Build Command to `npm install` and Start Command to `npm start`. Set environment variable `PORT` if needed (defaults to standard web ports).

---

## License

This project is licensed under the [MIT License](LICENSE).
