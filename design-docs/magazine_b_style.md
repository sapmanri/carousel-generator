# Magazine B 스타일 디자인 시스템

캐러셀 생성기 `style: magazine-b` 기준 분석. 절제된 에디토리얼 미학 — 여백, 세리프, 사진 우선.

---

## 1. 컬러 팔레트

| 역할 | 색상 | 변수명 |
|---|---|---|
| 잉크(다크) | `#1a1a1a` | `--ink` |
| 캔버스(밝은 배경) | `#faf9f7` | `--canvas` |
| 페이퍼(라이트 그레이) | `#f2f0ec` | `--paper` |
| 페이퍼 웜톤 | `#ede9e3` | `--paper-warm` |
| 중간 톤 텍스트 | `#888580` | `--mid` |
| 보조 텍스트 | `#b5b2ad` | `--mute` |
| 헤어라인(선) | `#d8d5d0` | `--hairline` |
| 포인트 컬러 | `#b87a6e` | `--accent` |

---

## 2. 타이포그래피

- **세리프**: Cormorant Garamond → Noto Serif KR → Georgia
- **산세리프**: Noto Sans KR → Helvetica Neue → Arial
- 헤드라인은 항상 **세리프 + font-weight 300(가늘게)** — 굵은 명조가 아니라 라이트 명조
- 본문은 세리프 **이탤릭 9px**, 줄간격 1.65

### 헤드라인 크기
| 클래스 | 크기 | 용도 |
|---|---|---|
| `.s-headline-lg` | 28px | 표지(cover), line-height 0.95 |
| `.s-headline-md` | 20px | 분할(split) 레이아웃 |
| `.s-headline-dark` | 24px | 클로징(다크 배경) |
| `.s-headline-pull` | 19px | 인용(pull quote) |

---

## 3. 레이아웃 / 슬라이드 타입

### 표지 (cover)
- 배경: 사진 + 하단 그라디언트 오버레이(`ov-bottom`)
- 상단: `SAPMANRI` 마스트헤드 (7px, 자간 0.22em, 흰색 50% 투명도)
- 헤드라인: `.s-headline-lg`, 본문: 세리프 이탤릭

### 클로징 (closing)
- 배경: `#1a1a1a` 다크
- 좌측 룰(rule) 막대: 2px × 28px, accent 컬러
- 헤드라인: `.s-headline-dark` (흰색)
- 하단에 채널 태그 표시 (accent 컬러)

### 일반 피처 슬라이드
- 라벨(`.s-label`): 7px, 자간 0.16em, accent 컬러
- 헤드라인 + 본문(이탤릭)
- 레이아웃에 따라 overlay 방향 다름: `overlay_bottom`, `overlay_top`, `overlay_left`, `overlay_right`, `split_bottom`, `dark_full`

### 인용 (pull quote)
- 배경: `var(--paper)` (#f2f0ec)
- 좌측 accent 룰(rule) + `.s-headline-pull` + 잉크색 본문

---

## 4. 페이지 번호 (Folio)

- 우하단 고정, 7px, 자간 0.12em
- 배경에 따라 색상 변화: 밝은 배경 `rgba(255,255,255,0.3)`, 다크 `rgba(255,255,255,0.18)`, 잉크 배경 `var(--mute)`

---

## 5. 핵심 원칙

1. **여백이 핵심** — 텍스트는 절제되고, 사진이 주인공
2. 헤드라인은 항상 **라이트 웨이트 세리프** (굵은 산세리프 금지)
3. 본문은 항상 **이탤릭** — 캡션 같은 톤
4. 컬러는 거의 무채색 + accent 한 가지(`#b87a6e` 테라코타)만 사용
5. 오버레이는 사진의 톤을 살리면서 텍스트 가독성만 확보하는 최소한의 그라디언트
