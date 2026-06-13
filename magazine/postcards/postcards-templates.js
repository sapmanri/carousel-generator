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
  switch (pc.template) {
    case 'expo-01':
    default:
      return side === 'back' ? renderExpo01Back(pc, hasQr) : renderExpo01(pc, hasQr);
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
