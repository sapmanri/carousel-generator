# SAPMANRI 웹매거진 디자인 시스템 v1.0

기존 `jeonwon_magazine_style.md`(표지) + `magazine_inner_pages.md`(캐러셀 내지)를
**웹 매거진**(index.html / issue.html) 포맷으로 확장한 문서.
참조 이미지: Feldman Projects 그리드(표지), Pinterest 화보집 레이아웃(내지).

---

## 1. 컬러 팔레트 (공통)

| 역할 | 값 |
|---|---|
| 워드마크 / 포인트 | `#E8762C` (오렌지) |
| 캔버스(라이트) | `#FAF5EE` (크림) |
| 캔버스(다크) | `#120E0C` |
| 보조 그린 | `#B2CDA8` (세이지) |
| 본문 텍스트(라이트 배경) | `#1A1A1A` |
| 본문 텍스트(다크 배경) | `#FAF5EE` |
| 보더/헤어라인 | `#D8D5D0` |

폰트: 헤드라인 **Gowun Batang**(serif), 본문/UI **Noto Sans KR** (Light/Regular).
고정 태그(워드마크 서브): `오늘도 느리게 · slow days`

---

## 2. index.html — 프론트 메인 (표지/아카이브)

참조: Feldman Projects 그리드 (이미지 1)

### 구조
1. **상단 바**: 좌측 워드마크 "SAPMANRI" (Gowun Batang Bold, 오렌지) + 서브 태그.
   우측: 발행 정보 "2026 · Vol. N" + 메뉴(전체보기/About)
2. **번호 그리드(Projects 그리드 차용)**:
   - 다크(`#120E0C`) 배경 위에 카드형 그리드
   - 각 호(issue)는 번호(01, 02…) + 썸네일 사진 + 제목 + 부제(장소/날짜)
   - 그리드: 데스크탑 4~5열, 모바일 1~2열, 카드 사이 12px 갭
   - 호버 시 썸네일 살짝 확대(scale 1.02), 번호는 오렌지로 강조
3. **정렬 옵션**: "최신순 / 가나다순" 텍스트 토글 (좌상단, 작게)
4. **하단**: 워드마크 대형 + "Projects"류의 큰 세리프 워터마크 텍스트 (페이지 장식)

### 카드 컴포넌트
```
[번호 - 오렌지, Gowun Batang]
[썸네일 이미지 - 4:3 또는 3:4]
[제목 - Gowun Batang, 16-18px]
[부제 - Noto Sans KR Light, 11px, 회색]
```
클릭 → `issue.html?id=<issueId>`

---

## 3. issue.html — 이너페이지 리더 (호별 상세)

참조: Pinterest 화보집 — 풀블리드 사진+텍스트 블록, 인물 클로즈업, 그룹 사진 콜라주 (이미지 2-6)

### 공통
- 페이지 상단 고정 미니바: "← SAPMANRI" + "0N / 전체" 페이지 인디케이터
- 좌우 스와이프/스크롤로 페이지 전환 (모바일 세로 스크롤 기본, 데스크탑 좌우 화살표)
- 배경: 크림(`#FAF5EE`) 또는 다크(`#120E0C`) — 페이지 타입별 지정

### 페이지 타입 (magazine_inner_pages.md 7타입의 웹 버전)

**Type 1 — Cover (표지 페이지)**
워드마크 + 헤드라인(2줄, Gowun Batang) + 호 정보(발행월/이슈번호) + 목차 리스트.
다크 배경, 메인 사진은 배경 풀블리드 + 다크 그라데이션 오버레이.

**Type 2 — Full Bleed Photo (풀블리드 화보)**
사진 1장 전체화면(비율 유지, object-fit:contain on 크림 배경 — 이미지 2,3,5 참조처럼
사진이 종이 텍스처 위에 올려진 느낌). 캡션은 사진 하단 또는 옆 여백에 명조 1줄.
- 데스크탑: 사진 최대 폭 1100px, 크림 패딩 60px+
- 캡션 위치: 사진 아래 좌측, Gowun Batang 18-22px

**Type 3 — Index/Contents**
다크 배경. "Contents" 라벨 + 번호·제목 리스트(오렌지 번호 + 크림 제목).
각 항목 클릭 시 해당 페이지로 점프.

**Type 4 — Photo + Story Split (2단)**
좌 60% 사진 / 우 40% 텍스트(또는 반대), 데스크탑 가로 분할·모바일은 세로 스택.
텍스트 영역: 크림 또는 다크 솔리드, 본문은 Vase 문체 글(2-4문단), 상단에 작은 라벨(소제목).

**Type 5 — Grid Collage (그리드 콜라주)**
참조: Pinterest 3분할 그리드(이미지 5 하단) — 2x2 또는 1+2 비대칭.
사진 사이 8-12px 간격, 캡션은 그리드 하단에 작게.

**Type 6 — Quote/Highlight**
다크 배경 또는 흐린 사진 배경. 중앙에 큰 명조 인용구(48-64px), 위아래 얇은 오렌지 라인.

**Type 7 — Closing**
표지와 짝. 클로징 문구 + "유튜브에서 전체 영상 보기 · @sapmanri" + 워드마크 대형.

**Type 8 — Spread (와이드 스프레드)**
참조: Pinterest 화보집의 가로로 긴 풀스프레드 사진 (이미지 첨부 참조).
사진 1장이 2페이지에 걸친 느낌을 구현한다.
- **PC/패드(900px 이상)**: 한 화면에 사진 전체 + 좌우 여백에 짧은 캡션 2개 (좌측/우측)
- **모바일**: 같은 사진을 절반으로 나눠 두 개의 별도 페이지로 순서대로 표시 — 왼쪽 절반(객체 위치 left)이 먼저, 오른쪽 절반(객체 위치 right)이 다음. 각 절반에 해당 캡션이 따로 붙는다.
- 데이터 구조: `{ "type": "spread", "image": "...", "captionLeft": "...", "captionRight": "..." }`
- 용도: 풍경/그룹샷처럼 한 장으로도 압도적인 와이드 사진을 매거진 특유의 "스프레드 펼침" 감각으로 보여줄 때

### 캐러셀 모듈 재사용
Type 5(그리드)나 여러 사진이 들어가는 페이지는 기존 **carousel_ai_generator 캐러셀 렌더 로직**을
가져와 "스와이프형 캐러셀" 위젯으로 표시 가능 (모바일에서 가로 스와이프).

---

## 4. editor.html — 백엔드 작성 도구

### 워크플로우
1. **사진 업로드** (다중) → 각 사진 `SapmanriCache.hashImage()` 후
   `analyzeImage()`(공유 모듈)로 분석 → 분위기/밝기/추천 캡션 등 메타 추출 (캐시 공유)
2. **페이지 빌더**: 분석된 사진들을 위 7개 타입 중 하나에 드래그 배치
3. **글 생성**: writing_studio의 `generateText()` 로직 재사용 —
   사진 + 컨텍스트 → Vase 문체 글 생성, profile_data.json(문체 규칙/예시) 그대로 사용
4. **직접 입력**: 글 직접 타이핑도 가능 (생성 결과 수정 포함)
5. **발행**: "발행하기" 클릭 시
   - 첨부 사진들을 `magazine/images/<issueId>/`로 GitHub Contents API에 커밋
   - 페이지 데이터(타입, 텍스트, 이미지 경로, 캡션)를 `magazine/issues.json`에 추가/갱신

### UI 톤
기존 writing_studio / carousel_ai_generator와 동일한 다크 에디터 톤
(`--bg:#1a1a1a`, `--accent:#b87a6e`, Noto Sans KR Light, JetBrains Mono 라벨).

---

## 5. 데이터 구조 — issues.json

```json
{
  "issues": [
    {
      "id": "2026-06-2",
      "number": "Vol. 12",
      "title": "내 손으로 만든 작은 불빛 하나",
      "subtitle": "Wigong-ri, Gapyeong",
      "date": "2026-06-13",
      "cover": "images/2026-06-2/cover.jpg",
      "pages": [
        { "type": "cover", "headline": ["내 손으로 만든","작은 불빛 하나"], "toc": ["장미 울타리","직조 전등","산딸기"] },
        { "type": "fullbleed", "image": "images/2026-06-2/01.jpg", "caption": "..." },
        { "type": "split", "image": "images/2026-06-2/02.jpg", "label": "아침의 루틴", "text": "..." },
        { "type": "grid", "images": ["...","...","..."], "caption": "..." },
        { "type": "quote", "text": "...", "context": "6월의 느린 하루 중" },
        { "type": "closing", "text": "오늘도 느리게, 잘 보냈습니다" }
      ]
    }
  ]
}
```

---

## 6. 핵심 원칙

1. 워드마크 SAPMANRI는 항상 동일 색(`#E8762C`)·동일 폰트(Gowun Batang Bold)
2. 사진은 가공 없이, 텍스트는 항상 여백에
3. 다크(표지/인용/클로징/목차) ↔ 크림(화보/스토리) 배경 교차로 리듬감
4. 모바일 우선: index는 그리드 1-2열, issue는 세로 스크롤 기본
5. 글 생성·이미지 분석은 기존 공유 모듈(SapmanriCache, profile_data.json) 그대로 재사용 — 중복 구현 금지
