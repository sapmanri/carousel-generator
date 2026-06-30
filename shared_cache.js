// ══════════════════════════════════════════════════════════════
// SharedCache — image_cache.json 단일 표준 모듈
//
// 표준: flat 구조(B). entries[hash] = { caption, mood, r2_url, ... } (서비스 구분 없음)
// library.html이 실질적으로 만들어온 구조를 그대로 표준으로 채택했다.
// 과거 SapmanriCache(A구조, entries[hash][service].data)는 폐기 대상이며
// getLegacy/setLegacy는 전환기에만 쓰는 임시 호환 wrapper다 — 최종 목표는
// 모든 호출부가 get/set(서비스 구분 없음)으로 교체되는 것.
//
// 기존 image_cache.json 데이터는 이미 flat이므로 마이그레이션 불필요.
// ══════════════════════════════════════════════════════════════
(function (global) {
  const REPO = 'sapmanri/carousel-generator';
  const FILE = 'image_cache.json';
  const TOKEN_KEY = 'cg_sapmanri_gh_token'; // 5개 파일 전체에서 동일하게 쓰이는 키 (확인됨)
  const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/${FILE}`;
  const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

  // ── 토큰 ──────────────────────────────────────────────────────
  function getToken() {
    try {
      if (global.SapConfig?.getGithubToken) {
        const v = global.SapConfig.getGithubToken();
        if (v) return v;
      }
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) { return ''; }
  }
  function setToken(val) {
    try {
      if (global.SapConfig?.set) global.SapConfig.set('github', val);
      localStorage.setItem(TOKEN_KEY, val);
    } catch (e) {}
  }
  function isEnabled() { return !!getToken(); }

  // ── 해시 (library.html / image-library.js / editor-core.js 전부 동일 알고리즘) ──
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

  function decodeGithubContent(content) {
    const b64 = content.replace(/\n/g, '');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function encodeGithubContent(str) {
    const bytes = new TextEncoder().encode(str);
    const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return btoa(binStr);
  }

  // ── 인증된 로드 (쓰기 작업 전 SHA 확보용) ─────────────────────
  async function loadCacheRaw(token) {
    try {
      const res = await fetch(API_URL, { headers: { Authorization: `token ${token}` }, cache: 'no-store' });
      if (!res.ok) return { cache: { entries: {} }, sha: null };
      const json = await res.json();
      const cache = JSON.parse(decodeGithubContent(json.content));
      cache.entries = cache.entries || {};
      return { cache, sha: json.sha };
    } catch (e) {
      return { cache: { entries: {} }, sha: null };
    }
  }

  // ── 읽기 전용 단건 조회 (토큰 없어도 동작, 정적 raw fetch) ────
  // 분석 여부 확인 등 읽기만 필요한 곳에서 사용. 매번 전체 파일을 받으므로
  // 여러 장을 조회할 땐 getAll()로 한 번만 받아서 재사용할 것.
  let _readCache = null;
  let _readPromise = null;
  async function getAll(forceRefresh) {
    if (_readCache && !forceRefresh) return _readCache;
    if (_readPromise && !forceRefresh) return _readPromise;
    _readPromise = (async () => {
      try {
        const res = await fetch(`${RAW_URL}?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return { entries: {} };
        const data = await res.json();
        _readCache = { entries: data.entries || {} };
        return _readCache;
      } catch (e) {
        return { entries: {} };
      }
    })();
    return _readPromise;
  }
  async function get(hash) {
    if (!hash) return null;
    const all = await getAll();
    return all.entries[hash] || null;
  }

  // ── 백업 (fire-and-forget, 실패해도 본 저장은 막지 않음) ──────
  async function backupCache(token, jsonStr) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const nonce = Math.random().toString(36).slice(2, 8);
    const key = `backups/image_cache_${ts}_${nonce}.json`;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${key}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Backup: ${ts}`, content: encodeGithubContent(jsonStr) })
      });
      return res.ok;
    } catch (e) { return false; }
  }

  // ── 저장 primitive — 이미 merge된 cache를 그대로 PUT만 시도 ──
  async function _putCache(cache, sha, token, message) {
    const jsonStr = JSON.stringify(cache, null, 2);
    try { await backupCache(token, jsonStr); } catch (e) {}
    const body = { message: message || 'Update image_cache', content: encodeGithubContent(jsonStr) };
    if (sha) body.sha = sha;
    const res = await fetch(API_URL, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`image_cache.json 저장 실패: ${res.status} ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    _readCache = null; // 다음 읽기에서 최신 반영되도록 캐시 무효화
    return true;
  }

  // ── 409 재시도 포함 저장 ────────────────────────────────────
  // applyFn(cache)는 cache.entries를 직접 mutate하는 함수 — 매 시도마다 "최신" cache에
  // 다시 적용해야 하므로(이전에 merge해둔 cache 객체를 재사용하면 안 됨), 데이터가 아니라
  // 함수를 받는다.
  // 흐름: load(SHA 포함) → applyFn으로 merge → PUT → 409면 재로드 후 applyFn 다시 적용 → 재시도.
  // 최대 3회(최초 1회 + 재시도 2회) 시도하고, 그래도 실패하면 에러를 그대로 던진다 —
  // 호출부(예: library.html saveToCache catch 블록)가 analysis_status: 'save_failed' 등으로
  // 기록하도록 한다.
  const MAX_ATTEMPTS = 3;
  async function _saveWithRetry(applyFn, message) {
    const token = getToken();
    if (!token) throw new Error('GitHub 토큰이 필요합니다.');
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { cache, sha } = await loadCacheRaw(token);
      const beforeCount = Object.keys(cache.entries).length;
      applyFn(cache);
      const afterCount = Object.keys(cache.entries).length;
      if (afterCount < beforeCount) {
        throw new Error(`저장 중단: entry 수 감소 감지 (${beforeCount} → ${afterCount})`);
      }
      try {
        return await _putCache(cache, sha, token, message);
      } catch (e) {
        lastErr = e;
        const isConflict = e.status === 409 || /\b409\b/.test(e.message);
        if (isConflict && attempt < MAX_ATTEMPTS) {
          console.warn(`[SharedCache] 409 충돌, 재시도 ${attempt}/${MAX_ATTEMPTS - 1}`);
          continue; // 다음 루프에서 최신 SHA로 다시 로드 + merge + PUT
        }
        throw lastErr;
      }
    }
    throw lastErr;
  }

  // ── 단건 병합 저장 (기존 필드 보존, 새 필드만 덮어씀) ─────────
  // 여러 장을 한꺼번에 처리할 때는 호출마다 충돌 가능성이 커지므로
  // 가능하면 setBatch()로 묶어서 한 번에 저장할 것 — set()은 단발성 변경(재분석 1장,
  // 삭제 등)에만 쓴다.
  async function set(hash, data, message) {
    if (!hash || !data) return false;
    return _saveWithRetry((cache) => {
      cache.entries[hash] = { ...(cache.entries[hash] || {}), ...data };
    }, message || `Update ${hash}`);
  }

  // ── 배치 병합 저장 — 여러 장 분석/업로드 시 우선 사용할 것 ────
  async function setBatch(updates, message) {
    if (!updates || !updates.length) return true;
    return _saveWithRetry((cache) => {
      updates.forEach(([hash, data]) => {
        if (!hash || !data) return;
        cache.entries[hash] = { ...(cache.entries[hash] || {}), ...data };
      });
    }, message || `Batch update ${updates.length} entries`);
  }

  // ── 하위호환 wrapper (A구조 호출부 — 임시. 전환 완료되는 대로 삭제 예정) ──
  // service 인자는 무시하고 flat get/set으로 위임한다.
  async function getLegacy(hash, service) { return get(hash); }
  async function setLegacy(hash, service, data) { return set(hash, data); }

  global.SharedCache = {
    hashImage, get, getAll, set, setBatch,
    loadCacheRaw, backupCache, decodeGithubContent, encodeGithubContent,
    isEnabled, getToken, setToken,
    getLegacy, setLegacy, // 임시 — 전환 완료 후 제거 예정
  };
})(window);
