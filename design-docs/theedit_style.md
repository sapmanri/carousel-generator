# 디에디트(The Edit) 스타일 디자인 시스템

캐러셀 생성기 `style: theedit` 기준 분석. 큐레이션 매거진 · 정보 전달형 · 깔끔한 화이트.

---

## 1. 컬러 팔레트

| 역할 | 색상 | 변수명 |
|---|---|---|
| 블랙 | `#111` | `--te-black` |
| 화이트 | `#fff` | `--te-white` |
| 라이트 그레이 배경 | `#f5f5f5` | `--te-gray` |
| 중간 톤 | `#888` | `--te-mid` |
| accent (포인트 오렌지/레드) | `#ff3c00` | `--te-accent` |

---

## 2. 타이포그래피

- 폰트: **Helvetica Neue / Arial / Noto Sans KR** — 산세리프만, 세리프 없음
- 헤드라인: **font-weight 700**, line-height 1.0, letter-spacing -0.02em (압축적)
- 라벨: 7px, font-weight 500, 자간 0.14em, uppercase, accent 컬러(`#ff3c00`)

### 헤드라인 크기
| 클래스 | 크기 |
|---|---|
| `.te-headline` | 26px (표지/클로징) |
| `.te-headline-sm` | 18px (분할/인용) |

---

## 3. 레이아웃 / 슬라이드 타입

### 표지 (cover)
- 사진 + 상단→투명 그라디언트(`linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 50%)`)
- 마스트헤드: `THE EDIT × SAPMANRI` (7px, bold, 자간 0.22em, 흰색 60%)
- 헤드라인 흰색 `.te-headline`

### 클로징 (closing)
- 사진 + 다크 오버레이(`rgba(0,0,0,0.72)`) 또는 솔리드 블랙
- 마스트헤드(흰색 40%) + accent 룰(rule, 20px×3px)
- 헤드라인 흰색 22px + 본문 + 채널 태그(accent 컬러, bold, 자간 0.16em)

### 분할(split_bottom)
- 상단 55%: 사진
- 하단 45%: **화이트 배경**(`#fff`)
  - 라벨(accent 컬러) + `.te-headline-sm` + 본문

### 일반 피처
- 사진 배경 + **하단 화이트 텍스트 박스**(`.te-txt-box`, 둥근 모서리 없음, 패딩만)
  - 라벨 + 헤드라인 + 본문, 모두 잉크색(블랙)

### 인용(pull quote)
- 배경: `var(--te-gray)` (#f5f5f5)
- 중앙 정렬, accent 룰(24px×3px) + `.te-headline-sm` + 본문

---

## 4. 핵심 원칙

1. **화이트/그레이/블랙 + accent 한 색(`#ff3c00`)** — 매거진B보다 채도 높은 포인트
2. 사진 위에 직접 글씨를 얹지 않고, **화이트 텍스트 박스를 사진 아래/위에 배치**하는 구조가 핵심
3. 헤드라인은 굵고 압축적(negative letter-spacing) — 정보 밀도가 높은 느낌
4. 라벨은 항상 accent 컬러로 강조 — "카테고리 태그" 역할
5. 클로징만 다크, 나머지는 화이트/그레이 기반 — 밝고 정보 중심적인 톤
