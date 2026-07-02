/**
 * sapmanri_constitution.js
 * SAPMANRI Writing Constitution — 정적 데이터 + 빌더 함수
 *
 * Single Source of Truth.
 * 모든 데이터는 writing_studio.html v5에서 100% 추출.
 * 프롬프트, 문체, QC 규칙을 이 파일 외에서 정의하거나 복사하지 않는다.
 *
 * ── 문체 소스 역할 정의 (2026-07-02, Decision Log 기록) ──────────
 *   sapmanri_constitution.js = 문체 철학 / 금지 규칙 / QC 기준 /
 *                              공통 프롬프트 규칙의 Single Source of Truth
 *   profile_data.json        = vase 실제 예문 / AI 초안→vase 수정본 pairs /
 *                              실사용 문체 데이터 저장소 (규칙의 원천 아님,
 *                              Writing Studio 편집 UI가 실시간으로 관리하는
 *                              살아있는 예문 DB)
 * 새 문체 규칙/금지 패턴이 생기면 반드시 이 파일에만 추가한다.
 * Magazine/Carousel/Skyline/Postcard에 별도로 하드코딩하지 않는다.
 *
 * 사용법:
 *   <script src="/sapmanri_constitution.js"></script>
 *   window.SapConstitution.SAPMANRI_CONSTITUTION
 *   window.SapConstitution.buildConstitutionText()
 *   window.SapConstitution.buildAvoidExamplesText()
 *   window.SapConstitution.buildOutputContractText(type, opts)
 */
(function (global) {
  // ── 출력 타입 레이블 ──────────────────────────────────────────
  const TYPE_LABEL = {
    webmag:       '웹매거진',
    sapmanri_blog:'삽만리닷컴 블로그',
    naver_blog:   '네이버 블로그',
    pause_book:   '잠깐 멈춰.',
    instagram:    '인스타 캡션',
    youtube:      '유튜브',
    carousel:     '인스타 캐러셀',
    postcard:     '포스트카드',
    skyline:      'Skyline Music Matcher',
    poem:         '시·산문',
    blog:         '블로그'
  };
  const VOICE_LABEL = {
    sapmanri:   'Sapmanri Voice',
    pause_book: '잠깐 멈춰 Voice'
  };
  const OUTPUT_PRIORITY = ['webmag','sapmanri_blog','naver_blog','pause_book','instagram','youtube','carousel','postcard','skyline'];

  // ── 구조 선택지 ───────────────────────────────────────────────
  const OPEN_OPTIONS = ['사물','행동','소리','빛','대화','상태'];
  const DEV_OPTIONS  = ['관찰','기억','비교','발견','대조','누락된 것'];
  const END_OPTIONS  = ['열린 끝','장면 끝','질문 끝','침묵 끝','사물 끝','행동 끝'];

  // ── 출력 규격 ─────────────────────────────────────────────────
  const OUTPUT_PROFILES = {
    webmag: {
      label:'웹매거진', defaultChars:2600, shortChars:1600, normalChars:2600, longChars:4200,
      minChars:1800, maxChars:5000,
      spec:[
        '제목 1개, 리드 1개, 본문 4~8개 섹션',
        '사진/장면을 기반으로 하지만 사진 설명문처럼 쓰지 않음',
        'SEO는 약하게. 읽는 흐름과 문체 우선',
        '마지막은 정리문이 아니라 장면 안의 사물/움직임으로 닫음'
      ]
    },
    sapmanri_blog: {
      label:'삽만리닷컴 블로그', defaultChars:1500, shortChars:900, normalChars:1500, longChars:2200,
      minChars:1200, maxChars:2600,
      spec:[
        '제목, 본문, SEO Focus keyphrase, Meta description, Slug 후보 3개, 태그 포함',
        '본문 1200자 이상 권장. 웹사이트용이라 너무 일기처럼 흐르지 않음',
        'Focus keyphrase와 Meta description은 반드시 출력',
        '태그는 #버전과 키워드형을 함께 고려'
      ]
    },
    naver_blog: {
      label:'네이버 블로그', defaultChars:2200, shortChars:1500, normalChars:2200, longChars:3000,
      minChars:1500, maxChars:3500,
      spec:[
        '전체 본문 최소 1500자 이상',
        '핵심 키워드 8~12회 자연 반복. 사용자가 키워드를 넣으면 그 키워드를 우선',
        '첫 두 줄에 핵심 키워드 포함',
        '중간 소제목 3~5개, 사진 위치 [사진 1] 등 5~10개 제안',
        '태그 10~20개. 검색용이지만 광고문처럼 쓰지 않음'
      ]
    },
    pause_book: {
      label:'잠깐 멈춰.', defaultChars:800, shortChars:450, normalChars:800, longChars:1200,
      minChars:400, maxChars:1600,
      spec:[
        '책 원고 후보. SEO, 해시태그, 홍보문 금지',
        '짧은 행갈이, 여백, 잔향 유지',
        '관찰을 충분히 쌓은 뒤 아주 작은 인식만 남김',
        '추상명사보다 구체적인 사물로 끝냄'
      ]
    },
    instagram: {
      label:'인스타', defaultChars:500, shortChars:250, normalChars:500, longChars:800,
      minChars:200, maxChars:900,
      spec:[
        '첫 줄은 장면을 붙잡는 짧은 문장',
        '본문 2~6문장 또는 짧은 행갈이',
        '해시태그는 반드시 5개만 출력',
        '서두르지 않았다/별것 없다/충분했다 남발 금지'
      ]
    },
    youtube: {
      label:'유튜브', defaultChars:900, shortChars:500, normalChars:900, longChars:1300,
      minChars:500, maxChars:1600,
      spec:[
        '제목 후보 5개, 설명란, 고정댓글, 해시태그 포함',
        '첫 두 줄은 검색과 클릭을 고려',
        '시골살이/전원주택/마당있는 집/먼저 살아보고 있습니다 맥락 반영',
        '필요하면 타임라인 섹션 포함'
      ]
    },
    carousel: {
      label:'캐러셀', defaultChars:420, shortChars:250, normalChars:420, longChars:700,
      minChars:200, maxChars:900,
      spec:[
        '카드 5~8장',
        '각 카드 1~3줄',
        '첫 카드는 제목, 마지막 카드는 장면 또는 여운',
        '카드별 문장만 명확히 분리'
      ]
    },
    postcard: {
      label:'포스트카드', defaultChars:120, shortChars:40, normalChars:120, longChars:220,
      minChars:30, maxChars:300,
      spec:[
        '1줄 문장 5개 + 2~4행 짧은 문장 3개',
        '명언처럼 완성하지 않음',
        '이미지 위 여백을 고려',
        '사물/빛/거리/손/속도 중 하나가 남게 함'
      ]
    },
    skyline: {
      label:'Skyline', defaultChars:180, shortChars:80, normalChars:180, longChars:350,
      minChars:60, maxChars:500,
      spec:[
        '음악 매칭용 장면 해석',
        'mood words, tempo words, texture words 포함',
        '긴 산문 금지. 음악 추천에 필요한 감정/속도/밀도 중심',
        '한 줄 요약 포함'
      ]
    }
  };

  // ── 출력 타입별 지시문 ────────────────────────────────────────
  const TYPE_INSTRUCTION = {
    webmag: `웹매거진 원고를 생성한다.
- 입력이 이미지든 텍스트든 둘 다든, 먼저 Vase가 쓴 것 같은 Original Draft를 만든 뒤 웹매거진 문장으로 정리한다
- 제목 1개, 리드문 1개, 본문 4~8개 섹션을 출력한다
- 지정 글자수에 맞춘다. 기본은 2600자 안팎이다
- 사진 설명문처럼 쓰지 말고 장면에서 시작한다
- 본문은 삽만리 웹매거진에 바로 넣을 수 있는 길이와 호흡
- 마지막은 교훈이 아니라 장면/사물/행동으로 닫는다`,

    sapmanri_blog: `삽만리닷컴 블로그 글을 생성한다.
- 제목, 본문, SEO Focus keyphrase, Meta description, slug 후보, 태그를 반드시 포함한다
- 본문은 지정 글자수에 맞춘다. 기본은 1500자, 최소 1200자 이상이다
- 검색 키워드는 자연스럽게 넣되 문체를 해치지 않는다
- 한글 중심, 필요하면 짧은 영문 보조 문장 허용
- 반드시 Focus keyphrase와 Meta description을 함께 제공한다
- Meta description은 120~155자 안팎으로 작성한다`,

    naver_blog: `네이버 블로그 글을 생성한다.
- 제목, 첫 두 줄 SEO 도입, 본문, 소제목 3~5개, 마무리, 태그를 포함한다
- 전체 본문은 지정 글자수에 맞춘다. 기본은 2200자, 최소 1500자 이상이다
- 핵심 키워드는 8~12회 자연스럽게 반복한다. 키워드를 모르면 제목/입력에서 하나를 정하고 명시한다
- 사진이 들어갈 위치를 [사진 1], [사진 2]처럼 5~10개 제안한다
- 삽만리 문체를 유지하되 네이버 검색 유입을 위해 조금 더 설명적이어도 된다
- 광고문처럼 쓰지 않는다`,

    pause_book: `산문집 《잠깐 멈춰.》 원고 후보를 생성한다.
- 책 문체 전용. 블로그처럼 설명하지 않는다
- 짧은 행갈이, 여백, 잔향을 유지한다
- 감정을 직접 말하지 말고 사물, 손, 빛, 거리, 속도, 이름과 몸의 차이로 남긴다
- 교훈, 홍보, SEO, 해시태그 금지
- 오래 보존될 문장처럼 쓰되 과하게 예쁘게 꾸미지 않는다`,

    instagram: `인스타그램 캡션을 생성한다.
- 첫 줄은 장면을 붙잡는 짧은 문장
- 본문은 2~5문장 또는 짧은 행갈이 산문
- 해시태그는 반드시 5개만 제공한다
- 같은 말(서두르지 않았다, 별것 없다, 충분했다) 반복 금지
- 홍보문보다 오늘의 장면 기록에 가깝게`,

    youtube: `유튜브 텍스트를 생성한다.
- 제목 후보 5개
- 설명란 본문
- 고정댓글 1개
- 해시태그 5~8개
- 첫 두 줄은 검색과 클릭을 고려하되 삽만리 톤을 해치지 않는다
- 시골살이/전원주택/마당있는 집/먼저 살아보고 있습니다 맥락을 필요할 때 반영한다`,

    carousel: `인스타 캐러셀용 문장을 생성한다.
- 카드 1~7장 구조로 나눈다
- 각 카드는 1~3줄, 짧고 명확하게
- 카드 문장은 이미지 위에 얹어도 읽히는 길이여야 한다
- 첫 카드는 제목, 마지막 카드는 여운 또는 장면으로 닫는다
- 출력은 카드 번호와 카드별 문장으로 정리한다`,

    postcard: `포스트카드용 짧은 문장을 생성한다.
- 1줄 문장 5개, 2~4행 짧은 문장 3개를 제안한다
- 너무 완성된 명언처럼 쓰지 않는다
- 이미지 위에 얹었을 때 여백이 살아야 한다
- 사물/빛/거리/손/속도 중 하나가 남게 한다`,

    skyline: `Skyline Music Matcher용 텍스트를 생성한다.
- 장면의 감정, 리듬, 속도, 밀도, 색온도를 짧게 정리한다
- 음악 매칭에 쓸 수 있도록 mood words, tempo words, texture words를 포함한다
- 설명은 기술적이기보다 감각적으로 쓴다
- 필요하면 추천 문장 3개와 검색 키워드 8~12개를 제공한다`,

    poem: `짧은 시 또는 산문시 후보를 생성한다.
- 한 호흡 단위로 행을 끊는다
- 장면과 사물로 감정을 드러내고, 감정을 직접 설명하지 않는다
- 교훈형 결말을 붙이지 않는다
- 해시태그 없음`,

    blog: `블로그 포스트 후보를 생성한다.
- 목적이 불분명하면 삽만리닷컴 블로그 기준으로 작성한다
- 제목, 본문, SEO Focus keyphrase, Meta description을 포함한다`
  };

  // ── SAPMANRI Constitution ─────────────────────────────────────
  const SAPMANRI_CONSTITUTION = {
    philosophy: [
      '글은 감정을 설명하는 것이 아니라, 익숙한 장면에서 처음 보는 틈을 발견하는 일이다.',
      '잘 쓰는 것보다 잘 멈추는 것이 먼저다.',
      '장면은 배경이 아니라 생각보다 먼저 독자를 세워두는 자리다.',
      '하나의 글에는 하나의 발견만 남긴다.',
      '독자를 설득하지 않는다. 장면 앞에 같이 세워둔다.'
    ],
    observation: [
      '가장 눈에 띄는 것보다 오래 보게 된 것을 고른다.',
      '사람의 감정보다 손, 빛, 거리, 천, 바람, 그림자, 표면, 온도 같은 물성을 먼저 본다.',
      '사진이 이미 말하고 있는 것을 다시 설명하지 않는다.',
      '속도를 설명하지 말고 속도가 보이게 한다.',
      '예쁜 풍경보다 생활의 작은 어긋남, 늦게 알아차린 것, 이름과 몸의 차이를 본다.'
    ],
    thinking: [
      '이 장면 앞에서 왜 멈췄는지 한 줄만 남긴다.',
      '감정의 이름보다 인식의 변화를 우선한다.',
      '큰 결론으로 확장하지 않는다. 그날의 작은 오류와 발견 안에서 끝낸다.',
      '질문이 생기면 답하지 말고 질문 가까이에 둔다.'
    ],
    sentence: [
      '짧은 행갈이를 쓰되, 리듬을 꾸미기 위해 억지로 끊지 않는다.',
      '좋은 문장은 예쁜 문장이 아니라 독자가 한 번 멈추게 만드는 문장이다.',
      '마지막 문장은 의미 정리가 아니라 장면 안에 아직 남아 있는 사물, 움직임, 빛, 거리 중 하나로 둔다.',
      '설명형 비교문(A는 B지만 C는 D다)을 기본적으로 피한다.'
    ],
    avoid: [
      '좋았다, 충분했다, 괜찮다, 조용히, 천천히 같은 안전한 결말로 도망가지 않는다.',
      '보여준다, 알게 된다, 의미한다, 생각했다 같은 해석 동사를 남발하지 않는다.',
      '우리는, 삶은, 결국, 소중함, 위로처럼 큰 말로 확장하지 않는다.',
      '최근 글과 같은 시작 방식, 같은 결말 구조, 같은 감정 처리 방식을 반복하지 않는다.'
    ],
    evolution: [
      '최근 문체는 감정보다 인지에 가깝다.',
      '사물을 오래 보는 것보다, 알고 있다고 생각한 것의 틈을 다시 보는 쪽으로 진화했다.',
      '사진 산문은 예쁜 묘사보다 생활 속 발견의 기록에 가깝다.'
    ],
    // 2026-07-02 추가: bad → good 대조 예시.
    // 규칙 나열만으로는 모델이 금지어만 피해서 새 변형(paraphrase)으로 옮겨가는
    // 문제가 반복 확인되었다 (QC 정규식이 "그냥 있었다" 류를 계속 쫓아가야 했던 사례).
    // 대조 예시는 정확한 문구를 외우게 하려는 게 아니라 "방향"을 보여주는 용도이므로,
    // 사용하는 프롬프트 쪽에서 "이 예시를 그대로 반복하지 말고 매번 새로 찾아내라"는
    // 문구를 함께 붙여야 한다 (buildAvoidExamplesText()가 이미 포함함).
    // source: 'vase_pair' = profile_data.json의 실제 AI초안→vase수정본에서 추출.
    //         'vase_dictated' = vase가 이 대화에서 직접 예시로 제시한 문구.
    avoidExamples: [
      {
        bad: '무작정. 아무 생각 없이 한다고 말은 하지만,',
        good: '무작정 퍼즐을 맞춘다. 손은 조각을 고르는데 마음은 자꾸 다른 곳으로 간다.',
        label: '해석 동사가 많음',
        source: 'vase_pair'
      },
      {
        bad: '요즘 카메라에는 너무 당연하게 들어 있는 기능들이 그때의 카메라에는 대부분 없었다.',
        good: '불편한 점이 많았다.',
        label: '설명형 비교문',
        source: 'vase_pair'
      },
      {
        bad: '너와 함께라 참 행복했다. 하루하루 소중하지 않은 날이 없었다.',
        good: '너와 함께라 매일이 달랐다. 같은 하루도 두 번 오지 않았다.',
        label: '감정을 직접 설명',
        source: 'vase_pair'
      },
      {
        bad: '그냥 있었다. 서두르지 않았다. 빠르지도 느리지도 않았다.',
        good: '커피잔 손잡이와 고양이 꼬리 사이, 손가락 두 개 정도 거리.',
        label: '안전한 관찰 리듬 반복',
        source: 'vase_dictated'
      },
      {
        bad: '그런 오후였다. 그것만으로 충분했다.',
        good: '식은 차 옆에 다 읽지 못한 책이 엎어져 있었다.',
        label: '익숙한 결말로 수렴',
        source: 'vase_dictated'
      }
    ]
  };

  const RUNTIME_RULES = [
    ...SAPMANRI_CONSTITUTION.philosophy.slice(0, 3),
    ...SAPMANRI_CONSTITUTION.observation.slice(0, 4),
    ...SAPMANRI_CONSTITUTION.thinking.slice(0, 3),
    ...SAPMANRI_CONSTITUTION.sentence.slice(1, 4),
    ...SAPMANRI_CONSTITUTION.avoid.slice(0, 3)
  ];

  const OBSERVATION_AXES = ['시간','습관','온도','거리','손의 움직임','사용감','기다림','남은 것','사라진 것','소리','무게','빛','반복','어긋남','흔적','빈자리','인지의 차이','이름과 몸','늦게 본 것','작은 오류'];
  const VIEWPOINTS       = ['기록','관찰','발견','질문','회상','메모','혼잣말','인지','생활 기록'];
  const THINKING_AXES    = ['발견','인지의 균열','이름과 실제의 차이','늦게 알아차림','사라진 것','남은 것','거리감','속도감','몸의 방향','생활의 작은 오류'];

  const WATCH_PHRASES = [
    '문득','어쩌면','어느새','조용히','따뜻하게',
    '작은 행복','소소한 행복','위로','힐링',
    '그 정도면 충분했다','대단한 일은 아니었다',
    '괜찮다','잘하고 있다','삶은','우리는','소중함','마음 한켠'
  ];
  const LESSON_PATTERNS = [
    '그래서 우리는','삶은 결국','행복이란',
    '소중함을 알게','괜찮아도 된다','그것만으로 충분','작은 위로가'
  ];

  // ── 빌더 함수 ─────────────────────────────────────────────────
  function buildConstitutionText() {
    const sections = [
      ['Philosophy', SAPMANRI_CONSTITUTION.philosophy],
      ['Observation', SAPMANRI_CONSTITUTION.observation],
      ['Thinking',   SAPMANRI_CONSTITUTION.thinking],
      ['Sentence',   SAPMANRI_CONSTITUTION.sentence],
      ['Avoid',      SAPMANRI_CONSTITUTION.avoid],
      ['Evolution',  SAPMANRI_CONSTITUTION.evolution],
    ];
    return sections.map(([title, arr]) =>
      `## ${title}\n` + arr.map((r,i) => `${i+1}. ${r}`).join('\n')
    ).join('\n\n');
  }

  function buildRuntimeRulesText() {
    return RUNTIME_RULES.map((r,i) => `${i+1}. ${r}`).join('\n');
  }

  // 2026-07-02 추가: bad → good 대조 예시 텍스트 빌더.
  // Magazine/Carousel/Skyline/Postcard/Writing Studio 전 도구가 이 함수를 통해서만
  // 대조 예시를 프롬프트에 넣는다. 개별 파일에 예시를 하드코딩하지 않는다.
  function buildAvoidExamplesText() {
    const ex = SAPMANRI_CONSTITUTION.avoidExamples || [];
    if (!ex.length) return '';
    const lines = ex.map(e => `❌ ${e.bad}\n⭕ ${e.good}`).join('\n\n');
    return `## 안전한 추상 리듬 대신 구체 장면으로 (예시)\n` +
      `아래는 방향을 보여주는 예시입니다. 이 정확한 표현을 그대로 반복하지 말고,\n` +
      `매번 그 장면에 맞는 새로운 구체적 디테일을 스스로 찾아내세요.\n\n${lines}`;
  }

  /**
   * buildAvoidPhraseText(recentHistory)
   * @param {string[]} recentHistory — state.generationHistory 배열
   */
  function buildAvoidPhraseText(recentHistory) {
    const recentText = (recentHistory || []).slice(-30).join('\n');
    const overused = WATCH_PHRASES.filter(p =>
      (recentText.match(new RegExp(p,'g'))||[]).length >= 2
    );
    const base = ['한참 보고 있었다','그 손이 좋았다','서두르지 않았다','그 정도면 충분했다','그런 오후였다','마음이 늦어졌다','좋았다','충분했다','괜찮았다','조용히','천천히','보여준다','알게 된다','생각했다','의미한다'];
    return [...new Set([...base, ...overused])];
  }

  /**
   * buildRecentStyleMemoryText(recentHistory)
   * @param {string[]} recentHistory
   */
  function buildRecentStyleMemoryText(recentHistory) {
    const recent = (recentHistory || []).slice(-12).join('\n---\n');
    if (!recent.trim()) return '최근 생성 기록 없음';
    return recent.slice(-3000);
  }

  function getVoiceForType(type) {
    return type === 'pause_book' ? 'pause_book' : 'sapmanri';
  }
  function getOutputInstruction(type) {
    return TYPE_INSTRUCTION[type] || TYPE_INSTRUCTION.webmag;
  }
  function getOutputProfile(type) {
    return OUTPUT_PROFILES[type] || OUTPUT_PROFILES.webmag;
  }

  /**
   * getTargetLengthSpec(type, opts)
   * writing_studio.html의 getTargetLengthSpec()과 동일 로직.
   * DOM 의존성을 opts 인자로 분리했다 — 동작은 동일함.
   * @param {string} type
   * @param {{ preset?: string, customTarget?: number }} opts
   */
  function getTargetLengthSpec(type, opts) {
    const profile = getOutputProfile(type);
    const preset = (opts && opts.preset) || 'default';
    let target = profile.defaultChars;
    if (preset === 'short')  target = profile.shortChars;
    else if (preset === 'normal') target = profile.normalChars;
    else if (preset === 'long')   target = profile.longChars;
    else if (preset === 'custom') {
      const n = parseInt(opts && opts.customTarget, 10);
      if (!Number.isNaN(n) && n > 0) target = n;
    }
    target = Math.max(profile.minChars || 40, Math.min(profile.maxChars || 5000, target));
    return { preset, target, min: profile.minChars, max: profile.maxChars };
  }

  function estimateMaxTokensForType(type, opts) {
    const spec = getTargetLengthSpec(type, opts);
    return Math.max(1500, Math.min(7000, Math.ceil(spec.target * 2.2)));
  }

  /**
   * buildOutputProfileText(type, opts)
   * @param {string} type
   * @param {{ preset?: string, customTarget?: number, focusKeyword?: string }} opts
   */
  function buildOutputProfileText(type, opts) {
    const profile = getOutputProfile(type);
    const len = getTargetLengthSpec(type, opts);
    const keyword = (opts && opts.focusKeyword) || '';
    const lines = [
      `출력 규격: ${profile.label}`,
      `목표 글자수: 약 ${len.target.toLocaleString()}자 (허용 범위 ${len.min.toLocaleString()}~${len.max.toLocaleString()}자)`,
      keyword
        ? `핵심 키워드: ${keyword}`
        : '핵심 키워드: 입력에서 자연스럽게 추출하되, 필요하면 제목에 맞춰 하나를 정한다.',
      '',
      '반드시 지킬 출력 규격:',
      ...(profile.spec || []).map(s => `- ${s}`)
    ];
    if (type === 'naver_blog') {
      lines.push('', '네이버 블로그 특별 규칙:', '- 첫 두 줄에 핵심 키워드를 자연스럽게 넣는다.', '- 핵심 키워드를 본문 전체에 8~12회 자연 반복한다.', '- 1500자 미만이면 실패로 간주한다.', '- 소제목 3~5개와 [사진 n] 위치 제안을 포함한다.');
    }
    if (type === 'sapmanri_blog') {
      lines.push('', '삽만리닷컴 특별 규칙:', '- SEO Focus keyphrase와 Meta description을 반드시 출력한다.', '- Slug 후보는 영어 소문자와 하이픈만 사용한다.', '- 본문이 너무 짧으면 실패로 간주한다.');
    }
    return lines.join('\n');
  }

  function buildOutputContractText(type, opts) {
    const label = TYPE_LABEL[type] || type;
    return `현재 출력 목적: ${label}\nVoice: ${VOICE_LABEL[getVoiceForType(type)]}\n\n${buildOutputProfileText(type, opts)}\n\n${getOutputInstruction(type)}`;
  }

  // ── export ────────────────────────────────────────────────────
  global.SapConstitution = {
    // 데이터
    SAPMANRI_CONSTITUTION,
    RUNTIME_RULES,
    OBSERVATION_AXES,
    VIEWPOINTS,
    THINKING_AXES,
    WATCH_PHRASES,
    LESSON_PATTERNS,
    OUTPUT_PROFILES,
    TYPE_INSTRUCTION,
    TYPE_LABEL,
    VOICE_LABEL,
    OUTPUT_PRIORITY,
    OPEN_OPTIONS,
    DEV_OPTIONS,
    END_OPTIONS,
    // 빌더 함수
    buildConstitutionText,
    buildRuntimeRulesText,
    buildAvoidExamplesText,
    buildAvoidPhraseText,
    buildRecentStyleMemoryText,
    getVoiceForType,
    getOutputInstruction,
    getOutputProfile,
    getTargetLengthSpec,
    estimateMaxTokensForType,
    buildOutputProfileText,
    buildOutputContractText,
  };
})(window);
