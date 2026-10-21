import { sound } from './sound.js';
import { playTransition } from './transitions.js';
import {
  clone,
  downloadJSON,
  hashText,
  loadContent,
  publishContent,
  storage,
  validateContent,
  verifyGithub
} from './store.js';

/* ------------------------------------------------------------------ *
 * state & helpers
 * ------------------------------------------------------------------ */

const state = {
  content: null,
  remoteContent: null,
  mode: ['game', 'anime'].includes(storage.getMode()) ? storage.getMode() : 'game',
  isOwner: storage.isOwnerSession(),
  isEditing: false,
  currentEntry: null,
  lastRouteKey: '',
  transitioning: false,
  dragId: null,
  justDragged: false,
  modalOpen: false,
  scrollHandler: null
};

const el = {};
const TIER_KEYS = ['hang', 'top', 'renshangren', 'npc', 'la'];
const TRANSITIONS = [
  ['boot', 'Switch 开机动画'],
  ['portal', '英雄联盟 · 海克斯传送'],
  ['scan', 'Apex · 空投扫描'],
  ['bounty', '荒野大镖客 · 死神之眼'],
  ['colony', '环世界 · 殖民日志'],
  ['ring', '艾尔登法环 · 赐福金环'],
  ['heart', '女神异闻录5 · 心之怪盗'],
  ['clock', 'Re:Zero · 死亡回归'],
  ['magic', 'Fate · 圣杯魔法阵'],
  ['crt', '命运石之门 · 世界线变动'],
  ['petals', '芙莉莲 · 花瓣与旅途'],
  ['brand', '剑风传奇 · 蚀之刻'],
  ['strings', '轻音少女 · 放课后'],
  ['brass', '京吹 · 北宇治吹奏'],
  ['wings', '进击的巨人 · 自由之翼'],
  ['glitch', '孤独摇滚 · 故障音墙']
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, '&#96;');
}

function safeURL(value) {
  return String(value ?? '').trim().replace(/["'\\\n\r()]/g, '');
}

function safePosition(value) {
  return String(value || 'center').replace(/[^a-zA-Z0-9.%\s-]/g, '');
}

function safeColor(value, fallback = '#d8ff3e') {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : fallback;
}

function hexToRgb(hex) {
  let value = safeColor(hex).slice(1);
  if (value.length === 3) value = value.split('').map(c => c + c).join('');
  const int = parseInt(value.slice(0, 6), 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

function scoreText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

function today() {
  const date = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function typeKey(type) {
  return type === 'anime' ? 'anime' : 'games';
}

function listFor(type = state.mode) {
  return state.content?.[typeKey(type)] || [];
}

function findEntry(type, id) {
  return listFor(type).find(entry => entry.id === id) || null;
}

function tierOf(entry) {
  return state.content.tiers.find(tier => tier.id === entry.tier) || state.content.tiers[0];
}

function tierOrder(tierId) {
  const index = state.content.tiers.findIndex(tier => tier.id === tierId);
  return index < 0 ? 99 : index;
}

function reviewParagraphs(review) {
  if (Array.isArray(review)) return review.map(p => String(p).trim()).filter(Boolean);
  return String(review || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(tag => String(tag).trim()).filter(Boolean);
  return String(tags || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
}

function sortedList(type = state.mode) {
  return clone(listFor(type));
}

function applyDerivedOrder(type = state.mode) {
  const key = typeKey(type);
  const entries = [...state.content[key]];
  entries.sort((a, b) => {
    const tierDiff = tierOrder(a.tier) - tierOrder(b.tier);
    return tierDiff;
  });
  state.content[key] = entries;
}

function markUpdated() {
  state.content.site.updatedAt = today();
}

function preloadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve();
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

function currentHashRoute() {
  const raw = location.hash || '#/';
  if (!raw.startsWith('#/')) return { view: 'home', anchor: raw.replace(/^#/, '') };
  const parts = raw.slice(2).split('/');
  if ((parts[0] === 'game' || parts[0] === 'anime') && parts[1]) {
    return { view: 'detail', type: parts[0], id: decodeURIComponent(parts.slice(1).join('/')) };
  }
  return { view: 'home', anchor: raw === '#/' ? '' : raw.replace(/^#\/?/, '') };
}

function routeFor(entry) {
  return `#/${entry.type}/${encodeURIComponent(entry.id)}`;
}

function toast(message, { error = false, duration = 3000 } = {}) {
  const root = el.modalRoot ? $('#toastRoot') : document.getElementById('toastRoot');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast${error ? ' is-error' : ''}`;
  node.textContent = message;
  root.appendChild(node);
  if (error) sound.error();
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 280);
  }, duration);
}

/* ------------------------------------------------------------------ *
 * loading
 * ------------------------------------------------------------------ */

function createLoader() {
  const loader = document.createElement('div');
  loader.className = 'page-loader';
  loader.innerHTML = `
    <div class="page-loader__inner">
      <div class="page-loader__mark"><i></i><i></i><i></i></div>
      <p class="page-loader__title">TIER<span>/</span>00</p>
      <p class="page-loader__sub">LOADING PRIVATE ARCHIVE</p>
      <div class="page-loader__bar"><i></i></div>
    </div>`;
  document.body.appendChild(loader);
  return loader;
}

function finishLoading(loader) {
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-ready');
  loader?.classList.add('is-out');
  setTimeout(() => loader?.remove(), 900);
  setupReveals();
}

function showFatal(message, loader) {
  document.body.classList.remove('is-loading');
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <section class="fatal">
        <p class="section-kicker">ARCHIVE OFFLINE</p>
        <h1>档案暂时打不开</h1>
        <p>${escapeHTML(message)}</p>
        <p class="fatal__hint">如果你是站主：请确认 <code>content.json</code> 存在且格式正确，并通过 HTTP / GitHub Pages 访问页面。</p>
        <button class="btn btn--primary" type="button" id="fatalRetry">重新加载</button>
      </section>`;
    $('#fatalRetry')?.addEventListener('click', () => location.reload());
  }
  if (loader) {
    loader.classList.add('is-out');
    setTimeout(() => loader.remove(), 600);
  }
}

function setupReveals() {
  const nodes = $$('.reveal');
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(node => node.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach((entry, index) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      const delay = Number(node.dataset.delay || 0) + index * 35;
      setTimeout(() => node.classList.add('is-in'), delay);
      io.unobserve(node);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  nodes.forEach(node => io.observe(node));
}

/* ------------------------------------------------------------------ *
 * mode, backgrounds and chrome
 * ------------------------------------------------------------------ */

let backdropTimer = 0;

function setBackdropLayer(mode) {
  if (!state.content) return;
  const layers = $$('.site-bg__layer');
  const index = mode === 'anime' ? 1 : 0;
  if (!layers[index]) return;
  const source = mode === 'anime'
    ? state.content.site?.heroAnime || 'assets/img/hero-anime.webp'
    : state.content.site?.heroGame || 'assets/img/hero-game.webp';
  const lqip = mode === 'anime' ? state.content.site?.heroAnimeLqip : state.content.site?.heroGameLqip;
  if (!layers[index].style.backgroundImage) {
    layers[index].style.backgroundImage = `url("${safeURL(source)}")${lqip ? `, url("${safeURL(lqip)}")` : ''}`;
  }
}

function updateBackdrop() {
  if (!state.content) return;
  setBackdropLayer(state.mode);
  // Load the inactive atmosphere image after the page has settled. It is
  // intentionally not fetched together with the initial view.
  clearTimeout(backdropTimer);
  backdropTimer = setTimeout(() => setBackdropLayer(state.mode === 'game' ? 'anime' : 'game'), 1800);
}

function updateModeChrome({ animate = false } = {}) {
  if (!state.content) return;
  document.body.dataset.mode = state.mode;
  $$('.mode-switch__btn').forEach(btn => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const list = listFor();
  const count = list.length;
  const avg = count ? list.reduce((sum, entry) => sum + Number(entry.score || 0), 0) / count : 0;
  const top = list.filter(entry => entry.tier === 'hang').length;
  if (el.statCount) el.statCount.textContent = String(count).padStart(2, '0');
  if (el.statAvg) el.statAvg.textContent = avg.toFixed(1);
  if (el.statTop) el.statTop.textContent = String(top).padStart(2, '0');
  if (el.boardModeLabel) el.boardModeLabel.textContent = state.mode === 'game' ? '/ GAMES' : '/ ANIME';
  if (el.nowId) el.nowId.textContent = state.mode === 'game' ? `GAME / ${String(count).padStart(2, '0')}` : `ANIME / ${String(count).padStart(2, '0')}`;
  if (el.nowCaption) el.nowCaption.textContent = state.mode === 'game' ? '游戏档案' : '番剧档案';
  if (el.nowTitle) el.nowTitle.textContent = state.mode === 'game' ? 'GAMES' : 'ANIME';

  if (animate && el.tierBoard) {
    el.tierBoard.animate(
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
    const now = $('.now-card');
    now?.animate(
      [{ opacity: 0.3, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
      { duration: 360, easing: 'ease-out' }
    );
  }
}

function setMode(mode, { animate = true } = {}) {
  if (!['game', 'anime'].includes(mode) || mode === state.mode) return;
  setBackdropLayer(mode);
  state.mode = mode;
  storage.setMode(mode);
  updateModeChrome({ animate });
  renderBoard();
  updateEditChrome();
  sound.select();
}

/* ------------------------------------------------------------------ *
 * board
 * ------------------------------------------------------------------ */

function cardMarkup(entry, index) {
  const tier = tierOf(entry);
  const showEdit = state.isEditing;
  const image = safeURL(entry.thumb || entry.image || '');
  const lqip = safeURL(entry.lqip || '');
  const pos = safePosition(entry.imagePosition);
  const initial = String(entry.title || '?').trim().slice(0, 1);
  return `
    <button class="entry-card" type="button" data-id="${escapeAttr(entry.id)}" draggable="${showEdit}" aria-label="查看《${escapeAttr(entry.title)}》的评价" title="${escapeAttr(entry.quote || entry.title)}">
      <span class="entry-card__media${lqip ? ' has-lqip' : ''}" data-initial="${escapeAttr(initial)}" style='--pos:${pos};${lqip ? `background-image:url("${lqip}")` : ''}'>${image ? `<img src="${image}" alt="" loading="eager" decoding="async" />` : ''}</span>
      <span class="entry-card__no"></span>
      <span class="entry-card__top">
        <span class="entry-card__rank">NO.${String(index + 1).padStart(2, '0')}</span>
        <span class="entry-card__type">${entry.type === 'game' ? 'GAME' : 'ANIME'}</span>
      </span>
      <span class="entry-card__score">${scoreText(entry.score)}<small>/10</small></span>
      <span class="entry-card__bottom">
        <span class="entry-card__meta"><span>${escapeHTML(tier.en)}</span><span>${escapeHTML(entry.year || '—')}</span></span>
        <span class="entry-card__title">${escapeHTML(entry.title)}</span>
      </span>
      <span class="entry-card__arrow" aria-hidden="true"></span>
    </button>`;
}

function renderBoard() {
  if (!state.content || !el.tierBoard) return;
  const current = state.mode;
  const list = listFor(current);
  const pieces = [];

  for (const tier of state.content.tiers) {
    const tierEntries = list.filter(entry => entry.tier === tier.id);
    const cards = tierEntries.map((entry, index) => cardMarkup(entry, index)).join('');
    const empty = tierEntries.length === 0
      ? `<div class="empty-tier">这一层暂时空着${state.isEditing ? '，把卡片拖进来，或点右侧添加。' : '。'}</div>`
      : '';
    const add = state.isEditing
      ? `<button class="entry-add" type="button" data-add-tier="${escapeAttr(tier.id)}"><strong>＋</strong>ADD</button>`
      : '';
    pieces.push(`
      <section class="tier-row" data-tier="${escapeAttr(tier.id)}" aria-label="${escapeAttr(tier.label)}层级">
        <div class="tier-row__label" data-ghost="${escapeAttr(tier.ghost || tier.label)}">
          <div class="tier-row__name">
            <span class="tier-row__char">${escapeHTML(tier.label)}</span>
            <span class="tier-row__en">${escapeHTML(tier.en)}</span>
          </div>
          <div class="tier-row__meta">
            <span>${escapeHTML(tier.desc || '')}</span>
            <span class="tier-row__count">${String(tierEntries.length).padStart(2, '0')}</span>
          </div>
        </div>
        <div class="tier-row__cards${tierEntries.length === 0 ? ' is-empty' : ''}">${cards}${empty}${add}</div>
      </section>`);
  }

  el.tierBoard.innerHTML = pieces.join('');
  const pendingImages = [];
  $$('.entry-card__media img', el.tierBoard).forEach(img => {
    const media = img.closest('.entry-card__media');
    if (!media) return;
    if (img.complete && img.naturalWidth) {
      media.classList.add('is-loaded');
      return;
    }
    img.addEventListener('load', () => media.classList.add('is-loaded'), { once: true });
    pendingImages.push({ img, media });
  });
  // On slow or throttled connections an offscreen <img> can sit un-decoded for
  // a long time. Warm the same URL with an in-memory Image and swap it in when
  // it is ready; LQIP keeps the card presentable while this happens.
  pendingImages.forEach(({ img, media }, index) => {
    setTimeout(() => {
      if (!media.isConnected || media.classList.contains('is-loaded')) return;
      const warm = new Image();
      warm.alt = '';
      warm.loading = 'eager';
      warm.decoding = 'async';
      warm.onload = () => {
        if (!media.isConnected) return;
        const current = media.querySelector('img');
        if (current && current !== warm) current.replaceWith(warm);
        media.classList.add('is-loaded');
      };
      warm.src = img.getAttribute('src');
    }, 180 + index * 55);
  });
  if (el.boardHint) {
    el.boardHint.textContent = state.isEditing
      ? '编辑模式：拖动卡片调整层级与顺序。修改只保存在本机，记得发布或导出。'
      : '当前为只读档案。内容只由站主通过管理入口修改。';
  }
}

/* ------------------------------------------------------------------ *
 * owner / edit chrome
 * ------------------------------------------------------------------ */

function updateOwnerUI() {
  if (el.ownerBadge) el.ownerBadge.hidden = !state.isOwner;
  if (el.adminNavBtn) el.adminNavBtn.textContent = state.isOwner ? '管理 · ON' : '管理';
  if (el.editToggle) el.editToggle.hidden = !state.isOwner;
  if (el.editToggleText) el.editToggleText.textContent = state.isEditing ? '完成调整' : '调整排名';
  if (el.editState) el.editState.classList.toggle('is-editing', state.isEditing);
  if (el.editStateText) el.editStateText.textContent = state.isEditing ? '编辑模式 · 本地草稿' : state.isOwner ? '站主已解锁 · 只读展示' : '只读模式';
  document.body.classList.toggle('is-editing', state.isEditing);
  if (el.addEntryBtn) el.addEntryBtn.hidden = !state.isEditing;

  if (state.currentEntry && currentHashRoute().view === 'detail') {
    const fresh = findEntry(state.currentEntry.type, state.currentEntry.id);
    if (fresh) {
      const scroll = window.scrollY;
      renderDetailPage(fresh);
      window.scrollTo(0, scroll);
    }
  }
}

function updateEditChrome() {
  updateOwnerUI();
  if (state.content) {
    const scroll = window.scrollY;
    renderBoard();
    window.scrollTo(0, scroll);
  }
}

function toggleEdit() {
  if (!state.isOwner) {
    openAdmin();
    return;
  }
  state.isEditing = !state.isEditing;
  updateEditChrome();
  if (state.isEditing) {
    toast('编辑模式已开启。拖动卡片可以调整层级，点击卡片可以改内容。');
  } else {
    toast(state.content && storage.getDraft() ? '编辑模式已关闭。本地草稿仍保存在这台设备。' : '编辑模式已关闭。');
  }
}

function lockOwner({ silent = false } = {}) {
  state.isOwner = false;
  state.isEditing = false;
  storage.setOwnerSession(false);
  if (state.remoteContent) {
    state.content = clone(state.remoteContent);
    updateSiteCopy();
    updateBackdrop();
    updateModeChrome();
    renderBoard();
  }
  updateEditChrome();
  if (!silent) toast('已退出管理模式，恢复为线上内容。');
}

function restoreRemote() {
  if (!state.remoteContent) return;
  state.content = clone(state.remoteContent);
  state.currentEntry = null;
  storage.clearDraft();
  updateSiteCopy();
  updateBackdrop();
  updateModeChrome();
  renderBoard();
  updateEditChrome();
  if (currentHashRoute().view === 'detail') {
    renderRoute({ force: true });
  }
  toast('已丢弃本地草稿，恢复为上次加载的线上内容。');
}

function commitLocal(message, { rerenderDetail = false } = {}) {
  markUpdated();
  updateSiteCopy();
  storage.saveDraft(state.content);
  renderBoard();
  updateModeChrome();
  if (rerenderDetail && state.currentEntry) {
    const fresh = findEntry(state.currentEntry.type, state.currentEntry.id);
    if (fresh) {
      const y = window.scrollY;
      state.currentEntry = fresh;
      renderDetailPage(fresh);
      window.scrollTo(0, y);
    }
  }
  if (message) toast(message);
}

/* ------------------------------------------------------------------ *
 * page rendering
 * ------------------------------------------------------------------ */

function updateSiteCopy() {
  if (!state.content) return;
  if (el.updatedAt) el.updatedAt.textContent = state.content.site?.updatedAt || '—';
  if (el.ownerBadge) el.ownerBadge.textContent = state.content.site?.owner || 'OWNER';
}

function renderDetailPage(entry) {
  const home = el.homeView;
  const detail = el.detailView;
  if (!home || !detail) return;
  const list = listFor(entry.type);
  const index = list.findIndex(item => item.id === entry.id);
  const tier = tierOf(entry);
  const accent = safeColor(entry.accent, entry.type === 'game' ? '#d8ff3e' : '#ff809b');
  const rgb = hexToRgb(accent);
  const paragraphs = reviewParagraphs(entry.review);
  const tags = normalizeTags(entry.tags);
  const score = Number(entry.score);
  const scoreSafe = Number.isFinite(score) ? score : 0;
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const fullImage = safeURL(entry.image || entry.thumb || '');
  const thumbImage = safeURL(entry.thumb || entry.image || '');
  // A tiny inline image paints instantly; then the card thumbnail and finally
  // the high-resolution background replace it as they arrive.
  const image = safeURL(entry.lqip || '') || thumbImage;
  const pos = safePosition(entry.imagePosition);
  const typeLabel = entry.type === 'game' ? 'GAME' : 'ANIME';
  const typeCn = entry.type === 'game' ? '游戏' : '番剧';
  const metaPlatform = entry.switchGame && !String(entry.platform || '').includes('Switch')
    ? `${entry.platform || ''} / Switch`.replace(/^ \/ /, '')
    : entry.platform;

  home.hidden = true;
  detail.hidden = false;
  document.body.dataset.mode = entry.type;
  $('.mode-switch__btn[data-mode="game"]')?.classList.toggle('is-active', entry.type === 'game');
  $('.mode-switch__btn[data-mode="anime"]')?.classList.toggle('is-active', entry.type === 'anime');

  detail.style.setProperty('--entry-color', accent);
  detail.style.setProperty('--entry-rgb', rgb);
  detail.innerHTML = `
    <div class="detail-bg" aria-hidden="true">
      <div class="detail-bg__img" style='background-image:url("${image}");--pos:${pos}'></div>
      <div class="detail-bg__scrim"></div>
      <div class="detail-bg__pattern"></div>
      <div class="detail-bg__edge"></div>
    </div>
    <div class="detail-page">
      <div class="detail-top">
        <a class="back-link" href="#/" data-back>
          <span class="back-link__arrow" aria-hidden="true"></span>
          BACK TO INDEX
        </a>
        <div class="detail-top__meta">
          <span>${typeCn}档案 / ${typeLabel}</span>
          <span>ENTRY <b>${String(index + 1).padStart(2, '0')}</b> / ${String(list.length).padStart(2, '0')}</span>
          <span>${escapeHTML(state.content.site?.updatedAt || '—')}</span>
        </div>
      </div>

      <div class="detail-grid">
        <article class="detail-main">
          <p class="detail-kicker">${escapeHTML(typeLabel)} / ${escapeHTML(tier.en)} · PERSONAL NOTES</p>
          <h1 class="detail-title">${escapeHTML(entry.title)}</h1>
          <p class="detail-latin">${escapeHTML(entry.latin || '')}</p>

          <dl class="detail-facts">
            <div class="detail-fact"><dt>YEAR</dt><dd>${escapeHTML(entry.year || '—')}</dd></div>
            <div class="detail-fact"><dt>CREATOR</dt><dd>${escapeHTML(entry.creator || '—')}</dd></div>
            <div class="detail-fact"><dt>PLATFORM</dt><dd>${escapeHTML(metaPlatform || '—')}</dd></div>
            <div class="detail-fact"><dt>GENRE</dt><dd>${escapeHTML(entry.genre || '—')}</dd></div>
          </dl>

          ${entry.quote ? `<blockquote class="detail-quote">${escapeHTML(entry.quote)}</blockquote>` : ''}

          <section class="detail-body">
            <p class="detail-body__label">WHY IT LIVES HERE / 私人短评</p>
            ${paragraphs.length
              ? paragraphs.map(paragraph => `<p>${escapeHTML(paragraph)}</p>`).join('')
              : '<p>还没有写短评。点开管理入口，补上几句。</p>'}
          </section>

          ${entry.memory ? `
          <section class="detail-memory">
            <p class="detail-memory__label">MEMORY LOG / 记忆点</p>
            <p>${escapeHTML(entry.memory)}</p>
          </section>` : ''}

          ${tags.length ? `<div class="detail-tags">${tags.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join('')}</div>` : ''}
        </article>

        <aside class="detail-aside">
          <div class="score-card">
            <div class="score-card__top">
              <span>PERSONAL SCORE</span>
              <span class="score-card__tier">${escapeHTML(tier.label)}</span>
            </div>
            <div class="score-card__number">${scoreText(entry.score)}<small>/ 10</small></div>
            <div class="score-card__scale" aria-hidden="true">
              ${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(scoreSafe) ? 'is-on' : ''}"></i>`).join('')}
            </div>
            <p class="score-card__note">私人评分，不是媒体均分。分数与层级会随着重看、重玩而改变。</p>
            <div class="score-card__line"></div>
            <div class="score-card__row"><span>类型 / TYPE</span><span>${typeLabel}</span></div>
            <div class="score-card__row"><span>层级 / TIER</span><span>${escapeHTML(tier.label)} · ${escapeHTML(tier.en)}</span></div>
            <div class="score-card__row"><span>条目 / ENTRY</span><span>${String(index + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}</span></div>
            <div class="score-card__row"><span>记录 / UPDATED</span><span>${escapeHTML(state.content.site?.updatedAt || '—')}</span></div>
            ${state.isOwner ? `<button class="btn btn--ghost btn--small score-card__edit" type="button" data-edit-entry>编辑这篇内容</button>` : ''}
          </div>
          <div class="detail-aside__hint"><span>SELF-INDULGENT<br>BUT HONEST</span><span>NO SPOILERS<br>PROMISED</span></div>
        </aside>
      </div>

      <nav class="detail-nav" aria-label="上一篇与下一篇">
        ${prev ? `<button class="detail-nav__item" type="button" data-open-entry="${escapeAttr(prev.id)}"><span>PREVIOUS / ${prev.type === 'game' ? '游戏' : '番剧'}</span><strong>${escapeHTML(prev.title)}</strong></button>` : '<span></span>'}
        ${next ? `<button class="detail-nav__item" type="button" data-open-entry="${escapeAttr(next.id)}"><span>NEXT / ${next.type === 'game' ? '游戏' : '番剧'}</span><strong>${escapeHTML(next.title)}</strong></button>` : '<span></span>'}
      </nav>

      <footer class="detail-footer">
        <p>本页内容由站主手动维护 · 图片版权归原作者与发行商所有</p>
        <button type="button" data-scroll-top>BACK TO TOP ↑</button>
      </footer>
    </div>`;
  document.title = `${entry.title} · 从夯到拉`;
  state.currentEntry = entry;

  const swapDetailImage = source => {
    if (!source) return;
    const loader = new Image();
    loader.onload = () => {
      if (state.currentEntry?.id !== entry.id) return;
      const target = $('.detail-bg__img', detail);
      if (target) target.style.backgroundImage = `url("${source}")`;
    };
    loader.src = source;
  };
  if (fullImage && fullImage !== image) swapDetailImage(fullImage);
}

function renderHomeRoute({ anchor = '', scroll = true } = {}) {
  if (!el.homeView || !el.detailView) return;
  el.detailView.hidden = true;
  el.detailView.innerHTML = '';
  el.homeView.hidden = false;
  state.currentEntry = null;
  document.body.dataset.mode = state.mode;
  document.title = '从夯到拉 · 私人评级档案';
  updateModeChrome();
  renderBoard();
  updateOwnerUI();
  if (scroll) {
    if (anchor === 'board') {
      setTimeout(() => el.boardSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }
}

function renderRoute({ force = false } = {}) {
  if (!state.content) return;
  const route = currentHashRoute();
  const key = route.view === 'detail' ? `${route.type}/${route.id}` : `home/${route.anchor}`;
  if (!force && key === state.lastRouteKey) return;
  state.lastRouteKey = key;

  if (route.view === 'detail') {
    const entry = findEntry(route.type, route.id);
    if (!entry) {
      toast('没有找到这条档案。', { error: true });
      location.replace('#/');
      return;
    }
    state.mode = entry.type;
    storage.setMode(entry.type);
    updateModeChrome();
    renderDetailPage(entry);
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }
  renderHomeRoute({ anchor: route.anchor, scroll: true });
}

async function navigateTo(entry) {
  if (!entry || state.transitioning) return;
  const target = routeFor(entry);
  if (location.hash === target) return;
  preloadImage(entry.image || entry.thumb);
  if (!entry.transition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    location.hash = target;
    return;
  }
  state.transitioning = true;
  try {
    await playTransition(entry, {
      onReveal: () => {
        if (location.hash !== target) location.hash = target;
      }
    });
  } finally {
    state.transitioning = false;
  }
}

/* ------------------------------------------------------------------ *
 * modals
 * ------------------------------------------------------------------ */

function closeModal() {
  const root = el.modalRoot;
  if (!root) return;
  const modals = $$('.modal', root);
  const open = modals[modals.length - 1];
  if (!open) return;
  open.classList.add('is-closing');
  setTimeout(() => {
    open.remove();
    state.modalOpen = false;
    if (!document.querySelector('.modal')) document.body.classList.remove('is-locked');
  }, 180);
}

function openModal({ kicker = 'TIER/00', title, body, footer = '', wide = false, onMount, className = '' }) {
  const root = el.modalRoot;
  if (!root) return null;
  const existing = $('.modal', root);
  if (existing) existing.remove();
  root.innerHTML = `
    <div class="modal" role="presentation">
      <section class="modal__panel${wide ? ' modal__panel--wide' : ''} ${className}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header class="modal__head">
          <div>
            <p class="modal__kicker">${escapeHTML(kicker)}</p>
            <h2 class="modal__title" id="modalTitle">${escapeHTML(title)}</h2>
          </div>
          <button class="modal__close" type="button" data-close aria-label="关闭">×</button>
        </header>
        <div class="modal__body">${body}</div>
        ${footer ? `<footer class="modal__foot">${footer}</footer>` : ''}
      </section>
    </div>`;
  const modal = $('.modal', root);
  state.modalOpen = true;
  document.body.classList.add('is-locked');

  const panel = $('.modal__panel', modal);
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-close]')) closeModal();
  });
  onMount?.(panel, modal);
  setTimeout(() => {
    const focusTarget = $('input:not([type="hidden"]), textarea, select, button:not([data-close])', panel);
    focusTarget?.focus({ preventScroll: true });
  }, 80);
  return panel;
}

function openAbout() {
  openModal({
    kicker: 'ABOUT THIS ARCHIVE',
    title: '关于这份私人档案',
    wide: true,
    body: `
      <div class="about-grid">
        <div class="about-block">
          <h3>WHAT / 这是什么</h3>
          <p>一个只记录自己真实体验的游戏与番剧评级页。主页从「夯」排到「拉」，游戏和番剧分开；点进每一张卡片，会有一篇带专属转场的私人短评。</p>
          <p>这里没有媒体评分、没有客观真理，也没有“你应该喜欢什么”。分数只代表某一段时间里的我。</p>
        </div>
        <div class="about-block">
          <h3>TIER / 层级含义</h3>
          <ul class="about-list">
            ${state.content.tiers.map(tier => `<li><span>${escapeHTML(tier.label)} · ${escapeHTML(tier.en)}</span><span>${escapeHTML(tier.desc)}</span></li>`).join('')}
          </ul>
        </div>
        <div class="about-block">
          <h3>OWNER / 内容权限</h3>
          <p>页面是纯静态站，访客只能阅读。站主打开「管理」后可解锁本机编辑；真正发布到线上需要 GitHub Token，或导出 <code>content.json</code> 替换到仓库。</p>
          <p>管理密码只保存在当前浏览器，用于防误触，不是服务器鉴权。</p>
        </div>
        <div class="about-block">
          <h3>CREDITS / 图像与版权</h3>
          <p>页面中的游戏、动画图像版权归原作者、制作公司与发行商所有，仅作个人收藏与非商业展示。若你是权利人并希望移除某张图片，请联系站主。</p>
          <p>切换动画与音效为网页重新设计的致敬演出，不包含官方视频或音频素材。</p>
        </div>
        <div class="about-block">
          <h3>BUILT WITH / 技术</h3>
          <p>原生 HTML / CSS / JavaScript，无框架、无追踪、无后端。部署在 GitHub Pages；内容数据存于 <code>content.json</code>。</p>
          <p>键盘：<code>G</code> / <code>A</code> 切换游戏与番剧，<code>Esc</code> 关闭弹窗，详情页可用 <code>←</code> / <code>→</code> 切换条目。</p>
        </div>
        <div class="about-block">
          <h3>NOTE / 最后</h3>
          <p>排名随时会变。今天放在「夯」的东西，明天也可能被移到「NPC」。这不是背叛，只是又活了一段时间。</p>
        </div>
      </div>`,
    footer: '<button class="btn btn--primary" type="button" data-close>知道了</button>'
  });
}

/* ------------------------------------------------------------------ *
 * admin
 * ------------------------------------------------------------------ */

function openAdmin() {
  if (!state.isOwner) {
    if (!storage.getPassHash()) openAdminSetup();
    else openAdminLock();
    return;
  }
  openAdminHome();
}

function openAdminSetup() {
  openModal({
    kicker: 'OWNER SETUP',
    title: '设置本机管理密码',
    body: `
      <div class="modal__note">首次使用请设置一个管理密码。它只保存在当前浏览器的 localStorage 中，用于防止误触与访客随手修改界面，<strong>不是服务器密码</strong>。</div>
      <form id="setupForm" class="field-grid" style="margin-top:18px" autocomplete="off">
        <div class="field field--full">
          <label for="setupPass">管理密码 <b>*</b></label>
          <input id="setupPass" name="pass" type="password" minlength="4" maxlength="72" required placeholder="至少 4 位，请自己记住" />
        </div>
        <div class="field field--full">
          <label for="setupPass2">再输入一次 <b>*</b></label>
          <input id="setupPass2" name="pass2" type="password" minlength="4" maxlength="72" required placeholder="确认密码" />
        </div>
        <p class="field__hint field--full">如果忘记密码：清除本站 localStorage 后重新设置。线上内容不会受影响。</p>
      </form>`,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>取消</button>
      <button class="btn btn--primary" type="submit" form="setupForm">设置并解锁</button>`,
    onMount(panel) {
      $('#setupForm', panel).addEventListener('submit', async event => {
        event.preventDefault();
        const pass = $('#setupPass', panel).value;
        const pass2 = $('#setupPass2', panel).value;
        if (pass.length < 4) return toast('密码至少 4 位。', { error: true });
        if (pass !== pass2) return toast('两次输入的密码不一致。', { error: true });
        const hash = await hashText(pass);
        storage.setPassHash(hash);
        state.isOwner = true;
        storage.setOwnerSession(true);
        const draft = storage.getDraft();
        if (draft?.content) {
          try {
            validateContent(draft.content);
            state.content = clone(draft.content);
            updateSiteCopy();
            updateBackdrop();
            renderBoard();
            toast('已恢复这台设备上的本地草稿。');
          } catch {
            storage.clearDraft();
          }
        }
        closeModal();
        updateOwnerUI();
        updateModeChrome();
        sound.success();
        setTimeout(openAdminHome, 220);
      });
    }
  });
}

function openAdminLock() {
  openModal({
    kicker: 'OWNER LOCK',
    title: '解锁管理模式',
    body: `
      <div class="admin-state">
        <span class="admin-state__dot"></span>
        <span class="admin-state__text"><strong>内容当前为只读</strong><span>只有站主需要解锁；访客不需要密码。</span></span>
      </div>
      <form id="lockForm" class="field-grid" autocomplete="off">
        <div class="field field--full">
          <label for="lockPass">管理密码</label>
          <input id="lockPass" name="pass" type="password" required placeholder="输入本机管理密码" />
        </div>
        <p class="field__hint field--full">密码只用于本机界面。发布线上内容仍需 GitHub Token 或手动替换 content.json。</p>
      </form>`,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>取消</button>
      <button class="btn btn--primary" type="submit" form="lockForm">解锁</button>`,
    onMount(panel) {
      const form = $('#lockForm', panel);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const pass = $('#lockPass', panel).value;
        const hash = await hashText(pass);
        if (hash !== storage.getPassHash()) {
          toast('密码不正确。', { error: true });
          $('#lockPass', panel).select();
          return;
        }
        state.isOwner = true;
        storage.setOwnerSession(true);
        const draft = storage.getDraft();
        if (draft?.content) {
          try {
            validateContent(draft.content);
            state.content = clone(draft.content);
            updateSiteCopy();
            updateBackdrop();
            updateModeChrome();
            renderBoard();
            toast('已解锁，并恢复本地草稿。');
          } catch {
            toast('发现了损坏的本地草稿，已忽略。', { error: true });
            storage.clearDraft();
          }
        } else {
          toast('已解锁管理模式。');
        }
        closeModal();
        updateOwnerUI();
        sound.success();
        setTimeout(openAdminHome, 220);
      });
    }
  });
}

function openAdminHome() {
  const draft = storage.getDraft();
  openModal({
    kicker: 'OWNER CONSOLE',
    title: '管理模式',
    wide: true,
    body: `
      <div class="admin-state is-owner">
        <span class="admin-state__dot"></span>
        <span class="admin-state__text"><strong>站主已解锁</strong><span>本机编辑已启用。修改先保存在本地草稿，不会自动影响线上访客。</span></span>
        <span class="owner-badge">OWNER</span>
      </div>
      <div class="about-grid">
        <div class="about-block">
          <h3>EDIT / 编辑内容</h3>
          <p>进入编辑模式后，拖动主页卡片调整层级与顺序；点击卡片编辑标题、分数、短评和图片。所有字段都只由你维护。</p>
          <div class="admin-actions">
            <button class="btn btn--primary" type="button" id="adminEditBtn">${state.isEditing ? '关闭编辑模式' : '进入编辑模式'}</button>
            <button class="btn btn--ghost" type="button" id="adminExportBtn">导出 content.json</button>
            <button class="btn btn--ghost" type="button" id="adminImportBtn">导入 JSON</button>
            <input type="file" id="adminImportFile" accept="application/json,.json" hidden />
          </div>
        </div>
        <div class="about-block">
          <h3>PUBLISH / 发布</h3>
          <p>使用 GitHub Contents API 把当前内容直接提交到仓库，只有持有 Token 的你可以发布。适合在部署后的页面上直接改排名。</p>
          <div class="admin-actions">
            <button class="btn btn--primary" type="button" id="adminPublishBtn">GitHub 发布设置</button>
            <button class="btn btn--ghost" type="button" id="adminResetBtn">丢弃本地草稿</button>
          </div>
          <p class="field__hint" style="margin-top:8px">${draft ? `本地草稿保存于 ${new Date(draft.savedAt).toLocaleString('zh-CN')}` : '当前没有本地草稿。'}</p>
        </div>
      </div>
      <div class="modal__note" style="margin-top:20px">真正的内容权限由 GitHub 仓库控制：访客能看到页面，但没有仓库写权限，无法修改线上内容。本机管理密码只是一道防误触的 UI 锁。</div>
      <div class="admin-help">
        <p>无需 Token 的替代方案：导出 <code>content.json</code>，在 GitHub 网页中替换仓库根目录的同名文件，提交后等待 Pages 重新构建。</p>
        <p>Token 建议使用 Fine-grained token，仅授予该仓库的 <code>Contents: Read and write</code> 权限。Token 只保存在当前标签页的 sessionStorage 中，关闭标签页即失效。</p>
      </div>`,
    footer: `
      <button class="btn btn--danger is-left" type="button" id="adminLockBtn">退出管理</button>
      <button class="btn btn--ghost" type="button" id="adminPassBtn">修改密码</button>
      <button class="btn btn--primary" type="button" data-close>完成</button>`,
    onMount(panel) {
      $('#adminEditBtn', panel).addEventListener('click', () => {
        state.isEditing = !state.isEditing;
        updateEditChrome();
        closeModal();
        if (state.isEditing) toast('编辑模式已开启。拖动卡片调整排名，点击卡片编辑内容。');
      });
      $('#adminExportBtn', panel).addEventListener('click', () => {
        downloadJSON(state.content);
        toast('content.json 已导出。');
      });
      const fileInput = $('#adminImportFile', panel);
      $('#adminImportBtn', panel).addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          validateContent(data);
          state.content = data;
          markUpdated();
          storage.saveDraft(state.content);
          updateSiteCopy();
          updateBackdrop();
          updateModeChrome();
          renderBoard();
          closeModal();
          if (currentHashRoute().view === 'detail') renderRoute({ force: true });
          toast('已导入并写入本地草稿。');
        } catch (error) {
          toast(`导入失败：${error.message}`, { error: true });
        }
      });
      $('#adminPublishBtn', panel).addEventListener('click', () => openGithub());
      $('#adminResetBtn', panel).addEventListener('click', async () => {
        if (await confirmDialog('丢弃本地草稿并恢复为上次加载的线上内容？此操作不会删除 GitHub 上的文件。')) {
          restoreRemote();
          closeModal();
        }
      });
      $('#adminPassBtn', panel).addEventListener('click', () => openChangePassword());
      $('#adminLockBtn', panel).addEventListener('click', () => {
        lockOwner();
        closeModal();
      });
    }
  });
}

function openChangePassword() {
  openModal({
    kicker: 'OWNER SECURITY',
    title: '修改本机管理密码',
    body: `
      <form id="changePassForm" class="field-grid" autocomplete="off">
        <div class="field field--full">
          <label for="newPass">新密码</label>
          <input id="newPass" name="pass" type="password" minlength="4" maxlength="72" required placeholder="至少 4 位" />
        </div>
        <div class="field field--full">
          <label for="newPass2">再输入一次</label>
          <input id="newPass2" name="pass2" type="password" minlength="4" maxlength="72" required placeholder="确认新密码" />
        </div>
        <p class="field__hint field--full">修改后，已解锁的当前标签页仍然有效；其他标签页需要重新解锁。</p>
      </form>`,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>取消</button>
      <button class="btn btn--primary" type="submit" form="changePassForm">保存新密码</button>`,
    onMount(panel) {
      $('#changePassForm', panel).addEventListener('submit', async event => {
        event.preventDefault();
        const pass = $('#newPass', panel).value;
        const pass2 = $('#newPass2', panel).value;
        if (pass.length < 4) return toast('密码至少 4 位。', { error: true });
        if (pass !== pass2) return toast('两次输入的密码不一致。', { error: true });
        storage.setPassHash(await hashText(pass));
        sound.success();
        closeModal();
        toast('管理密码已更新。');
      });
    }
  });
}

function openGithub() {
  const config = storage.getGithubConfig();
  openModal({
    kicker: 'PUBLISH TO GITHUB',
    title: '发布到 GitHub Pages',
    wide: true,
    body: `
      <div class="modal__note">当前内容会通过 GitHub Contents API 直接提交到仓库的 <code>content.json</code>。需要 Fine-grained token 的 <code>Contents: Read and write</code> 权限。Token 不会写入页面或仓库，只保留在当前标签页。</div>
      <form id="githubForm" class="field-grid" style="margin-top:18px" autocomplete="off">
        <div class="field">
          <label for="ghOwner">GitHub 用户名 / Owner</label>
          <input id="ghOwner" name="owner" value="${escapeAttr(config.owner)}" placeholder="your-name" required />
        </div>
        <div class="field">
          <label for="ghRepo">仓库名 / Repository</label>
          <input id="ghRepo" name="repo" value="${escapeAttr(config.repo)}" placeholder="my-rating-archive" required />
        </div>
        <div class="field">
          <label for="ghBranch">分支 / Branch</label>
          <input id="ghBranch" name="branch" value="${escapeAttr(config.branch)}" placeholder="main" required />
        </div>
        <div class="field">
          <label for="ghPath">文件路径 / Path</label>
          <input id="ghPath" name="path" value="${escapeAttr(config.path)}" placeholder="content.json" required />
        </div>
        <div class="field field--full">
          <label for="ghToken">Fine-grained Personal Access Token <b>*</b></label>
          <input id="ghToken" name="token" type="password" value="${escapeAttr(config.token)}" placeholder="github_pat_..." autocomplete="off" required />
          <p class="field__hint">只存 sessionStorage。关闭浏览器标签页后需要重新输入。切勿把 Token 写进仓库文件。</p>
        </div>
      </form>
      <div class="settings-status" id="ghStatus"></div>`,
    footer: `
      <button class="btn btn--ghost" type="button" id="ghTestBtn">测试连接</button>
      <button class="btn btn--ghost" type="button" data-close>取消</button>
      <button class="btn btn--primary" type="button" id="ghPublishBtn">提交并发布</button>`,
    onMount(panel) {
      const status = $('#ghStatus', panel);
      const readConfig = () => ({
        owner: $('#ghOwner', panel).value.trim(),
        repo: $('#ghRepo', panel).value.trim(),
        branch: $('#ghBranch', panel).value.trim() || 'main',
        path: $('#ghPath', panel).value.trim() || 'content.json',
        token: $('#ghToken', panel).value.trim()
      });
      const setStatus = (text, kind = '') => {
        status.textContent = text;
        status.className = `settings-status${kind ? ` is-${kind}` : ''}`;
      };
      const save = () => {
        const config = readConfig();
        storage.saveGithubConfig(config);
        return config;
      };
      $('#ghTestBtn', panel).addEventListener('click', async () => {
        const config = save();
        setStatus('正在连接 GitHub…');
        try {
          const info = await verifyGithub(config);
          setStatus(`连接成功：${info.repo}${info.private ? '（私有仓库）' : ''} · 分支 ${config.branch} · ${info.fileExists ? 'content.json 已存在，可直接提交' : 'content.json 尚不存在，将新建'}`, 'ok');
          sound.success();
        } catch (error) {
          setStatus(`连接失败：${error.message}`, 'error');
        }
      });
      $('#ghPublishBtn', panel).addEventListener('click', async () => {
        if (!state.isOwner) return toast('请先解锁管理。', { error: true });
        const config = save();
        if (!config.token) return setStatus('请填写 Token。', 'error');
        setStatus('正在提交内容…');
        const button = $('#ghPublishBtn', panel);
        button.disabled = true;
        try {
          markUpdated();
          updateSiteCopy();
          const result = await publishContent(state.content, config);
          state.remoteContent = clone(state.content);
          storage.clearDraft();
          storage.saveDraft(state.content);
          updateModeChrome();
          renderBoard();
          setStatus(`已提交。GitHub Pages 通常需要 1–2 分钟重新构建。${result.commitUrl ? ` 查看提交：${result.commitUrl}` : ''}`, 'ok');
          if (result.commitUrl) {
            const link = document.createElement('a');
            link.href = result.commitUrl;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = ' 打开提交记录 ↗';
            status.appendChild(link);
          }
          sound.success();
          toast('内容已提交到 GitHub，等待 Pages 构建。', { duration: 4500 });
        } catch (error) {
          setStatus(`发布失败：${error.message}`, 'error');
          toast(`发布失败：${error.message}`, { error: true });
        } finally {
          button.disabled = false;
        }
      });
    }
  });
}

function confirmDialog(message) {
  return new Promise(resolve => {
    const root = el.modalRoot;
    if (!root) return resolve(false);
    const overlay = document.createElement('div');
    overlay.className = 'modal modal--confirm';
    overlay.innerHTML = `
      <section class="modal__panel" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
        <header class="modal__head">
          <div><p class="modal__kicker">PLEASE CONFIRM</p><h2 class="modal__title" id="confirmTitle">确认操作</h2></div>
        </header>
        <div class="modal__body"><p style="color:var(--ink-dim);font-size:12px;line-height:1.9">${escapeHTML(message)}</p></div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" data-confirm-no>取消</button>
          <button class="btn btn--danger" type="button" data-confirm-yes>确认</button>
        </footer>
      </section>`;
    root.appendChild(overlay);
    document.body.classList.add('is-locked');
    const finish = answer => {
      overlay.remove();
      if (!document.querySelector('.modal')) document.body.classList.remove('is-locked');
      resolve(answer);
    };
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-confirm-no]')) finish(false);
      if (event.target.closest('[data-confirm-yes]')) finish(true);
    });
    setTimeout(() => $('[data-confirm-yes]', overlay)?.focus(), 50);
  });
}

/* ------------------------------------------------------------------ *
 * entry editor
 * ------------------------------------------------------------------ */

function newEntry(tierId = 'la') {
  const isGame = state.mode === 'game';
  return {
    id: `entry-${Date.now().toString(36)}`,
    type: state.mode,
    title: '',
    latin: '',
    year: String(new Date().getFullYear()),
    creator: '',
    platform: '',
    genre: '',
    score: 5.0,
    tier: tierId,
    quote: '',
    review: [],
    memory: '',
    tags: [],
    image: isGame ? state.content.site?.heroGame || '' : state.content.site?.heroAnime || '',
    thumb: '',
    accent: isGame ? '#d8ff3e' : '#ff809b',
    imagePosition: 'center',
    transition: isGame ? 'portal' : 'petals',
    switchGame: false
  };
}

function openEntryEditor(id = null, tierId = null) {
  if (!state.isOwner) return openAdmin();
  const isNew = !id;
  const original = isNew ? newEntry(tierId || 'la') : findEntry(state.mode, id);
  if (!original) return toast('没有找到这条内容。', { error: true });
  const entry = clone(original);
  const type = entry.type;
  const key = typeKey(type);
  const list = state.content[key];
  const preview = safeURL(entry.image || entry.thumb || '');
  const transitionOptions = TRANSITIONS.map(([value, label]) => `<option value="${value}"${entry.transition === value ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('');

  openModal({
    kicker: isNew ? 'NEW ENTRY' : 'EDIT ENTRY',
    title: isNew ? '添加一部作品' : `编辑 · ${entry.title}`,
    wide: true,
    body: `
      <form id="entryForm" class="field-grid" autocomplete="off">
        <div class="form-section">01 / BASIC INFO</div>
        <div class="field field--full">
          <label for="entryTitle">标题 <b>*</b></label>
          <input id="entryTitle" name="title" value="${escapeAttr(entry.title)}" required placeholder="例如：塞尔达传说 旷野之息" />
        </div>
        <div class="field">
          <label for="entryId">条目 ID <b>*</b></label>
          <input id="entryId" name="id" value="${escapeAttr(entry.id)}" required pattern="[a-z0-9-]+" placeholder="英文小写、数字、连字符" ${isNew ? '' : 'readonly'} />
          <p class="field__hint">用于详情页链接，创建后建议不要改。</p>
        </div>
        <div class="field">
          <label for="entryYear">年份</label>
          <input id="entryYear" name="year" value="${escapeAttr(entry.year)}" placeholder="2024" />
        </div>
        <div class="field field--full">
          <label for="entryLatin">外文原名 / 副标题</label>
          <input id="entryLatin" name="latin" value="${escapeAttr(entry.latin)}" placeholder="THE LEGEND OF ZELDA: BREATH OF THE WILD" />
        </div>
        <div class="field">
          <label for="entryCreator">作者 / 制作组</label>
          <input id="entryCreator" name="creator" value="${escapeAttr(entry.creator)}" placeholder="Nintendo EPD / ufotable" />
        </div>
        <div class="field">
          <label for="entryPlatform">平台 / 媒介</label>
          <input id="entryPlatform" name="platform" value="${escapeAttr(entry.platform)}" placeholder="Nintendo Switch / TV 动画" />
        </div>
        <div class="field">
          <label for="entryGenre">类型</label>
          <input id="entryGenre" name="genre" value="${escapeAttr(entry.genre)}" placeholder="开放世界 / 动作冒险" />
        </div>
        <div class="field">
          <label for="entryTier">层级</label>
          <select id="entryTier" name="tier">${state.content.tiers.map(tier => `<option value="${escapeAttr(tier.id)}"${entry.tier === tier.id ? ' selected' : ''}>${escapeHTML(tier.label)} · ${escapeHTML(tier.en)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="entryScore">分数 / 10</label>
          <input id="entryScore" name="score" type="number" min="0" max="10" step="0.1" value="${escapeAttr(entry.score)}" />
        </div>
        <div class="field">
          <label for="entryAccent">强调色</label>
          <input id="entryAccent" name="accent" type="color" value="${safeColor(entry.accent, type === 'game' ? '#d8ff3e' : '#ff809b')}" />
        </div>

        <div class="form-section">02 / REVIEW</div>
        <div class="field field--full">
          <label for="entryQuote">一句话评价 / 引言</label>
          <input id="entryQuote" name="quote" value="${escapeAttr(entry.quote)}" placeholder="写在详情页最上方的一句话" />
        </div>
        <div class="field field--full">
          <label for="entryReview">私人短评</label>
          <textarea id="entryReview" name="review" rows="7" placeholder="用空行分隔段落。">${escapeHTML(reviewParagraphs(entry.review).join('\n\n'))}</textarea>
          <p class="field__hint">不要怕写得太私人。这个页面只给你自己看。</p>
        </div>
        <div class="field field--full">
          <label for="entryMemory">记忆点 / 名场面</label>
          <textarea id="entryMemory" name="memory" rows="3" placeholder="一个具体的瞬间、一句台词、一次失败。">${escapeHTML(entry.memory || '')}</textarea>
        </div>
        <div class="field field--full">
          <label for="entryTags">标签</label>
          <input id="entryTags" name="tags" value="${escapeAttr(normalizeTags(entry.tags).join(', '))}" placeholder="用逗号分隔：开放世界, 神作, 孤独感" />
        </div>

        <div class="form-section">03 / IMAGE & TRANSITION</div>
        <div class="field field--full">
          <label for="entryImage">背景图地址</label>
          <input id="entryImage" name="image" value="${escapeAttr(entry.image)}" placeholder="assets/img/xxx.webp 或 https://..." />
          <p class="field__hint">推荐把图片放进 assets/img/ 后填写相对路径。外链需允许跨站引用。</p>
        </div>
        <div class="field">
          <label for="entryThumb">卡片缩略图（可选）</label>
          <input id="entryThumb" name="thumb" value="${escapeAttr(entry.thumb)}" placeholder="不填则使用背景图" />
        </div>
        <div class="field">
          <label for="entryPos">背景裁切位置</label>
          <input id="entryPos" name="imagePosition" value="${escapeAttr(entry.imagePosition || 'center')}" placeholder="center 35%" />
        </div>
        <div class="field field--full">
          <label for="entryTransition">切换动画</label>
          <select id="entryTransition" name="transition">${transitionOptions}</select>
          <div class="field-row" style="margin-top:7px">
            <input id="entrySwitch" name="switchGame" type="checkbox"${entry.switchGame ? ' checked' : ''} />
            <label for="entrySwitch">这是 Switch 游戏（自动使用开机动画）</label>
          </div>
        </div>
        <div class="field field--full">
          <label>图片预览</label>
          <div class="editor-preview" id="entryPreview" style='${preview ? `background-image:url("${preview}")` : ''}'></div>
        </div>
      </form>`,
    footer: `
      ${isNew ? '' : '<button class="btn btn--danger is-left" type="button" id="entryDeleteBtn">删除条目</button>'}
      <button class="btn btn--ghost" type="button" data-close>取消</button>
      <button class="btn btn--primary" type="submit" form="entryForm">保存修改</button>`,
    onMount(panel) {
      const form = $('#entryForm', panel);
      const imageInput = $('#entryImage', panel);
      const thumbInput = $('#entryThumb', panel);
      const previewNode = $('#entryPreview', panel);
      const transitionSelect = $('#entryTransition', panel);
      const switchCheck = $('#entrySwitch', panel);
      const updatePreview = () => {
        const url = safeURL(imageInput.value || thumbInput.value);
        previewNode.style.backgroundImage = url ? `url("${url}")` : '';
      };
      imageInput.addEventListener('input', updatePreview);
      thumbInput.addEventListener('input', updatePreview);
      switchCheck.addEventListener('change', () => {
        if (switchCheck.checked) transitionSelect.value = 'boot';
        else if (transitionSelect.value === 'boot') transitionSelect.value = type === 'game' ? 'portal' : 'petals';
      });
      transitionSelect.addEventListener('change', () => {
        switchCheck.checked = transitionSelect.value === 'boot';
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        saveEntryFromForm(panel, original, isNew);
      });
      if (!isNew) {
        $('#entryDeleteBtn', panel)?.addEventListener('click', async () => {
          if (!(await confirmDialog(`确定删除《${entry.title}》？这会从本地草稿中移除，发布后线上才会消失。`))) return;
          const index = list.findIndex(item => item.id === entry.id);
          if (index >= 0) list.splice(index, 1);
          state.currentEntry = null;
          markUpdated();
          storage.saveDraft(state.content);
          closeModal();
          updateModeChrome();
          if (currentHashRoute().view === 'detail') location.hash = '#/';
          else renderBoard();
          updateOwnerUI();
          toast('条目已从本地草稿中删除。', { duration: 3500 });
        });
      }
    }
  });
}

function saveEntryFromForm(panel, original, isNew) {
  const form = $('#entryForm', panel);
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  const id = String(data.get('id') || '').trim();
  const type = original.type;
  const key = typeKey(type);
  const list = state.content[key];
  if (!title) return toast('标题不能为空。', { error: true });
  if (!/^[a-z0-9-]+$/.test(id)) return toast('条目 ID 只能使用英文小写、数字和连字符。', { error: true });
  if (list.some(item => item.id === id && item.id !== original.id)) return toast('这个条目 ID 已经存在。', { error: true });

  const scoreRaw = Number(data.get('score'));
  const score = Number.isFinite(scoreRaw) ? Math.min(10, Math.max(0, Math.round(scoreRaw * 10) / 10)) : 5;
  const targetTier = state.content.tiers.some(tier => tier.id === data.get('tier')) ? data.get('tier') : 'la';
  const entry = {
    ...original,
    id,
    type,
    title,
    latin: String(data.get('latin') || '').trim(),
    year: String(data.get('year') || '').trim(),
    creator: String(data.get('creator') || '').trim(),
    platform: String(data.get('platform') || '').trim(),
    genre: String(data.get('genre') || '').trim(),
    score,
    tier: targetTier,
    quote: String(data.get('quote') || '').trim(),
    review: String(data.get('review') || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean),
    memory: String(data.get('memory') || '').trim(),
    tags: normalizeTags(data.get('tags')),
    image: String(data.get('image') || '').trim(),
    thumb: String(data.get('thumb') || '').trim(),
    imagePosition: safePosition(data.get('imagePosition') || 'center'),
    transition: String(data.get('transition') || 'portal'),
    switchGame: data.get('switchGame') === 'on',
    accent: safeColor(data.get('accent'), type === 'game' ? '#d8ff3e' : '#ff809b')
  };
  if (entry.image !== original.image) entry.lqip = '';

  if (isNew) {
    list.push(entry);
  } else {
    const index = list.findIndex(item => item.id === original.id);
    if (index >= 0) list[index] = entry;
    else list.push(entry);
  }
  applyDerivedOrder(type);
  markUpdated();
  storage.saveDraft(state.content);
  closeModal();
  updateSiteCopy();
  updateModeChrome();
  if (currentHashRoute().view === 'detail' && state.currentEntry?.id === entry.id) {
    state.currentEntry = entry;
    renderDetailPage(entry);
  } else {
    renderBoard();
  }
  updateOwnerUI();
  toast(isNew ? '新条目已加入本地草稿。' : '修改已保存到本地草稿。');
  sound.success();
}

/* ------------------------------------------------------------------ *
 * drag & drop
 * ------------------------------------------------------------------ */

function clearDropStyles() {
  $$('.tier-row.is-dragover').forEach(row => row.classList.remove('is-dragover'));
}

function reorderEntry(entryId, targetTier, beforeId = null) {
  const key = typeKey(state.mode);
  const list = state.content[key];
  const index = list.findIndex(entry => entry.id === entryId);
  if (index < 0) return;
  const [entry] = list.splice(index, 1);
  const groups = new Map(state.content.tiers.map(tier => [tier.id, []]));
  for (const item of list) {
    if (!groups.has(item.tier)) groups.set(item.tier, []);
    groups.get(item.tier).push(item);
  }
  const target = groups.get(targetTier) || groups.get('la');
  if (beforeId) {
    const beforeIndex = target.findIndex(item => item.id === beforeId);
    if (beforeIndex >= 0) target.splice(beforeIndex, 0, entry);
    else target.push(entry);
  } else {
    target.push(entry);
  }
  entry.tier = targetTier;
  state.content[key] = state.content.tiers.flatMap(tier => groups.get(tier.id) || []);
  markUpdated();
  storage.saveDraft(state.content);
  updateModeChrome();
  renderBoard();
  toast('排名已调整，并保存到本地草稿。');
}

function bindDragAndDrop() {
  el.tierBoard.addEventListener('dragstart', event => {
    if (!state.isEditing) return;
    const card = event.target.closest('.entry-card');
    if (!card) return;
    state.dragId = card.dataset.id;
    state.justDragged = false;
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.dragId);
  });

  el.tierBoard.addEventListener('dragend', event => {
    event.target.closest('.entry-card')?.classList.remove('is-dragging');
    state.dragId = null;
    state.justDragged = true;
    setTimeout(() => { state.justDragged = false; }, 260);
    clearDropStyles();
  });

  el.tierBoard.addEventListener('dragover', event => {
    if (!state.isEditing || !state.dragId) return;
    const row = event.target.closest('.tier-row');
    if (!row) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    $$('.tier-row.is-dragover').forEach(item => { if (item !== row) item.classList.remove('is-dragover'); });
    row.classList.add('is-dragover');
  });

  el.tierBoard.addEventListener('dragleave', event => {
    const row = event.target.closest('.tier-row');
    if (!row || row.contains(event.relatedTarget)) return;
    row.classList.remove('is-dragover');
  });

  el.tierBoard.addEventListener('drop', event => {
    if (!state.isEditing || !state.dragId) return;
    const row = event.target.closest('.tier-row');
    if (!row) return;
    event.preventDefault();
    const cards = [...row.querySelectorAll('.entry-card')].filter(card => card.dataset.id !== state.dragId);
    let beforeId = null;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (event.clientX < rect.left + rect.width / 2) {
        beforeId = card.dataset.id;
        break;
      }
    }
    const id = state.dragId;
    state.dragId = null;
    state.justDragged = true;
    setTimeout(() => { state.justDragged = false; }, 260);
    clearDropStyles();
    reorderEntry(id, row.dataset.tier, beforeId);
  });
}

/* ------------------------------------------------------------------ *
 * static bindings
 * ------------------------------------------------------------------ */

function bindStaticEvents() {
  el.homeView.addEventListener('click', event => {
    const modeButton = event.target.closest('.mode-switch__btn');
    if (modeButton) {
      setMode(modeButton.dataset.mode);
      return;
    }
    const addButton = event.target.closest('[data-add-tier]');
    if (addButton) {
      if (state.isEditing) openEntryEditor(null, addButton.dataset.addTier);
      return;
    }
    const card = event.target.closest('.entry-card');
    if (!card || state.justDragged) return;
    if (state.isEditing) {
      openEntryEditor(card.dataset.id);
    } else {
      const entry = findEntry(state.mode, card.dataset.id);
      if (entry) navigateTo(entry);
    }
  });

  el.detailView.addEventListener('click', event => {
    const openButton = event.target.closest('[data-open-entry]');
    if (openButton) {
      const entry = findEntry(state.mode, openButton.dataset.openEntry);
      if (entry) navigateTo(entry);
      return;
    }
    if (event.target.closest('[data-edit-entry]')) {
      if (state.currentEntry) openEntryEditor(state.currentEntry.id);
      return;
    }
    if (event.target.closest('[data-scroll-top]')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  bindDragAndDrop();

  $('#soundToggle')?.addEventListener('click', () => {
    const on = !sound.enabled;
    sound.setEnabled(on);
    updateSoundButton();
    if (on) sound.select();
  });
  $('#editToggle')?.addEventListener('click', toggleEdit);
  $('#addEntryBtn')?.addEventListener('click', () => openEntryEditor(null, 'la'));

  $$('[data-open]').forEach(button => {
    button.addEventListener('click', () => {
      closeMobileMenu();
      const target = button.dataset.open;
      if (target === 'about') openAbout();
      if (target === 'admin') openAdmin();
    });
  });

  const menuBtn = $('#menuBtn');
  const mobileMenu = $('#mobileMenu');
  menuBtn?.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    mobileMenu.classList.toggle('is-open', open);
    mobileMenu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('is-locked', open);
  });
  $$('#mobileMenu a, #mobileMenu [data-open]').forEach(node => node.addEventListener('click', closeMobileMenu));

  window.addEventListener('hashchange', () => {
    closeMobileMenu();
    renderRoute();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    document.body.classList.add('has-pointer');
    const glow = $('.cursor-glow');
    if (glow) glow.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  }, { passive: true });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (document.querySelector('.modal')) closeModal();
      closeMobileMenu();
      return;
    }
    const tag = event.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target?.isContentEditable) return;
    if (document.querySelector('.modal')) return;
    if (currentHashRoute().view === 'home') {
      if (event.key.toLowerCase() === 'g') setMode('game');
      if (event.key.toLowerCase() === 'a') setMode('anime');
    } else {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const list = listFor(state.mode);
        const index = list.findIndex(entry => entry.id === state.currentEntry?.id);
        const nextIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
        if (nextIndex >= 0 && nextIndex < list.length) navigateTo(list[nextIndex]);
      }
    }
  });

  window.addEventListener('popstate', () => renderRoute());
}

function onScroll() {
  const topbar = $('#topbar');
  topbar?.classList.toggle('is-scrolled', window.scrollY > 24);
  const progress = $('.scroll-progress span');
  if (progress) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
  }
}

function updateSoundButton() {
  const button = $('#soundToggle');
  if (!button) return;
  button.classList.toggle('is-muted', !sound.enabled);
  button.setAttribute('aria-pressed', String(sound.enabled));
  button.setAttribute('aria-label', sound.enabled ? '关闭音效' : '开启音效');
  button.title = sound.enabled ? '音效开' : '音效关';
}

function closeMobileMenu() {
  const menuBtn = $('#menuBtn');
  const mobileMenu = $('#mobileMenu');
  if (!menuBtn || !mobileMenu) return;
  menuBtn.setAttribute('aria-expanded', 'false');
  mobileMenu.classList.remove('is-open');
  mobileMenu.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal')) document.body.classList.remove('is-locked');
}

/* ------------------------------------------------------------------ *
 * init
 * ------------------------------------------------------------------ */

async function init() {
  const loader = createLoader();
  cacheElements();
  bindStaticEvents();
  updateSoundButton();
  onScroll();
  if (el.mobileYear) el.mobileYear.textContent = String(new Date().getFullYear());

  try {
    state.content = await loadContent();
    state.remoteContent = clone(state.content);
    if (state.isOwner) {
      const draft = storage.getDraft();
      if (draft?.content) {
        try {
          validateContent(draft.content);
          state.content = clone(draft.content);
          setTimeout(() => toast('已恢复这台设备上的本地草稿。', { duration: 3600 }), 1200);
        } catch {
          storage.clearDraft();
        }
      }
    }
    updateSiteCopy();
    updateBackdrop();
    updateModeChrome();
    renderBoard();
    updateOwnerUI();
    renderRoute({ force: true });
    updateEditChrome();
    finishLoading(loader);
    if (new URLSearchParams(location.search).has('admin')) {
      setTimeout(openAdmin, 700);
    }
    if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/');
  } catch (error) {
    console.error(error);
    showFatal(error.message || '未知错误', loader);
  }
}

function cacheElements() {
  el.homeView = document.getElementById('view-home');
  el.detailView = document.getElementById('view-detail');
  el.tierBoard = document.getElementById('tierBoard');
  el.boardSection = document.getElementById('board');
  el.boardModeLabel = document.getElementById('boardModeLabel');
  el.updatedAt = document.getElementById('updatedAt');
  el.statCount = document.getElementById('statCount');
  el.statAvg = document.getElementById('statAvg');
  el.statTop = document.getElementById('statTop');
  el.nowId = document.getElementById('nowId');
  el.nowCaption = document.getElementById('nowCaption');
  el.nowTitle = document.getElementById('nowTitle');
  el.ownerBadge = document.getElementById('ownerBadge');
  el.adminNavBtn = document.getElementById('adminNavBtn');
  el.editToggle = document.getElementById('editToggle');
  el.editToggleText = document.getElementById('editToggleText');
  el.editState = document.getElementById('editState');
  el.editStateText = document.getElementById('editStateText');
  el.addEntryBtn = document.getElementById('addEntryBtn');
  el.boardHint = document.getElementById('boardHint');
  el.modalRoot = document.getElementById('modalRoot');
  el.mobileYear = document.getElementById('mobileYear');
}

init();
