// ══════════════════════════════════════════════════════════════
// SharedStorage — R2 기반 분리형 캐시 저장소
//
// 배경: GitHub Contents API의 1MB 응답 제한 때문에 image_cache.json이
// 커지면서 읽기/쓰기가 조용히 실패하는 문제가 발생했다 (2026-06-30 발견).
// 이미 R2를 이미지 저장에 쓰고 있으므로, 분석 데이터도 R2로 옮기되
// 사진 1장당 키 하나로 쪼개서 1MB 제한 자체를 구조적으로 피한다.
//
// 키 구조:
//   cache/index.json              ← 전체 목록, 가벼운 필드만 (그리드/검색/필터용)
//   cache/images/<hash>.json      ← 사진 1장의 전체 분석 데이터
//   cache/backups/index_<ts>.json ← index.json 쓰기 전 자동 백업
//
// 읽기는 R2 공개 URL(pub-...r2.dev)로 인증 없이, 쓰기는 기존
// image-library.js와 동일한 AWS SigV4 서명으로 R2 S3 호환 엔드포인트에 PUT.
//
// 기존 GitHub image_cache.json은 읽기 전용 백업으로만 남겨두고
// 이 모듈은 절대 그 파일을 쓰지 않는다 (안정화 전까지 삭제/수정 금지 — 사용자 지시).
// ══════════════════════════════════════════════════════════════
(function (global) {
  const INDEX_KEY = 'cache/index.json';
  const IMAGES_PREFIX = 'cache/images/';
  const BACKUPS_PREFIX = 'cache/backups/';

  // ── R2 설정 (shared-config.js의 SapConfig 그대로 사용, 새 키 안 만듦) ──
  function getR2Config() {
    if (!global.SapConfig || !global.SapConfig.getR2) {
      throw new Error('shared-config.js가 먼저 로드되어야 합니다.');
    }
    return global.SapConfig.getR2();
  }
  function hasR2() {
    return !!(global.SapConfig && global.SapConfig.hasR2 && global.SapConfig.hasR2());
  }

  // ── 해시 (다른 모든 모듈과 동일 알고리즘) ──────────────────────
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

  // ── AWS SigV4 (image-library.js의 signR2Put과 동일 패턴, 일반화) ──
  async function hmacSha256(key, data) {
    const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
  }
  async function sha256Hex(data) {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function toHex(buf) {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // extraHeaders: 예) { 'if-match': '"etag값"' } — 조건부 쓰기용. 헤더는 서명 대상에 포함되어야
  // R2가 검증할 수 있으므로 반드시 이 함수를 통해서만 보낸다 (fetch에서 직접 붙이면 서명 불일치로 거부됨).
  async function signR2Request(method, key, bodyBytes, contentType, cfg, extraHeaders) {
    const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${cfg.bucket}/${key}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
    const dateShort = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';

    const payloadHash = await sha256Hex(bodyBytes || '');
    const headers = {
      'host': `${cfg.accountId}.r2.cloudflarestorage.com`,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      ...(contentType ? { 'content-type': contentType } : {}),
      ...(extraHeaders || {}),
    };

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [method, `/${cfg.bucket}/${key}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

    const kDate = await hmacSha256(`AWS4${cfg.secretKey}`, dateShort);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = toHex(await hmacSha256(kSigning, stringToSign));

    const authHeader = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { url, headers: { ...headers, Authorization: authHeader } };
  }

  // ── 저수준 PUT (JSON 객체 또는 문자열) ─────────────────────────
  // extraHeaders로 'if-match' 줄 수 있음 (조건부 쓰기, R2가 지원 여부는 응답으로 확인).
  async function r2PutJson(key, obj, extraHeaders) {
    const cfg = getR2Config();
    const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    const bytes = new TextEncoder().encode(jsonStr);
    const { url, headers } = await signR2Request('PUT', key, bytes, 'application/json', cfg, extraHeaders);
    const res = await fetch(url, { method: 'PUT', headers, body: bytes });
    return { ok: res.ok, status: res.status, etag: res.headers.get('etag'), text: res.ok ? null : await res.text().catch(() => '') };
  }

  // ── 저수준 GET (공개 URL, 인증 불필요 — 이미지와 동일한 공개 버킷 경로 사용) ──
  async function r2GetPublicJson(key) {
    const cfg = getR2Config();
    const url = `${cfg.publicUrl}/${key}?ts=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return { ok: false, status: res.status, data: null, etag: null };
      const etag = res.headers.get('etag');
      const data = await res.json();
      return { ok: true, status: res.status, data, etag };
    } catch (e) {
      return { ok: false, status: 0, data: null, etag: null, error: e.message };
    }
  }

  // ── R2 객체 목록 (prefix 기준, list-type=2) ────────────────────
  async function r2List(prefix) {
    const cfg = getR2Config();
    const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
    const dateShort = amzDate.slice(0, 8);
    const region = 'auto', service = 's3';
    const payloadHash = await sha256Hex('');
    const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${cfg.bucket}`;
    const canonicalQuery = `list-type=2&max-keys=1000&prefix=${encodeURIComponent(prefix)}`;
    const sortedQuery = canonicalQuery.split('&').sort().join('&');
    const headers = { 'host': host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');
    const canonicalRequest = ['GET', canonicalUri, sortedQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
    const kDate = await hmacSha256(`AWS4${cfg.secretKey}`, dateShort);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = toHex(await hmacSha256(kSigning, stringToSign));
    const authHeader = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const url = `${endpoint}/${cfg.bucket}?${canonicalQuery}`;
    const res = await fetch(url, { headers: { ...headers, Authorization: authHeader } });
    if (!res.ok) throw new Error(`R2 list 실패 (${res.status})`);
    const xml = await res.text();
    const keys = Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g)).map(m => m[1]);
    return keys;
  }

  // ════════════════════════════════════════════════════════════
  // 고수준 API — index.json
  // ════════════════════════════════════════════════════════════
  async function getIndex() {
    const res = await r2GetPublicJson(INDEX_KEY);
    if (!res.ok) return { entries: {}, etag: null };
    return { entries: (res.data && res.data.entries) || {}, etag: res.etag };
  }

  async function backupIndex(currentObj) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    try { await r2PutJson(`${BACKUPS_PREFIX}index_${ts}.json`, currentObj); } catch (e) {}
  }

  const MAX_ATTEMPTS = 3;
  // applyFn(entries)는 entries 객체를 직접 mutate. 매 시도 최신본 다시 받아서 적용.
  async function _saveIndexWithRetry(applyFn) {
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { entries, etag } = await getIndex();
      const beforeCount = Object.keys(entries).length;
      applyFn(entries);
      const afterCount = Object.keys(entries).length;
      if (afterCount < beforeCount) {
        throw new Error(`index 저장 중단: entry 수 감소 감지 (${beforeCount} → ${afterCount})`);
      }
      const payload = { entries, updated_at: new Date().toISOString() };
      if (beforeCount > 0) backupIndex(payload).catch(() => {}); // fire-and-forget, 빈 인덱스는 백업 의미 없음
      const extraHeaders = etag ? { 'if-match': etag } : undefined;
      const res = await r2PutJson(INDEX_KEY, payload, extraHeaders);
      if (res.ok) return true;
      lastErr = new Error(`index.json 저장 실패: ${res.status} ${(res.text || '').slice(0, 200)}`);
      // 412 Precondition Failed = ETag 불일치(동시쓰기 충돌). R2가 If-Match를 지원 안 하면
      // 애초에 이 헤더를 무시하고 항상 200을 줄 수도 있음 — 그 경우 충돌 자체가 거의 안 남는다.
      if (res.status === 412 && attempt < MAX_ATTEMPTS) {
        console.warn(`[SharedStorage] index.json 충돌(412), 재시도 ${attempt}/${MAX_ATTEMPTS - 1}`);
        continue;
      }
      throw lastErr;
    }
    throw lastErr;
  }

  async function setIndexEntry(hash, data) {
    if (!hash || !data) return false;
    return _saveIndexWithRetry((entries) => {
      entries[hash] = { ...(entries[hash] || {}), ...data };
    });
  }
  async function setIndexBatch(updates) {
    if (!updates || !updates.length) return true;
    return _saveIndexWithRetry((entries) => {
      updates.forEach(([hash, data]) => {
        if (!hash || !data) return;
        entries[hash] = { ...(entries[hash] || {}), ...data };
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // 고수준 API — 사진 1장당 전체 분석 데이터
  // ════════════════════════════════════════════════════════════
  async function getImage(hash) {
    const res = await r2GetPublicJson(`${IMAGES_PREFIX}${hash}.json`);
    return res.ok ? res.data : null;
  }
  // 사진별 파일은 키가 서로 달라서 동시쓰기 충돌이 구조적으로 안 생긴다 (재시도 불필요).
  async function setImage(hash, data) {
    if (!hash || !data) return false;
    const res = await r2PutJson(`${IMAGES_PREFIX}${hash}.json`, data);
    if (!res.ok) throw new Error(`이미지 캐시 저장 실패 (${hash}): ${res.status} ${(res.text || '').slice(0, 200)}`);
    return true;
  }
  async function listImageKeys() {
    const keys = await r2List(IMAGES_PREFIX);
    return keys.map(k => k.replace(IMAGES_PREFIX, '').replace(/\.json$/, ''));
  }

  global.SharedStorage = {
    hashImage,
    getIndex, setIndexEntry, setIndexBatch,
    getImage, setImage, listImageKeys,
    r2PutJson, r2GetPublicJson, r2List, // 마이그레이션 도구에서 직접 쓸 저수준 API
    hasR2,
  };
})(window);
