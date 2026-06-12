// ══════════════════════════════════════════════════════════════
// SAPMANRI Magazine Editor — core logic
// 이미지 분석(SapmanriCache/analyzeImage)과 글 생성은
// carousel_ai_generator.html / writing_studio.html과 동일한
// 공유 모듈/패턴을 그대로 사용한다 (중복 구현 금지).
// ══════════════════════════════════════════════════════════════

const API_KEY_STORAGE = 'ws_sapmanri_apikey';   // writing_studio와 동일 키 (공유)
const GH_TOKEN_KEY = 'cg_sapmanri_gh_token';     // carousel_ai_generator와 동일 키 (공유, image_cache 접근용)
const GITHUB_REPO = 'sapmanri/carousel-generator';
const ISSUES_FILE = 'magazine/issues.json';
const PROFILE_FILE = 'profile_data.json';

// ── 공통 이미지 분석 캐시 (carousel_ai_generator.html과 동일 모듈) ──
(function (global) {
  const REPO = GITHUB_REPO;
  const FILE = 'image_cache.json';
  const TOKEN_KEY = GH_TOKEN_KEY;
  const MAX_ENTRIES = 800;

  let _cache = null;
  let _loadPromise = null;

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch(e) { return ''; }
  }
  function setToken(val) {
    try { localStorage.setItem(TOKEN_KEY, val); } catch(e) {}
  }

  async function _load() {
    const token = getToken();
    if (!token) { _cache = { entries: {}, sha: null }; return _cache; }
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
        headers: { Authorization: `token ${token}` }
      });
      if (res.status === 404) { _cache = { entries: {}, sha: null }; return _cache; }
      const json = await res.json();
      if (!json.sha) { _cache = { entries: {}, sha: null }; return _cache; }
      const b64 = json.content.replace(/\n/g, '');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      _cache = { entries: data.entries || {}, sha: json.sha };
    } catch (e) {
      _cache = { entries: {}, sha: null };
    }
    return _cache;
  }

  async function _ensureLoaded() {
    if (_cache) return _cache;
    if (!_loadPromise) _loadPromise = _load();
    return _loadPromise;
  }

  function _latestTs(serviceMap) {
    let max = 0;
    for (const svc in serviceMap) {
      const ts = serviceMap[svc] && serviceMap[svc].ts;
      if (ts && ts > max) max = ts;
    }
    return max;
  }

  function _enforceLimit(entries) {
    const keys = Object.keys(entries);
    if (keys.length <= MAX_ENTRIES) return entries;
    const sorted = keys.map(k => ({ k, ts: _latestTs(entries[k]) })).sort((a,b)=>a.ts-b.ts);
    const removeCount = keys.length - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i++) delete entries[sorted[i].k];
    return entries;
  }

  let _saveQueue = Promise.resolve();
  async function _save() {
    const token = getToken();
    if (!token || !_cache) return false;
    _enforceLimit(_cache.entries);
    const jsonStr = JSON.stringify({ entries: _cache.entries }, null, 0);
    const bytes = new TextEncoder().encode(jsonStr);
    const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    const body = { message: 'Update image_cache', content: btoa(binStr) };
    if (_cache.sha) body.sha = _cache.sha;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.content?.sha) { _cache.sha = json.content.sha; return true; }
      if (json.message && /sha/i.test(json.message)) { await _load(); return false; }
      return false;
    } catch (e) { return false; }
  }
  function _queueSave() { _saveQueue = _saveQueue.then(() => _save()); return _saveQueue; }

  async function hashImage(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const commaIdx = dataUrl.indexOf(',');
    const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const len = b64.length;
    const sampleSize = Math.min(len, 4000);
    const step = Math.max(1, Math.floor(len / sampleSize));
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < len; i += step) {
      const c = b64.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) | 0;
      h2 = ((h2 << 5) - h2 + c) | 0;
    }
    return `${len.toString(36)}_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
  }

  async function get(hash, service) {
    if (!hash || !service) return null;
    await _ensureLoaded();
    const entry = _cache.entries[hash];
    if (!entry || !entry[service]) return null;
    return entry[service].data;
  }

  async function set(hash, service, data) {
    if (!hash || !service) return false;
    await _ensureLoaded();
    if (!_cache.entries[hash]) _cache.entries[hash] = {};
    _cache.entries[hash][service] = { data, ts: Date.now() };
    return _queueSave();
  }

  function isEnabled() { return !!getToken(); }

  global.SapmanriCache = { hashImage, get, set, isEnabled, getToken, setToken };
})(window);


// ── API Key / GitHub Token ──
function getApiKey() {
  return document.getElementById('apiKeyField').value.trim() || localStorage.getItem(API_KEY_STORAGE) || '';
}
function getGhToken() {
  return document.getElementById('ghTokenField').value.trim() || localStorage.getItem(GH_TOKEN_KEY) || '';
}
function toggleField(fieldId, btnId, storageKey) {
  const field = document.getElementById(fieldId);
  const isOpen = field.classList.contains('open');
  if (isOpen) {
    const val = field.value.trim();
    if (val) {
      localStorage.setItem(storageKey, val);
      document.getElementById(btnId).classList.add('ok');
      document.getElementById(btnId).textContent = btnId.includes('api') ? 'API Key ✓' : 'GitHub ✓';
    }
    field.classList.remove('open');
  } else {
    field.classList.add('open');
    field.focus();
  }
}
function initKeys() {
  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  if (apiKey) {
    document.getElementById('apiKeyField').value = apiKey;
    document.getElementById('apiKeyBtn').classList.add('ok');
    document.getElementById('apiKeyBtn').textContent = 'API Key ✓';
  }
  const ghToken = localStorage.getItem(GH_TOKEN_KEY);
  if (ghToken) {
    document.getElementById('ghTokenField').value = ghToken;
    document.getElementById('ghTokenBtn').classList.add('ok');
    document.getElementById('ghTokenBtn').textContent = 'GitHub ✓';
  }
}

// ── 토스트 ──
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


// ══════════════════════════════════════════════════════════════
// 이미지 분석 (carousel_ai_generator.html의 analyzeImage와 동일 패턴)
// ══════════════════════════════════════════════════════════════
async function analyzeImage(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const mediaType = dataUrl.match(/data:(image\/\w+)/)[1];
  const key = getApiKey();
  if (!key) throw new Error('API Key가 필요합니다.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `이 이미지를 분석해서 웹매거진 페이지 레이아웃에 필요한 정보를 JSON으로만 반환해줘. 다른 텍스트 없이 JSON만.
{"subject_position":"left|center|right|top|bottom|full","overall_brightness":"dark|mid|bright","dominant_color":"#hex","mood":"한 단어 한국어","suggested_caption":"명조체로 어울리는 한국어 캡션 한 줄 (Vase 문체, 12자 이내)","suggested_label":"소제목 한국어 (예: 아침의 루틴, 4-8자)","best_page_type":"fullbleed|split|grid|quote 중 이 사진에 가장 어울리는 것"}` }
      ]}]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content?.find(b => b.type === 'text')?.text || '{}';
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  return JSON.parse(text.slice(s, e + 1));
}


// ══════════════════════════════════════════════════════════════
// 글 생성 (writing_studio.html의 generateText와 동일 패턴)
// profile_data.json의 문체 규칙/예시를 그대로 가져와 적용한다.
// ══════════════════════════════════════════════════════════════
const DEFAULT_RULES = [
  '감정을 직접 설명하지 않는다. 사물과 장면을 통해 감정이 드러나게 한다.',
  '짧은 문장과 긴 문장을 리듬감 있게 교차한다. 같은 길이의 문장이 연속되면 단조로워진다.',
  '결론을 서두르지 않는다. 독자와 함께 천천히 도달한다.',
  '여백을 남긴다. 모든 것을 설명하려 하지 않는다.',
  '\'그러나\', \'하지만\' 같은 역접 접속사보다 장면의 전환으로 대비를 표현한다.',
  '계절과 빛, 소리, 온도 같은 감각적 디테일을 구체적으로 쓴다.',
  '고양이 빼빼와 콩이 등장할 때는 사람처럼 묘사하지 않는다. 그냥 그 자리에 있는 것으로 충분하다.',
  '마침표로 끝나는 짧은 한 문장이 문단 전체를 마무리할 때 가장 강하다.',
];

let profileCache = null;
async function loadProfile() {
  if (profileCache) return profileCache;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/${PROFILE_FILE}`, { cache: 'no-store' });
    const data = await res.json();
    profileCache = {
      rules: data.rules?.length ? data.rules : [...DEFAULT_RULES],
      examples: data.examples || [],
    };
  } catch (e) {
    profileCache = { rules: [...DEFAULT_RULES], examples: [] };
  }
  return profileCache;
}

// pageType별 글 작성 지시 (writing_studio TYPE_INSTRUCTION과 같은 역할)
const PAGE_TEXT_INSTRUCTION = {
  fullbleed: `풀블리드 화보 페이지의 캡션을 쓴다. 명조체로 한 줄, 12자 내외, 장면의 핵심을 담는다. 설명하지 말고 보여준다.`,
  split: `2단 사진+글 페이지의 본문을 쓴다. Vase의 인간극장(observer) 톤으로 2-4문단, 한 문장씩 줄바꿈하여 호흡을 살린다. 사진 속 장면에서 시작해 감각적 디테일로 확장한다.`,
  grid: `그리드 콜라주 페이지의 짧은 캡션을 쓴다. 한 문장, 20자 내외. 여러 장면을 압축하는 느낌.`,
  quote: `인용/하이라이트 페이지의 문장을 쓴다. 가장 인상적인 한 문장, 24-40자, 여운이 남는 톤.`,
  closing: `클로징 페이지의 마무리 문구를 쓴다. "오늘도 느리게, 잘 보냈습니다" 같은 톤으로 1-2문장.`,
  index: `목차용 소제목들을 쓴다.`,
  cover: `표지 헤드라인을 쓴다. 2줄, 명조체, 영상/이야기의 핵심을 담는다.`,
};

async function generateMagazineText(pageType, photo, extraContext) {
  const key = getApiKey();
  if (!key) throw new Error('API Key가 필요합니다.');
  const profile = await loadProfile();
  const typeExamples = profile.examples.slice(-3);

  let system = `당신은 한국 크리에이터 Vase Lim(@sapmanri)의 웹매거진 글쓰기 도구입니다.
Vase의 문체로 글을 씁니다. 아래 규칙과 예시를 철저히 따르세요.

## 문체 규칙
${profile.rules.map((r, i) => `${i+1}. ${r}`).join('\n')}

## 이번 글 지시
${PAGE_TEXT_INSTRUCTION[pageType] || ''}

결과는 텍스트만 반환하세요. 따옴표, 설명, 마크다운 기호 없이 순수한 글만 반환합니다.`;

  if (typeExamples.length > 0) {
    system += `\n\n## Vase가 직접 쓴 예시 글 (문체와 어조를 그대로 따르세요)\n`;
    typeExamples.forEach((e, i) => { system += `\n--- 예시 ${i+1} ---\n${e.text}\n`; });
  }

  let userContent;
  const ctxText = extraContext ? `\n\n참고 컨텍스트: ${extraContext}` : '';
  if (photo && photo.dataUrl) {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.dataUrl.split(',')[1] } },
      { type: 'text', text: `이 이미지를 보고 글을 써주세요. 이미지의 분위기, 빛, 계절, 감각적 디테일을 Vase 문체로 담아주세요.${ctxText}` }
    ];
  } else {
    userContent = `다음 내용을 바탕으로 글을 써주세요.${ctxText}`;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text?.trim() || '';
}


// ══════════════════════════════════════════════════════════════
// 상태
// ══════════════════════════════════════════════════════════════
let photos = [];   // { id, dataUrl, mediaType, name, analysis, sha?, path? }
let pages = [];    // page objects (matching issue.html schema)
let allIssues = []; // loaded from issues.json (for select + sha tracking)
let issuesSha = null;
let currentIssueId = null;
let coverPhotoId = null;
let photoIdSeq = 0;

// ══════════════════════════════════════════════════════════════
// 사진 업로드
// ══════════════════════════════════════════════════════════════
function setupUploadZone() {
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    onFilesSelected(e.dataTransfer.files);
  });
}

function onFilesSelected(files) {
  [...files].forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photo = {
        id: 'p' + (++photoIdSeq),
        dataUrl: reader.result,
        mediaType: file.type,
        name: file.name,
        analysis: null,
      };
      photos.push(photo);
      renderPhotoGrid();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoGrid() {
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = photos.map((p, i) => `
    <div class="photo-card ${p.analysis ? 'analyzed' : ''}" draggable="true" data-id="${p.id}">
      <img src="${p.dataUrl}" alt="">
      <div class="pc-num">${i+1}</div>
      <button class="pc-remove" onclick="removePhoto('${p.id}')">×</button>
      <div class="pc-status">${p.analysis ? (p.analysis.mood || '분석됨') : '미분석'}</div>
    </div>
  `).join('');
  document.getElementById('photoCount').textContent = photos.length ? `${photos.length}장 업로드됨` : '';
  setupPhotoDrag();
  renderPageList(); // thumb pickers depend on photos
}

function removePhoto(id) {
  photos = photos.filter(p => p.id !== id);
  if (coverPhotoId === id) coverPhotoId = null;
  pages.forEach(pg => {
    if (pg.imageId === id) pg.imageId = null;
    if (Array.isArray(pg.imageIds)) pg.imageIds = pg.imageIds.filter(x => x !== id);
  });
  renderPhotoGrid();
  renderCoverPreview();
}

// 드래그로 순서 변경
function setupPhotoDrag() {
  const grid = document.getElementById('photoGrid');
  let dragId = null;
  grid.querySelectorAll('.photo-card').forEach(card => {
    card.addEventListener('dragstart', () => { dragId = card.dataset.id; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = card.dataset.id;
      if (!dragId || dragId === targetId) return;
      const fromIdx = photos.findIndex(p => p.id === dragId);
      const toIdx = photos.findIndex(p => p.id === targetId);
      const [moved] = photos.splice(fromIdx, 1);
      photos.splice(toIdx, 0, moved);
      renderPhotoGrid();
    });
  });
}

// ══════════════════════════════════════════════════════════════
// 이미지 분석 (캐시 우선, 없으면 analyzeImage 호출 후 캐시 저장)
// ══════════════════════════════════════════════════════════════
async function analyzeAllPhotos() {
  if (!photos.length) { toast('먼저 사진을 업로드해주세요.'); return; }
  const status = document.getElementById('analyzeStatus');
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (p.analysis) continue;
    status.innerHTML = `<span class="spinner"></span>${i+1}/${photos.length} 분석 중…`;
    try {
      const hash = await SapmanriCache.hashImage(p.dataUrl);
      let result = await SapmanriCache.get(hash, 'magazine');
      if (!result) {
        result = await analyzeImage(p.dataUrl);
        SapmanriCache.set(hash, 'magazine', result); // 비동기 — 기다리지 않음
      }
      p.analysis = result;
      renderPhotoGrid();
    } catch (e) {
      toast('분석 실패: ' + e.message);
      status.textContent = '';
      return;
    }
  }
  status.textContent = '분석 완료 ✓';
  setTimeout(() => status.textContent = '', 2000);
}

// ══════════════════════════════════════════════════════════════
// 표지 선택
// ══════════════════════════════════════════════════════════════
function pickCover() {
  if (!photos.length) { toast('먼저 사진을 업로드해주세요.'); return; }
  openPhotoPicker(id => { coverPhotoId = id; renderCoverPreview(); }, coverPhotoId);
}
function renderCoverPreview() {
  const el = document.getElementById('fCoverPreview');
  const photo = photos.find(p => p.id === coverPhotoId);
  if (photo) {
    el.src = photo.dataUrl;
    el.classList.remove('empty');
  } else {
    el.removeAttribute('src');
    el.classList.add('empty');
    el.textContent = '사진 선택';
  }
}

// 간단한 사진 선택 팝업 (prompt 대체용 — 인라인 그리드 클릭)
let _pickerCallback = null;
function openPhotoPicker(callback, currentId) {
  _pickerCallback = callback;
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const box = document.createElement('div');
  box.style = 'background:var(--s1);border:1px solid var(--border);border-radius:8px;padding:16px;max-width:500px;width:100%;max-height:70vh;overflow:auto';
  box.innerHTML = `<div style="font-family:var(--mono);font-size:10px;letter-spacing:0.12em;color:var(--dim);margin-bottom:10px;text-transform:uppercase">사진 선택</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px">
      ${photos.map(p => `<img src="${p.dataUrl}" class="thumb-pick${p.id===currentId?' selected':''}" style="width:100%;height:70px" onclick="(_pickerCallback && _pickerCallback('${p.id}')); this.closest('div[style*=fixed]')?.remove?.(); document.querySelector('[style*=\\'rgba(0,0,0,0.7)\\']')?.remove()">`).join('')}
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// ══════════════════════════════════════════════════════════════
// 페이지 빌더
// ══════════════════════════════════════════════════════════════
const PAGE_DEFAULTS = {
  cover: () => ({ type: 'cover', imageId: null, headline: ['', ''], toc: [] }),
  fullbleed: () => ({ type: 'fullbleed', imageId: null, caption: '' }),
  index: () => ({ type: 'index', label: 'Contents · 이번 호 이야기', items: [] }),
  split: () => ({ type: 'split', imageId: null, label: '', text: '', darkText: false }),
  grid: () => ({ type: 'grid', imageIds: [], label: '', caption: '' }),
  quote: () => ({ type: 'quote', text: '', context: '' }),
  closing: () => ({ type: 'closing', text: '', cta: '' }),
};

function addPage() {
  const type = document.getElementById('newPageType').value;
  pages.push(PAGE_DEFAULTS[type]());
  renderPageList();
}
function removePage(idx) {
  pages.splice(idx, 1);
  renderPageList();
}
function movePage(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= pages.length) return;
  [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];
  renderPageList();
}

const PAGE_TYPE_LABEL = {
  cover: '표지', fullbleed: '풀블리드', index: '목차', split: '2단 split', grid: '그리드', quote: '인용', closing: '클로징'
};

function renderPageList() {
  const list = document.getElementById('pageList');
  if (!pages.length) {
    list.innerHTML = `<div class="hint">아래에서 페이지 타입을 선택하고 "+ 페이지 추가"를 눌러 구성하세요.</div>`;
    return;
  }
  list.innerHTML = pages.map((pg, idx) => renderPageCard(pg, idx)).join('');
}

function thumbHtml(photoId, onclick, extraClass) {
  const photo = photos.find(p => p.id === photoId);
  if (photo) {
    return `<img src="${photo.dataUrl}" class="thumb-pick selected ${extraClass||''}" onclick="${onclick}">`;
  }
  return `<div class="thumb-pick empty ${extraClass||''}" onclick="${onclick}">사진<br>선택</div>`;
}

function renderPageCard(pg, idx) {
  const head = `
    <div class="page-card-head">
      <span class="ptag">${String(idx+1).padStart(2,'0')} · ${PAGE_TYPE_LABEL[pg.type]}</span>
      <div class="pc-actions">
        <button class="icon-btn" onclick="movePage(${idx},-1)" title="위로">↑</button>
        <button class="icon-btn" onclick="movePage(${idx},1)" title="아래로">↓</button>
        <button class="icon-btn" onclick="removePage(${idx})" title="삭제">×</button>
      </div>
    </div>`;

  let body = '';
  switch (pg.type) {
    case 'cover':
      body = `
        <div class="row">${thumbHtml(pg.imageId, `openPhotoPicker(id=>{pages[${idx}].imageId=id; renderPageList()}, '${pg.imageId||''}')`)}</div>
        <div class="field"><label>헤드라인 1행</label><input value="${esc(pg.headline[0]||'')}" oninput="pages[${idx}].headline[0]=this.value"></div>
        <div class="field"><label>헤드라인 2행</label><input value="${esc(pg.headline[1]||'')}" oninput="pages[${idx}].headline[1]=this.value"></div>
        <div class="field"><label>목차 항목 (줄바꿈으로 구분)</label><textarea oninput="pages[${idx}].toc=this.value.split('\\n').filter(Boolean)">${esc((pg.toc||[]).join('\n'))}</textarea></div>
        <div class="gen-row"><button class="btn-gen" onclick="genCoverHeadline(${idx})">✨ 헤드라인 생성</button></div>
      `;
      break;
    case 'fullbleed':
      body = `
        <div class="row">${thumbHtml(pg.imageId, `openPhotoPicker(id=>{pages[${idx}].imageId=id; renderPageList()}, '${pg.imageId||''}')`)}</div>
        <div class="field"><label>캡션</label><textarea oninput="pages[${idx}].caption=this.value">${esc(pg.caption||'')}</textarea></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 캡션 생성</button></div>
      `;
      break;
    case 'index':
      body = `
        <div class="field"><label>라벨</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
        <div class="field"><label>목차 항목 (줄바꿈으로 구분)</label><textarea oninput="pages[${idx}].items=this.value.split('\\n').filter(Boolean)">${esc((pg.items||[]).join('\n'))}</textarea></div>
      `;
      break;
    case 'split':
      body = `
        <div class="row">${thumbHtml(pg.imageId, `openPhotoPicker(id=>{pages[${idx}].imageId=id; renderPageList()}, '${pg.imageId||''}')`)}</div>
        <div class="field"><label>소제목 라벨</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
        <div class="field"><label>본문</label><textarea style="min-height:120px" oninput="pages[${idx}].text=this.value">${esc(pg.text||'')}</textarea></div>
        <label style="font-size:11px;color:var(--dim);display:flex;gap:6px;align-items:center"><input type="checkbox" ${pg.darkText?'checked':''} onchange="pages[${idx}].darkText=this.checked"> 다크 배경 텍스트</label>
        <div class="gen-row">
          <input style="flex:1" placeholder="추가 컨텍스트 (선택)" id="ctx-${idx}">
          <button class="btn-gen" onclick="genPageText(${idx}, document.getElementById('ctx-${idx}').value)">✨ 본문 생성</button>
        </div>
      `;
      break;
    case 'grid':
      body = `
        <div class="row">
          ${[0,1,2].map(i => thumbHtml((pg.imageIds||[])[i], `openPhotoPicker(id=>{ if(!pages[${idx}].imageIds) pages[${idx}].imageIds=[]; pages[${idx}].imageIds[${i}]=id; renderPageList()}, '${(pg.imageIds||[])[i]||''}')`)).join('')}
        </div>
        <div class="field"><label>그리드 라벨</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
        <div class="field"><label>캡션</label><input value="${esc(pg.caption||'')}" oninput="pages[${idx}].caption=this.value"></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 캡션 생성</button></div>
      `;
      break;
    case 'quote':
      body = `
        <div class="field"><label>인용 문장</label><textarea oninput="pages[${idx}].text=this.value">${esc(pg.text||'')}</textarea></div>
        <div class="field"><label>맥락 (작게 표시)</label><input value="${esc(pg.context||'')}" oninput="pages[${idx}].context=this.value"></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 문장 생성</button></div>
      `;
      break;
    case 'closing':
      body = `
        <div class="field"><label>클로징 문구</label><textarea oninput="pages[${idx}].text=this.value">${esc(pg.text||'')}</textarea></div>
        <div class="field"><label>CTA (선택, 비워두면 기본값 사용)</label><input value="${esc(pg.cta||'')}" oninput="pages[${idx}].cta=this.value"></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 문구 생성</button></div>
      `;
      break;
  }

  return `<div class="page-card">${head}<div class="page-card-body">${body}</div></div>`;
}

// ── 글 생성 핸들러 ──
async function genPageText(idx, extraContext) {
  const pg = pages[idx];
  const photoId = pg.imageId || (pg.imageIds && pg.imageIds[0]);
  const photo = photos.find(p => p.id === photoId);
  try {
    toast('생성 중…');
    const text = await generateMagazineText(pg.type, photo, extraContext);
    if (pg.type === 'fullbleed' || pg.type === 'grid') pg.caption = text;
    else if (pg.type === 'split') pg.text = text;
    else if (pg.type === 'quote' || pg.type === 'closing') pg.text = text;
    renderPageList();
    toast('생성 완료');
  } catch (e) {
    toast('오류: ' + e.message);
  }
}

async function genCoverHeadline(idx) {
  const pg = pages[idx];
  const photoId = pg.imageId;
  const photo = photos.find(p => p.id === photoId);
  try {
    toast('생성 중…');
    const text = await generateMagazineText('cover', photo, '두 줄로 줄바꿈하여 작성');
    const lines = text.split('\n').filter(Boolean);
    pg.headline = [lines[0] || '', lines[1] || ''];
    renderPageList();
    toast('생성 완료');
  } catch (e) {
    toast('오류: ' + e.message);
  }
}


// ══════════════════════════════════════════════════════════════
// GitHub: issues.json 로드/저장, 이미지 커밋
// ══════════════════════════════════════════════════════════════
async function loadIssuesFromGithub() {
  const token = getGhToken();
  const statusEl = document.getElementById('ghLoadStatus');
  if (!token) { statusEl.textContent = 'GitHub 토큰을 입력하면 기존 호 목록을 불러올 수 있어요.'; return; }
  statusEl.innerHTML = '<span class="spinner"></span>불러오는 중…';
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ISSUES_FILE}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (res.status === 404) {
      allIssues = []; issuesSha = null;
      statusEl.textContent = 'issues.json이 없어서 새로 생성됩니다.';
      populateIssueSelect();
      return;
    }
    const json = await res.json();
    if (!json.sha) throw new Error(json.message || '로드 실패');
    issuesSha = json.sha;
    const b64 = json.content.replace(/\n/g, '');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    allIssues = data.issues || [];
    statusEl.textContent = `${allIssues.length}개 호 불러옴 ✓`;
    populateIssueSelect();
  } catch (e) {
    statusEl.textContent = '로드 실패: ' + e.message;
  }
}

function populateIssueSelect() {
  const sel = document.getElementById('issueSelect');
  sel.innerHTML = `<option value="__new__">+ 새 호 만들기</option>` +
    allIssues.map(iss => `<option value="${esc(iss.id)}">${esc(iss.number || iss.id)} · ${esc(iss.title || '')}</option>`).join('');
}

function onIssueSelect() {
  const id = document.getElementById('issueSelect').value;
  if (id === '__new__') {
    currentIssueId = null;
    clearForm();
    return;
  }
  const issue = allIssues.find(x => x.id === id);
  if (!issue) return;
  currentIssueId = id;
  loadIssueIntoForm(issue);
}

function clearForm() {
  document.getElementById('fId').value = '';
  document.getElementById('fNumber').value = '';
  document.getElementById('fTitle').value = '';
  document.getElementById('fSubtitle').value = '';
  document.getElementById('fDate').value = '';
  photos = [];
  pages = [];
  coverPhotoId = null;
  renderPhotoGrid();
  renderCoverPreview();
  renderPageList();
}

// 기존 호를 폼에 로드 (이미지는 URL 참조 — 새 사진 추가 시에만 업로드됨)
function loadIssueIntoForm(issue) {
  document.getElementById('fId').value = issue.id || '';
  document.getElementById('fNumber').value = issue.number || '';
  document.getElementById('fTitle').value = issue.title || '';
  document.getElementById('fSubtitle').value = issue.subtitle || '';
  document.getElementById('fDate').value = issue.date || '';

  // 기존 이미지들을 photos 배열에 참조 형태로 등록 (path만, dataUrl 없음 → 재업로드 전까지 그대로 사용)
  photos = [];
  pages = (issue.pages || []).map(pg => {
    const clone = JSON.parse(JSON.stringify(pg));
    if (clone.image) clone._existingImage = clone.image;
    if (Array.isArray(clone.images)) clone._existingImages = [...clone.images];
    return mapExistingPageToEditable(clone);
  });

  if (issue.cover) {
    coverPhotoId = '__existing_cover__';
    photos.push({ id: '__existing_cover__', dataUrl: issue.cover, mediaType: 'image/jpeg', name: 'cover', analysis: null, _existing: true });
  } else {
    coverPhotoId = null;
  }

  renderPhotoGrid();
  renderCoverPreview();
  renderPageList();
  toast('호 데이터를 불러왔어요. 사진을 다시 추가하면 새 이미지로 교체됩니다.');
}

// issue.html 스키마(image/images 경로) → 에디터 내부 스키마(imageId/imageIds) 매핑
// 기존 경로는 _existingImage(s)에 보관하고, 발행 시 imageId가 없으면 그대로 사용
function mapExistingPageToEditable(pg) {
  if (pg.image) {
    const id = 'existing_' + Math.random().toString(36).slice(2);
    photos.push({ id, dataUrl: pg.image, mediaType: 'image/jpeg', name: id, analysis: null, _existing: true });
    pg.imageId = id;
  }
  if (Array.isArray(pg.images)) {
    pg.imageIds = pg.images.map(src => {
      const id = 'existing_' + Math.random().toString(36).slice(2);
      photos.push({ id, dataUrl: src, mediaType: 'image/jpeg', name: id, analysis: null, _existing: true });
      return id;
    });
  }
  return pg;
}

// 새 사진(base64)을 GitHub에 커밋, 기존 사진(_existing)은 그대로 경로 재사용
async function commitPhoto(photo, issueId, index) {
  if (photo._existing) {
    // 기존 이미지: dataUrl이 이미 경로(magazine/images/...)인 경우 그대로 반환
    if (typeof photo.dataUrl === 'string' && !photo.dataUrl.startsWith('data:')) {
      return photo.dataUrl;
    }
  }
  const token = getGhToken();
  const ext = (photo.mediaType.split('/')[1] || 'jpg').replace('jpeg','jpg');
  const filename = `${String(index).padStart(2,'0')}_${photo.id}.${ext}`;
  const path = `magazine/images/${issueId}/${filename}`;
  const base64 = photo.dataUrl.split(',')[1];

  // 기존 파일 sha 확인 (덮어쓰기 대비)
  let sha = null;
  try {
    const checkRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (checkRes.ok) { const j = await checkRes.json(); sha = j.sha; }
  } catch(e) {}

  const body = { message: `Add magazine image: ${path}`, content: base64 };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.content) throw new Error(json.message || `이미지 업로드 실패: ${filename}`);
  return path; // issue.html에서 상대경로로 참조 (magazine/ 안에서는 ./images/... 가 맞음 → 보정)
}

// magazine/images/... → ./images/... (issue.html은 magazine/ 폴더 안에서 동작)
function toRelativePath(repoPath) {
  return repoPath.replace(/^magazine\//, './');
}

async function publish() {
  const token = getGhToken();
  const apiKey = getApiKey();
  if (!token) { toast('GitHub 토큰을 입력해주세요.'); return; }
  if (!apiKey) { toast('API Key도 입력해두면 다음 글 생성이 편해요. (발행은 토큰만 있어도 가능)'); }

  const id = document.getElementById('fId').value.trim();
  if (!id) { toast('호 ID를 입력해주세요.'); return; }
  if (!pages.length) { toast('페이지를 1개 이상 추가해주세요.'); return; }

  const btn = document.getElementById('publishBtn');
  const statusEl = document.getElementById('publishStatus');
  btn.disabled = true;

  try {
    // 1. issues.json 최신화 (sha 충돌 방지)
    statusEl.textContent = '기존 데이터 확인 중…';
    statusEl.className = 'publish-status';
    await loadIssuesFromGithubSilent();

    // 2. 사진 커밋
    const photoPathMap = {}; // photoId -> relative path
    let coverPath = '';
    let doneCount = 0;
    const totalToCommit = photos.filter(p => !p._existing || (p.dataUrl||'').startsWith('data:')).length;

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (p._existing && !(p.dataUrl||'').startsWith('data:')) {
        photoPathMap[p.id] = toRelativePath(p.dataUrl);
        continue;
      }
      doneCount++;
      statusEl.innerHTML = `<span class="spinner"></span>사진 업로드 중 (${doneCount}/${totalToCommit||photos.length})…`;
      const repoPath = await commitPhoto(p, id, i+1);
      photoPathMap[p.id] = toRelativePath(repoPath);
      if (p.id === coverPhotoId) coverPath = photoPathMap[p.id];
    }
    if (coverPhotoId && !coverPath && photoPathMap[coverPhotoId]) coverPath = photoPathMap[coverPhotoId];

    // 3. 페이지 데이터를 issue.html 스키마로 변환
    const exportedPages = pages.map(pg => {
      const out = { type: pg.type };
      switch (pg.type) {
        case 'cover':
          out.image = pg.imageId ? photoPathMap[pg.imageId] : '';
          out.headline = pg.headline || [];
          out.toc = pg.toc || [];
          break;
        case 'fullbleed':
          out.image = pg.imageId ? photoPathMap[pg.imageId] : '';
          out.caption = pg.caption || '';
          break;
        case 'index':
          out.label = pg.label || '';
          out.items = pg.items || [];
          break;
        case 'split':
          out.image = pg.imageId ? photoPathMap[pg.imageId] : '';
          out.label = pg.label || '';
          out.text = pg.text || '';
          out.darkText = !!pg.darkText;
          break;
        case 'grid':
          out.images = (pg.imageIds || []).filter(Boolean).map(id => photoPathMap[id]).filter(Boolean);
          out.label = pg.label || '';
          out.caption = pg.caption || '';
          break;
        case 'quote':
          out.text = pg.text || '';
          out.context = pg.context || '';
          break;
        case 'closing':
          out.text = pg.text || '';
          out.cta = pg.cta || '';
          break;
      }
      return out;
    });

    const issueData = {
      id,
      number: document.getElementById('fNumber').value.trim(),
      title: document.getElementById('fTitle').value.trim(),
      subtitle: document.getElementById('fSubtitle').value.trim(),
      date: document.getElementById('fDate').value,
      cover: coverPath || '',
      pages: exportedPages,
    };

    // 4. issues 배열 갱신 (같은 id면 교체, 아니면 추가)
    const existingIdx = allIssues.findIndex(x => x.id === id);
    if (existingIdx >= 0) allIssues[existingIdx] = issueData;
    else allIssues.push(issueData);

    // 5. issues.json 커밋
    statusEl.innerHTML = '<span class="spinner"></span>issues.json 저장 중…';
    const jsonStr = JSON.stringify({ issues: allIssues }, null, 2);
    const bytes = new TextEncoder().encode(jsonStr);
    const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    const body = { message: `Publish magazine issue: ${id}`, content: btoa(binStr) };
    if (issuesSha) body.sha = issuesSha;
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ISSUES_FILE}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!json.content) throw new Error(json.message || 'issues.json 저장 실패');
    issuesSha = json.content.sha;

    statusEl.textContent = '발행 완료 ✓';
    statusEl.className = 'publish-status ok';
    currentIssueId = id;
    populateIssueSelect();
    document.getElementById('issueSelect').value = id;
    toast('발행되었습니다. 매거진 보기에서 확인하세요.');
  } catch (e) {
    statusEl.textContent = '발행 실패: ' + e.message;
    statusEl.className = 'publish-status err';
    toast('발행 실패: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// publish() 내부에서 sha 충돌 방지를 위해 재로드 (UI status 갱신 없이)
async function loadIssuesFromGithubSilent() {
  const token = getGhToken();
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ISSUES_FILE}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (res.status === 404) { allIssues = allIssues || []; issuesSha = null; return; }
    const json = await res.json();
    if (!json.sha) return;
    issuesSha = json.sha;
    const b64 = json.content.replace(/\n/g, '');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    // 병합: 새로 불러온 목록 기준, 현재 편집중인 호만 갱신 대상이므로 allIssues 갈아끼움
    const remoteIssues = data.issues || [];
    // 현재 편집 중인 항목은 로컬 값을 유지해야 하므로 단순 교체만 수행 (merge는 publish 본문에서)
    allIssues = remoteIssues;
  } catch (e) { /* 무시 - 로컬 상태로 진행 */ }
}


// ══════════════════════════════════════════════════════════════
// 초기화
// ══════════════════════════════════════════════════════════════
function init() {
  initKeys();
  setupUploadZone();
  renderPhotoGrid();
  renderPageList();
  renderCoverPreview();
  loadIssuesFromGithub();
}
document.addEventListener('DOMContentLoaded', init);
