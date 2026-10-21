import { sound } from './sound.js';

const FX_META = {
  boot: { label: 'SYSTEM STARTUP', sub: 'NINTENDO SWITCH', accent: '#ffffff' },
  portal: { label: '召唤师峡谷', sub: 'WELCOME TO THE RIFT', accent: '#5ddcff' },
  scan: { label: 'DROP IN', sub: 'APEX LEGENDS', accent: '#ff5a2b' },
  bounty: { label: 'DEAD EYE', sub: 'RED DEAD REDEMPTION II', accent: '#d8a45f' },
  colony: { label: 'COLONY LOG', sub: 'RIMWORLD', accent: '#91d374' },
  ring: { label: '赐福之光', sub: 'ELDEN RING', accent: '#e6c36b' },
  heart: { label: 'TAKE YOUR HEART', sub: 'PERSONA 5 ROYAL', accent: '#ffdf5d' },
  clock: { label: '死亡回归', sub: 'RE:ZERO', accent: '#9ac3ff' },
  magic: { label: '圣杯战争', sub: 'FATE', accent: '#8fc7ff' },
  crt: { label: 'DIVERGENCE', sub: 'STEINS;GATE', accent: '#7dffab' },
  petals: { label: '旅行的终点', sub: 'FRIEREN', accent: '#8fe3c0' },
  brand: { label: '蚀之刻', sub: 'BERSERK', accent: '#ff5a3c' },
  strings: { label: '放课后茶会', sub: 'K-ON!', accent: '#b96c76' },
  brass: { label: '北宇治吹奏乐部', sub: 'HIBIKE! EUPHONIUM', accent: '#f3c766' },
  wings: { label: '献出心脏', sub: 'ATTACK ON TITAN', accent: '#dfe9dc' },
  glitch: { label: 'BOCCHI THE ROCK!', sub: '結束バンド', accent: '#ff3f8d' }
};

const FALLBACK = 'portal';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function petals() {
  let html = '';
  for (let i = 0; i < 26; i++) {
    html += `<span class="petal" style="left:${random(2, 98).toFixed(1)}%;--dur:${random(3.2, 6.2).toFixed(2)}s;--delay:${random(0, 2.4).toFixed(2)}s;--drift:${random(-90, 140).toFixed(0)}px;transform:rotate(${random(0, 360).toFixed(0)}deg)"></span>`;
  }
  return html;
}

function sparks() {
  let html = '';
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + random(-0.2, 0.2);
    const dist = random(100, 310);
    html += `<span class="fx__spark" style="--x:${Math.cos(angle) * dist}px;--y:${Math.sin(angle) * dist}px;animation-delay:${random(0.05, 0.5).toFixed(2)}s"></span>`;
  }
  return html;
}

function dust() {
  let html = '';
  for (let i = 0; i < 28; i++) {
    html += `<span class="fx__dust" style="left:${random(5, 95).toFixed(1)}%;top:${random(10, 90).toFixed(1)}%;animation-delay:${random(0, 1.7).toFixed(2)}s"></span>`;
  }
  return html;
}

const BRAND_SIGIL = `<svg class="fx__sigil" viewBox="0 0 120 170" fill="none" aria-hidden="true">
  <path d="M60 5v160M60 32c-17 0-29-11-29-25M60 32c17 0 29-11 29-25M60 91c-20 0-33-12-33-28M60 91c20 0 33-12 33-28" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
  <path d="M60 132c-17 0-28-8-28-19M60 132c17 0 28-8 28-19" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
</svg>`;

function shell(type, inner, extraClass = '') {
  const meta = FX_META[type] || FX_META[FALLBACK];
  return `
    <div class="fx__stage ${extraClass}">
      ${inner}
      <div class="fx__flash"></div>
      <div class="fx__corner">${esc(meta.label)}<br>${esc(meta.sub)}</div>
      <div class="fx__label"><b>${esc(meta.label)}</b><span>${esc(meta.sub)}</span></div>
      <div class="fx__skip">CLICK TO SKIP</div>
    </div>`;
}

function bodyFor(type) {
  switch (type) {
    case 'portal':
      return shell(type, `
        <div class="fx__hex"></div>
        ${sparks()}
        <div class="fx__big">WELCOME<br>TO THE RIFT<small>召唤师，欢迎回来</small></div>`);
    case 'scan':
      return shell(type, `
        <div class="fx__scanlines"></div>
        <div class="fx__ring"></div>
        <div class="fx__drop"></div>
        <div class="fx__big">DROP<br>IN<small>空投已部署 / 小队准备</small></div>`);
    case 'bounty':
      return shell(type, `
        <div class="fx__sepia"></div>
        <div class="fx__revolver"></div>
        <div class="fx__big"><small>RED DEAD REDEMPTION II</small>DEAD EYE</div>
        <div class="fx__vignette"></div>`);
    case 'colony':
      return shell(type, `
        <div class="fx__terminal">
          <div class="fx__log">
            <span>&gt; RANDOM STORYTELLER: SEED 00000</span>
            <span>&gt; 3 COLONISTS LANDED. TEMPERATURE: -12°C</span>
            <span>&gt; EVENT: PSYCHIC DRONE / 心灵低语</span>
            <span>&gt; LOADING COLONY...</span>
          </div>
        </div>
        <div class="fx__colonist"></div>
        <div class="fx__big">RIM<br>WORLD</div>`);
    case 'ring':
      return shell(type, `
        <div class="fx__golden"></div>
        ${dust()}
        <div class="fx__big">GRACE<br>GUIDES THEE<small>赐福指引着你</small></div>`);
    case 'heart':
      return shell(type, `
        <div class="fx__slash fx__slash--1"></div>
        <div class="fx__slash fx__slash--2"></div>
        <div class="fx__slash fx__slash--3"></div>
        <div class="fx__dots"></div>
        <div class="fx__big">TAKE YOUR<br>HEART<small>PERSONA 5 ROYAL / 心之怪盗团</small></div>`);
    case 'clock':
      return shell(type, `
        <div class="fx__clockface"></div>
        <div class="fx__hash">RETURN BY DEATH / 死亡回归</div>
        <div class="fx__big">RETURN<br>BY DEATH<small>这一次，一定要救下所有人</small></div>`);
    case 'magic':
      return shell(type, `
        <div class="fx__circle"></div>
        <div class="fx__sword"></div>
        <div class="fx__big">HOLY GRAIL<br>WAR<small>圣杯战争 / 开始</small></div>`);
    case 'crt':
      return shell(type, `
        <div class="fx__crt"></div>
        <div class="fx__divergence">DIVERGENCE METER<b>1.048596</b></div>
        <div class="fx__big">EL PSY<br>KONGROO<small>STEINS;GATE</small></div>`);
    case 'petals':
      return shell(type, `
        <div class="fx__halo"></div>
        ${petals()}
        <div class="fx__big">AFTER THE<br>JOURNEY<small>葬送的芙莉莲 / 旅程之后</small></div>`);
    case 'brand':
      return shell(type, `
        <div class="fx__eclipse"></div>
        <div class="fx__blood"></div>
        ${BRAND_SIGIL}
        <div class="fx__big">BERSERK<small>黄金时代 / 蚀之刻</small></div>`);
    case 'strings':
      return shell(type, `
        <div class="fx__stagebg"></div>
        <div class="fx__string"></div>
        <div class="fx__string"></div>
        <div class="fx__string"></div>
        <div class="fx__string"></div>
        <span class="fx__note" style="left:14%;top:18%">♪</span>
        <span class="fx__note" style="right:18%;top:29%;animation-delay:.6s">♫</span>
        <span class="fx__note" style="left:23%;bottom:17%;animation-delay:1.1s">♩</span>
        <div class="fx__big">放課後<br>ティータイム<small>K-ON! / 轻音少女</small></div>`);
    case 'brass':
      return shell(type, `
        <div class="fx__sun"></div>
        <div class="fx__rays"></div>
        <div class="fx__staff">♪ ♫ ♪</div>
        <div class="fx__big">北宇治高校<br>吹奏楽部<small>HIBIKE! EUPHONIUM</small></div>`);
    case 'wings':
      return shell(type, `
        <div class="fx__smoke"></div>
        <div class="fx__bolt"></div>
        <div class="fx__wings"><span></span><span></span></div>
        <div class="fx__big">献出心脏<small>SURVEY CORPS / ATTACK ON TITAN</small></div>`);
    case 'glitch':
      return shell(type, `
        <div class="fx__bars"></div>
        <div class="fx__cable"></div>
        <div class="fx__big">ぼっち・ざ・ろっく！<small>BOCCHI THE ROCK! / 结束乐队</small></div>`);
    default:
      return bodyFor(FALLBACK);
  }
}

function bootBody() {
  return `
    <div class="fx__stage">
      <div class="boot__controllers">
        <div class="joycon joycon--l"><span class="joycon__btn"></span></div>
        <div class="boot__snap"></div>
        <div class="joycon joycon--r"><span class="joycon__btn"></span></div>
      </div>
      <div class="boot__line"></div>
      <div class="boot__logo"><strong>SWITCH</strong><span>NINTENDO</span></div>
      <div class="boot__sound">咔哒 / SYSTEM STARTUP</div>
      <div class="fx__flash"></div>
      <div class="fx__skip">CLICK TO SKIP</div>
    </div>`;
}

export function playTransition(entry, { onReveal } = {}) {
  const type = entry?.transition && (FX_META[entry.transition] || entry.transition === 'boot') ? entry.transition : FALLBACK;
  const root = document.getElementById('fxRoot');
  if (!root) {
    onReveal?.();
    return Promise.resolve();
  }
  if (reduced()) {
    onReveal?.();
    return Promise.resolve();
  }

  const fx = document.createElement('div');
  const accent = FX_META[type]?.accent || entry?.accent || '#ffffff';
  fx.className = `fx fx--${type}`;
  fx.style.setProperty('--fx-accent', accent);
  if (entry?.accent) fx.style.setProperty('--entry-color', entry.accent);
  fx.innerHTML = type === 'boot' ? bootBody() : bodyFor(type);
  if (type !== 'boot' && entry?.image) {
    const image = String(entry.image).replace(/["'\\\n\r()]/g, '');
    const stage = fx.querySelector('.fx__stage');
    if (stage && image) {
      stage.insertAdjacentHTML('afterbegin', `
        <div class="fx__backdrop" style='background-image:url("${image}")'></div>
        <div class="fx__veil"></div>`);
    }
  }
  root.appendChild(fx);
  document.body.classList.add('is-locked');

  let revealed = false;
  let finished = false;
  const timers = [];

  const cleanup = () => {
    if (finished) return;
    finished = true;
    document.body.classList.remove('is-locked');
    fx.classList.add('is-out');
    setTimeout(() => fx.remove(), 520);
  };

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    fx.classList.add('is-reveal');
    if (type === 'boot') sound.bootChime();
    onReveal?.();
    timers.push(setTimeout(() => {
      fx.classList.add('is-out');
      cleanup();
    }, type === 'boot' ? 360 : 250));
  };

  const skip = () => {
    if (revealed) return;
    timers.forEach(clearTimeout);
    if (type === 'boot') {
      fx.classList.add('is-snap');
      sound.switchBoot();
      timers.push(setTimeout(reveal, 160));
    } else {
      reveal();
    }
  };
  fx.addEventListener('click', skip);

  if (type === 'boot') {
    timers.push(setTimeout(() => {
      fx.classList.add('is-snap');
      sound.switchBoot();
    }, 760));
    timers.push(setTimeout(() => {
      fx.classList.add('is-reveal');
      sound.bootChime();
    }, 1320));
    timers.push(setTimeout(() => {
      if (!revealed) {
        revealed = true;
        onReveal?.();
      }
    }, 1480));
    timers.push(setTimeout(() => {
      fx.classList.add('is-out');
      cleanup();
    }, 1880));
    timers.push(setTimeout(() => fx.remove(), 2500));
  } else {
    timers.push(setTimeout(() => sound.whoosh(), 260));
    timers.push(setTimeout(reveal, 740));
    timers.push(setTimeout(() => {
      fx.classList.add('is-out');
      cleanup();
    }, 1060));
    timers.push(setTimeout(() => fx.remove(), 1700));
  }

  return new Promise(resolve => {
    const check = setInterval(() => {
      if (finished) {
        clearInterval(check);
        resolve();
      }
    }, 60);
  });
}
