# 감성찾아삽만리 (다크·감성) 스타일 디자인 시스템

캐러셀 생성기 `style: sapmanri` 기준 분석. 채널 자체 톤 — 다크 배경, 감성적, 산세리프 Bold.

---

## 1. 컬러 팔레트

| 역할 | 색상 |
|---|---|
| 메인 배경 | `#0e0e0e` |
| 보조 다크 배경(분할 하단) | `#1a1a1a` |
| 텍스트(메인) | `rgba(255,255,255,0.97)` |
| 본문 텍스트 | `rgba(255,255,255,0.5)` |
| 마스트헤드 | `rgba(255,255,255,0.22)` |
| accent | 슬라이드별 `accent_color` (기본 `#b87a6e`) |

→ 항상 다크 배경 기반, accent 컬러만 슬라이드마다 동적으로 바뀜

---

## 2. 타이포그래피

- 폰트: **Helvetica Neue / Arial / Noto Sans KR** — 산세리프, font-weight 700 (Nike와 유사하게 굵음)
- `.sm-title`: 22px, line-height 1.05, letter-spacing -0.01em, 흰색 97%
- `.sm-body`: 8px, font-weight 300, 흰색 50%, line-height 1.7
- 마스트헤드 `SAPMANRI`: 7px, 자간 0.22em, uppercase, 흰색 22%

---

## 3. 레이아웃 / 슬라이드 타입

### 클로징 (closing)
- 사진 + 다크 오버레이(`rgba(14,14,14,0.82)`) 또는 솔리드 다크
- `SAPMANRI` 마스트헤드(흰색 22%)
- accent 컬러 짧은 룰(18px×2px)
- `.sm-title` 20px + 본문 + 하단 채널 태그(accent 컬러, 자간 0.18em)

### 분할(split_bottom)
- 상단 57%: 사진 + 하단 그라디언트(`transparent` → `rgba(14,14,14,0.6)`)
- 하단: `#0e0e0e` 배경
  - 라벨(accent, 6px) + `.sm-title` 16px + 본문

### 텍스트 전용 슬라이드 (이미지 없음)
- `SAPMANRI` 마스트헤드 + `.sm-title` + 본문, 중앙 정렬 다크 배경

### 일반 피처/표지
- 사진 + 상/하 오버레이(`.sm-overlay-top`, `.sm-overlay-bottom`)
- 표지: `SAPMANRI` 마스트헤드(흰색 30%)
- 일반: 라벨(accent, 6px)
- `.sm-title` + accent 룰(`.sm-rule`) + 본문

---

## 4. 핵심 원칙

1. **항상 다크 배경** (`#0e0e0e` / `#1a1a1a`) — 채널의 시그니처 톤
2. 헤드라인은 굵은 산세리프(700) — Nike와 유사한 임팩트, 다만 대문자 변환은 안 함
3. accent 컬러는 슬라이드마다 동적으로 바뀜 — 사진의 분위기에 맞춰 포인트 컬러 선택
4. 마스트헤드는 항상 낮은 투명도(22~30%)로 은은하게 배치
5. 본문은 흰색 50% — 헤드라인 대비 확실히 낮은 위계
