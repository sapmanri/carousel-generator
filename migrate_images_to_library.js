// 기존 magazine/images/<issueId>/*.jpg → magazine/images/library/<hash>.<ext> 로 마이그레이션
// issues.json의 image/images/cover 경로를 새 라이브러리 경로로 갱신
const fs = require('fs');
const path = require('path');

const MAGAZINE_DIR = path.join(__dirname, 'magazine');
const ISSUES_FILE = path.join(MAGAZINE_DIR, 'issues.json');
const IMAGES_DIR = path.join(MAGAZINE_DIR, 'images');
const LIBRARY_DIR = path.join(IMAGES_DIR, 'library');

function hashImage(base64) {
  const len = base64.length;
  const sampleSize = Math.min(len, 4000);
  const step = Math.max(1, Math.floor(len / sampleSize));
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < len; i += step) {
    const c = base64.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) - h2 + c) | 0;
  }
  return `${len.toString(36)}_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

if (!fs.existsSync(LIBRARY_DIR)) fs.mkdirSync(LIBRARY_DIR, { recursive: true });

const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf8'));
const pathMap = {}; // old relative path (./images/...) -> new relative path (./images/library/<hash>.ext)

function processFile(oldRelPath) {
  // oldRelPath like "./images/061226-1/01_p1.jpg"
  if (!oldRelPath || pathMap[oldRelPath]) return pathMap[oldRelPath];
  const rel = oldRelPath.replace(/^\.\//, ''); // images/061226-1/01_p1.jpg
  const fullPath = path.join(MAGAZINE_DIR, rel);
  if (!fs.existsSync(fullPath)) {
    console.warn('  ! missing file:', fullPath);
    return oldRelPath;
  }
  const buf = fs.readFileSync(fullPath);
  const base64 = buf.toString('base64');
  const hash = hashImage(base64);
  const ext = path.extname(fullPath).slice(1).toLowerCase().replace('jpeg', 'jpg');
  const newFilename = `${hash}.${ext}`;
  const newFullPath = path.join(LIBRARY_DIR, newFilename);
  if (!fs.existsSync(newFullPath)) {
    fs.writeFileSync(newFullPath, buf);
    console.log('  + library/' + newFilename, '  (from', rel + ')');
  } else {
    console.log('  = library/' + newFilename, '  (already exists, dedup from', rel + ')');
  }
  const newRelPath = `./images/library/${newFilename}`;
  pathMap[oldRelPath] = newRelPath;
  return newRelPath;
}

for (const issue of issues.issues || []) {
  console.log('Issue:', issue.id);
  if (issue.cover) issue.cover = processFile(issue.cover);
  for (const pg of issue.pages || []) {
    if (pg.image) pg.image = processFile(pg.image);
    if (Array.isArray(pg.images)) pg.images = pg.images.map(processFile);
  }
}

fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2));
console.log('\nDone. issues.json updated.');
console.log('Old per-issue folders can be removed after verifying:', Object.keys(pathMap).length, 'unique files mapped.');
