// ══════════════════════════════════════════════════════════════
// SAPMANRI Postcard Templates
// renderTemplateHtml(pc) — 에디터 미리보기 + 갤러리 화면 표시에 공통으로 사용.
// 실제 다운로드용 이미지는 postcards-canvas.js에서 캔버스로 별도 합성한다.
// 새 템플릿을 추가할 때는 이 파일에 case를 늘리고
// postcards-core.js의 TEMPLATES 배열, postcards-canvas.js의 캔버스 렌더러도 함께 추가한다.
// ══════════════════════════════════════════════════════════════

// HTML 이스케이프 — core.js와 동일 구현 (templates.js를 단독으로 쓰는 화면에서도 필요)
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderTemplateHtml(pc, hasQr, side) {
  side = side || 'front';
  if (side === 'back') {
    return renderBackTemplate(pc, hasQr);
  }
  switch (pc.template) {
    case 'mag-01':    return renderMag01(pc);
    case 'typo-01':   return renderTypo01(pc);
    case 'story-01':  return renderStory01(pc);
    case 'edit-01':   return renderEdit01(pc);
    case 'expo-01':
    default:          return renderExpo01(pc, hasQr);
  }
}

function renderBackTemplate(pc, hasQr) {
  switch (pc.backTemplate || 'back-classic') {
    case 'back-modern':  return renderBackModern(pc, hasQr);
    case 'back-centre':  return renderBackCentre(pc, hasQr);
    case 'back-seal':    return renderBackSeal(pc, hasQr);
    case 'back-classic':
    default:             return renderExpo01Back(pc, hasQr);
  }
}

// Expo 01 뒷면 — 클래식 우편엽서 레이아웃: 좌측 메시지 영역(+SAPMANRI/제목), 우측 주소란+우표
function renderExpo01Back(pc, hasQr) {
  return `
    <div class="pc-back">
      <div class="pc-back-header">POST CARD</div>
      <div class="pc-back-body">
        <div class="pc-back-left">
          <div class="pc-back-brand">SAPMANRI</div>
          <div class="pc-back-caption">${esc(pc.title || '')}</div>
          <div class="pc-back-sub">오늘도 느리게 · slow days<br>@sapmanri · No.${esc(pc.number || '')}</div>
        </div>
        <div class="pc-back-divider"></div>
        <div class="pc-back-right">
          <div class="pc-back-stamp"></div>
          <div class="pc-back-addrlines">
            <div class="pc-back-addr-label">TO</div>
            <div class="pc-back-line"></div>
            <div class="pc-back-line"></div>
            <div class="pc-back-line"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Expo 01 — 전시 포스터 스타일: 상단 라벨+번호, 큰 사진, 하단 제목 + (연결된 호가 있을 때만) QR
function renderExpo01(pc, hasQr) {
  const label = pc.label || '';
  const qrHtml = hasQr ? `<div class="pc-qr" data-qr-target="1"></div>` : '';
  const metaCls = hasQr ? 'pc-meta' : 'pc-meta pc-meta-full';
  return `
    <div class="pc-top">
      <div class="pc-label"><div class="l1">SAPMANRI</div><div>${esc(label)}</div></div>
      <div class="pc-number">${esc(pc.number || '')}</div>
    </div>
    <div class="pc-photo"><img src="${esc(pc.image)}" alt="" loading="lazy"></div>
    <div class="pc-bottom">
      <div class="pc-title">${esc(pc.title || '')}</div>
      <div class="${metaCls}">
        <div class="pc-meta-text">오늘도 느리게 · slow days<br>@sapmanri</div>
        ${qrHtml}
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Mag 01 — 잡지형: 상단 헤더(번호+메타), 대형 사진, 하단 굵은 타이틀+설명
// ──────────────────────────────────────────────
function renderMag01(pc) {
  return `
    <div class="pc-mag01">
      <div class="pc-mag01-header">
        <div class="pc-mag01-meta">
          <span class="pc-mag01-brand">SAPMANRI</span>
          <span class="pc-mag01-label">${esc(pc.label || '')}</span>
        </div>
        <div class="pc-mag01-num">${esc(pc.number || '')}</div>
      </div>
      <div class="pc-mag01-title-over">${esc(pc.title || '')}</div>
      <div class="pc-mag01-photo"><img src="${esc(pc.image)}" alt="" loading="lazy"></div>
      <div class="pc-mag01-footer">
        <div class="pc-mag01-desc">${esc(pc.label || '')}</div>
        <div class="pc-mag01-sig">오늘도 느리게 · slow days<br>@sapmanri</div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Typo 01 — 타이포 중심형: 세로 사이드 텍스트, 대형 볼드 워드, 인용구, 하단 작은 사진
// ──────────────────────────────────────────────
function renderTypo01(pc) {
  return `
    <div class="pc-typo01">
      <div class="pc-typo01-side">CAPTURE YOUR MOMENTS</div>
      <div class="pc-typo01-main">
        <div class="pc-typo01-word">${esc(pc.label || 'SLOW')}</div>
        <div class="pc-typo01-quote">
          <span class="pc-typo01-qq">"</span>
          <div class="pc-typo01-qtext">${esc(pc.title || '')}</div>
          <div class="pc-typo01-attr">— @sapmanri</div>
        </div>
        <div class="pc-typo01-photo"><img src="${esc(pc.image)}" alt="" loading="lazy"></div>
        <div class="pc-typo01-sig">오늘도 느리게 · slow days · No.${esc(pc.number || '')}</div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Story 01 — 스토리/날짜형: 상단 타이틀+날짜, 대형 사진, 좌측 세로 텍스트 블록
// ──────────────────────────────────────────────
function renderStory01(pc) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit' })
    + '\n' + today.toLocaleDateString('en-US', { weekday:'long' });
  return `
    <div class="pc-story01">
      <div class="pc-story01-top">
        <div class="pc-story01-titlewrap">
          <div class="pc-story01-label">${esc(pc.label || '')}</div>
          <div class="pc-story01-title">${esc(pc.title || '')}</div>
        </div>
        <div class="pc-story01-datetag">
          <div class="pc-story01-brand">SAPMANRI</div>
          <div class="pc-story01-date">${today.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'})}</div>
          <div class="pc-story01-dow">${today.toLocaleDateString('en-US',{weekday:'long'})}</div>
        </div>
      </div>
      <div class="pc-story01-photo"><img src="${esc(pc.image)}" alt="" loading="lazy"></div>
      <div class="pc-story01-footer">
        <div class="pc-story01-side">오늘도 느리게 · slow days · @sapmanri</div>
        <div class="pc-story01-num">No.${esc(pc.number || '')}</div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Edit 01 — 편집숍/듀얼 포토형: 상단 대형 타이틀, 두 개 사진 그리드, 우측 텍스트 단락, 하단 서명
// ──────────────────────────────────────────────
function renderEdit01(pc) {
  return `
    <div class="pc-edit01">
      <div class="pc-edit01-title">${esc(pc.title || '')}</div>
      <div class="pc-edit01-sub">${esc(pc.label || '')}</div>
      <div class="pc-edit01-grid">
        <div class="pc-edit01-photoa"><img src="${esc(pc.image)}" alt="" loading="lazy"></div>
        <div class="pc-edit01-photob"><img src="${esc(pc.image)}" alt="" loading="lazy" style="filter:brightness(.75) contrast(1.1)"></div>
      </div>
      <div class="pc-edit01-body">
        <div class="pc-edit01-text">감성찾아삽만리의 기록 · 오늘도 느리게, 조금씩.<br><br>${esc(pc.label || '')}</div>
        <div class="pc-edit01-sig">
          <div class="pc-edit01-brand">— SAPMANRI</div>
          <div class="pc-edit01-num">No.${esc(pc.number || '')}</div>
        </div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Back Modern — "P O / S T" 세로, TO + 주소선(마지막 오렌지), 웹사이트
// ──────────────────────────────────────────────
function renderBackModern(pc, hasQr) {
  return `
    <div class="pc-back-modern">
      <div class="pc-bm-header">
        <div class="pc-bm-brand">SAPMANRI</div>
        <div class="pc-bm-post">P O<br>S T</div>
      </div>
      <div class="pc-bm-divider"></div>
      <div class="pc-bm-body">
        <div class="pc-bm-left"></div>
        <div class="pc-bm-right">
          <div class="pc-bm-to">T O</div>
          <div class="pc-bm-lines">
            <div class="pc-bm-line"></div>
            <div class="pc-bm-line"></div>
            <div class="pc-bm-line accent"></div>
          </div>
        </div>
      </div>
      <div class="pc-bm-footer">carousel-generator-roan.vercel.app</div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Back Centre — 상단 브랜드 중앙, 좌측 사진 섬네일, 우측 TO+주소선, 하단 서명
// ──────────────────────────────────────────────
function renderBackCentre(pc, hasQr) {
  return `
    <div class="pc-back-centre">
      <div class="pc-bc-brand">SAPMANRI</div>
      <div class="pc-bc-body">
        <div class="pc-bc-photo"><img src="${esc(pc.image)}" alt="" loading="lazy"></div>
        <div class="pc-bc-right">
          <div class="pc-bc-label">${esc(pc.label || '')}</div>
          <div class="pc-bc-to">TO</div>
          <div class="pc-bc-lines">
            <div class="pc-bc-line"></div>
            <div class="pc-bc-line"></div>
            <div class="pc-bc-line"></div>
          </div>
        </div>
      </div>
      <div class="pc-bc-footer">@sapmanri · No.${esc(pc.number || '')}</div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Back Seal — 발신자정보(좌상단), 우표박스(우상단), TO(중앙우), 원형씰(우하단)
// ──────────────────────────────────────────────
function renderBackSeal(pc, hasQr) {
  return `
    <div class="pc-back-seal">
      <div class="pc-bs-header">
        <div class="pc-bs-from">
          <div class="pc-bs-brand">SAPMANRI</div>
          <div class="pc-bs-addr">Wigong-ri, Seorak-myeon, Gapyeong-gun · Korea</div>
          <div class="pc-bs-web">carousel-generator-roan.vercel.app</div>
        </div>
        <div class="pc-bs-stamp"></div>
      </div>
      <div class="pc-bs-divider"></div>
      <div class="pc-bs-body">
        <div class="pc-bs-left"></div>
        <div class="pc-bs-right">
          <div class="pc-bs-to">TO:</div>
          <div class="pc-bs-lines">
            <div class="pc-bs-line"></div>
            <div class="pc-bs-line"></div>
          </div>
          <div class="pc-bs-seal">
            <div class="pc-bs-seal-inner">
              <div class="pc-bs-seal-text">SAPMANRI</div>
              <div class="pc-bs-seal-sub">slow days</div>
            </div>
          </div>
        </div>
      </div>
      <div class="pc-bs-footer">No.${esc(pc.number || '')} · @sapmanri</div>
    </div>
  `;
}
