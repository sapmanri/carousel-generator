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
async function analyzeImage(dataUrl, hints) {
  const base64 = dataUrl.split(',')[1];
  const mediaType = dataUrl.match(/data:(image\/\w+)/)[1];
  const key = getApiKey();
  if (!key) throw new Error('API Key가 필요합니다.');
  const hintText = hints ? `\n\n참고로 이 사진은 이전에 다른 도구에서 분석한 적이 있고, 그 결과는 다음과 같아 (참고만 하고 필요하면 다르게 판단해도 됨): subject_position=${hints.subject_position}, overall_brightness=${hints.overall_brightness}, dominant_color=${hints.dominant_color}, mood=${hints.mood}` : '';
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
{"subject_position":"left|center|right|top|bottom|full","overall_brightness":"dark|mid|bright","dominant_color":"#hex","mood":"한 단어 한국어","suggested_caption":"명조체로 어울리는 한국어 캡션 한 줄 (Vase 문체, 12자 이내)","suggested_caption_left":"스프레드용 왼쪽 캡션 (10자 내외)","suggested_caption_right":"스프레드용 오른쪽 캡션 (10자 내외)","suggested_label":"소제목 한국어 (예: 아침의 루틴, 4-8자)","aspect_ratio":"wide|square|tall (이미지의 가로세로 비율 느낌)","best_page_type":"fullbleed|split|grid|quote|spread|botanical 중 이 사진에 가장 어울리는 것. 가로로 넓고 풍경/그룹샷처럼 펼쳐 보여주면 좋은 사진은 spread를 우선 선택할 것. 식물, 꽃, 작은 정물, 디테일 클로즈업처럼 여백 있는 카드형 프레임에 단아하게 어울리는 사진은 botanical을 선택할 것.","focal_x":"이 사진에서 가장 중요한 피사체(인물, 얼굴, 핵심 사물 등)의 가로 위치를 0~100 사이 숫자로 (좌측=0, 중앙=50, 우측=100). 풀블리드로 세로 화면에 꽉 채울 때 이 지점이 잘리지 않도록 기준점이 됨.","focal_y":"같은 피사체의 세로 위치를 0~100 사이 숫자로 (상단=0, 중앙=50, 하단=100).","spread_focal_left":"이 사진을 스프레드(2페이지로 나눠 보여주는 형태)로 쓸 때, 모바일 첫 페이지(왼쪽)에서 보여줄 크롭의 중심을 0~100으로 (기본값 0=이미지 좌측 끝). 핵심 피사체가 이미지 중앙~우측에 있다면 이 값을 높여서 첫 페이지에도 보이게 할 것.","spread_focal_right":"같은 사진을 모바일 둘째 페이지(오른쪽)에서 보여줄 크롭의 중심을 0~100으로 (기본값 100=이미지 우측 끝). 핵심 피사체가 이미지 중앙~좌측에 있다면 이 값을 낮춰서 둘째 페이지에도 보이게 할 것."}${hintText}` }
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

// ══════════════════════════════════════════════════════════════
// 유튜브 영상 정보(제목+자막 일부) 가져오기 — carousel_ai_generator.html과 동일 패턴
// 자동 구성 시 글/캡션/제목/부제 생성에 컨텍스트로 사용한다.
// ══════════════════════════════════════════════════════════════
let videoContext = null; // { title, transcript } | null

function extractVideoId(url) {
  const match = (url || '').match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  return match ? match[1] : null;
}

async function fetchVideoContext(status) {
  videoContext = null;
  const url = (document.getElementById('fYoutubeUrl')?.value || '').trim();
  if (!url) return null;
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  try {
    if (status) status.textContent = '영상 정보 가져오는 중...';

    // 1단계: oEmbed로 영상 제목 취득
    let videoTitle = '';
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) { const d = await oembedRes.json(); videoTitle = d.title || ''; }
    } catch (e) {}
    if (!videoTitle) return null;

    if (status) status.textContent = `"${videoTitle}" — 자막 가져오는 중...`;

    // 2단계: YouTube 자막 가져오기 (CORS 프록시 경유)
    let transcript = '';
    try {
      const proxyBase = 'https://corsproxy.io/?url=';
      const ytPageRes = await fetch(proxyBase + encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`));
      if (ytPageRes.ok) {
        const html = await ytPageRes.text();
        let captionUrl = '';
        const koMatch = html.match(/"baseUrl":"(https:[^"]+timedtext[^"]+)"[^}]{0,200}"languageCode":"ko"/);
        if (koMatch) {
          captionUrl = koMatch[1].replace(/\u0026/g, '&');
        } else {
          const anyMatch = html.match(/"captionTracks":\[{"baseUrl":"([^"]+)"/);
          if (anyMatch) captionUrl = anyMatch[1].replace(/\u0026/g, '&');
        }
        if (captionUrl) {
          const captionRes = await fetch(proxyBase + encodeURIComponent(captionUrl + '&fmt=json3'));
          if (captionRes.ok) {
            const captionData = await captionRes.json();
            transcript = (captionData.events || [])
              .slice(0, 180)
              .map(e => (e.segs || []).map(s => s.utf8 || '').join(''))
              .filter(t => t.trim() && t !== '\n')
              .join(' ')
              .slice(0, 1200);
          }
        }
      }
    } catch (e) {}

    videoContext = { title: videoTitle, transcript };
    return videoContext;
  } catch (e) {
    return null;
  }
}

// 글 생성용 영상 컨텍스트 문자열 (없으면 빈 문자열)
function videoContextText() {
  if (!videoContext) return '';
  let t = `이번 호와 연결된 영상 제목: "${videoContext.title}"`;
  if (videoContext.transcript) t += `\n영상 자막 내용(일부): ${videoContext.transcript}`;
  return t;
}


async function generateIssueTitleSubtitle() {
  const key = getApiKey();
  if (!key) throw new Error('API Key가 필요합니다.');
  const profile = await loadProfile();

  // 페이지에서 텍스트 단서 모으기
  const snippets = [];
  pages.forEach(pg => {
    if (pg.type === 'cover' && pg.headline) snippets.push(pg.headline.join(' '));
    if (pg.caption) snippets.push(pg.caption);
    if (pg.text) snippets.push(pg.text.split('\n').filter(Boolean)[0] || '');
    if (pg.captionLeft) snippets.push(pg.captionLeft);
  });
  const context = snippets.filter(Boolean).slice(0, 8).join(' / ');
  const videoCtx = videoContextText();

  const system = `당신은 한국 크리에이터 Vase Lim(@sapmanri)의 웹매거진 글쓰기 도구입니다.
Vase의 문체 규칙:
${profile.rules.slice(0, 5).map((r,i)=>`${i+1}. ${r}`).join('\n')}

이번 호의 내용 단서: ${context}
${videoCtx ? `\n${videoCtx}\n` : ''}
이 호의 "제목"과 "부제"를 만들어주세요.
- 제목: 명조체로 어울리는 한국어 제목, 8-16자, Vase 문체의 시적인 느낌
- 부제: 장소나 계절감, 영어 또는 한국어 짧은 문구, 6-20자 (예: "Wigong-ri, Gapyeong" 또는 "6월의 느린 오후")

결과는 정확히 이 형식의 JSON만 반환하세요. 다른 텍스트 없이:
{"title":"...","subtitle":"..."}`;

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
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: '제목과 부제를 만들어주세요.' }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content?.[0]?.text || '{}';
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  return JSON.parse(text.slice(s, e + 1));
}

const PAGE_TEXT_INSTRUCTION = {
  fullbleed: `풀블리드 화보 페이지의 캡션을 쓴다. 명조체로 한 줄, 12자 내외, 장면의 핵심을 담는다. 설명하지 말고 보여준다.`,
  split: `2단 사진+글 페이지의 본문을 쓴다. Vase의 인간극장(observer) 톤으로 2-4문단, 한 문장씩 줄바꿈하여 호흡을 살린다. 사진 속 장면에서 시작해 감각적 디테일로 확장한다.`,
  grid: `그리드 콜라주 페이지의 짧은 캡션을 쓴다. 한 문장, 20자 내외. 여러 장면을 압축하는 느낌.`,
  quote: `인용/하이라이트 페이지의 문장을 쓴다. 가장 인상적인 한 문장, 24-40자, 여운이 남는 톤.`,
  spread: `와이드 스프레드 화보의 캡션을 쓴다. 짧은 명조체 한 줄(10자 내외)로, 사진의 왼쪽 절반과 오른쪽 절반에 각각 어울리는 두 개의 짧은 문구를 만든다. 두 줄로 반환하며 첫 줄이 왼쪽, 둘째 줄이 오른쪽 캡션이다.`,
  essay: `사진 없이 글로만 채우는 에세이 페이지를 쓴다. Vase의 인간극장 톤으로 3-5문단, 한 문장씩 줄바꿈하여 호흡을 살린다. 주어진 주제/컨텍스트가 있으면 그것을 중심으로, 없으면 이번 호 전체의 정서를 정리하는 글을 쓴다.{{ESSAY_TITLE_INSTRUCTION}}`,
  dialogue: `짧은 대화나 코멘트 형식의 캡션 3-5개를 만든다. 결과는 한 줄에 하나씩, "화자|내용" 형식으로 반환한다 (화자가 없으면 "|내용"). 예: "빼빼|또 거기 앉아있네" / "|오늘은 유난히 조용한 오후였다"`,
  list: `짧은 리스트형 정보를 만든다 (레시피 재료, 오늘의 할 일, 추천 목록, 이번 호에서 다녀온 곳/만난 것들 등). 결과는 한 줄에 하나씩, "이름|설명" 형식으로 3-6개 반환한다 (설명이 없으면 "이름|"). 주어진 주제/컨텍스트가 있으면 그것에서 자연스럽게 리스트 항목을 떠올려 쓴다. 없으면 이번 호의 정서에 맞는 소소한 목록을 만든다.`,
  milestone: `마일스톤/숫자 강조 페이지의 설명 문구를 쓴다. 1-2문장, Vase 문체로 그 숫자/단어가 의미하는 감정적 맥락을 짧게 담는다.`,
  botanical: `보태니컬(식물/소품) 사진에 어울리는 이탤릭체 캡션 한 줄을 쓴다. 10-16자, 관찰자적이고 담담한 톤.`,
  closing: `클로징 페이지의 마무리 문구를 쓴다. "오늘도 느리게, 잘 보냈습니다" 같은 톤으로 1-2문장.`,
  index: `목차용 소제목들을 쓴다.`,
  cover: `표지 헤드라인을 쓴다. 2줄, 명조체, 영상/이야기의 핵심을 담는다.`,
};

async function generateMagazineText(pageType, photo, extraContext, options) {
  const key = getApiKey();
  if (!key) throw new Error('API Key가 필요합니다.');
  const profile = await loadProfile();
  const typeExamples = profile.examples.slice(-3);

  let instruction = PAGE_TEXT_INSTRUCTION[pageType] || '';
  if (pageType === 'essay') {
    const needsTitle = options && options.needsTitle;
    instruction = instruction.replace('{{ESSAY_TITLE_INSTRUCTION}}',
      needsTitle
        ? ` 결과의 맨 첫 줄에 "라벨|제목" 형식으로 이 글에 어울리는 짧은 라벨(소제목, 4-10자)과 제목(8-16자)을 한 줄로 쓰고, 그 다음 빈 줄을 하나 두고, 이어서 본문을 쓴다.`
        : ''
    );
  }

  let system = `당신은 한국 크리에이터 Vase Lim(@sapmanri)의 웹매거진 글쓰기 도구입니다.
Vase의 문체로 글을 씁니다. 아래 규칙과 예시를 철저히 따르세요.

## 문체 규칙
${profile.rules.map((r, i) => `${i+1}. ${r}`).join('\n')}

## 이번 글 지시
${instruction}

결과는 텍스트만 반환하세요. 따옴표, 설명, 마크다운 기호 없이 순수한 글만 반환합니다.`;

  if (typeExamples.length > 0) {
    system += `\n\n## Vase가 직접 쓴 예시 글 (문체와 어조를 그대로 따르세요)\n`;
    typeExamples.forEach((e, i) => { system += `\n--- 예시 ${i+1} ---\n${e.text}\n`; });
  }

  const videoCtx = videoContextText();
  if (videoCtx) {
    system += `\n\n## 이번 호와 연결된 영상 정보 (분위기/주제 참고용, 직접 인용하지 말고 자연스럽게 녹여낼 것)\n${videoCtx}`;
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
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name || '')) return;

    const isHeic = /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');

    if (isHeic && typeof createImageBitmap === 'function') {
      // HEIC/HEIF는 <img>에서 렌더링 안 되는 브라우저가 많음 → 캔버스로 JPEG 변환
      createImageBitmap(file).then(bitmap => {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        photos.push({
          id: 'p' + (++photoIdSeq),
          dataUrl,
          mediaType: 'image/jpeg',
          name: file.name,
          analysis: null,
        });
        renderPhotoGrid();
      }).catch(() => {
        // 변환 실패 시 원본 그대로 시도 (최후 수단)
        readAsDataUrl(file);
      });
      return;
    }

    readAsDataUrl(file);
  });
}

function readAsDataUrl(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const photo = {
      id: 'p' + (++photoIdSeq),
      dataUrl: reader.result,
      mediaType: file.type || 'image/jpeg',
      name: file.name,
      analysis: null,
    };
    photos.push(photo);
    renderPhotoGrid();
    // 공유 이미지 라이브러리에 비동기 등록 (hash 기반 dedup, 실패해도 진행에 영향 없음)
    if (window.ImageLibrary && window.ImageLibrary.uploadIfNeeded) {
      window.ImageLibrary.uploadIfNeeded(photo.dataUrl, photo.mediaType).catch(() => {});
    }
  };
  reader.readAsDataURL(file);
}

// 공유 이미지 라이브러리에서 사진을 선택해 photos[]에 추가
// 라이브러리 사진은 이미 magazine/images/library/에 존재하므로 발행 시 재업로드 없이 그 경로를 사용한다.
function openMagazineLibraryPicker() {
  if (!window.ImageLibrary) { toast('이미지 라이브러리 모듈을 불러오지 못했습니다.'); return; }
  window.ImageLibrary.openPicker((items) => {
    const list = Array.isArray(items) ? items : [items];
    list.forEach(item => {
      photos.push({
        id: 'p' + (++photoIdSeq),
        dataUrl: item.dataUrl,
        mediaType: item.path.endsWith('.png') ? 'image/png' : 'image/jpeg',
        name: item.hash,
        analysis: null,
        _existing: true,
        _libraryPath: item.path,
      });
    });
    renderPhotoGrid();
  }, { multiple: true, theme: 'dark' });
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
        // 캐러셀/스카이라인 캐시에 있으면 힌트로 활용 (subject_position, brightness, color, mood 일관성)
        let hints = await SapmanriCache.get(hash, 'carousel');
        if (!hints) hints = await SapmanriCache.get(hash, 'skyline');
        result = await analyzeImage(p.dataUrl, hints);
        SapmanriCache.set(hash, 'magazine', result); // 비동기 — 기다리지 않음
        // 겹치는 필드를 carousel/skyline 캐시에도 역으로 채워둠 (있을 때만, 다른 도구 재사용 대비)
        const shared = {
          subject_position: result.subject_position,
          overall_brightness: result.overall_brightness,
          dominant_color: result.dominant_color,
          mood: result.mood,
        };
        if (!await SapmanriCache.get(hash, 'carousel')) {
          SapmanriCache.set(hash, 'carousel', { ...shared, best_text_position: 'bottom_left', text_color: 'white', suggested_copy: result.suggested_caption || '', suggested_body: '' });
        }
        if (!await SapmanriCache.get(hash, 'skyline')) {
          SapmanriCache.set(hash, 'skyline', shared);
        }
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

  // 분석 끝난 사진들로 페이지 구성 + 글까지 자동 생성
  if (pages.length > 0) {
    const ok = confirm('이미 구성된 페이지가 있어요. 자동 구성으로 덮어쓸까요?');
    if (!ok) { setTimeout(() => status.textContent = '', 2000); return; }
  }
  await autoBuildPages(status);
}

// ══════════════════════════════════════════════════════════════
// 분석 결과 기반 자동 페이지 구성 + 글 자동 생성
// ══════════════════════════════════════════════════════════════
async function autoBuildPages(status) {
  status = status || document.getElementById('analyzeStatus');
  if (!photos.length) return;

  // 유튜브 영상 링크가 입력되어 있으면 영상 정보(제목+자막)를 먼저 가져와
  // 이후 글/캡션/제목/부제 생성 시 컨텍스트로 활용한다.
  try {
    await fetchVideoContext(status);
  } catch (e) {}

  const n = photos.length;
  const newPages = [];

  // 1. 표지 — 첫 사진
  const coverPg = PAGE_DEFAULTS.cover();
  coverPg.imageId = photos[0].id;
  newPages.push(coverPg);

  // 표지 사진을 기본 표지 이미지로도 지정 (아직 선택 안 된 경우)
  if (!coverPhotoId) coverPhotoId = photos[0].id;

  // 2. 목차 — 사진이 2장 이상이면 추가
  if (n >= 3) {
    const tocPg = PAGE_DEFAULTS.index();
    newPages.push(tocPg);
  }

  // 3. 나머지 사진들을 분석 결과(best_page_type)에 따라 배치
  const middlePhotos = photos.slice(1);
  let gridBuffer = [];
  let gridTarget = 3 + Math.floor(Math.random() * 4); // 3~6장 랜덤 목표
  let consecutiveFullbleed = 0; // fullbleed/spread 연속 카운트 (둘 다 풀스크린 단일 사진 페이지)
  const MAX_CONSECUTIVE_FULLBLEED = 1; // fullbleed/spread가 연속으로 너무 많이 나오지 않도록 제한

  // 사진 없이 글로만 채우는 페이지(essay/dialogue)를 5~7페이지마다 한 번씩 자연스럽게 끼워넣는다.
  let pagesSinceTextBreak = 0;
  let nextTextBreak = 5 + Math.floor(Math.random() * 3); // 5~7

  function flushGrid(force) {
    if (!gridBuffer.length) return;
    if (gridBuffer.length < 2 && !force) return; // 1장짜리는 보류 (다음 그리드에 합치거나 마지막에 처리)
    if (gridBuffer.length === 1) {
      // 1장만 남으면 그리드 대신 풀블리드로
      const pg = PAGE_DEFAULTS.fullbleed();
      pg.imageId = gridBuffer[0].id;
      const a = gridBuffer[0].analysis;
      if (a && typeof a.focal_x === 'number') pg.focalX = a.focal_x;
      if (a && typeof a.focal_y === 'number') pg.focalY = a.focal_y;
      newPages.push(pg);
    } else {
      const g = PAGE_DEFAULTS.grid();
      g.imageIds = gridBuffer.map(p => p.id);
      newPages.push(g);
    }
    gridBuffer = [];
    gridTarget = 3 + Math.floor(Math.random() * 4);
  }

  function maybeInsertTextBreak() {
    if (newPages.length === lastPageCountAtBreakCheck) return; // 그리드 버퍼링 중이라 새 페이지가 안 생겼으면 스킵
    lastPageCountAtBreakCheck = newPages.length;
    pagesSinceTextBreak++;
    if (pagesSinceTextBreak < nextTextBreak) return;
    flushGrid(true);
    consecutiveFullbleed = 0;
    const types = ['essay', 'dialogue', 'quote', 'list'];
    const type = types[Math.floor(Math.random() * types.length)];
    newPages.push(PAGE_DEFAULTS[type]());
    lastPageCountAtBreakCheck = newPages.length;
    pagesSinceTextBreak = 0;
    nextTextBreak = 5 + Math.floor(Math.random() * 3);
  }
  let lastPageCountAtBreakCheck = newPages.length;

  middlePhotos.forEach((p, i) => {
    let best = (p.analysis && p.analysis.best_page_type) || 'fullbleed';

    // fullbleed/spread(둘 다 사진 1장이 화면을 가득 채우는 형태)가 연속으로 너무 많이 나오면 split/grid로 분산
    if (best === 'fullbleed' || best === 'spread') {
      if (consecutiveFullbleed >= MAX_CONSECUTIVE_FULLBLEED) {
        best = (i % 2 === 0) ? 'split' : 'grid';
      }
    }

    if (best === 'spread') {
      flushGrid(true);
      consecutiveFullbleed++;
      const pg = PAGE_DEFAULTS.spread();
      pg.imageId = p.id;
      pg.captionLeft = (p.analysis && p.analysis.suggested_caption_left) || '';
      pg.captionRight = (p.analysis && p.analysis.suggested_caption_right) || '';
      if (p.analysis && typeof p.analysis.spread_focal_left === 'number') pg.focalXLeft = p.analysis.spread_focal_left;
      if (p.analysis && typeof p.analysis.spread_focal_right === 'number') pg.focalXRight = p.analysis.spread_focal_right;
      newPages.push(pg);
    } else if (best === 'botanical') {
      flushGrid(true);
      consecutiveFullbleed = 0;
      const pg = PAGE_DEFAULTS.botanical();
      pg.imageId = p.id;
      pg.caption = (p.analysis && p.analysis.suggested_caption) || '';
      newPages.push(pg);
    } else if (best === 'grid') {
      consecutiveFullbleed = 0;
      gridBuffer.push(p);
      if (gridBuffer.length >= gridTarget) flushGrid(true);
    } else if (best === 'split') {
      flushGrid(true);
      consecutiveFullbleed = 0;
      const pg = PAGE_DEFAULTS.split();
      pg.imageId = p.id;
      pg.label = (p.analysis && p.analysis.suggested_label) || '';
      pg.darkText = (p.analysis && p.analysis.overall_brightness === 'dark');
      newPages.push(pg);
    } else if (best === 'quote') {
      flushGrid(true);
      consecutiveFullbleed = 0;
      newPages.push(PAGE_DEFAULTS.quote());
    } else {
      // fullbleed
      flushGrid(true);
      consecutiveFullbleed++;
      const pg = PAGE_DEFAULTS.fullbleed();
      pg.imageId = p.id;
      if (p.analysis && typeof p.analysis.focal_x === 'number') pg.focalX = p.analysis.focal_x;
      if (p.analysis && typeof p.analysis.focal_y === 'number') pg.focalY = p.analysis.focal_y;
      newPages.push(pg);
    }

    maybeInsertTextBreak();
  });
  flushGrid(true);

  // 4. 클로징
  newPages.push(PAGE_DEFAULTS.closing());

  pages = newPages;
  renderPageList();

  // 5. 목차 항목 채우기 (각 split/fullbleed 사진의 suggested_label/caption으로)
  const tocPage = pages.find(pg => pg.type === 'index');
  if (tocPage) {
    tocPage.items = middlePhotos
      .map(p => (p.analysis && (p.analysis.suggested_label || p.analysis.suggested_caption)) || '')
      .filter(Boolean)
      .slice(0, 6);
  }

  // 6. 각 페이지 글 자동 생성
  const textPages = pages.filter(pg => ['cover','fullbleed','split','grid','quote','spread','essay','dialogue','list','closing'].includes(pg.type));
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    if (!['cover','fullbleed','split','grid','quote','spread','essay','dialogue','list','closing'].includes(pg.type)) continue;
    status.innerHTML = `<span class="spinner"></span>페이지 글 생성 중 (${textPages.indexOf(pg)+1}/${textPages.length})…`;
    try {
      if (pg.type === 'cover') {
        await genCoverHeadline(i);
      } else if (pg.type === 'essay' || pg.type === 'dialogue' || pg.type === 'quote' || pg.type === 'list') {
        // 사진 없는 텍스트 페이지 — 주변 페이지들의 분위기를 컨텍스트로 전달
        const nearbyMoods = [];
        for (let off = -2; off <= 2; off++) {
          const nb = pages[i + off];
          if (!nb) continue;
          const nbPhoto = photos.find(p => p.id === (nb.imageId || (nb.imageIds && nb.imageIds[0])));
          if (nbPhoto && nbPhoto.analysis) {
            const m = nbPhoto.analysis.mood;
            const c = nbPhoto.analysis.suggested_caption;
            if (m) nearbyMoods.push(m);
            if (c) nearbyMoods.push(c);
          }
        }
        const ctx = nearbyMoods.filter(Boolean).slice(0, 6).join(', ');
        await genPageText(i, ctx ? `주변 페이지들의 분위기: ${ctx}` : undefined);
      } else {
        await genPageText(i);
      }
    } catch (e) {
      // 글 생성 실패해도 구성은 유지, 계속 진행
    }
  }

  renderPageList();
  status.textContent = '자동 구성 완료 ✓';
  setTimeout(() => status.textContent = '', 2500);
  toast('사진 분석과 페이지 구성, 글까지 자동으로 채웠어요. 확인하고 수정해주세요.');
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
  fullbleed: () => ({ type: 'fullbleed', imageId: null, caption: '', focalX: 50, focalY: 50 }),
  index: () => ({ type: 'index', label: 'Contents · 이번 호 이야기', items: [] }),
  split: () => ({ type: 'split', imageId: null, label: '', text: '', darkText: false }),
  grid: () => ({ type: 'grid', imageIds: [], label: '', caption: '' }),
  quote: () => ({ type: 'quote', text: '', context: '' }),
  spread: () => ({ type: 'spread', imageId: null, captionLeft: '', captionRight: '', focalXLeft: 0, focalXRight: 100 }),
  essay: () => ({ type: 'essay', label: '', title: '', text: '', dark: false }),
  dialogue: () => ({ type: 'dialogue', label: '', lines: [{ speaker: '', text: '', side: 'left' }] }),
  list: () => ({ type: 'list', label: '', title: '', items: [{ name: '', desc: '' }] }),
  milestone: () => ({ type: 'milestone', number: '', label: '', text: '' }),
  botanical: () => ({ type: 'botanical', imageId: null, tag: 'Botanical Notes', caption: '' }),
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
  cover: '표지', fullbleed: '풀블리드', index: '목차', split: '2단 split', grid: '그리드', quote: '인용', spread: '스프레드',
  essay: '에세이(글만)', dialogue: '대화형 캡션', list: '리스트', milestone: '마일스톤', botanical: '보태니컬', closing: '클로징'
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

function photoSrc(photoId) {
  const photo = photos.find(p => p.id === photoId);
  return photo ? photo.dataUrl : '';
}

// 풀블리드 초점 위치 미리보기에서 클릭한 좌표를 focalX/focalY(%)로 저장
function setFocalPoint(evt, idx) {
  const rect = evt.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, ((evt.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((evt.clientY - rect.top) / rect.height) * 100));
  pages[idx].focalX = Math.round(x);
  pages[idx].focalY = Math.round(y);
  renderPageList();
}

// 스프레드 모바일 크롭 미리보기를 슬라이더 값에 맞춰 즉시 갱신 (라벨 텍스트도 함께 갱신)
function updateSpreadFocalPreview(idx, side, value) {
  const card = document.querySelectorAll('.page-card')[idx];
  if (!card) return;
  const previews = card.querySelectorAll('.focal-spread-preview img');
  const img = previews[side === 'left' ? 0 : 1];
  if (img) img.style.objectPosition = `${value}% center`;
  const labels = card.querySelectorAll('.field > div[style*="opacity:0.6"]');
  const label = labels[side === 'left' ? 0 : 1];
  if (label) label.textContent = `${side === 'left' ? '왼쪽' : '오른쪽'} 페이지: ${value}`;
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
        <div class="field"><label>초점 위치 (모바일 풀블리드 크롭 기준점 — 클릭해서 지정)</label>
          <div class="focal-picker" style="position:relative;width:160px;aspect-ratio:9/16;border-radius:4px;overflow:hidden;background:#000;cursor:crosshair;"
               onclick="setFocalPoint(event, ${idx})">
            ${pg.imageId ? `<img src="${photoSrc(pg.imageId)}" style="width:100%;height:100%;object-fit:cover;object-position:${pg.focalX ?? 50}% ${pg.focalY ?? 50}%;display:block;pointer-events:none;">` : ''}
            <div style="position:absolute;left:${pg.focalX ?? 50}%;top:${pg.focalY ?? 50}%;width:14px;height:14px;margin:-7px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,0.4);pointer-events:none;"></div>
          </div>
          <div style="font-size:11px;opacity:0.6;margin-top:4px">현재: ${Math.round(pg.focalX ?? 50)}%, ${Math.round(pg.focalY ?? 50)}% — 미리보기는 9:16 비율로 모바일 크롭을 근사함</div>
        </div>
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
          <input placeholder="추가 컨텍스트 (선택)" id="ctx-${idx}">
          <button class="btn-gen" onclick="genPageText(${idx}, document.getElementById('ctx-${idx}').value)">✨ 본문 생성</button>
        </div>
      `;
      break;
    case 'grid':
      {
        const slotCount = Math.max(2, (pg.imageIds || []).length || 3);
        body = `
          <div class="row">
            ${Array.from({length: slotCount}, (_,i) => thumbHtml((pg.imageIds||[])[i], `openPhotoPicker(id=>{ if(!pages[${idx}].imageIds) pages[${idx}].imageIds=[]; pages[${idx}].imageIds[${i}]=id; renderPageList()}, '${(pg.imageIds||[])[i]||''}')`)).join('')}
          </div>
          <div class="row" style="gap:6px">
            ${slotCount < 6 ? `<button class="btn-ghost" onclick="if(!pages[${idx}].imageIds) pages[${idx}].imageIds=[]; pages[${idx}].imageIds.length=${slotCount+1}; renderPageList()">+ 칸 추가</button>` : ''}
            ${slotCount > 2 ? `<button class="btn-ghost" onclick="pages[${idx}].imageIds = (pages[${idx}].imageIds||[]).slice(0,${slotCount-1}); renderPageList()">- 칸 삭제</button>` : ''}
          </div>
          <div class="field"><label>그리드 라벨</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
          <div class="field"><label>캡션</label><input value="${esc(pg.caption||'')}" oninput="pages[${idx}].caption=this.value"></div>
          <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 캡션 생성</button></div>
        `;
      }
      break;
    case 'quote':
      body = `
        <div class="field"><label>인용 문장</label><textarea oninput="pages[${idx}].text=this.value">${esc(pg.text||'')}</textarea></div>
        <div class="field"><label>맥락 (작게 표시)</label><input value="${esc(pg.context||'')}" oninput="pages[${idx}].context=this.value"></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 문장 생성</button></div>
      `;
      break;
    case 'spread':
      body = `
        <div class="row">${thumbHtml(pg.imageId, `openPhotoPicker(id=>{pages[${idx}].imageId=id; renderPageList()}, '${pg.imageId||''}')`)}</div>
        <div class="hint">와이드 사진 1장을 2페이지에 걸쳐 보여줍니다. PC/패드는 한 화면, 모바일은 좌/우로 나눠서 순서대로 표시됩니다.</div>
        <div class="field"><label>모바일 크롭 위치 (좌/우 페이지에서 잘리는 지점을 직접 조정)</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:140px">
              <div class="focal-spread-preview" style="position:relative;width:100%;max-width:160px;aspect-ratio:9/16;border-radius:4px;overflow:hidden;background:#000;">
                ${pg.imageId ? `<img src="${photoSrc(pg.imageId)}" style="position:absolute;inset:0;width:200%;max-width:200%;height:100%;object-fit:cover;object-position:${pg.focalXLeft ?? 0}% center;display:block;">` : ''}
              </div>
              <div style="font-size:11px;opacity:0.6;margin:4px 0">왼쪽 페이지: ${Math.round(pg.focalXLeft ?? 0)}</div>
              <input type="range" min="0" max="100" value="${pg.focalXLeft ?? 0}" style="width:100%"
                oninput="pages[${idx}].focalXLeft=Number(this.value); updateSpreadFocalPreview(${idx},'left',this.value)">
            </div>
            <div style="flex:1;min-width:140px">
              <div class="focal-spread-preview" style="position:relative;width:100%;max-width:160px;aspect-ratio:9/16;border-radius:4px;overflow:hidden;background:#000;">
                ${pg.imageId ? `<img src="${photoSrc(pg.imageId)}" style="position:absolute;inset:0;width:200%;max-width:200%;height:100%;object-fit:cover;object-position:${pg.focalXRight ?? 100}% center;transform:translateX(-50%);display:block;">` : ''}
              </div>
              <div style="font-size:11px;opacity:0.6;margin:4px 0">오른쪽 페이지: ${Math.round(pg.focalXRight ?? 100)}</div>
              <input type="range" min="0" max="100" value="${pg.focalXRight ?? 100}" style="width:100%"
                oninput="pages[${idx}].focalXRight=Number(this.value); updateSpreadFocalPreview(${idx},'right',this.value)">
            </div>
          </div>
          <div style="font-size:11px;opacity:0.5;margin-top:4px">기본값: 왼쪽=0(이미지 좌측), 오른쪽=100(이미지 우측). 중요한 부분이 가운데에 있어 잘릴 때 슬라이더로 조정하세요.</div>
        </div>
        <div class="field"><label>왼쪽 페이지 캡션</label><input value="${esc(pg.captionLeft||'')}" oninput="pages[${idx}].captionLeft=this.value"></div>
        <div class="field"><label>오른쪽 페이지 캡션</label><input value="${esc(pg.captionRight||'')}" oninput="pages[${idx}].captionRight=this.value"></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 캡션 생성</button></div>
      `;
      break;
    case 'essay':
      body = `
        <div class="field"><label>라벨 (소제목)</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
        <div class="field"><label>제목</label><input value="${esc(pg.title||'')}" oninput="pages[${idx}].title=this.value"></div>
        <div class="field"><label>본문</label><textarea style="min-height:160px" oninput="pages[${idx}].text=this.value">${esc(pg.text||'')}</textarea></div>
        <label style="font-size:11px;color:var(--dim);display:flex;gap:6px;align-items:center"><input type="checkbox" ${pg.dark?'checked':''} onchange="pages[${idx}].dark=this.checked"> 다크 배경</label>
        <div class="gen-row">
          <input placeholder="주제/컨텍스트 (선택)" id="ctx-${idx}">
          <button class="btn-gen" onclick="genPageText(${idx}, document.getElementById('ctx-${idx}').value)">✨ 에세이 생성</button>
        </div>
      `;
      break;
    case 'dialogue':
      body = `
        <div class="field"><label>라벨</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
        <div class="hint">짧은 대화/코멘트를 좌우로 번갈아 배치합니다.</div>
        ${(pg.lines||[]).map((l,li) => `
          <div class="row" style="align-items:center">
            <select class="w-fixed" onchange="pages[${idx}].lines[${li}].side=this.value; renderPageList()">
              <option value="left" ${l.side!=='right'?'selected':''}>왼쪽</option>
              <option value="right" ${l.side==='right'?'selected':''}>오른쪽</option>
            </select>
            <input class="w-fixed" placeholder="화자(선택)" value="${esc(l.speaker||'')}" oninput="pages[${idx}].lines[${li}].speaker=this.value">
            <input placeholder="대화/코멘트" value="${esc(l.text||'')}" oninput="pages[${idx}].lines[${li}].text=this.value">
            <button class="icon-btn" onclick="pages[${idx}].lines.splice(${li},1); renderPageList()">×</button>
          </div>
        `).join('')}
        <button class="btn-ghost" onclick="pages[${idx}].lines.push({speaker:'',text:'',side: (pages[${idx}].lines.length%2===0?'left':'right')}); renderPageList()">+ 대화 추가</button>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 대화 생성</button></div>
      `;
      break;
    case 'list':
      body = `
        <div class="field"><label>라벨</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value"></div>
        <div class="field"><label>제목</label><input value="${esc(pg.title||'')}" oninput="pages[${idx}].title=this.value"></div>
        ${(pg.items||[]).map((it,li) => `
          <div class="row" style="align-items:flex-start">
            <input placeholder="항목 이름" value="${esc(it.name||'')}" oninput="pages[${idx}].items[${li}].name=this.value">
            <input style="flex:2" placeholder="설명 (선택)" value="${esc(it.desc||'')}" oninput="pages[${idx}].items[${li}].desc=this.value">
            <button class="icon-btn" onclick="pages[${idx}].items.splice(${li},1); renderPageList()">×</button>
          </div>
        `).join('')}
        <button class="btn-ghost" onclick="pages[${idx}].items.push({name:'',desc:''}); renderPageList()">+ 항목 추가</button>
        <div class="gen-row">
          <input placeholder="주제 (예: 6월의 텃밭 작물)" id="ctx-${idx}">
          <button class="btn-gen" onclick="genPageText(${idx}, document.getElementById('ctx-${idx}').value)">✨ 리스트 생성</button>
        </div>
      `;
      break;
    case 'milestone':
      body = `
        <div class="field"><label>숫자/단어 (크게 표시)</label><input value="${esc(pg.number||'')}" oninput="pages[${idx}].number=this.value" placeholder="예: 3, D-7, 50,000"></div>
        <div class="field"><label>라벨 (작게, 위에 위치)</label><input value="${esc(pg.label||'')}" oninput="pages[${idx}].label=this.value" placeholder="예: SUBSCRIBERS"></div>
        <div class="field"><label>설명 문구</label><textarea oninput="pages[${idx}].text=this.value">${esc(pg.text||'')}</textarea></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 문구 생성</button></div>
      `;
      break;
    case 'botanical':
      body = `
        <div class="row">${thumbHtml(pg.imageId, `openPhotoPicker(id=>{pages[${idx}].imageId=id; renderPageList()}, '${pg.imageId||''}')`)}</div>
        <div class="hint">세이지색 배경의 "잡지 속 잡지" 페이지입니다. 식물/소품 일러스트나 클로즈업 사진에 어울립니다.</div>
        <div class="field"><label>상단 태그</label><input value="${esc(pg.tag||'')}" oninput="pages[${idx}].tag=this.value"></div>
        <div class="field"><label>캡션 (이탤릭, 작게)</label><input value="${esc(pg.caption||'')}" oninput="pages[${idx}].caption=this.value"></div>
        <div class="gen-row"><button class="btn-gen" onclick="genPageText(${idx})">✨ 캡션 생성</button></div>
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
    const needsTitle = pg.type === 'essay' && !(pg.label || '').trim() && !(pg.title || '').trim();
    const text = await generateMagazineText(pg.type, photo, extraContext, { needsTitle });
    if (pg.type === 'fullbleed' || pg.type === 'grid') pg.caption = text;
    else if (pg.type === 'split') pg.text = text;
    else if (pg.type === 'quote' || pg.type === 'closing' || pg.type === 'milestone') pg.text = text;
    else if (pg.type === 'essay') {
      if (needsTitle) {
        const lines = text.split('\n');
        const headerLine = (lines[0] || '').trim();
        const m = headerLine.match(/^(.*?)\|(.*)$/);
        if (m) {
          pg.label = m[1].trim();
          pg.title = m[2].trim();
          // 첫 줄(헤더) + 그 다음 빈 줄을 제거하고 나머지를 본문으로
          let rest = lines.slice(1);
          if (rest[0] !== undefined && rest[0].trim() === '') rest = rest.slice(1);
          pg.text = rest.join('\n').replace(/^\n+/, '');
        } else {
          pg.text = text;
        }
      } else {
        pg.text = text;
      }
    }
    else if (pg.type === 'botanical') pg.caption = text;
    else if (pg.type === 'spread') {
      const lines = text.split('\n').filter(Boolean);
      pg.captionLeft = lines[0] || '';
      pg.captionRight = lines[1] || '';
    } else if (pg.type === 'dialogue') {
      let lines = text.split('\n').filter(Boolean);
      // 첫 줄이 "# 제목" 형식이면 대화 항목이 아닌 라벨로 분리
      if (lines.length && /^#\s+/.test(lines[0].trim())) {
        if (!pg.label) pg.label = lines[0].trim().replace(/^#\s+/, '');
        lines = lines.slice(1);
      }
      pg.lines = lines.map((l, i) => {
        const [speaker, ...rest] = l.split('|');
        const content = rest.length ? rest.join('|') : speaker;
        const hasSpeaker = rest.length > 0 && speaker.trim();
        return { speaker: hasSpeaker ? speaker.trim() : '', text: content.trim(), side: i % 2 === 0 ? 'left' : 'right' };
      }).filter(l => l.text);
    } else if (pg.type === 'list') {
      let lines = text.split('\n').filter(Boolean);
      const parsed = lines.map(l => {
        const [name, ...rest] = l.split('|');
        return { name: (name||'').trim(), desc: rest.join('|').trim() };
      }).filter(it => it.name);
      // 첫 항목이 설명 없이 제목 역할이면 items가 아닌 title로 분리
      if (parsed.length > 1 && !parsed[0].desc) {
        if (!pg.title) pg.title = parsed[0].name;
        pg.items = parsed.slice(1);
      } else {
        pg.items = parsed;
      }
    }
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
    allIssues.map(iss => `<option value="${esc(iss.id)}">${iss.hidden ? '🙈 ' : ''}${esc(iss.number || iss.id)} · ${esc(iss.title || '')}</option>`).join('');
  updateIssueActionButtons();
}

function updateIssueActionButtons() {
  const id = document.getElementById('issueSelect').value;
  const issue = allIssues.find(x => x.id === id);
  const hideBtn = document.getElementById('hideIssueBtn');
  const delBtn = document.getElementById('deleteIssueBtn');
  if (!issue) {
    hideBtn.style.display = 'none';
    delBtn.style.display = 'none';
    return;
  }
  hideBtn.style.display = '';
  delBtn.style.display = '';
  hideBtn.textContent = issue.hidden ? '숨김 해제' : '숨김';
}

let suppressIssueSelectChange = false;
function onIssueSelect() {
  if (suppressIssueSelectChange) return;
  const id = document.getElementById('issueSelect').value;
  if (id === '__new__') {
    currentIssueId = null;
    clearForm();
    updateIssueActionButtons();
    return;
  }
  const issue = allIssues.find(x => x.id === id);
  if (!issue) return;
  currentIssueId = id;
  loadIssueIntoForm(issue);
  updateIssueActionButtons();
}

function clearForm() {
  document.getElementById('fId').value = '';
  document.getElementById('fNumber').value = '';
  document.getElementById('fTitle').value = '';
  document.getElementById('fSubtitle').value = '';
  document.getElementById('fDate').value = '';
  document.getElementById('fYoutubeUrl').value = '';
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
  document.getElementById('fYoutubeUrl').value = issue.youtubeUrl || '';

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

// 사진을 공유 이미지 라이브러리(magazine/images/library/<hash>.<ext>)에 커밋.
// 같은 사진(같은 해시)이 이미 라이브러리에 있으면 업로드 없이 그 경로를 재사용한다.
// ImageLibrary.uploadIfNeeded에 위임 (carousel/skyline과 로직 통일).
async function commitPhoto(photo, issueId, index) {
  // 라이브러리 피커로 선택된 사진은 이미 라이브러리 경로를 알고 있으므로 그대로 사용
  if (photo._libraryPath) {
    return photo._libraryPath;
  }

  // 기존(_existing) 사진이고 이미 경로(데이터URL 아님)면 그대로 사용
  if (photo._existing && typeof photo.dataUrl === 'string' && !photo.dataUrl.startsWith('data:')) {
    return photo.dataUrl;
  }

  const result = await window.ImageLibrary.uploadIfNeeded(photo.dataUrl, photo.mediaType);
  return result.path;
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
    // 0. 제목/부제가 비어있으면 자동 생성
    const titleField = document.getElementById('fTitle');
    const subtitleField = document.getElementById('fSubtitle');
    if (!titleField.value.trim() || !subtitleField.value.trim()) {
      statusEl.innerHTML = '<span class="spinner"></span>제목/부제 생성 중…';
      statusEl.className = 'publish-status';
      try {
        if (!videoContext) { try { await fetchVideoContext(); } catch (e) {} }
        const generated = await generateIssueTitleSubtitle();
        if (!titleField.value.trim() && generated.title) titleField.value = generated.title;
        if (!subtitleField.value.trim() && generated.subtitle) subtitleField.value = generated.subtitle;
      } catch (e) {
        // 생성 실패해도 발행은 계속 진행
      }
    }

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
      // 업로드 완료된 사진은 기존(existing) 상태로 전환 → 다음 발행 시 재업로드 방지
      p._existing = true;
      p.dataUrl = photoPathMap[p.id];
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
          if (typeof pg.focalX === 'number') out.focalX = pg.focalX;
          if (typeof pg.focalY === 'number') out.focalY = pg.focalY;
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
        case 'spread':
          out.image = pg.imageId ? photoPathMap[pg.imageId] : '';
          out.captionLeft = pg.captionLeft || '';
          out.captionRight = pg.captionRight || '';
          if (typeof pg.focalXLeft === 'number') out.focalXLeft = pg.focalXLeft;
          if (typeof pg.focalXRight === 'number') out.focalXRight = pg.focalXRight;
          break;
        case 'essay':
          out.label = pg.label || '';
          out.title = pg.title || '';
          out.text = pg.text || '';
          out.dark = !!pg.dark;
          break;
        case 'dialogue':
          out.label = pg.label || '';
          out.lines = (pg.lines || []).filter(l => l.text);
          break;
        case 'list':
          out.label = pg.label || '';
          out.title = pg.title || '';
          out.items = (pg.items || []).filter(it => it.name);
          break;
        case 'milestone':
          out.number = pg.number || '';
          out.label = pg.label || '';
          out.text = pg.text || '';
          break;
        case 'botanical':
          out.image = pg.imageId ? photoPathMap[pg.imageId] : '';
          out.tag = pg.tag || '';
          out.caption = pg.caption || '';
          break;
        case 'closing':
          out.text = pg.text || '';
          out.cta = pg.cta || '';
          break;
      }
      return out;
    });

    const existingIssue = allIssues.find(x => x.id === id);
    const issueData = {
      id,
      number: document.getElementById('fNumber').value.trim(),
      title: document.getElementById('fTitle').value.trim(),
      subtitle: document.getElementById('fSubtitle').value.trim(),
      date: document.getElementById('fDate').value,
      youtubeUrl: document.getElementById('fYoutubeUrl').value.trim(),
      cover: coverPath || '',
      pages: exportedPages,
    };
    if (existingIssue && existingIssue.hidden) issueData.hidden = true;

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
    suppressIssueSelectChange = true;
    populateIssueSelect();
    document.getElementById('issueSelect').value = id;
    suppressIssueSelectChange = false;
    renderPhotoGrid();
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
// allIssues를 issues.json으로 커밋한다. sha 충돌 시 1회 재로드 후 재시도.
async function saveIssuesJson(message) {
  const token = getGhToken();
  if (!token) throw new Error('GitHub 토큰을 입력해주세요.');
  const jsonStr = JSON.stringify({ issues: allIssues }, null, 2);
  const bytes = new TextEncoder().encode(jsonStr);
  const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  const body = { message, content: btoa(binStr) };
  if (issuesSha) body.sha = issuesSha;
  let res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ISSUES_FILE}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = await res.json();
  if (!json.content && json.message && /sha/i.test(json.message)) {
    // sha 충돌 — 최신 sha로 재시도
    const reload = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ISSUES_FILE}`, {
      headers: { Authorization: `token ${token}` }
    });
    const reloadJson = await reload.json();
    if (reloadJson.sha) {
      body.sha = reloadJson.sha;
      res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ISSUES_FILE}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      json = await res.json();
    }
  }
  if (!json.content) throw new Error(json.message || 'issues.json 저장 실패');
  issuesSha = json.content.sha;
}

// 선택된 호의 숨김 상태를 토글한다. 숨김 처리된 호는 magazine/index.html 목록에서 제외되지만
// issue.html 직접 링크로는 계속 접근 가능하다(비공개 보관용).
async function toggleHideIssue() {
  const id = document.getElementById('issueSelect').value;
  const issue = allIssues.find(x => x.id === id);
  if (!issue) return;
  const nextHidden = !issue.hidden;
  const label = nextHidden ? '숨김 처리' : '숨김 해제';
  if (!confirm(`"${issue.title || issue.id}" 호를 ${label}하시겠어요?`)) return;

  issue.hidden = nextHidden;
  const statusEl = document.getElementById('ghLoadStatus');
  statusEl.textContent = `${label} 중…`;
  try {
    await saveIssuesJson(`${nextHidden ? 'Hide' : 'Unhide'} magazine issue: ${id}`);
    statusEl.textContent = `${label} 완료 ✓`;
    populateIssueSelect();
    suppressIssueSelectChange = true;
    document.getElementById('issueSelect').value = id;
    suppressIssueSelectChange = false;
    updateIssueActionButtons();
    toast(`${label}되었습니다.`);
  } catch (e) {
    issue.hidden = !nextHidden; // 롤백
    statusEl.textContent = '실패: ' + e.message;
    toast('실패: ' + e.message);
  }
}

// 선택된 호를 issues.json에서 완전히 삭제한다. (라이브러리 이미지는 공유 자원이므로 삭제하지 않음)
async function deleteIssue() {
  const id = document.getElementById('issueSelect').value;
  const issue = allIssues.find(x => x.id === id);
  if (!issue) return;
  const confirmText = `"${issue.title || issue.id}" (${issue.id}) 호를 영구적으로 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠어요?`;
  if (!confirm(confirmText)) return;
  // 2차 확인
  if (!confirm('정말로 삭제할까요? issues.json에서 완전히 제거됩니다.')) return;

  const statusEl = document.getElementById('ghLoadStatus');
  statusEl.textContent = '삭제 중…';
  const backup = allIssues.slice();
  allIssues = allIssues.filter(x => x.id !== id);
  try {
    await saveIssuesJson(`Delete magazine issue: ${id}`);
    statusEl.textContent = '삭제 완료 ✓';
    if (currentIssueId === id) {
      currentIssueId = null;
      clearForm();
    }
    suppressIssueSelectChange = true;
    populateIssueSelect();
    document.getElementById('issueSelect').value = '__new__';
    suppressIssueSelectChange = false;
    updateIssueActionButtons();
    toast('삭제되었습니다.');
  } catch (e) {
    allIssues = backup; // 롤백
    statusEl.textContent = '실패: ' + e.message;
    toast('실패: ' + e.message);
  }
}


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
