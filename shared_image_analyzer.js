/**
 * shared_image_analyzer.js
 * Sapmanri 이미지 분석 v3 — 단일 공유 모듈
 *
 * Single Source of Truth: library.html의 analyzeImage() v3 스키마 기준.
 * 이 파일 외에 독자적인 이미지 분석 함수(v1/v2)를 두지 않는다.
 *
 * 예외: 캐러셀(bright_zone/suggested_copy 등 캐러셀 전용 필드)과
 *       스카이라인(waveform/energy 등 음악 매칭 전용 필드)은 스키마가 완전히
 *       달라서 이 공유 모듈 대신 각자의 특수 분석 함수를 유지한다.
 *
 * 의존성 (로드 순서):
 *   /shared-config.js → /sapmanri_constitution.js → /sapmanri_qc.js
 *   → /shared_writing_engine.js → /shared_image_analyzer.js
 *
 * 사용법:
 *   const meta = await SharedImageAnalyzer.analyze(base64, mediaType, extraText);
 *   const meta = await SharedImageAnalyzer.analyzeFromDataUrl(dataUrl, extraText);
 */
(function (global) {
  function req(name) {
    if (!global[name]) throw new Error(`${name}이 로드되지 않았습니다.`);
    return global[name];
  }

  // v3 분석 프롬프트 — library.html analyzeImage()와 100% 동일 스키마
  const V3_PROMPT = `이 사진을 분석해서 아래 JSON 형식으로만 반환해줘. 다른 텍스트 없이 JSON만. 삽만리(@sapmanri)는 한국 농촌/슬로우라이프 채널이고, 이 맥락을 반영해서 분석할 것.

{
  "subject_position": "left|center|right|top|bottom|full",
  "focal_x": 피사체 가로위치 0~100 숫자,
  "focal_y": 피사체 세로위치 0~100 숫자,
  "aspect_ratio": "wide|square|tall",
  "best_page_type": "fullbleed|split|grid|quote|spread|botanical",
  "spread_focal_left": 0~100,
  "spread_focal_right": 0~100,
  "overall_brightness": "dark|mid|bright",
  "dominant_color": "#hex",
  "color_temperature": "warm|cool|neutral",
  "contrast_level": "low|medium|high",
  "visual_density": "low|medium|high",
  "negative_space": "low|medium|high",
  "season": "spring|summer|autumn|winter|unknown",
  "time_of_day": "dawn|morning|day|afternoon|evening|night|unknown",
  "weather": "clear|cloudy|rain|snow|fog|indoor|unknown",
  "precipitation_presence": "none|rain|snow|after_rain|after_snow|unknown",
  "surface_condition": "dry|wet|snowy|muddy|reflective|unknown",
  "light_source": "sunlight|window_light|lamp|candle|fire|overcast|night_light|mixed|unknown",
  "emotional_tone": ["감정/정서 태그 2~5개"],
  "atmosphere_tags": ["날씨/공기/계절감 태그 2~6개"],
  "object_tags_ko": ["검색용 한국어 사물 태그 3~10개"],
  "object_tags_en": ["English object tags 3-10"],
  "scene_tags_ko": ["검색용 한국어 장면 태그 3~10개"],
  "scene_tags_en": ["English scene tags 3-10"],
  "search_keywords_ko": ["한국어 키워드 8~20개"],
  "search_keywords_en": ["English keywords 8-20"],
  "location_type": "indoor|outdoor|garden|kitchen|workshop|countryside|city|cafe|unknown",
  "primary_subject": "주요 피사체 한국어 키워드",
  "secondary_subjects": [],
  "activity_type": "cooking|gardening|craft|coffee|walking|resting|cleaning|travel|animal|object|unknown",
  "human_presence": "none|hands|back|side|face|multiple",
  "animal_presence": "none|cat|dog|bird|other",
  "material_texture": [],
  "has_text": false,
  "text_area_position": "none|top|center|bottom|left|right",
  "camera_distance": "closeup|medium|wide",
  "camera_angle": "top_down|eye_level|low_angle|side|unknown",
  "motion_implied": "still|hand_action|walking|pouring|cutting|making|unknown",
  "focus_clarity": "clear|soft|busy",
  "text_safe_area": "left|right|top|bottom|center|none",
  "thumbnail_potential": "low|medium|high",
  "thumbnail_reason": "썸네일 적합도 이유 한 줄",
  "mood": "한 단어 한국어",
  "suggested_caption": "Vase 문체 한국어 캡션 1줄 (12자 이내)",
  "suggested_caption_en": "English caption (poetic, under 8 words)",
  "suggested_caption_left": "스프레드 왼쪽 캡션 (10자 이내)",
  "suggested_caption_right": "스프레드 오른쪽 캡션 (10자 이내)",
  "suggested_label": "소제목 한국어 (4-8자)",
  "suggested_label_en": "English sublabel (2-4 words)",
  "domesticity_score": 0~5,
  "rurality_score": 0~5,
  "craft_score": 0~5,
  "visual_dna_tags": ["키워드 태그 3~6개 (한국어)"],
  "sapmanri_score": 0~10
}`;

  /**
   * analyze(base64, mediaType, extraText?)
   * 이미 추출된 base64 문자열로 v3 분석 수행.
   */
  async function analyze(base64, mediaType, extraText) {
    const engine = req('SharedWritingEngine');
    const promptText = extraText
      ? V3_PROMPT + `\n\n추가 메모: ${extraText}`
      : V3_PROMPT;

    const raw = await engine.callClaude(
      [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: promptText }
      ],
      '이미지 분석 도구입니다. JSON만 출력합니다.',
      1200,
      null,
      'claude-sonnet-5'
    );

    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s < 0 || e < 0 || e <= s) throw new Error('이미지 분석 실패: Claude 응답에 JSON 없음');
    const result = JSON.parse(raw.slice(s, e + 1));
    result.schema_version = 'image-analysis-v3';
    result.analyzed_at    = new Date().toISOString();
    result.model          = 'claude-sonnet-5';
    return result;
  }

  /**
   * analyzeFromDataUrl(dataUrl, extraText?)
   * data:image/... 형태의 URL에서 base64와 mediaType을 추출해서 analyze() 호출.
   * writing_studio, magazine 등 dataUrl을 직접 받는 곳에서 사용.
   */
  async function analyzeFromDataUrl(dataUrl, extraText) {
    const mediaType = (dataUrl.match(/data:(image\/[^;]+)/) || [])[1] || 'image/jpeg';
    const base64    = dataUrl.split(',')[1] || dataUrl;
    return analyze(base64, mediaType, extraText);
  }

  global.SharedImageAnalyzer = { analyze, analyzeFromDataUrl };
})(window);
