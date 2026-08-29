class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = true;
    this.noiseBuffer = null;
    this.musicPlaying = false;
    this.musicInterval = null;
  }

  init() {
    if (this.ctx) return;
    
    // Initialize AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContextClass();
      this.noiseBuffer = this.createNoiseBuffer();
      this.muted = false;
    }
  }

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  toggleMute() {
    this.init();
    this.muted = !this.muted;
    if (this.muted) {
      this.stopMusic();
    } else {
      this.resumeContext();
      this.startMusic();
    }
    return this.muted;
  }

  playSwish() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;
    
    // Swept Oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    
    oscGain.gain.setValueAtTime(0.12, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.19);

    // Highpass noise swoosh
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      
      noise.start(now);
      noise.stop(now + 0.16);
    }
  }

  playSplat() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;

    // Crunch (Noise Bandpass Burst)
    if (this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1200, now);
      noiseFilter.Q.setValueAtTime(3.0, now);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      
      noiseSource.start(now);
      noiseSource.stop(now + 0.15);
    }

    // Impact Tone (Sine sweep)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    
    oscGain.gain.setValueAtTime(0.18, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playExplosion() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;

    // Sub Bass Boom
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(10, now + 1.5);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, now);
    filter.frequency.exponentialRampToValueAtTime(15, now + 1.4);
    
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 1.6);

    // Blast Noise
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(600, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 0.9);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      
      noise.start(now);
      noise.stop(now + 0.95);
    }
  }

  playGameOver() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;
    const notes = [293.66, 277.18, 261.63, 220.00, 196.00]; // Sad minor descending scale (D, C#, C, A, G)
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.15);
      
      gain.gain.setValueAtTime(0, now + idx * 0.15);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.4);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 0.45);
    });
  }

  playCombo() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();

    const now = this.ctx.currentTime;
    const notes = [329.63, 392.00, 523.25]; // Ascending sound (E4, G4, C5)
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      
      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.3);
    });
  }

  playSoftNote(freq, duration) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.05); // Fade in
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // Exponential decay
    
    // Add simple delay/echo effect
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.25;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.3;
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Echo connection
    gain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    feedback.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + duration + 0.5);
  }

  playBackgroundPad(freq) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.02, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 2.6);
  }

  startMusic() {
    if (this.musicPlaying || this.muted || !this.ctx) return;
    this.musicPlaying = true;
    this.resumeContext();
    
    let noteIndex = 0;
    // Beautiful pentatonic scale notes (A3, C4, D4, E4, G4, A4, C5, D5, E5, G5)
    const scale = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
    const pattern = [0, 2, 4, 3, 5, 4, 7, 5, 6, 8, 9, 7, 5, 4, 2, 1];
    
    this.musicInterval = setInterval(() => {
      if (this.muted || !this.ctx) return;
      
      // Play a base root note every 8 beats
      if (noteIndex % 8 === 0) {
        this.playBackgroundPad(110.00); // A2
      }
      
      const noteFreq = scale[pattern[noteIndex % pattern.length]];
      this.playSoftNote(noteFreq, 0.6);
      
      noteIndex++;
    }, 400);
  }

  playHighscoreFanfare() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();
    const now = this.ctx.currentTime;
    
    // Triumphant victory fanfare: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const startTime = now + i * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + (i === notes.length - 1 ? 1.2 : 0.4));
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + (i === notes.length - 1 ? 1.3 : 0.45));
    });
  }

  playFreeze() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();
    const now = this.ctx.currentTime;
    
    // Shimmering ice crystal tones (E6 -> G6 -> B6 -> E7)
    const freqs = [1318.51, 1567.98, 1975.53, 2637.02];
    freqs.forEach((freq, idx) => {
      const startTime = now + idx * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, startTime + 0.35);
      
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.55);
    });
  }

  playLightning() {
    if (this.muted || !this.ctx) return;
    this.resumeContext();
    const now = this.ctx.currentTime;
    
    // Electric Sawtooth Burst
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.32);

    // Thunder boom bass
    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = 'triangle';
    bass.frequency.setValueAtTime(140, now);
    bass.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    bassGain.gain.setValueAtTime(0.35, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    bass.connect(bassGain);
    bassGain.connect(this.ctx.destination);
    bass.start(now);
    bass.stop(now + 0.65);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}
