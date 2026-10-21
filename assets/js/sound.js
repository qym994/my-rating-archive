const STORAGE_KEY = 'tier00.sound';

class SoundEngine {
  constructor() {
    this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (!this.enabled) return false;
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.24;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    if (on) {
      this.ensure();
      this.tick();
    }
  }

  tone({ freq = 440, endFreq = freq, duration = 0.12, type = 'sine', gain = 0.2, delay = 0, attack = 0.006 }) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  noise({ duration = 0.15, gain = 0.12, delay = 0, lowpass = 1800, highpass = 200 }) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  tick() {
    this.noise({ duration: 0.025, gain: 0.06, lowpass: 4200, highpass: 900 });
    this.tone({ freq: 880, endFreq: 720, duration: 0.035, type: 'square', gain: 0.035 });
  }

  click() {
    this.noise({ duration: 0.045, gain: 0.2, lowpass: 2400, highpass: 300 });
    this.tone({ freq: 190, endFreq: 105, duration: 0.07, type: 'triangle', gain: 0.18 });
    this.tone({ freq: 660, endFreq: 360, duration: 0.04, type: 'square', gain: 0.035, delay: 0.005 });
  }

  whoosh() {
    this.noise({ duration: 0.42, gain: 0.09, lowpass: 1600, highpass: 160 });
    this.tone({ freq: 160, endFreq: 520, duration: 0.4, type: 'sine', gain: 0.06 });
  }

  select() {
    this.noise({ duration: 0.06, gain: 0.06, lowpass: 5000, highpass: 600 });
    this.tone({ freq: 540, endFreq: 760, duration: 0.09, type: 'sine', gain: 0.09 });
  }

  switchBoot() {
    // The tactile "click" of the Joy-Con rails.
    this.noise({ duration: 0.055, gain: 0.34, lowpass: 3200, highpass: 240 });
    this.tone({ freq: 220, endFreq: 88, duration: 0.085, type: 'triangle', gain: 0.22 });
    this.tone({ freq: 1200, endFreq: 560, duration: 0.035, type: 'square', gain: 0.05 });
    if (navigator.vibrate) navigator.vibrate(18);
  }

  bootChime() {
    this.tone({ freq: 523.25, endFreq: 523.25, duration: 0.52, type: 'sine', gain: 0.14, delay: 0.02, attack: 0.02 });
    this.tone({ freq: 783.99, endFreq: 783.99, duration: 0.7, type: 'sine', gain: 0.12, delay: 0.12, attack: 0.02 });
    this.tone({ freq: 1046.5, endFreq: 1046.5, duration: 0.85, type: 'sine', gain: 0.08, delay: 0.23, attack: 0.02 });
    this.tone({ freq: 130.81, endFreq: 130.81, duration: 0.9, type: 'triangle', gain: 0.07, delay: 0.02 });
  }

  error() {
    this.tone({ freq: 150, endFreq: 90, duration: 0.18, type: 'sawtooth', gain: 0.09 });
    this.tone({ freq: 120, endFreq: 75, duration: 0.22, type: 'triangle', gain: 0.08, delay: 0.06 });
  }

  success() {
    this.tone({ freq: 659.25, endFreq: 659.25, duration: 0.18, type: 'sine', gain: 0.1 });
    this.tone({ freq: 987.77, endFreq: 987.77, duration: 0.3, type: 'sine', gain: 0.08, delay: 0.1 });
  }
}

export const sound = new SoundEngine();
