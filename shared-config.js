/**
 * SAPMANRI Shared Config v1.0
 * 모든 서비스가 공유하는 자격증명 관리 모듈
 * localStorage 키를 통일해서 한 번 입력으로 모든 서비스에서 사용
 *
 * 사용법: <script src="/shared-config.js"></script>
 * 그러면 window.SapConfig 로 접근 가능
 */
(function(window) {
  // ── 통합 키 이름 (모든 서비스 동일) ──────────────────────────────
  const KEYS = {
    anthropic : 'sapmanri_anthropic_key',   // Claude API Key
    github    : 'cg_sapmanri_gh_token',     // GitHub Token (기존 키 유지)
    r2Account : 'sapmanri_r2_account_id',
    r2Access  : 'sapmanri_r2_access_key',
    r2Secret  : 'sapmanri_r2_secret_key',
    r2Bucket  : 'sapmanri_r2_bucket',
    r2Public  : 'sapmanri_r2_public_url',
  };

  // ── 하위 호환 레거시 키 목록 (이전 키가 있으면 통합 키로 마이그레이션) ──
  const LEGACY = {
    anthropic: ['anthropic_key', 'ws_sapmanri_apikey', 'smm_apikey'],
    github   : [],
  };

  function migrate() {
    try {
      // Anthropic Key 마이그레이션
      if (!localStorage.getItem(KEYS.anthropic)) {
        for (const old of LEGACY.anthropic) {
          const val = localStorage.getItem(old);
          if (val) { localStorage.setItem(KEYS.anthropic, val); break; }
        }
      }
    } catch(e) {}
  }

  function get(key)      { try { return localStorage.getItem(KEYS[key]) || ''; } catch(e) { return ''; } }
  function set(key, val) { try { localStorage.setItem(KEYS[key], val || ''); } catch(e) {} }

  function getR2() {
    return {
      accountId : get('r2Account'),
      accessKey : get('r2Access'),
      secretKey : get('r2Secret'),
      bucket    : get('r2Bucket'),
      publicUrl : (get('r2Public') || '').replace(/\/$/, ''),
    };
  }
  function hasR2() {
    const c = getR2();
    return !!(c.accountId && c.accessKey && c.secretKey && c.bucket && c.publicUrl);
  }
  function setR2(cfg) {
    if (cfg.accountId !== undefined) set('r2Account', cfg.accountId);
    if (cfg.accessKey !== undefined) set('r2Access',  cfg.accessKey);
    if (cfg.secretKey !== undefined) set('r2Secret',  cfg.secretKey);
    if (cfg.bucket    !== undefined) set('r2Bucket',  cfg.bucket);
    if (cfg.publicUrl !== undefined) set('r2Public',  cfg.publicUrl);
  }

  // ── 설정 모달 UI 생성 (어느 페이지서나 호출 가능) ──────────────────
  function openSettingsModal(opts) {
    opts = opts || {};
    const isDark = opts.theme !== 'light';
    const existing = document.getElementById('sapConfigModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sapConfigModal';
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:20px;`;

    const bg = isDark ? '#1c1c1e' : '#fff';
    const fg = isDark ? '#f5f5f5' : '#1c1c1e';
    const border = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
    const inputBg = isDark ? '#111' : '#f5f5f5';

    const r2 = getR2();
    overlay.innerHTML = `
      <div style="background:${bg};color:${fg};border-radius:14px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,0.4);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 16px;border-bottom:1px solid ${border};">
          <div>
            <div style="font-size:15px;font-weight:600;letter-spacing:0.02em;">SAPMANRI · 공통 설정</div>
            <div style="font-size:11px;opacity:0.45;margin-top:3px;">한 번 저장하면 모든 서비스에서 공유됩니다</div>
          </div>
          <button id="sapCfgClose" style="background:none;border:none;color:${fg};font-size:20px;cursor:pointer;padding:4px 8px;">✕</button>
        </div>
        <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;">

          <div>
            <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.4;margin-bottom:8px;">AI</div>
            <label style="font-size:11px;opacity:0.6;display:block;margin-bottom:4px;">Anthropic API Key (Claude)</label>
            <input id="sapCfgAnthropicKey" type="password" value="${get('anthropic')}"
              placeholder="sk-ant-..."
              style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
          </div>

          <div>
            <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.4;margin-bottom:8px;">GitHub</div>
            <label style="font-size:11px;opacity:0.6;display:block;margin-bottom:4px;">GitHub Personal Access Token</label>
            <input id="sapCfgGhToken" type="password" value="${get('github')}"
              placeholder="ghp_..."
              style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
          </div>

          <div>
            <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.4;margin-bottom:8px;">Cloudflare R2</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <input id="sapCfgR2AccountId" type="text"    value="${r2.accountId}" placeholder="Account ID" style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
              <input id="sapCfgR2AccessKey" type="text"    value="${r2.accessKey}" placeholder="Access Key ID" style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
              <input id="sapCfgR2SecretKey" type="password" value="${r2.secretKey}" placeholder="Secret Access Key" style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
              <input id="sapCfgR2Bucket"    type="text"    value="${r2.bucket}"    placeholder="Bucket 이름" style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
              <input id="sapCfgR2PublicUrl" type="text"    value="${r2.publicUrl}" placeholder="Public URL (https://pub-xxxx.r2.dev)" style="width:100%;background:${inputBg};border:1px solid ${border};border-radius:6px;color:${fg};font-family:monospace;font-size:12px;padding:8px 10px;box-sizing:border-box;outline:none;">
            </div>
          </div>

          <div id="sapCfgStatus" style="font-size:11px;opacity:0.5;text-align:center;min-height:16px;"></div>

          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="sapCfgTest" style="background:${inputBg};border:1px solid ${border};color:${fg};padding:9px 16px;border-radius:8px;cursor:pointer;font-size:12px;">연결 테스트</button>
            <button id="sapCfgSave" style="background:#E8762C;border:none;color:#fff;padding:9px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">저장</button>
          </div>
        </div>
      </div>
    `;

    function readForm() {
      return {
        anthropic : document.getElementById('sapCfgAnthropicKey').value.trim(),
        github    : document.getElementById('sapCfgGhToken').value.trim(),
        r2AccountId: document.getElementById('sapCfgR2AccountId').value.trim(),
        r2AccessKey: document.getElementById('sapCfgR2AccessKey').value.trim(),
        r2SecretKey: document.getElementById('sapCfgR2SecretKey').value.trim(),
        r2Bucket   : document.getElementById('sapCfgR2Bucket').value.trim(),
        r2PublicUrl: document.getElementById('sapCfgR2PublicUrl').value.trim(),
      };
    }

    overlay.querySelector('#sapCfgClose').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#sapCfgSave').onclick = () => {
      const v = readForm();
      if (v.anthropic) set('anthropic', v.anthropic);
      if (v.github)    set('github',    v.github);
      setR2({ accountId: v.r2AccountId, accessKey: v.r2AccessKey, secretKey: v.r2SecretKey, bucket: v.r2Bucket, publicUrl: v.r2PublicUrl });
      document.getElementById('sapCfgStatus').textContent = '✓ 저장됨 — 모든 서비스에서 즉시 사용 가능';
      document.getElementById('sapCfgStatus').style.color = '#8aaa88';
      if (opts.onSave) opts.onSave();
      setTimeout(() => overlay.remove(), 1200);
    };

    overlay.querySelector('#sapCfgTest').onclick = async () => {
      const statusEl = document.getElementById('sapCfgStatus');
      statusEl.textContent = '테스트 중…'; statusEl.style.color = '';
      const v = readForm();
      const results = [];

      // Anthropic 테스트
      if (v.anthropic) {
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': v.anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'ping' }] })
          });
          results.push(res.ok ? '✓ Claude API' : `✗ Claude API (${res.status})`);
        } catch(e) { results.push('✗ Claude API'); }
      }

      // GitHub 테스트
      if (v.github) {
        try {
          const res = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${v.github}` } });
          const json = await res.json();
          results.push(res.ok ? `✓ GitHub (${json.login})` : '✗ GitHub');
        } catch(e) { results.push('✗ GitHub'); }
      }

      // R2 테스트 (라이브러리 목록)
      if (v.r2AccountId && v.r2AccessKey && window.ImageLibrary) {
        try {
          const items = await window.ImageLibrary.list();
          results.push(`✓ R2 (이미지 ${items.length}개)`);
        } catch(e) { results.push('✗ R2'); }
      }

      statusEl.textContent = results.join('  ');
      statusEl.style.color = results.some(r => r.startsWith('✗')) ? '#c47a6a' : '#8aaa88';
    };

    document.body.appendChild(overlay);
  }

  // 페이지 로드 시 레거시 키 마이그레이션
  try { migrate(); } catch(e) {}

  window.SapConfig = {
    get, set, getR2, hasR2, setR2,
    getAnthropicKey : () => get('anthropic'),
    getGithubToken  : () => get('github'),
    openSettingsModal,
    KEYS,
  };
})(window);
