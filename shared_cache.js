// ══════════════════════════════════════════════════════════════
// SharedCache — image_cache.json 단일 표준 모듈
//
// 표준: flat 구조(B). entries[hash] = { caption, mood, r2_url, ... } (서비스 구분 없음)
//
// 2026-06-30 R2 전환: GitHub Contents API의 1MB 응답 한계로 인한 침묵 실패
// 문제 때문에, 기본 저장소를 R2(SharedStorage)로 전환한다.
//
//   - 기본값: R2 사용 (cache/index.json + cache/images/<hash>.json)
//   - 읽기(get/getAll): R2 실패 시 GitHub로 자동 fallback (조용히 동작 유지)
//   - 쓰기(set/setBatch): R2 실패 시 GitHub에 절대 쓰지 않는다. 에러만 던진다.
//     (GitHub 원본은 안정화 검증 전까지 손대지 않는다는 원칙 유지)
//   - GitHub 기반 구현(_github.*)은 당분간 fallback/비상용으로 코드에 남겨둔다.
//
// 호출부(library.html 등)는 이 파일의 공개 API(get/getAll/set/setBatch/...)가
// 바뀌지 않았으므로 아무것도 수정할 필요 없다.
// ══════════════════════════════════════════════════════════════
(function (global) {
  const REPO = 'sapmanri/carousel-generator';
  const FILE = 'image_cache.json';
  const TOKEN_KEY = 'cg_sapmanri_gh_token'; // 5개 파일 전체에서 동일하게 쓰이는 키 (확인됨)
  const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/${FILE}`;
  const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const BACKEND_KEY = 'cg_cache_backend'; // 'r2' | 'github' — 디버그/비상 전환용, localStorage

  // ── 백엔드 선택 ──────────────────────────────────────────────
  // 기본값 R2. SharedStorage가 로드 안 됐거나 R2 자격증명이 없으면 자동으로 github.
  // 수동 강제 전환: localStorage.setItem('cg_cache_backend', 'github')
  function backend() {
    try {
      const forced = localStorage.getItem(BACKEND_KEY);
      if (forced === 'github') return 'github';
    } catch (e) {}
    if (global.SharedStorage && global.SharedStorage.hasR2 && global.SharedStorage.hasR2()) return 'r2';
    return 'github';
  }
  function setBackend(name) {
    try { localStorage.setItem(BACKEND_KEY, name === 'github' ? 'github' : 'r2'); } catch (e) {}
  }

  // ── 토큰 (GitHub fallback/비상 경로용으로 계속 필요) ───────────
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

  // ── 해시 (library.html / image-library.js / editor-core.js / shared_storage.js 전부 동일 알고리즘) ──
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

  // ══════════════════════════════════════════════════════════════
  // _github — 기존 GitHub Contents API 구현. 그대로 보존 (fallback 전용).
  // ══════════════════════════════════════════════════════════════
  const _github = {};

  _github.loadCacheRaw = async function (token) {
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
  };

  let _readCache = null;
  let _readPromise = null;
  _github.getAll = async function (forceRefresh) {
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
  };
  _github.get = async function (hash) {
    if (!hash) return null;
    const all = await _github.getAll();
    return all.entries[hash] || null;
  };

  _github.backupCache = async function (token, jsonStr) {
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
  };

  _github._putCache = async function (cache, sha, token, message) {
    const jsonStr = JSON.stringify(cache, null, 2);
    try { await _github.backupCache(token, jsonStr); } catch (e) {}
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
    _readCache = null;
    return true;
  };

  const MAX_ATTEMPTS = 3;
  _github._saveWithRetry = async function (applyFn, message) {
    const token = getToken();
    if (!token) throw new Error('GitHub 토큰이 필요합니다.');
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { cache, sha } = await _github.loadCacheRaw(token);
      const beforeCount = Object.keys(cache.entries).length;
      applyFn(cache);
      const afterCount = Object.keys(cache.entries).length;
      if (afterCount < beforeCount) {
        throw new Error(`저장 중단: entry 수 감소 감지 (${beforeCount} → ${afterCount})`);
      }
      try {
        return await _github._putCache(cache, sha, token, message);
      } catch (e) {
        lastErr = e;
        const isConflict = e.status === 409 || /\b409\b/.test(e.message);
        if (isConflict && attempt < MAX_ATTEMPTS) {
          console.warn(`[SharedCache:github] 409 충돌, 재시도 ${attempt}/${MAX_ATTEMPTS - 1}`);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr;
  };
  _github.set = async function (hash, data, message) {
    if (!hash || !data) return false;
    return _github._saveWithRetry((cache) => {
      cache.entries[hash] = { ...(cache.entries[hash] || {}), ...data };
    }, message || `Update ${hash}`);
  };
  _github.setBatch = async function (updates, message) {
    if (!updates || !updates.length) return true;
    return _github._saveWithRetry((cache) => {
      updates.forEach(([hash, data]) => {
        if (!hash || !data) return;
        cache.entries[hash] = { ...(cache.entries[hash] || {}), ...data };
      });
    }, message || `Batch update ${updates.length} entries`);
  };

  // ══════════════════════════════════════════════════════════════
  // _r2 — SharedStorage(R2) 기반 구현. 기본 경로.
  // ══════════════════════════════════════════════════════════════
  const _r2 = {};

  function requireSharedStorage() {
    if (!global.SharedStorage) {
      throw new Error('shared_storage.js가 로드되지 않았습니다 (R2 경로 사용 불가).');
    }
  }

  // index.json에 들어가는 가벼운 필드만 추출 (마이그레이션 도구와 동일 스키마)
  function buildIndexFields(entry) {
    return {
      thumbnail_url: entry.thumbnail_url,
      r2_url: entry.r2_url,
      filename: entry.filename,
      uploaded_at: entry.uploaded_at,
      analyzed_at: entry.analyzed_at,
      analysis_status: entry.analysis_status || (entry.mood ? 'ok' : 'pending'),
      mood: entry.mood,
      suggested_caption: entry.suggested_caption,
      season: entry.season,
      time_of_day: entry.time_of_day,
      deleted: entry.deleted || false,
    };
  }

  _r2.get = async function (hash) {
    requireSharedStorage();
    if (!hash) return null;
    return await global.SharedStorage.getImage(hash);
  };

  // getAll()은 index.json으로 해시 목록을 받은 뒤, 각 사진의 전체 데이터를
  // cache/images/<hash>.json에서 병렬로 받아 합친다 (기존 getAll()이 "전체 필드"를
  // 반환하던 동작과 호환 유지용 — 추후 library.html이 index만으로 그리드를 그리고
  // 상세보기에서 lazy fetch하도록 바뀌면 이 함수의 역할은 줄어들 예정. 그 전까지는
  // 이 호환 동작을 유지한다).
  _r2.getAll = async function () {
    requireSharedStorage();
    const { entries: indexEntries } = await global.SharedStorage.getIndex();
    const hashes = Object.keys(indexEntries);
    const entries = {};
    await Promise.all(hashes.map(async (hash) => {
      try {
        const full = await global.SharedStorage.getImage(hash);
        entries[hash] = full || indexEntries[hash];
      } catch (e) {
        entries[hash] = indexEntries[hash]; // 개별 실패 시 index의 가벼운 필드라도 사용
      }
    }));
    return { entries };
  };

  _r2.set = async function (hash, data) {
    requireSharedStorage();
    if (!hash || !data) return false;
    const existing = await global.SharedStorage.getImage(hash).catch(() => null);
    const merged = { ...(existing || {}), ...data };
    await global.SharedStorage.setImage(hash, merged); // 실패 시 그대로 throw (조건 3)
    await global.SharedStorage.setIndexEntry(hash, buildIndexFields(merged));
    return true;
  };

  _r2.setBatch = async function (updates) {
    requireSharedStorage();
    if (!updates || !updates.length) return true;
    const indexUpdates = [];
    for (const [hash, data] of updates) {
      if (!hash || !data) continue;
      const existing = await global.SharedStorage.getImage(hash).catch(() => null);
      const merged = { ...(existing || {}), ...data };
      await global.SharedStorage.setImage(hash, merged); // 실패 시 즉시 throw, 이후 항목 중단 (조건 3)
      indexUpdates.push([hash, buildIndexFields(merged)]);
    }
    await global.SharedStorage.setIndexBatch(indexUpdates);
    return true;
  };

  // ══════════════════════════════════════════════════════════════
  // 공개 API — backend()에 따라 R2/GitHub로 분기
  //   읽기: R2 실패 시 GitHub로 자동 fallback, 콘솔에 경고만 남김
  //   쓰기: R2 실패 시 GitHub로 fallback하지 않음 — 에러를 그대로 던진다
  // ══════════════════════════════════════════════════════════════
  async function get(hash) {
    if (backend() === 'r2') {
      try {
        const v = await _r2.get(hash);
        if (v) return v;
        // R2에 없으면(아직 미마이그레이션 등) GitHub에서 한 번 더 확인 — 읽기는 안전하므로 fallback 허용
        return await _github.get(hash);
      } catch (e) {
        console.error('[SharedCache] R2 get 실패, GitHub로 fallback:', e.message);
        return await _github.get(hash);
      }
    }
    return await _github.get(hash);
  }

  async function getAll(forceRefresh) {
    if (backend() === 'r2') {
      try {
        return await _r2.getAll();
      } catch (e) {
        console.error('[SharedCache] R2 getAll 실패, GitHub로 fallback:', e.message);
        return await _github.getAll(forceRefresh);
      }
    }
    return await _github.getAll(forceRefresh);
  }

  async function set(hash, data, message) {
    if (backend() === 'r2') {
      // 조건 3: R2 실패 시 GitHub는 절대 건드리지 않는다 — 에러만 표시(throw)하고 끝낸다.
      return await _r2.set(hash, data);
    }
    return await _github.set(hash, data, message);
  }

  async function setBatch(updates, message) {
    if (backend() === 'r2') {
      return await _r2.setBatch(updates);
    }
    return await _github.setBatch(updates, message);
  }

  // ── 하위호환 wrapper (A구조 호출부 — 임시. 전환 완료되는 대로 삭제 예정) ──
  async function getLegacy(hash, service) { return get(hash); }
  async function setLegacy(hash, service, data) { return set(hash, data); }

  global.SharedCache = {
    hashImage, get, getAll, set, setBatch,
    // GitHub 직접 접근이 필요한 비상/디버그용 (예: 마이그레이션 도구, 수동 점검)
    loadCacheRaw: _github.loadCacheRaw, backupCache: _github.backupCache,
    decodeGithubContent, encodeGithubContent,
    isEnabled, getToken, setToken,
    backend, setBackend, // 디버그: 현재 어느 백엔드를 쓰는지 확인/강제 전환
    getLegacy, setLegacy, // 임시 — 전환 완료 후 제거 예정
  };
})(window);
