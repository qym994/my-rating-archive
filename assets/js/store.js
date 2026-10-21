const KEYS = {
  draft: 'tier00.draft.v1',
  pass: 'tier00.pass.v1',
  ownerSession: 'tier00.owner.session',
  github: 'tier00.github.v1',
  githubToken: 'tier00.github.token',
  mode: 'tier00.mode.v1'
};

const GH_API = 'https://api.github.com';

export const storage = {
  getDraft() {
    try {
      const raw = localStorage.getItem(KEYS.draft);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  saveDraft(content) {
    const payload = { savedAt: new Date().toISOString(), content };
    localStorage.setItem(KEYS.draft, JSON.stringify(payload));
  },
  clearDraft() {
    localStorage.removeItem(KEYS.draft);
  },
  getPassHash() {
    return localStorage.getItem(KEYS.pass) || '';
  },
  setPassHash(hash) {
    localStorage.setItem(KEYS.pass, hash);
  },
  isOwnerSession() {
    return sessionStorage.getItem(KEYS.ownerSession) === '1';
  },
  setOwnerSession(on) {
    if (on) sessionStorage.setItem(KEYS.ownerSession, '1');
    else sessionStorage.removeItem(KEYS.ownerSession);
  },
  getGithubConfig() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEYS.github) || '{}'); } catch { saved = {}; }
    const token = sessionStorage.getItem(KEYS.githubToken) || '';
    return {
      owner: saved.owner || '',
      repo: saved.repo || '',
      branch: saved.branch || 'main',
      path: saved.path || 'content.json',
      token
    };
  },
  saveGithubConfig(config) {
    const { token, ...persisted } = config;
    localStorage.setItem(KEYS.github, JSON.stringify(persisted));
    if (token) sessionStorage.setItem(KEYS.githubToken, token);
    else sessionStorage.removeItem(KEYS.githubToken);
  },
  clearGithubToken() {
    sessionStorage.removeItem(KEYS.githubToken);
  },
  getMode() {
    return localStorage.getItem(KEYS.mode) || 'game';
  },
  setMode(mode) {
    localStorage.setItem(KEYS.mode, mode);
  }
};

export async function loadContent() {
  const res = await fetch(`content.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`内容加载失败 (${res.status})`);
  const data = await res.json();
  validateContent(data);
  return data;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validateContent(data) {
  if (!data || typeof data !== 'object') throw new Error('内容格式错误');
  if (!Array.isArray(data.tiers) || !data.tiers.length) throw new Error('缺少评级层级');
  if (!Array.isArray(data.games) || !Array.isArray(data.anime)) throw new Error('缺少游戏或番剧列表');
  const ids = new Set();
  for (const list of [data.games, data.anime]) {
    for (const item of list) {
      if (!item || !item.id || !item.title) throw new Error('存在缺少 id 或标题的条目');
      if (ids.has(`${item.type}:${item.id}`)) throw new Error(`条目 id 重复：${item.id}`);
      ids.add(`${item.type}:${item.id}`);
      if (!data.tiers.some(t => t.id === item.tier)) throw new Error(`条目 ${item.title} 的层级无效`);
    }
  }
  if (!data.site) data.site = {};
  return true;
}

export async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function downloadJSON(content) {
  const text = JSON.stringify(content, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `content-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function ghHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function ghFetch(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: ghHeaders(token),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const message = data?.message || `GitHub API 请求失败 (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function verifyGithub(config) {
  if (!config.owner || !config.repo) throw new Error('请填写 GitHub 用户名和仓库名');
  if (!config.token) throw new Error('请填写 Personal Access Token');
  const repo = await ghFetch(`/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, { token: config.token });
  let file = null;
  try {
    file = await ghFetch(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(config.branch)}`,
      { token: config.token }
    );
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  return {
    repo: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch,
    fileExists: Boolean(file),
    fileSha: file?.sha || ''
  };
}

export async function publishContent(content, config) {
  if (!config.owner || !config.repo) throw new Error('请先完成 GitHub 发布设置');
  if (!config.token) throw new Error('缺少 GitHub Token，请重新填写');
  if (!config.branch) throw new Error('请填写分支名');
  if (!config.path) throw new Error('请填写内容文件路径');

  const encodedPath = config.path.split('/').map(encodeURIComponent).join('/');
  let existing = null;
  try {
    existing = await ghFetch(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`,
      { token: config.token }
    );
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const payload = {
    message: `chore(content): update rating archive ${new Date().toISOString().slice(0, 10)}`,
    content: utf8ToBase64(JSON.stringify(content, null, 2)),
    branch: config.branch
  };
  if (existing?.sha) payload.sha = existing.sha;

  const result = await ghFetch(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`,
    { token: config.token, method: 'PUT', body: payload }
  );

  return {
    commitUrl: result.commit?.html_url || '',
    contentUrl: result.content?.html_url || '',
    sha: result.content?.sha || ''
  };
}
