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
  'expo-01': drawExpo01,
};

async function downloadPostcard(idx) {
  const pc = window.__postcards[idx];
  const label = document.getElementById('dlLabel' + idx);
  const issue = (window.__issues || []).find(x => x.id === pc.issueId);
  const youtubeUrl = issue && issue.youtubeUrl;

  label.innerHTML = '<span class="spinner"></span>준비 중…';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = PC_CANVAS_W;
    canvas.height = PC_CANVAS_H;
    const ctx = canvas.getContext('2d');

    const renderer = CANVAS_RENDERERS[pc.template] || CANVAS_RENDERERS['expo-01'];
    await renderer(ctx, pc, youtubeUrl);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sapmanri-postcard-${pc.number || idx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    label.textContent = '↓ 다운로드';
  } catch (e) {
    label.textContent = '오류: ' + (e.message || '다운로드 실패');
    setTimeout(() => { label.textContent = '↓ 다운로드'; }, 2500);
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

  // QR 코드 (우하단)
  const qrSize = W * 0.13;
  const qrX = W - padX - qrSize;
  const qrY = H * 0.945 - qrSize;
  if (youtubeUrl && window.QRCode) {
    const qrCanvas = document.createElement('canvas');
    await new Promise((resolve) => {
      QRCode.toCanvas(qrCanvas, youtubeUrl, { width: qrSize, margin: 0, color: { dark: '#1A1A1A', light: '#FFFFFF' } }, () => resolve());
    });
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.strokeRect(qrX, qrY, qrSize, qrSize);
  } else {
    // 연결된 호가 없으면 빈 칸으로 표시
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
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
