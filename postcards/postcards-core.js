// ══════════════════════════════════════════════════════════════
// SAPMANRI Postcard Editor — core logic
// 매거진 에디터(editor-core.js)와 동일한 localStorage 키를 공유한다.
// ══════════════════════════════════════════════════════════════

const API_KEY_STORAGE = 'ws_sapmanri_apikey';
const GH_TOKEN_KEY = 'cg_sapmanri_gh_token';
const GITHUB_REPO = 'sapmanri/carousel-generator';
const POSTCARDS_FILE = 'postcards/postcards.json';
const ISSUES_FILE = 'magazine/issues.json';
const IMAGE_CACHE_FILE = 'image_cache.json';

// ── API Key / GitHub Token (editor-core.js와 동일 패턴) ──
function getApiKey() {
  return document.getElementById('apiKeyField').value.trim() || localStorage.getItem(API_KEY_STORAGE) || '';
}
function getGhToken() {
  return document.getElementById('ghTokenField').value.trim() || localStorage.getItem(GH_TOKEN_KEY) || '';
}
function toggleField(fieldId, btnId, storageKey) {
  const field = document.getElementById(fieldId);
  const btn = document.getElementById(btnId);
  if (field.classList.contains('open')) {
    if (field.value.trim()) {
      localStorage.setItem(storageKey, field.value.trim());
      btn.classList.add('ok');
    }
    field.classList.remove('open');
  } else {
    field.value = localStorage.getItem(storageKey) || '';
    field.classList.add('open');
    field.focus();
    if (field.value.trim()) btn.classList.add('ok');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem(API_KEY_STORAGE)) document.getElementById('apiKeyBtn').classList.add('ok');
  if (localStorage.getItem(GH_TOKEN_KEY)) document.getElementById('ghTokenBtn').classList.add('ok');
});

// ── 이미지 분석 캐시 (editor-core.js의 SapmanriCache와 동일 구조/파일, 읽기 전용 접근) ──
const PostcardCache = (function () {
  let _cache = null;
  let _loadPromise = null;

  async function _load() {
    const token = getGhToken();
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${IMAGE_CACHE_FILE}`, {
        headers: token ? { Authorization: `token ${token}` } : {}
      });
      if (!res.ok) { _cache = { entries: {} }; return; }
      const json = await res.json();
      const b64 = (json.content || '').replace(/\n/g, '');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const text = new TextDecoder().decode(bytes);
      _cache = JSON.parse(text);
      if (!_cache.entries) _cache.entries = {};
    } catch (e) {
      _cache = { entries: {} };
    }
  }
  function _ensureLoaded() {
    if (!_loadPromise) _loadPromise = _load();
    return _loadPromise;
  }
  async function get(hash, service) {
    if (!hash || !service) return null;
    await _ensureLoaded();
    const entry = _cache.entries[hash];
    if (!entry || !entry[service]) return null;
    return entry[service].data;
  }
  return { get };
})();

// ══════════════════════════════════════════════════════════════
// 라이브러리 그리드
// ══════════════════════════════════════════════════════════════
let libraryItems = [];
const selectedPaths = new Set();

const LIB_PAGE_SIZE = 60;
let libVisibleCount = LIB_PAGE_SIZE;
let libHideUsed = false;

async function loadLibrary() {
  const grid = document.getElementById('libGrid');
  grid.innerHTML = '<div class="hint" style="grid-column:1/-1"><span class="spinner"></span>불러오는 중…</div>';
  try {
    libraryItems = await window.ImageLibrary.list();
  } catch (e) {
    libraryItems = [];
  }
  libVisibleCount = LIB_PAGE_SIZE;
  renderLibraryGrid();
}

function renderLibraryGrid() {
  const grid = document.getElementById('libGrid');
  if (!libraryItems.length) {
    grid.innerHTML = '<div class="hint" style="grid-column:1/-1">라이브러리에 이미지가 없습니다. (GitHub 토큰을 입력했는지 확인하세요)</div>';
    document.getElementById('libMoreRow').innerHTML = '';
    return;
  }
  const usedHashes = new Set(postcards.map(pc => pc.imageHash));
  let items = libraryItems;
  if (libHideUsed) items = items.filter(it => !usedHashes.has(it.hash));

  const visible = items.slice(0, libVisibleCount);
  grid.innerHTML = visible.map(item => `
    <div class="lib-item ${selectedPaths.has(item.path) ? 'selected' : ''} ${usedHashes.has(item.hash) ? 'used' : ''}" data-path="${item.path}" onclick="toggleLibSelect('${item.path}')">
      <img src="${item.download_url}" loading="lazy" alt="">
      ${usedHashes.has(item.hash) ? '<div class="lib-used-badge">사용됨</div>' : ''}
    </div>
  `).join('');
  updateSelCount();

  const moreRow = document.getElementById('libMoreRow');
  const remaining = items.length - visible.length;
  let html = `<span class="hint">${items.length}장 중 ${visible.length}장 표시</span>`;
  if (remaining > 0) {
    html += ` <button class="btn-ghost" onclick="libVisibleCount += ${LIB_PAGE_SIZE}; renderLibraryGrid()">더 보기 (+${Math.min(LIB_PAGE_SIZE, remaining)})</button>`;
  }
  html += ` <button class="btn-ghost" onclick="libHideUsed = !libHideUsed; libVisibleCount = ${LIB_PAGE_SIZE}; renderLibraryGrid()">${libHideUsed ? '사용된 사진도 보기' : '사용된 사진 숨기기'}</button>`;
  moreRow.innerHTML = html;
}

function toggleLibSelect(path) {
  if (selectedPaths.has(path)) selectedPaths.delete(path);
  else selectedPaths.add(path);
  const el = document.querySelector(`.lib-item[data-path="${path}"]`);
  if (el) el.classList.toggle('selected');
  updateSelCount();
}

function updateSelCount() {
  const n = selectedPaths.size;
  document.getElementById('selCount').textContent = n ? `${n}장 선택됨` : '';
  document.getElementById('addBtn').disabled = n === 0;
}

// ══════════════════════════════════════════════════════════════
// 발행 호 목록 (QR 연결용)
// ══════════════════════════════════════════════════════════════
let allIssues = [];
async function loadIssuesForLinking() {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/${ISSUES_FILE}`, { cache: 'no-store' });
    const data = await res.json();
    allIssues = (data.issues || []).filter(iss => !iss.hidden);
  } catch (e) {
    allIssues = [];
  }
}
function issueOptionsHtml(selectedId) {
  const opts = ['<option value="">(연결 안 함)</option>'];
  for (const iss of allIssues) {
    if (!iss.youtubeUrl) continue; // QR은 유튜브 링크가 있는 호만 의미가 있음
    const sel = iss.id === selectedId ? 'selected' : '';
    opts.push(`<option value="${esc(iss.id)}" ${sel}>${esc(iss.number || iss.id)} · ${esc(iss.title || iss.id)}</option>`);
  }
  return opts.join('');
}

// ══════════════════════════════════════════════════════════════
// 템플릿 목록 (계속 추가될 예정 — id로 postcards-templates.js의 렌더러를 찾음)
// ══════════════════════════════════════════════════════════════
const TEMPLATES = [
  { id: 'expo-01',   label: 'Expo 01 · 전시 포스터' },
  { id: 'mag-01',   label: 'Mag 01 · 잡지형' },
  { id: 'typo-01',  label: 'Typo 01 · 타이포 중심' },
  { id: 'story-01', label: 'Story 01 · 날짜/스토리' },
  { id: 'edit-01',  label: 'Edit 01 · 듀얼 포토' },
];
const BACK_TEMPLATES = [
  { id: 'back-classic',  label: 'Classic · 클래식 구분선' },
  { id: 'back-modern',   label: 'Modern · 미니멀 모던' },
  { id: 'back-centre',   label: 'Centre · 사진+주소' },
  { id: 'back-seal',     label: 'Seal · 씰 스탬프' },
];
function templateOptionsHtml(selectedId) {
  const opts = ['<option value="random">랜덤</option>'];
  for (const t of TEMPLATES) {
    const sel = t.id === selectedId ? 'selected' : '';
    opts.push(`<option value="${t.id}" ${sel}>${esc(t.label)}</option>`);
  }
  return opts.join('');
}
function backTemplateOptionsHtml(selectedId) {
  const opts = ['<option value="random">랜덤</option>'];
  for (const t of BACK_TEMPLATES) {
    const sel = t.id === selectedId ? 'selected' : '';
    opts.push(`<option value="${t.id}" ${sel}>${esc(t.label)}</option>`);
  }
  return opts.join('');
}
function pickBackTemplate(template) {
  if (template && template !== 'random') return template;
  return BACK_TEMPLATES[Math.floor(Math.random() * BACK_TEMPLATES.length)].id;
}
function pickTemplate(template) {
  if (template && template !== 'random') return template;
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)].id;
}

// ══════════════════════════════════════════════════════════════
// 포스트카드 목록 상태
// ══════════════════════════════════════════════════════════════
let postcards = [];
let postcardsSha = null;

// esc() is defined in postcards-templates.js (loaded before this file)

// 선택된 라이브러리 사진들로 포스트카드 항목을 추가하고, 캐시/AI로 라벨·제목을 자동 채운다.
async function addSelectedAsPostcards() {
  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>채우는 중…';
  try {
    for (const path of selectedPaths) {
      const item = libraryItems.find(x => x.path === path);
      if (!item) continue;
      const pc = {
        id: 'pc-' + item.hash + '-' + Math.random().toString(36).slice(2, 6),
        image: '../magazine/images/library/' + item.name,
        imageHash: item.hash,
        label: '',
        title: '',
        number: String(postcards.length + 1).padStart(2, '0'),
        issueId: '',
        template: pickTemplate('random'),
        backTemplate: pickBackTemplate('random'),
      };
      await autoFillFromAnalysis(pc, item);
      postcards.push(pc);
    }
    selectedPaths.clear();
    document.querySelectorAll('.lib-item.selected').forEach(el => el.classList.remove('selected'));
    updateSelCount();
    renderPostcardList();
    renderLibraryGrid();
  } finally {
    btn.disabled = false;
    btn.textContent = '선택한 사진으로 포스트카드 만들기';
  }
}

// 매거진 분석 캐시(magazine/carousel/skyline 순)에서 label/caption을 가져오고,
// 캐시가 전혀 없고 API 키가 있으면 새로 분석한다.
async function autoFillFromAnalysis(pc, item) {
  const hash = item.hash;
  let result = await PostcardCache.get(hash, 'magazine');
  if (!result) result = await PostcardCache.get(hash, 'carousel');
  if (!result) result = await PostcardCache.get(hash, 'skyline');

  if (!result && getApiKey()) {
    try {
      const dataUrl = await window.ImageLibrary.fetchAsDataUrl(item.path);
      result = await analyzeImageForPostcard(dataUrl);
    } catch (e) { /* 분석 실패해도 빈 텍스트로 진행 */ }
  }

  if (result) {
    pc.label = result.suggested_label || '';
    pc.title = result.suggested_caption || result.suggested_label || '';
  }
  if (!pc.title) pc.title = '제목 없음';
}

// 캐시가 없을 때 새로 분석 (magazine 분석과 동일한 스키마 중 필요한 항목만 요청)
async function analyzeImageForPostcard(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const mediaType = dataUrl.match(/data:(image\/\w+)/)[1];
  const key = getApiKey();
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
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `이 이미지를 보고 포스트카드용 짧은 한국어 텍스트를 JSON으로만 반환해줘. 다른 텍스트 없이 JSON만.
{"suggested_label":"소제목 한국어 (4-8자)","suggested_caption":"명조체로 어울리는 한국어 캡션 한 줄 (Vase 문체, 12자 이내)"}` }
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
// 포스트카드 카드 렌더링 (에디터 + 미리보기)
// ══════════════════════════════════════════════════════════════
const PC_PAGE_SIZE = 12;
let pcVisibleCount = PC_PAGE_SIZE;

function renderPostcardList() {
  const list = document.getElementById('pcList');
  document.getElementById('pcCount').textContent = postcards.length ? `${postcards.length}장` : '';
  if (!postcards.length) {
    list.innerHTML = '<div class="hint">위에서 라이브러리 사진을 선택해 포스트카드를 추가하세요.</div>';
    document.getElementById('pcMoreRow').innerHTML = '';
    return;
  }
  // 최근 추가한 순(배열 뒤쪽)부터 보여주되, idx는 실제 postcards 배열 인덱스를 유지해야 onclick 핸들러가 맞게 동작함
  const order = postcards.map((_, i) => i).reverse();
  const visibleOrder = order.slice(0, pcVisibleCount);
  list.innerHTML = visibleOrder.map(idx => {
    const pc = postcards[idx];
    return `
    <div class="pc-card">
      <div class="pc-preview-wrap">
        ${renderPreview(pc, idx)}
      </div>
      <div class="pc-fields">
        <div class="field-row">
          <div class="field"><label>번호</label><input value="${esc(pc.number)}" oninput="postcards[${idx}].number=this.value; refreshPreview(${idx})"></div>
          <div class="field"><label>템플릿 (앞면)</label><select onchange="postcards[${idx}].template=pickTemplate(this.value); refreshPreview(${idx})">${templateOptionsHtml(pc.template)}</select></div>
          <div class="field"><label>템플릿 (뒷면)</label><select onchange="postcards[${idx}].backTemplate=pickBackTemplate(this.value); refreshPreview(${idx})">${backTemplateOptionsHtml(pc.backTemplate||'back-classic')}</select></div>
        </div>
        <div class="field"><label>라벨</label><input value="${esc(pc.label)}" oninput="postcards[${idx}].label=this.value; refreshPreview(${idx})"></div>
        <div class="field"><label>제목</label><input value="${esc(pc.title)}" oninput="postcards[${idx}].title=this.value; refreshPreview(${idx})"></div>
        <div class="field"><label>연결할 호 (QR코드 → 유튜브)</label>
          <select onchange="postcards[${idx}].issueId=this.value; refreshPreview(${idx})">${issueOptionsHtml(pc.issueId)}</select>
        </div>
        <div class="pc-actions">
          <button class="icon-btn" onclick="reAnalyze(${idx})" title="✨ 다시 분석">✨</button>
          <button class="icon-btn" onclick="removePostcard(${idx})" title="삭제">×</button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  const moreRow = document.getElementById('pcMoreRow');
  const remaining = postcards.length - visibleOrder.length;
  moreRow.innerHTML = remaining > 0
    ? `<button class="btn-ghost" onclick="pcVisibleCount += ${PC_PAGE_SIZE}; renderPostcardList()">더 보기 (+${Math.min(PC_PAGE_SIZE, remaining)}, 남은 ${remaining}장)</button>`
    : '';
}

async function removePostcard(idx) {
  postcards.splice(idx, 1);
  renderPostcardList();
  renderLibraryGrid();
  const statusEl = document.getElementById('publishStatus');
  statusEl.innerHTML = '<span class="spinner"></span>삭제 반영 중…';
  await publishPostcards(); // 삭제는 즉시 저장 — 새로고침해도 사라진 상태가 유지되어야 함
}

async function reAnalyze(idx) {
  const pc = postcards[idx];
  const item = libraryItems.find(x => x.hash === pc.imageHash) || { hash: pc.imageHash, path: pc.image.replace('../', '') };
  if (!getApiKey()) { alert('API Key를 입력해야 다시 분석할 수 있어요.'); return; }
  try {
    const dataUrl = await window.ImageLibrary.fetchAsDataUrl(item.path);
    const result = await analyzeImageForPostcard(dataUrl);
    pc.label = result.suggested_label || pc.label;
    pc.title = result.suggested_caption || pc.title;
    renderPostcardList();
  } catch (e) {
    alert('분석 실패: ' + e.message);
  }
}

function issueYoutubeUrl(issueId) {
  const issue = allIssues.find(x => x.id === issueId);
  return issue ? issue.youtubeUrl : '';
}

// 템플릿별 미리보기 HTML (postcards-templates.js의 renderTemplateHtml에 위임)
function renderPreview(pc, idx) {
  const hasQr = !!issueYoutubeUrl(pc.issueId);
  return `
    <div class="pc-preview-pair">
      <div class="pc-preview-side">
        <div class="pc-canvas" id="pcPreviewFront${idx}">${renderTemplateHtml(pc, hasQr, 'front')}</div>
        <div class="hint">앞면</div>
      </div>
      <div class="pc-preview-side">
        <div class="pc-canvas" id="pcPreviewBack${idx}">${renderTemplateHtml(pc, hasQr, 'back')}</div>
        <div class="hint">뒷면</div>
      </div>
    </div>
  `;
}
function refreshPreview(idx) {
  const pc = postcards[idx];
  const hasQr = !!issueYoutubeUrl(pc.issueId);
  const front = document.getElementById('pcPreviewFront' + idx);
  const back = document.getElementById('pcPreviewBack' + idx);
  if (front) front.innerHTML = renderTemplateHtml(pc, hasQr, 'front');
  if (back) back.innerHTML = renderTemplateHtml(pc, hasQr, 'back');
}

// ══════════════════════════════════════════════════════════════
// 저장 (GitHub)
// ══════════════════════════════════════════════════════════════
async function loadPostcardsFromGithub() {
  const token = getGhToken();
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${POSTCARDS_FILE}`, {
      headers: token ? { Authorization: `token ${token}` } : {}
    });
    if (res.status === 404) { postcards = []; postcardsSha = null; return; }
    const json = await res.json();
    if (!json.sha) { postcards = []; postcardsSha = null; return; }
    postcardsSha = json.sha;
    const b64 = json.content.replace(/\n/g, '');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const data = JSON.parse(text);
    postcards = data.postcards || [];
  } catch (e) {
    postcards = []; postcardsSha = null;
  }
}

async function publishPostcards() {
  const token = getGhToken();
  const statusEl = document.getElementById('publishStatus');
  if (!token) { statusEl.textContent = 'GitHub 토큰을 입력해주세요.'; return; }
  statusEl.innerHTML = '<span class="spinner"></span>저장 중…';
  try {
    const jsonStr = JSON.stringify({ postcards }, null, 2);
    const bytes = new TextEncoder().encode(jsonStr);
    const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    const body = { message: 'Update postcards.json', content: btoa(binStr) };
    if (postcardsSha) body.sha = postcardsSha;
    let res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${POSTCARDS_FILE}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let json = await res.json();
    if (!json.content && json.message && /sha/i.test(json.message)) {
      const reload = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${POSTCARDS_FILE}`, {
        headers: { Authorization: `token ${token}` }
      });
      const reloadJson = await reload.json();
      if (reloadJson.sha) {
        body.sha = reloadJson.sha;
        res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${POSTCARDS_FILE}`, {
          method: 'PUT',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        json = await res.json();
      }
    }
    if (!json.content) throw new Error(json.message || 'postcards.json 저장 실패');
    postcardsSha = json.content.sha;
    statusEl.textContent = '저장 완료 (' + new Date().toLocaleTimeString('ko-KR') + ')';
  } catch (e) {
    statusEl.textContent = '오류: ' + e.message;
  }
}

// ══════════════════════════════════════════════════════════════
// 초기화
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadIssuesForLinking(), loadPostcardsFromGithub()]);
  renderPostcardList();
  loadLibrary();
});
