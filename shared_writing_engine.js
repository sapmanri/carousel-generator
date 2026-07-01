/**
 * shared_writing_engine.js
 * Shared Writing Engine — Claude API 단일 호출 + Perception Plan + 글 생성
 *
 * 이 파일 외에는 Claude API를 직접 호출하지 않는다.
 * 모든 로직은 writing_studio.html v5에서 100% 추출. 프롬프트/문체/QC 변경 없음.
 *
 * 의존성 (로드 순서):
 *   1. /shared-config.js            (SapConfig — Anthropic 키 조회)
 *   2. /sapmanri_constitution.js    (SapConstitution)
 *   3. /sapmanri_qc.js              (SapQC)
 *   4. /shared_writing_engine.js    ← 이 파일
 *
 * 사용법:
 *   await SharedWritingEngine.generate({
 *     type:    'instagram',          // TYPE_LABEL 키
 *     text:    '오늘의 메모',
 *     imageMeta: { ... },            // compactImageMeta 결과 또는 null
 *     recentHistory: [],             // state.generationHistory
 *     examples: [],                  // db.examples (같은 type, 최신 3~4개)
 *     rules: [],                     // db.rules
 *     opts: {                        // 선택
 *       preset: 'default',           // 'short'|'normal'|'long'|'custom'
 *       customTarget: 0,
 *       focusKeyword: '',
 *       maxTokens: 0,                // 0이면 estimateMaxTokensForType 자동 계산
 *       skipQC: false,               // QC 패스 건너뛰기
 *     }
 *   })
 *   → { text: string, score: object, qcApplied: boolean }
 */
(function (global) {

  function req(name) {
    if (!global[name]) throw new Error(`${name}이 로드되지 않았습니다.`);
    return global[name];
  }

  // ── API 키 조회 ───────────────────────────────────────────────
  function getApiKey() {
    try {
      if (global.SapConfig) {
        const v = global.SapConfig.getAnthropicKey();
        if (v) return v;
      }
      // 레거시 폴백 (writing_studio.html의 ws_api_key)
      return localStorage.getItem('ws_api_key') || localStorage.getItem('anthropic_key') || '';
    } catch(e) { return ''; }
  }

  // ── callClaude ────────────────────────────────────────────────
  // writing_studio.html의 callClaude()와 100% 동일.
  // 모델, 재시도 횟수, 헤더, 에러 분류 모두 그대로 추출.
  // 이 함수가 이 파일 외에 존재하면 안 된다.
  // model: 기본값 'claude-sonnet-4-5'. 도구별로 다른 모델이 필요하면 명시적으로 전달.
  async function callClaude(userMsg, systemMsg, maxTokens, toastFn, model) {
    const key = getApiKey();
    if (!key) throw new Error('Anthropic API Key가 설정되지 않았습니다 (SapConfig 또는 localStorage ws_api_key).');

    const retryCount = 3;
    const content = Array.isArray(userMsg) ? userMsg : userMsg;
    const body = {
      model: model || 'claude-sonnet-4-5',
      max_tokens: maxTokens || 1500,
      messages: [{ role: 'user', content: content }],
    };
    if (systemMsg) body.system = systemMsg;

    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0) {
          if (typeof toastFn === 'function') toastFn(`API 혼잡 — ${attempt}번째 재시도 중…`);
          await new Promise(r => setTimeout(r, 1200 * attempt));
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) {
          const msg = data.error.message || data.error.type || 'API error';
          const retryable = res.status === 429 || res.status === 500 || res.status === 529 ||
            /overload|overloaded|rate|temporarily/i.test(msg);
          if (retryable && attempt < retryCount) { lastError = new Error(msg); continue; }
          throw new Error(msg);
        }
        return data.content?.[0]?.text || '';
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        const retryable = /overload|overloaded|rate|temporarily|fetch/i.test(msg);
        if (!retryable || attempt >= retryCount) break;
      }
    }
    throw lastError || new Error('API 호출 실패');
  }

  // ── 유틸 ──────────────────────────────────────────────────────
  function safeJsonFromText(raw) {
    const text = String(raw || '').replace(/```json|```/g,'').trim();
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(text.slice(s, e + 1));
    return JSON.parse(text);
  }
  function safeArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

  function planToText(plan) {
    if (!plan) return '';
    return `선택 소재: ${plan.selected_material || ''}\n버린 소재: ${safeArray(plan.discarded_materials).join(', ')}\n선택 이유: ${plan.focus_reason || ''}\n관찰 축: ${plan.observation_axis || ''}\n사고 축: ${plan.thinking_axis || ''}\n관점: ${plan.viewpoint || ''}\n작은 변화: ${plan.small_shift || ''}\n마지막 이미지: ${plan.final_image || ''}\n금지: ${safeArray(plan.do_not_write).join(', ')}\n피할 표현: ${safeArray(plan.avoid_phrases).join(', ')}`;
  }

  // ── buildPerceptionPlan ───────────────────────────────────────
  // writing_studio.html의 buildPerceptionPlan()와 100% 동일.
  // payload: { input_type, text, materials, image_meta }
  // recentHistory: state.generationHistory 배열
  async function buildPerceptionPlan(payload, recentHistory, toastFn) {
    const C = req('SapConstitution');
    const avoid = C.buildAvoidPhraseText(recentHistory);
    const system = `너는 MIMESIS Writing Studio v4의 Perception + Thinking Engine이다. 글을 쓰지 않는다. 입력에서 무엇을 볼지, 왜 멈출지, 무엇을 버릴지만 정한다. JSON만 출력한다.`;
    const user = `입력 정보를 보고 글쓰기 전 사고 계획을 만든다.

Sapmanri Writing Constitution:
${C.buildConstitutionText()}

입력 타입: ${payload.input_type}
원문/메모: ${payload.text || ''}
선택 소재: ${payload.materials || ''}
이미지 메타 JSON:
${payload.image_meta || ''}

최근 생성 기록 일부:
${C.buildRecentStyleMemoryText(recentHistory)}

선택 가능한 observation_axis: ${C.OBSERVATION_AXES.join(', ')}
선택 가능한 thinking_axis: ${C.THINKING_AXES.join(', ')}
선택 가능한 viewpoint: ${C.VIEWPOINTS.join(', ')}
피해야 할 표현: ${avoid.join(', ')}

중요:
- 글을 쓰지 말 것.
- 예쁜 소재를 고르지 말고, 사용자가 멈출 만한 작은 틈을 고를 것.
- 사진/메모에 보이는 것을 전부 쓰려 하지 말고 하나를 버리고 하나만 남길 것.
- small_shift는 감정 이름이 아니라 인식의 변화여야 한다.

반드시 아래 JSON만 출력:
{
  "selected_material": "오늘 중심으로 볼 소재 하나",
  "discarded_materials": ["이번 글에서 일부러 버릴 소재 2~4개"],
  "focus_reason": "왜 그것을 골랐는지 한 문장",
  "observation_axis": "${C.OBSERVATION_AXES.join('|')}",
  "thinking_axis": "${C.THINKING_AXES.join('|')}",
  "viewpoint": "${C.VIEWPOINTS.join('|')}",
  "small_shift": "장면 앞에서 생긴 작은 인식 변화 한 줄",
  "final_image": "마지막에 남길 수 있는 장면/물성 후보 하나",
  "do_not_write": ["이번 글에서 쓰지 말아야 할 것 2~4개"],
  "avoid_phrases": []
}`;
    const raw = await callClaude(user, system, 1000, toastFn);
    const plan = safeJsonFromText(raw);
    plan.avoid_phrases = [...new Set([...(plan.avoid_phrases||[]), ...avoid])];
    return plan;
  }

  // ── SharedWritingEngine.generate ──────────────────────────────
  // writing_studio.html의 autoGenerate() + enforceSapmanriQC() 흐름을
  // 재사용 가능한 단일 인터페이스로 통합.
  // 프롬프트, Constitution 적용, QC 흐름은 writing_studio.html과 100% 동일.
  //
  // params:
  //   type:          출력 타입 (TYPE_LABEL 키)
  //   text:          사용자 메모/입력 텍스트
  //   imageMeta:     compactImageMeta() 결과 문자열 또는 null
  //   imageMetaSummary: imageMetaSummary() 결과 문자열 또는 null (QC용)
  //   recentHistory: state.generationHistory 배열
  //   examples:      db.examples 중 같은 type 최신 3~4개
  //   rules:         db.rules 배열
  //   opts:          { preset, customTarget, focusKeyword, maxTokens, skipQC }
  //   toastFn:       선택적 UI 피드백 함수 (toast)
  //
  // returns: { text, score, qcApplied }
  async function generate(params) {
    const C  = req('SapConstitution');
    const QC = req('SapQC');

    const {
      type = 'webmag',
      text = '',
      imageMeta = '',
      imageMetaSummary = '',
      recentHistory = [],
      examples = [],
      rules = [],
      opts = {},
      toastFn,
    } = params;

    const maxTokens = opts.maxTokens || C.estimateMaxTokensForType(type, opts);
    const avoidPhrases = C.buildAvoidPhraseText(recentHistory);

    // 1. Perception Plan
    const perceptionPlan = await buildPerceptionPlan({
      input_type: imageMeta ? 'image_meta+text' : 'text',
      text,
      materials: text,
      image_meta: imageMeta,
    }, recentHistory, toastFn);

    // 2. System prompt — writing_studio.html autoGenerate()의 system과 100% 동일
    let system = `당신은 한국 크리에이터 Vase Lim(@sapmanri)의 Writing Studio v5입니다.
목표는 입력이 이미지든 텍스트든 둘 다든, Vase가 직접 쓴 것 같은 원문을 만들고 선택한 출력 목적에 맞게 변환하는 것입니다.
이번 버전은 바로 글을 쓰지 않고 Perception Plan을 따른 뒤 글을 씁니다.

## Sapmanri Writing Constitution
${C.buildConstitutionText()}

## Runtime Rules
${C.buildRuntimeRulesText()}

## Perception + Thinking Plan
${planToText(perceptionPlan)}

## 절대 금지
- 교훈형 결말: "그래서 우리는", "삶은 결국", "그것만으로 충분", "괜찮다", "소중함을 알게"
- 감성 상투어와 반복 표현: ${avoidPhrases.join(', ')}
- 입력에 없는 장면 지어내기
- 감정 직접 설명. 장면, 행동, 감각, 물성으로 남길 것
- 이미지 메타 전체를 설명문처럼 나열하지 말 것

## 생성 원칙
선택 소재 하나 → 작은 관찰 → 인식의 미세한 변화 → 장면 안에서 멈춤

## 출력 규격 우선 원칙
- 문체보다 먼저 선택한 출력 목적의 분량/구조/SEO 규격을 지킨다.
- 특히 네이버 블로그와 삽만리닷컴 블로그는 짧은 산문으로 끝내면 실패다.
- 글자수는 정확히 맞추지 않아도 되지만 목표 글자수의 80% 미만이면 실패다.

## Sapmanri QC를 미리 통과할 것
- 발견이 있어야 한다. 예쁜 묘사만 있으면 실패.
- 생각보다 장면이 먼저 와야 한다.
- 사진이 이미 말한 것을 다시 설명하면 실패.
- 마지막 문장이 정리문이면 실패.

${C.buildOutputContractText(type, opts)}`;

    if (examples.length) {
      system += `\n\n## Vase가 직접 쓴 예시 (온도와 리듬만 참고, 표현 복사 금지)\n`;
      examples.forEach((e, i) => { system += `\n--- 예시 ${i+1} ---\n${e.text.slice(0,360)}\n`; });
    }
    if (rules.length) {
      system += `\n\n## Style Bible 참고 규칙(과적용 금지)\n${rules.slice(-8).map((r,i)=>`${i+1}. ${r}`).join('\n')}\n`;
    }

    // 3. User prompt — writing_studio.html autoGenerate()의 userContent와 100% 동일
    const userContent = `입력 메모:
${text || '(없음)'}

이미지 분석 메타:
${imageMeta || '(없음)'}

Perception Plan:
${planToText(perceptionPlan)}

출력 규격:
${C.buildOutputProfileText(type, opts)}

위 계획과 출력 규격을 기준으로 글을 써주세요. 메타데이터를 설명하지 말고, 선택된 소재 하나와 작은 인식 변화만 남겨주세요. 초안은 70점이면 됩니다. 마지막은 의미 정리가 아니라 장면 안의 사물/움직임으로 남겨주세요. 단, 네이버 블로그/삽만리닷컴/웹매거진은 반드시 지정된 글자수와 구조를 우선 지켜주세요.`;

    // 4. 글 생성
    const raw = await callClaude(userContent, system, maxTokens, toastFn);

    // 5. Sapmanri QC — writing_studio.html autoGenerate()의 enforceSapmanriQC 호출과 100% 동일
    let finalText = raw;
    let qcApplied = false;
    if (!opts.skipQC) {
      if (typeof toastFn === 'function') toastFn('Sapmanri QC 적용 중…');
      // callClaude를 주입: SapQC.enforceSapmanriQC는 Claude를 직접 호출하지 않고
      // 이 파일의 callClaude를 사용한다 (단일 호출 원칙 유지)
      const callClaudeForQC = (u, s, t) => callClaude(u, s, t, toastFn);
      finalText = await QC.enforceSapmanriQC(callClaudeForQC, raw, {
        planText:          planToText(perceptionPlan),
        metaText:          imageMetaSummary,
        outputType:        type,
        outputProfileText: C.buildOutputProfileText(type, opts),
        maxTokens,
      });
      qcApplied = finalText !== raw;
    }

    const score = QC.scoreSapmanriWriting(finalText);
    return { text: finalText, score, qcApplied };
  }

  // ── export ────────────────────────────────────────────────────
  global.SharedWritingEngine = {
    generate,
    callClaude,     // 테스트/디버그용 노출. 다른 파일에서 직접 호출하지 않는다.
    buildPerceptionPlan,
    planToText,
    safeJsonFromText,
    safeArray,
    getApiKey,
  };
})(window);
