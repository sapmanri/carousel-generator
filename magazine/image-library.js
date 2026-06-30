/**
 * ImageLibrary v2 — R2 우선, GitHub 폴백
 * Cloudflare R2 (S3-compatible) 자격증명이 localStorage에 있으면 R2로 업로드.
 * 없으면 기존 GitHub Contents API 방식 유지 (하위 호환).
 *
 * R2 credentials (localStorage):
 *   sapmanri_r2_account_id  — Cloudflare Account ID
 *   sapmanri_r2_access_key  — R2 Access Key ID
 *   sapmanri_r2_secret_key  — R2 Secret Access Key
 *   sapmanri_r2_bucket      — Bucket 이름
 *   sapmanri_r2_public_url  — Public URL (예: https://pub-xxxx.r2.dev 또는 커스텀 도메인)
 *
 * GitHub token (기존): localStorage 'cg_sapmanri_gh_token'
 */
(function (window) {
  // ── 상수 ──────────────────────────────────────────────────────────
  const REPO         = 'sapmanri/carousel-generator';
  const LIBRARY_DIR  = 'magazine/images/library';
  const TOKEN_KEY    = 'cg_sapmanri_gh_token';

  const R2_KEYS = {
    accountId  : 'sapmanri_r2_account_id',
    accessKey  : 'sapmanri_r2_access_key',
    secretKey  : 'sapmanri_r2_secret_key',
    bucket     : 'sapmanri_r2_bucket',
    publicUrl  : 'sapmanri_r2_public_url',
  };

  // ── 자격증명 헬퍼 ────────────────────────────────────────────────
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function getR2Config() {
    try {
      return {
        accountId : localStorage.getItem(R2_KEYS.accountId)  || '',
        accessKey : localStorage.getItem(R2_KEYS.accessKey)  || '',
        secretKey : localStorage.getItem(R2_KEYS.secretKey)  || '',
        bucket    : localStorage.getItem(R2_KEYS.bucket)     || '',
        publicUrl : (localStorage.getItem(R2_KEYS.publicUrl) || '').replace(/\/$/, ''),
      };
    } catch (e) { return {}; }
  }

  function hasR2() {
    const c = getR2Config();
    return !!(c.accountId && c.accessKey && c.secretKey && c.bucket && c.publicUrl);
  }

  function setR2Config(cfg) {
    try {
      Object.entries(R2_KEYS).forEach(([k, storageKey]) => {
        if (cfg[k] !== undefined) localStorage.setItem(storageKey, cfg[k]);
      });
    } catch (e) {}
  }

  // ── 해시 (기존과 동일 알고리즘, SapmanriCache 호환) ───────────────
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

  // ── AWS Signature V4 (Web Crypto API) ───────────────────────────
  async function hmacSha256(key, data) {
    const k = typeof key === 'string'
      ? new TextEncoder().encode(key)
      : key;
    const cryptoKey = await crypto.subtle.importKey(
      'raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
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

  async function signR2Put(key, bodyBytes, contentType, cfg) {
    const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${cfg.bucket}/${key}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
    const dateShort = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';

    const payloadHash = await sha256Hex(bodyBytes);
    const headers = {
      'host'                : `${cfg.accountId}.r2.cloudflarestorage.com`,
      'x-amz-date'         : amzDate,
      'x-amz-content-sha256': payloadHash,
      'content-type'        : contentType,
    };

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders  = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const signedHeaders     = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      'PUT',
      `/${cfg.bucket}/${key}`,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate    = await hmacSha256(`AWS4${cfg.secretKey}`, dateShort);
    const kRegion  = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = toHex(await hmacSha256(kSigning, stringToSign));

    const authHeader = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url,
      headers: {
        ...headers,
        'Authorization': authHeader,
      },
    };
  }

  // ── R2 업로드 ────────────────────────────────────────────────────
  async function uploadToR2(dataUrl, mediaType, customKey) {
    const cfg = getR2Config();
    const ext  = (mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('webp','webp');
    const hash = customKey || await hashImage(dataUrl);
    // customKey가 있으면 그대로, 없으면 library/<hash>.<ext>
    const key  = customKey ? `library/${customKey}.${ext}` : `library/${hash}.${ext}`;
    const publicUrl = `${cfg.publicUrl}/${key}`;

    // 존재 여부 확인 (HEAD)
    try {
      const headRes = await fetch(publicUrl, { method: 'HEAD' });
      if (headRes.ok) return { url: publicUrl, key, existed: true };
    } catch (e) {}

    // base64 → Uint8Array
    const b64 = dataUrl.split(',')[1];
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

    const { url, headers } = await signR2Put(key, bytes, mediaType, cfg);

    const res = await fetch(url, { method: 'PUT', headers, body: bytes });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`R2 업로드 실패 (${res.status}): ${text.slice(0, 200)}`);
    }
    return { url: publicUrl, key, existed: false };
  }

  // ── GitHub 업로드 (기존 폴백) ─────────────────────────────────────
  async function uploadToGitHub(dataUrl, mediaType) {
    const token = getToken();
    if (!token) throw new Error('GitHub 토큰 또는 R2 자격증명이 필요합니다.');
    const ext      = (mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const hash     = await hashImage(dataUrl);
    const filename = `${hash}.${ext}`;
    const path     = `${LIBRARY_DIR}/${filename}`;
    const base64   = dataUrl.split(',')[1];

    try {
      const checkRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
        headers: { Authorization: `token ${token}` }
      });
      if (checkRes.ok) return { path, url: path, existed: true };
    } catch (e) {}

    const body = { message: `Add to image library: ${filename}`, content: base64 };
    const res  = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!json.content) throw new Error(json.message || `이미지 업로드 실패: ${filename}`);
    return { path, url: path, existed: false };
  }

  // ── 공개 API ─────────────────────────────────────────────────────

  /**
   * 이미지 업로드 (R2 우선, 없으면 GitHub)
   * 반환: { url, existed }
   *   - R2: url = 'https://...' (full public URL)
   *   - GitHub: url = 'magazine/images/library/<hash>.<ext>' (repo-relative, 기존 호환)
   */
  async function uploadIfNeeded(dataUrl, mediaType, customKey) {
    if (hasR2()) {
      const result = await uploadToR2(dataUrl, mediaType, customKey || null);
      return { path: result.key, url: result.url, existed: result.existed };
    } else {
      const result = await uploadToGitHub(dataUrl, mediaType);
      return { path: result.path, url: result.path, existed: result.existed };
    }
  }

  /**
   * 라이브러리 목록
   * R2: ListObjectsV2로 library/ prefix 조회
   * GitHub: 기존 방식 유지
   */
  async function list() {
    if (hasR2()) {
      return await listR2();
    } else {
      return await listGitHub();
    }
  }

  async function listR2() {
    const cfg = getR2Config();
    const prefix = 'library/';
    const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${cfg.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
    const dateShort = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';
    const payloadHash = await sha256Hex('');

    const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${cfg.bucket}`;
    const canonicalQuery = `list-type=2&max-keys=1000&prefix=${encodeURIComponent(prefix)}`;
    const sortedQuery = canonicalQuery.split('&').sort().join('&');

    const headers = {
      'host'                 : host,
      'x-amz-date'          : amzDate,
      'x-amz-content-sha256' : payloadHash,
    };
    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders  = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const signedHeaders     = sortedHeaderKeys.join(';');

    const canonicalRequest = ['GET', canonicalUri, sortedQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

    const kDate    = await hmacSha256(`AWS4${cfg.secretKey}`, dateShort);
    const kRegion  = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = toHex(await hmacSha256(kSigning, stringToSign));

    const authHeader = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
      const res = await fetch(`${endpoint}/${cfg.bucket}?${sortedQuery}`, {
        headers: { ...headers, 'Authorization': authHeader }
      });
      if (!res.ok) return [];
      const xml = await res.text();
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
      return keys
        .filter(key => {
          const base = key.split('/').pop().split('?')[0];
          if (/^thumb_/i.test(base)) return false;
          if (/_display\.(jpe?g|png|webp)$/i.test(base)) return false;
          if (/_display$/i.test(base)) return false;
          if (/_left\.\w+$/.test(base)) return false;
          if (/_right\.\w+$/.test(base)) return false;
          if (/^existing_/i.test(base)) return false;
          return true;
        })
        .map(key => {
        const name = key.replace(/^library\//, '');
        const m = name.match(/^(.+)\.(\w+)$/);
        const publicUrl = `${cfg.publicUrl}/${key}`;
        return {
          name,
          path: key,
          hash: m ? m[1] : name,
          ext: m ? m[2] : '',
          download_url: publicUrl,
          url: publicUrl,
        };
      });
    } catch (e) {
      return [];
    }
  }

  async function listGitHub() {
    const token = getToken();
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${LIBRARY_DIR}`, {
        headers: token ? { Authorization: `token ${token}` } : {}
      });
      if (!res.ok) return [];
      const json = await res.json();
      if (!Array.isArray(json)) return [];
      return json
        .filter(item => item.type === 'file')
        .map(item => {
          const m = item.name.match(/^(.+)\.(\w+)$/);
          return {
            name: item.name,
            path: `${LIBRARY_DIR}/${item.name}`,
            hash: m ? m[1] : item.name,
            ext: m ? m[2] : '',
            sha: item.sha,
            download_url: item.download_url,
            url: item.download_url,
          };
        });
    } catch (e) {
      return [];
    }
  }

  /**
   * 경로 또는 URL로부터 data URL 로드
   */
  async function fetchAsDataUrl(pathOrUrl) {
    let fetchUrl;
    if (pathOrUrl.startsWith('http')) {
      fetchUrl = pathOrUrl;
    } else {
      fetchUrl = `https://raw.githubusercontent.com/${REPO}/main/${pathOrUrl}`;
    }
    const res = await fetch(fetchUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`이미지 로드 실패: ${pathOrUrl}`);
    const blob = await res.blob();
    // blob.type에서 실제 mediaType 추출 (URL 확장자 의존 제거)
    let mediaType = blob.type || '';
    if (!mediaType || mediaType === 'application/octet-stream') {
      const ext = (pathOrUrl.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
      mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    }
    // HEIC/HEIF → jpeg 강제 (Claude API 미지원)
    if (/heic|heif/i.test(mediaType)) mediaType = 'image/jpeg';
    // 지원 타입 외 → jpeg fallback
    if (!['image/jpeg','image/png','image/gif','image/webp'].includes(mediaType)) mediaType = 'image/jpeg';
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    // dataUrl의 헤더를 올바른 mediaType으로 교체
    const commaIdx = dataUrl.indexOf(',');
    const b64 = dataUrl.slice(commaIdx + 1);
    return `data:${mediaType};base64,${b64}`;
  }

  /**
   * 라이브러리 그리드 피커 모달
   */
  async function openPicker(onSelect, opts) {
    opts = opts || {};
    const multiple = !!opts.multiple;
    const theme = opts.theme === 'dark' ? 'dark' : 'light';
    const isDark = theme === 'dark';

    const overlay = document.createElement('div');
    overlay.id = 'sapmanriLibraryPickerOverlay';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      background:rgba(0,0,0,0.6);
      display:flex; align-items:center; justify-content:center;
      padding:24px;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background:${isDark ? '#1c1c1e' : '#ffffff'};
      color:${isDark ? '#f5f5f5' : '#1c1c1e'};
      border-radius:14px;
      width:100%; max-width:720px; max-height:80vh;
      display:flex; flex-direction:column;
      overflow:hidden;
      box-shadow:0 12px 40px rgba(0,0,0,0.3);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 20px; border-bottom:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      font-weight:600; font-size:16px;
    `;
    const r2Badge = hasR2() ? ' <span style="font-size:10px;font-weight:400;opacity:0.5;margin-left:6px;">R2</span>' : '';
    header.innerHTML = `<span>라이브러리에서 선택${multiple ? ' (여러 장 가능)' : ''}${r2Badge}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:18px;color:${isDark ? '#f5f5f5' : '#1c1c1e'};padding:4px 8px;`;
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.cssText = `
      padding:16px 20px; overflow-y:auto; flex:1;
      display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:10px;
    `;
    body.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;opacity:0.6;">불러오는 중...</div>`;

    let footer = null;
    const selected = new Set();

    if (multiple) {
      footer = document.createElement('div');
      footer.style.cssText = `
        display:flex; justify-content:flex-end; gap:10px;
        padding:14px 20px; border-top:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      `;
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '취소';
      cancelBtn.style.cssText = `padding:8px 16px;border-radius:8px;border:1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'};background:transparent;color:inherit;cursor:pointer;font-size:14px;`;
      cancelBtn.onclick = () => overlay.remove();

      const addBtn = document.createElement('button');
      addBtn.textContent = '추가';
      addBtn.style.cssText = `padding:8px 16px;border-radius:8px;border:none;background:${isDark ? '#fff' : '#1c1c1e'};color:${isDark ? '#1c1c1e' : '#fff'};cursor:pointer;font-size:14px;font-weight:600;`;
      addBtn.onclick = async () => {
        const items = [];
        for (const pathOrUrl of selected) {
          try {
            const dataUrl = await fetchAsDataUrl(pathOrUrl);
            const m = pathOrUrl.match(/([^/]+)\.(\w+)$/);
            items.push({ dataUrl, path: pathOrUrl, url: pathOrUrl, hash: m ? m[1] : '' });
          } catch (e) {}
        }
        overlay.remove();
        onSelect(items);
      };
      footer.appendChild(cancelBtn);
      footer.appendChild(addBtn);
    }

    modal.appendChild(header);
    modal.appendChild(body);
    if (footer) modal.appendChild(footer);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    const PAGE_SIZE = 30;
    let currentPage = 0;
    let allItems = [];

    // image_cache.json을 먼저 로드 — 이게 실제 라이브러리의 source of truth
    let cacheMap = {};
    try {
      const cacheRes = await fetch('https://raw.githubusercontent.com/sapmanri/carousel-generator/main/image_cache.json');
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        cacheMap = cacheData.entries || {};
      }
    } catch(e) {}

    const rawItems = await list();
    if (!rawItems.length && !Object.keys(cacheMap).length) {
      body.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;opacity:0.6;">라이브러리에 이미지가 없습니다.</div>`;
      return;
    }

    // cache 기반으로 유효한 항목만 필터링 + analyzed_at 최신순 정렬
    const cfg = hasR2() ? getR2Config() : null;
    if (Object.keys(cacheMap).length) {
      // cache 키는 해시값, 실제 URL은 r2_url 필드에 있음
      allItems = Object.entries(cacheMap)
        .map(([key, data]) => ({ key, data, url: data.r2_url || data.display_url || data.url || '' }))
        .filter(({ url }) => {
          if (!url || !url.startsWith('http')) return false;
          const base = url.split('/').pop().split('?')[0];
          if (/^thumb_/i.test(base)) return false;
          if (/_display/i.test(base)) return false;
          if (/_left\.\w+$/.test(base)) return false;
          if (/_right\.\w+$/.test(base)) return false;
          if (/^existing_/i.test(base)) return false;
          return true;
        })
        .sort((a, b) => (b.data.analyzed_at || '').localeCompare(a.data.analyzed_at || ''))
        .map(({ key, data, url }) => ({
          name: url.split('/').pop(),
          path: url,
          hash: data.image_id || key,
          ext: url.split('.').pop(),
          download_url: url,
          url: url,
          thumbnail_url: data.thumbnail_url || url,
        }));
    } else {
      // cache 없으면 R2 raw listing 사용
      allItems = rawItems.sort((a, b) => (b.analyzed_at || '').localeCompare(a.analyzed_at || ''));
    }

    function renderPage(page) {
      const start = page * PAGE_SIZE;
      const slice = allItems.slice(start, start + PAGE_SIZE);
      body.innerHTML = '';

      slice.forEach(item => {
        const thumb = document.createElement('div');
        thumb.style.cssText = `position:relative;width:100%;padding-bottom:100%;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;background:${isDark ? '#2c2c2e' : '#f0f0f0'};`;
        const img = document.createElement('img');
        img.src = item.thumbnail_url || item.download_url || item.url;
        img.loading = 'lazy';
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
        thumb.appendChild(img);

        const urlOrPath = item.url || item.path;
        thumb.addEventListener('click', async () => {
          if (multiple) {
            if (selected.has(urlOrPath)) {
              selected.delete(urlOrPath);
              thumb.style.borderColor = 'transparent';
            } else {
              selected.add(urlOrPath);
              thumb.style.borderColor = isDark ? '#fff' : '#1c1c1e';
            }
          } else {
            try {
              const dataUrl = await fetchAsDataUrl(urlOrPath);
              overlay.remove();
              onSelect({ dataUrl, path: urlOrPath, url: urlOrPath, hash: item.hash });
            } catch (e) {
              alert('이미지를 불러오지 못했습니다: ' + e.message);
            }
          }
        });
        body.appendChild(thumb);
      });

      // 페이징 컨트롤
      const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
      const pagingDiv = document.createElement('div');
      pagingDiv.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 0;';

      const prevBtn = document.createElement('button');
      prevBtn.textContent = '◀';
      prevBtn.disabled = page === 0;
      prevBtn.style.cssText = `padding:6px 14px;border-radius:6px;border:1px solid ${isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'};background:transparent;color:inherit;cursor:pointer;opacity:${page===0?'0.3':'1'};`;
      prevBtn.onclick = () => { currentPage--; renderPage(currentPage); };

      const pageInfo = document.createElement('span');
      pageInfo.style.cssText = 'font-size:13px;opacity:0.6;';
      pageInfo.textContent = `${page + 1} / ${totalPages}`;

      const nextBtn = document.createElement('button');
      nextBtn.textContent = '▶';
      nextBtn.disabled = page >= totalPages - 1;
      nextBtn.style.cssText = `padding:6px 14px;border-radius:6px;border:1px solid ${isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'};background:transparent;color:inherit;cursor:pointer;opacity:${page>=totalPages-1?'0.3':'1'};`;
      nextBtn.onclick = () => { currentPage++; renderPage(currentPage); };

      pagingDiv.appendChild(prevBtn);
      pagingDiv.appendChild(pageInfo);
      pagingDiv.appendChild(nextBtn);
      body.appendChild(pagingDiv);
    }

    renderPage(0);
  }

  // R2 설정 UI 헬퍼 (각 서비스 헤더에서 호출 가능)
  function getR2Status() {
    return hasR2() ? 'R2 연결됨 ✓' : 'R2 미설정';
  }

  window.ImageLibrary = {
    hashImage,
    list,
    fetchAsDataUrl,
    uploadIfNeeded,
    openPicker,
    // R2 설정 관련
    hasR2,
    getR2Config,
    setR2Config,
    getR2Status,
  };
})(window);
