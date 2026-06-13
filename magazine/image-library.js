/**
 * ImageLibrary — 공유 이미지 라이브러리 모듈
 * magazine/images/library/<hash>.<ext> 에 hash 기반으로 사진을 저장/조회/재사용한다.
 *
 * carousel_ai_generator.html, skyline_music_matcher.html, magazine/editor.html
 * 세 곳에서 <script src="./image-library.js"> (또는 "./magazine/image-library.js")로 공유.
 *
 * GitHub 토큰: localStorage 'cg_sapmanri_gh_token' (기존 캐러셀/매거진과 동일 키 공유)
 */
(function (window) {
  const REPO = 'sapmanri/carousel-generator';
  const LIBRARY_DIR = 'magazine/images/library';
  const TOKEN_KEY = 'cg_sapmanri_gh_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  /**
   * dataUrl(base64)로부터 빠른 해시 계산 (djb2 변형, 샘플링 기반)
   * — SapmanriCache.hashImage와 동일한 알고리즘 (호환성 유지)
   */
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

  /**
   * magazine/images/library/ 디렉토리 목록을 GitHub API로 조회
   * 반환: [{ name, path, hash, ext, sha, download_url }]
   */
  async function list() {
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
            download_url: item.download_url
          };
        });
    } catch (e) {
      return [];
    }
  }

  /**
   * 라이브러리 경로(magazine/images/library/<hash>.<ext>)의 파일을 가져와 data: URL로 변환
   */
  async function fetchAsDataUrl(path) {
    const ext = (path.split('.').pop() || 'jpg').toLowerCase();
    const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`라이브러리 이미지 로드 실패: ${path}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    // blob의 mime이 비어있을 수 있으므로 확장자 기반 mediaType으로 보정
    const commaIdx = dataUrl.indexOf(',');
    const b64 = dataUrl.slice(commaIdx + 1);
    return `data:${mediaType};base64,${b64}`;
  }

  /**
   * dataUrl을 hash 기반으로 라이브러리에 업로드 (이미 존재하면 스킵, dedup)
   * 반환: { path: 'magazine/images/library/<hash>.<ext>', existed: boolean }
   */
  async function uploadIfNeeded(dataUrl, mediaType) {
    const token = getToken();
    if (!token) throw new Error('GitHub 토큰이 필요합니다.');

    const ext = (mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const hash = await hashImage(dataUrl);
    const filename = `${hash}.${ext}`;
    const path = `${LIBRARY_DIR}/${filename}`;
    const base64 = dataUrl.split(',')[1];

    // 이미 존재하는지 확인 (dedup)
    try {
      const checkRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
        headers: { Authorization: `token ${token}` }
      });
      if (checkRes.ok) {
        return { path, existed: true };
      }
    } catch (e) {}

    const body = { message: `Add to image library: ${filename}`, content: base64 };
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!json.content) throw new Error(json.message || `이미지 업로드 실패: ${filename}`);
    return { path, existed: false };
  }

  /**
   * 라이브러리 그리드 피커 모달을 띄운다.
   * onSelect(item) — item: { dataUrl, path, hash }
   * multiple=true면 다중 선택 후 onSelect(items: array) 호출
   */
  async function openPicker(onSelect, opts) {
    opts = opts || {};
    const multiple = !!opts.multiple;
    const theme = opts.theme === 'dark' ? 'dark' : 'light';

    const overlay = document.createElement('div');
    overlay.id = 'sapmanriLibraryPickerOverlay';
    const isDark = theme === 'dark';
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
    header.innerHTML = `<span>라이브러리에서 선택${multiple ? ' (여러 장 가능)' : ''}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background:none; border:none; cursor:pointer; font-size:18px;
      color:${isDark ? '#f5f5f5' : '#1c1c1e'}; padding:4px 8px;
    `;
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.cssText = `
      padding:16px 20px; overflow-y:auto; flex:1;
      display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:10px;
    `;
    body.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; opacity:0.6;">불러오는 중...</div>`;

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
      cancelBtn.style.cssText = `
        padding:8px 16px; border-radius:8px; border:1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'};
        background:transparent; color:inherit; cursor:pointer; font-size:14px;
      `;
      cancelBtn.onclick = () => overlay.remove();
      const addBtn = document.createElement('button');
      addBtn.textContent = '추가';
      addBtn.style.cssText = `
        padding:8px 16px; border-radius:8px; border:none;
        background:${isDark ? '#fff' : '#1c1c1e'}; color:${isDark ? '#1c1c1e' : '#fff'};
        cursor:pointer; font-size:14px; font-weight:600;
      `;
      addBtn.onclick = async () => {
        const items = [];
        for (const path of selected) {
          try {
            const dataUrl = await fetchAsDataUrl(path);
            const m = path.match(/([^/]+)\.(\w+)$/);
            items.push({ dataUrl, path, hash: m ? m[1] : '' });
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

    const items = await list();
    if (!items.length) {
      body.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; opacity:0.6;">라이브러리에 이미지가 없습니다.</div>`;
      return;
    }

    body.innerHTML = '';
    items.forEach(item => {
      const thumb = document.createElement('div');
      thumb.style.cssText = `
        position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden;
        cursor:pointer; border:2px solid transparent; background:${isDark ? '#2c2c2e' : '#f0f0f0'};
      `;
      const img = document.createElement('img');
      img.src = item.download_url;
      img.loading = 'lazy';
      img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';
      thumb.appendChild(img);

      thumb.addEventListener('click', async () => {
        if (multiple) {
          if (selected.has(item.path)) {
            selected.delete(item.path);
            thumb.style.borderColor = 'transparent';
          } else {
            selected.add(item.path);
            thumb.style.borderColor = isDark ? '#fff' : '#1c1c1e';
          }
        } else {
          try {
            const dataUrl = await fetchAsDataUrl(item.path);
            overlay.remove();
            onSelect({ dataUrl, path: item.path, hash: item.hash });
          } catch (e) {
            alert('이미지를 불러오지 못했습니다: ' + e.message);
          }
        }
      });

      body.appendChild(thumb);
    });
  }

  window.ImageLibrary = { hashImage, list, fetchAsDataUrl, uploadIfNeeded, openPicker };
})(window);
