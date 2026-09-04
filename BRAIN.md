# 🧠 BRAIN.md — DOJO BLADE SYSTEM MEMORY & ARCHITECTURAL GROUND TRUTH

> **Golden Rule**: **STRICT ISOLATION BETWEEN CONTROL MODES.**  
> *Motion Katana* and *Touchpad* are two entirely distinct input pipelines. Changes to Motion Katana physics, sensors, or UI must NEVER alter, delay, or interfere with Touchpad touch/mouse processing or game-screen collision detection.

---

## 1. System Overview & Architecture

Dojo Blade (Devil Fruits Fruit Ninja) is a real-time multiplayer local-network web game where up to 4 mobile phones (or browser tabs) act as wireless katana controllers for a shared main screen.

```
┌───────────────────────────────┐
│     Mobile Phone / Tab        │
│   (public/controller.html)    │
│   ├── Mode A: Motion Katana   │──┐
│   └── Mode B: Touchpad        │  │
└───────────────────────────────┘  │ WebSocket (LAN / IP)
                                   ▼
                       ┌─────────────────────────┐
                       │    Node.js Server       │
                       │      (server.js)        │
                       │  - Slot manager (1 to 4)│
                       │  - Packet router        │
                       │  - Instant exit beacon  │
                       │  - Heartbeat monitor    │
                       └─────────────────────────┘
                                   │
                                   │ WebSocket
                                   ▼
                       ┌─────────────────────────┐
                       │   Main Game Display     │
                       │   (public/index.html)   │
                       │  - 60/120Hz physics loop│
                       │  - Continuous collision │
                       │  - Combo system         │
                       │  - Audio & Visual fx    │
                       └─────────────────────────┘
```

---

## 2. Strict Separation: Motion Katana vs Touchpad

| Dimension | ⚔️ Motion Katana | 👆 Touchpad |
| :--- | :--- | :--- |
| **Input Source** | 3D Sensors: Accelerometer (`devicemotion`) & Gyroscope (`deviceorientation`) | Screen Capacitive Touch (`touchstart`, `touchmove`, `touchend`) & Mouse fallback |
| **User Interaction** | Swings phone physically through the air | Swipes thumb/finger directly across the screen |
| **Packet Type** | `type: 'motionSlash'` with 3D aiming vector `{from, to, speed, direction}` | `type: 'touchStart'`, `'touchMove'`, `'touchEnd'` with `{x, y, vx, vy, speed}` |
| **Desktop Processing** | `handleMotionSlash()`: full-screen blade line collision | `handleTouchMove()`: continuous segment interpolation between previous and current point |
| **Phone Visuals** | 3D Katana blade rendering, swing power gauge, direction hint | Clean touch surface, glow ripples, thumb guide |
| **Phone Audio** | **Removed / Silent**. Only phone haptic rumble feedback occurs | Silent / Main screen audio only |
| **Touchscreen Slicing** | **STRICTLY DISABLED**. Tapping or swiping the screen does NOT slice fruits | **ACTIVE**. Swiping screen slices fruits instantly |

---

## 3. Deep Dive: Touchpad Latency & Missed Slice Diagnostics

### Symptoms Identified:
1. **Delay before slice registers**: The blade lags behind the finger movement.
2. **Late fruit cuts**: The fruit is sliced after the finger has already passed it, or it hits the floor before registering.
3. **Missed cuts ("sometimes doesn't work")**: Finger slashes directly across a fruit, but nothing cuts.

### The 4 Technical Root Causes:
1. **Vertical Coordinate Distortion (The "Deadzone" Bug)**:
   - In `controller.js`, `getNormalizedCoords` was computing:
     `normY = (clientY / window.innerHeight - 0.08) / 0.78`
   - When the user's thumb is in the bottom 14% of the phone (`clientY / height > 0.86`), `normY` was clamped to `1.0`.
   - When starting an upward swipe, the coordinates stayed at `1.0` until the thumb moved past the bottom 14%. This created an artificial **14% input deadzone**, making the swipe feel delayed by 50–150 milliseconds!
2. **Aggressive Packet Throttling with Dropped Points**:
   - `THROTTLE_MS = 8` in `touchmove` was discarding events when `now - lastSocketSentTime < THROTTLE_MS`.
   - Because `lastX` and `lastY` were not updated for dropped events, high-speed swipes had huge temporal gaps, causing the desktop interpolation to miscalculate trajectories.
3. **DOM Thrashing & Thread Starvation**:
   - Spawning dynamic `.ripple` DOM elements with CSS box-shadows and filters on 35% of high-frequency `touchmove` events caused style recalculations and garbage collection pauses on mobile WebKit/Blink.
   - Calling `requestWakeLock()` on every `touchstart` initiated asynchronous OS power management promises on the main thread during gameplay.
4. **Collision Window & Network Travel Delta**:
   - Fruits move at high velocities (gravitational parabola).
   - If a swipe packet takes 15–25ms to traverse the local Wi-Fi, the fruit on the desktop screen has already moved 15–30 pixels down.
   - If `checkCollisions` only tests the fruit's instantaneous position without time-backtracking or generous blade thickness, fast-moving fruits escape the blade collision boundary.

---

## 4. Architectural Solutions & Best Practices

### Solution A: True 1:1 Direct Coordinate Mapping
- Map `touch.clientX / window.innerWidth` and `touch.clientY / window.innerHeight` directly (0.0 to 1.0) without non-linear offset shifts.
- Eliminates the 14% bottom deadzone completely so cutting responds on the first pixel of finger travel.

### Solution B: Micro-Batching & Event Optimization
- Update `lastX` and `lastY` on every input event.
- Only send WebSocket messages when coordinates actually delta, or at a guaranteed, jitter-free 100–120Hz cadence without discarding critical path inflection points.
- Ensure `requestWakeLock()` is called only once upon entering the game, never in the hot `touchstart` loop.

### Solution C: Continuous Swept-Circle Collision (Continuous Collision Detection - CCD)
- In `game.js`, test collisions against both the fruit's current position AND its previous frame position (`fruit.prevX, fruit.prevY`).
- This guarantees that even if network packets arrive in small bursts, the fruit cannot "tunnel" through the blade slice segment.

### Solution D: Complete Decoupling of Motion and Touch Pipelines
- Keep Motion Katana state machines, sensitivity thresholds, and sensor events strictly contained in `handleDeviceMotion` and `triggerMotionSlash`.
- Keep Touchpad state machines and touch listeners cleanly separated so that modifying motion code never touches or alters the touchpad code.

---

## 5. Player Lifecycle & Network Rules
- **Instant Exit Beacon**: When a player closes their mobile tab or switches apps, `navigator.sendBeacon('/api/leave')` immediately frees their slot on the server in <50ms.
- **Heartbeat Stability**: Server pings active sockets every 6s with 3 missed-ping tolerance (18s total). Any incoming message (touch or swing) resets `ws.isAlive = true`.
- **Max Capacity**: 4 players maximum (`playerSlots` 1 to 4 with unique colors: Red, Green, Blue, Yellow).

---

## 6. Touchpad Pipeline Implementation (v4.7)
- **1:1 Normalized Coordinates**: Direct `normX = clientX / window.innerWidth`, `normY = clientY / window.innerHeight`. Zero deadzones at top/bottom of screen. Exact parity between mobile touch and desktop mouse.
- **Micro-Batching & WakeLock**: Removed `requestWakeLock()` from the hot `touchstart` loop. Throttled ripple DOM element generation to 100ms intervals to eliminate layout thrashing.
- **Continuous Collision Detection (CCD)**:
  - Fruits and bombs track `prevX` and `prevY` in `updatePhysics`.
  - `checkSweptCollision()` uses 2D orientation tests (`ccw` + `segmentsIntersect`) and swept-capsule distance checks to ensure fast falling fruits cannot tunnel through swipe segments.
  - Slices register instantly even during high-velocity vertical falls.
- **End-of-Flick Guarantee**: `handleTouchEnd` processes any final delta movement between the last sent coordinate and release position to ensure quick flicks cutting through fruits register 100% of the time.
- **Strict Isolation**: Motion Katana remains completely untouched. Sensor handlers, thresholds, and gyro math are isolated in their own functions.

---

## 7. Motion Katana: 360° Omnidirectional Angle Kinematics & Physics

### The Problem: Why Slices Did Not Match Physical Hand Swing Angles
1. **Hardcoded 4-Bucket Snapping**:
   - `triggerMotionSlash` evaluated an `if / else if` ladder that forced every swing into one of only 4 hardcoded buckets:
     - Pure Vertical Down: `(aimX, 0.05) -> (aimX, 0.95)` (90°)
     - Pure Vertical Up: `(aimX, 0.95) -> (aimX, 0.05)` (270°)
     - Pure Horizontal: `(0.05, aimY) -> (0.95, aimY)` (0° or 180°)
     - Fixed Diagonal Corners: `(0.08, 0.08) -> (0.92, 0.92)` (45°)
   - Any physical swing at 15°, 30°, 60°, 75°, 120°, 150°, 200°, 315°, etc. was destroyed and clamped into a flat horizontal, vertical, or 45° line.
2. **The 60% Horizontal Dominance Trap**:
   - The condition `absH >= absV * 0.75` mapped any angle between -53° and +53° (and 127° to 233°) to a 100% flat horizontal line, capturing over 60% of all player swings regardless of intention.
3. **Discrete Endpoints vs Continuous Trigonometric Raycasting**:
   - Instead of projecting a line along the actual angle $\theta$, static screen edges were hardcoded.

### The Physics: 3D Sensor Fusion to 2D Screen Plane
1. **Phone Sensor Frame vs Screen Canvas Frame**:
   - Phone Accelerometer: $(a_x, a_y, a_z)$ in device local space.
   - Phone Gyroscope: $(\omega_\alpha, \omega_\beta, \omega_\gamma)$ angular velocities (deg/sec).
   - Phone Attitude: $\beta$ (pitch, front-back tilt), $\gamma$ (roll, left-right tilt).
   - Screen Canvas Frame: $+X$ is Right, $+Y$ is Down (top-left is 0,0).
2. **Rotation Matrix Projection into User Vertical Slicing Plane**:
   $$\text{Roll-adjusted horizontal}: a_{\text{horiz}} = a_x \cos\gamma - a_y \sin\gamma$$
   $$\text{Roll-adjusted longitudinal}: y_{\text{roll}} = a_x \sin\gamma + a_y \cos\gamma$$
   $$\text{Pitch-projected vertical}: a_{\text{vert}} = y_{\text{roll}} \sin\beta - a_z \cos\beta$$
3. **Screen Vector Conversion**:
   - $V_x = a_{\text{horiz}} + k_{\text{gyro}} \cdot \omega_{\text{yaw/roll}}$
   - $V_y = -a_{\text{vert}} + k_{\text{gyro}} \cdot (-\omega_\beta)$  *(Note: Downward chop has negative $a_{\text{vert}}$ and negative $\omega_\beta$, mapping to positive $+V_y$ down the screen)*
4. **Exact Continuous Angle Calculation**:
   $$\theta = \text{Math.atan2}(V_y, V_x) \quad (-\pi \le \theta \le \pi)$$
   $$\theta_{\text{deg}} = (\theta \times 180 / \pi + 360) \pmod{360}$$
5. **Continuous Full-Screen Blade Raycasting**:
   Given blade length $L \approx 1.25$ and aim point $(C_x, C_y)$:
   $$\text{from} = \left(C_x - \frac{L}{2}\cos\theta, \; C_y - \frac{L}{2}\sin\theta\right)$$
   $$\text{to} = \left(C_x + \frac{L}{2}\cos\theta, \; C_y + \frac{L}{2}\sin\theta\right)$$
   This generates an exact blade trajectory matching the physical swing at every degree ($0^\circ$ to $360^\circ$).

6. **Phone Speaker Audio Removal (v4.9)**:
   - Completely stripped Web Audio API synthesizer (`phoneAudioCtx` and `playPhoneKatanaSwish`) from `controller.js`.
   - The phone controller remains completely silent during arm swings; all slice audio is handled exclusively by the main game screen (`audio.playMotionKatanaSlash`), while the phone provides subtle haptic vibration.

---

## 8. Ultra-Responsive 1:1 Motion Calibration & Sensor Filtering (v5.0)

### The 3 Remaining Sources of Latency & Angle Distortion:
1. **Single-Sample Trigger Jitter**:
   - `triggerMotionSlash` was called on the very first frame where `netMag >= threshold`.
   - In real-world hand swings, this initial frame represents pre-swing wrist flexing rather than peak kinetic energy. Sampling a single 16ms frame produced noisy, inconsistent angles.
2. **Reversed Gyroscope Yaw Projection**:
   - In W3C `DeviceMotionEvent`, rotation around the phone's long vertical axis (when held upright in portrait) is `rotationRate.gamma`, while `rotationRate.alpha` is rotation around the screen normal (Z-axis).
   - Projecting yaw as `alpha * sinBeta` took the steering-wheel twist instead of horizontal arm sweep. The corrected projection is `omega_yaw = gamma * sinBeta + alpha * cosBeta`.
3. **Gravity Bleed on Android / Fallback Accelerometers**:
   - When `e.acceleration` is unavailable, `e.accelerationIncludingGravity` raw components still contain 9.8 m/s² Earth gravity.
   - Solution: Dynamic component-wise low-pass gravity filter ($g_i = 0.85 \cdot g_i + 0.15 \cdot a_i$) yields true linear acceleration $\vec{a}_{\text{linear}} = \vec{a}_{\text{raw}} - \vec{g}$.

### The Calibration Architecture:
1. **Rolling Energy-Weighted Stroke Window (4 samples, ~50ms)**:
   - Maintain a 4-sample ring buffer of $(a_x, a_y, a_z, \text{rotRate})$.
   - When a swing spike triggers, calculate the momentum vector weighted by kinetic energy across the stroke:
     $$\vec{V}_{\text{stroke}} = \frac{\sum w_i \cdot \vec{V}_i}{\sum w_i} \quad \text{where } w_i = (\text{netMag}_i)^2 + (\text{gyroSpeed}_i \times 0.05)^2$$
   - Eliminates single-frame noise without introducing pipeline delay.
2. **Continuous 1:1 Trajectory Raycasting**:
   - Continuous angle $\theta = \text{atan2}(V_y, V_x)$ with 0° snapping or bucketing.
   - Blade endpoints $(from, to)$ span edge-to-edge ($L \approx 1.35$).
3. **Reduced Cooldown & Dynamic Multi-Slash**:
   - Cooldown reduced from 260ms to 180ms for fast martial-arts double and triple combos.




