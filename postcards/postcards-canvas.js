// ══════════════════════════════════════════════════════════════
// SAPMANRI Postcard — 다운로드용 캔버스 합성
// 화면 미리보기(postcards-templates.js의 HTML/CSS)와 별개로,
// 인쇄 가능한 고해상도 PNG를 <canvas>에 직접 그려서 다운로드한다.
// 4x6인치 표준 포스트카드 비율(2:3), 1200x1800px (~300dpi급)
// ══════════════════════════════════════════════════════════════

const PC_CANVAS_W = 1200;
const PC_CANVAS_H = 1800;

// 템플릿별 캔버스 렌더러 — postcards-templates.js의 HTML 레이아웃과 동일한 비율/배치를 사용한다.
const CANVAS_RENDERERS = {
  'expo-01': { front: drawExpo01, back: drawExpo01Back },
};

async function downloadPostcard(idx, side) {
  side = side || 'front';
  const pc = window.__postcards[idx];
  const label = document.getElementById(side === 'back' ? 'dlBack' + idx : 'dlFront' + idx);
  const issue = (window.__issues || []).find(x => x.id === pc.issueId);
  const youtubeUrl = issue && issue.youtubeUrl;

  const original = label.textContent;
  label.innerHTML = '<span class="spinner"></span>준비 중…';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = PC_CANVAS_W;
    canvas.height = PC_CANVAS_H;
    const ctx = canvas.getContext('2d');

    const renderers = CANVAS_RENDERERS[pc.template] || CANVAS_RENDERERS['expo-01'];
    const renderer = side === 'back' ? renderers.back : renderers.front;
    await renderer(ctx, pc, youtubeUrl);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sapmanri-postcard-${pc.number || idx + 1}-${side}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    label.textContent = original;
  } catch (e) {
    label.textContent = '오류';
    setTimeout(() => { label.textContent = original; }, 2500);
  }
}

// 이미지를 cover 방식으로 캔버스 영역에 그린다 (object-fit:cover와 동일)
function drawImageCover(ctx, img, x, y, w, h) {
  const ir = img.naturalWidth / img.naturalHeight;
  const tr = w / h;
  let sx, sy, sw, sh;
  if (ir > tr) {
    sh = img.naturalHeight;
    sw = sh * tr;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / tr;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Expo 01 — 전시 포스터 스타일 캔버스 렌더러 (postcards-templates.js의 renderExpo01과 동일 배치)
async function drawExpo01(ctx, pc, youtubeUrl) {
  const W = PC_CANVAS_W, H = PC_CANVAS_H;

  // 배경
  ctx.fillStyle = '#FAF5EE';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1A1A1A';

  const padX = W * 0.08;

  // 상단: 라벨 + 번호
  ctx.font = `300 ${Math.round(W * 0.013)}px "Noto Sans KR", sans-serif`;
  ctx.fillStyle = 'rgba(26,26,26,0.5)';
  ctx.textBaseline = 'top';
  const topY = H * 0.045;
  ctx.fillText('S A P M A N R I', padX, topY);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillText(pc.label || '', padX, topY + W * 0.022);

  ctx.textAlign = 'right';
  ctx.font = `700 ${Math.round(W * 0.045)}px "Gowun Batang", serif`;
  ctx.fillText(pc.number || '', W - padX, H * 0.03);
  ctx.textAlign = 'left';

  // 사진 영역
  const photoX = padX;
  const photoY = H * 0.11;
  const photoW = W - padX * 2;
  const photoH = H * 0.57;
  ctx.fillStyle = '#1d1815';
  ctx.fillRect(photoX, photoY, photoW, photoH);
  try {
    const img = await loadImage(pc.image);
    drawImageCover(ctx, img, photoX, photoY, photoW, photoH);
  } catch (e) {
    // 이미지 로드 실패해도 나머지는 그려서 다운로드 가능하게
  }

  // 하단: 제목
  const bottomX = padX;
  let bottomY = H * 0.68;
  ctx.fillStyle = '#1A1A1A';
  ctx.font = `700 ${Math.round(W * 0.033)}px "Gowun Batang", serif`;
  bottomY = wrapText(ctx, pc.title || '', bottomX, bottomY, W - padX * 2, W * 0.042);
  bottomY += H * 0.025;

  // 메타 텍스트 (좌하단)
  ctx.font = `300 ${Math.round(W * 0.011)}px "Noto Sans KR", sans-serif`;
  ctx.fillStyle = 'rgba(26,26,26,0.4)';
  const metaY = H * 0.945 - W * 0.011 * 1.7 * 2;
  ctx.fillText('오늘도 느리게 · slow days', bottomX, metaY);
  ctx.fillText('@sapmanri', bottomX, metaY + W * 0.011 * 1.7);

  // QR 코드 (우하단) — 연결된 호의 유튜브 링크가 있을 때만 표시
  if (youtubeUrl && window.QRCode) {
    const qrSize = W * 0.13;
    const qrX = W - padX - qrSize;
    const qrY = H * 0.945 - qrSize;
    const qrCanvas = document.createElement('canvas');
    await new Promise((resolve) => {
      QRCode.toCanvas(qrCanvas, youtubeUrl, { width: qrSize, margin: 0, color: { dark: '#1A1A1A', light: '#FFFFFF' } }, () => resolve());
    });
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.strokeRect(qrX, qrY, qrSize, qrSize);
  }
}

// 줄바꿈 텍스트 그리기 (한국어 word-break:keep-all 근사 — 어절 단위로 줄바꿈)
// 반환값: 마지막으로 그린 줄의 baseline + lineHeight (다음 콘텐츠의 y 시작점)
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  ctx.textBaseline = 'top';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
  return curY;
}

// Expo 01 뒷면 — 클래식 우편엽서 레이아웃 (renderExpo01Back의 HTML과 동일 배치)
async function drawExpo01Back(ctx, pc) {
  const W = PC_CANVAS_W, H = PC_CANVAS_H;
  const padX = W * 0.06;
  const padY = H * 0.06;

  // 배경
  ctx.fillStyle = '#FAF5EE';
  ctx.fillRect(0, 0, W, H);

  // 상단 "POST CARD"
  ctx.fillStyle = '#1A1A1A';
  ctx.font = `700 ${Math.round(W * 0.028)}px "Gowun Batang", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // 자간을 살짝 벌려서 표시 (letter-spacing 근사)
  drawSpacedText(ctx, 'POST CARD', W / 2, padY, W * 0.012);
  ctx.textAlign = 'left';

  const bodyTop = padY + H * 0.08;
  const bodyBottom = H - padY;
  const dividerX = W * 0.52;

  // 좌측: 브랜드 + 캡션 + 서브텍스트 (하단 정렬)
  ctx.font = `700 ${Math.round(W * 0.014)}px "Gowun Batang", serif`;
  ctx.fillStyle = '#E8762C';
  let subY = bodyBottom - H * 0.07;
  ctx.fillText('SAPMANRI', padX, subY - H * 0.16);

  ctx.fillStyle = '#1A1A1A';
  ctx.font = `400 ${Math.round(W * 0.018)}px "Gowun Batang", serif`;
  wrapText(ctx, pc.title || '', padX, subY - H * 0.13, dividerX - padX * 2, W * 0.026);

  ctx.fillStyle = 'rgba(26,26,26,0.4)';
  ctx.font = `300 ${Math.round(W * 0.0085)}px "Noto Sans KR", sans-serif`;
  ctx.fillText('오늘도 느리게 · slow days', padX, subY);
  ctx.fillText(`@sapmanri · No.${pc.number || ''}`, padX, subY + W * 0.0085 * 1.8);

  // 구분선
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX, bodyTop);
  ctx.lineTo(dividerX, bodyBottom);
  ctx.stroke();

  // 우측: 우표 박스 + 주소란
  const rightX = dividerX + W * 0.04;
  const rightW = W - padX - rightX;
  const stampSize = rightW * 0.22;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.strokeRect(W - padX - stampSize, bodyTop, stampSize, stampSize * 5 / 4);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = `300 ${Math.round(W * 0.01)}px "Noto Sans KR", sans-serif`;
  drawSpacedText(ctx, 'TO', rightX, bodyBottom - H * 0.16, W * 0.006);

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 3; i++) {
    const y = bodyBottom - H * 0.12 + i * (H * 0.045);
    ctx.beginPath();
    ctx.moveTo(rightX, y);
    ctx.lineTo(W - padX, y);
    ctx.stroke();
  }
}

// 자간(letter-spacing)을 적용해 텍스트를 그린다 (ctx.textAlign='center'일 때는 중앙 기준으로 보정)
function drawSpacedText(ctx, text, x, y, spacing) {
  const chars = text.split('');
  let totalWidth = 0;
  for (const c of chars) totalWidth += ctx.measureText(c).width + spacing;
  totalWidth -= spacing;

  let startX = x;
  if (ctx.textAlign === 'center') startX = x - totalWidth / 2;
  else if (ctx.textAlign === 'right') startX = x - totalWidth;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let cx = startX;
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prevAlign;
}
