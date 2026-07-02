/**
 * sapmanri_qc.js
 * Sapmanri Writing QC — 감지 · 점수 · 교열 리라이트
 *
 * 의존성: sapmanri_constitution.js (SapConstitution) 먼저 로드 필요
 * 모든 로직은 writing_studio.html v5에서 100% 추출. 프롬프트/규칙 변경 없음.
 *
 * 사용법:
 *   <script src="/sapmanri_constitution.js"></script>
 *   <script src="/sapmanri_qc.js"></script>
 *   SapQC.scoreSapmanriWriting(text)
 *   await SapQC.enforceSapmanriQC(callClaudeFn, draft, context)
 */
(function (global) {
  function require(name) {
    if (!global[name]) throw new Error(`${name}이 로드되지 않았습니다 (sapmanri_qc.js보다 먼저 로드하세요).`);
    return global[name];
  }

  // ── detectSapmanriIssues ──────────────────────────────────────
  // writing_studio.html의 detectSapmanriIssues()와 100% 동일
  function detectSapmanriIssues(text) {
    const t = String(text || '');
    const issues = [];
    const patterns = [
      [/앞모습은[\s\S]{0,100}뒷모습은/g, '개념 비교문이 장면보다 앞섬'],
      [/방향보다[\s\S]{0,60}속도/g,       '해석을 법칙처럼 정리함'],
      [/보여준다|알게 된다|알게 되는|의미한다/g, '해석 동사가 많음'],
      [/그래서 우리는|삶은 결국|행복이란|소중함을 알게|위로가 된다/g, '교훈형 문장'],
      // 2026-07-02 갭 허용 확장: "그냥/그저"와 "있었다" 사이에 짧은 어구가 끼어도
      // 잡히도록 함 (예: "그냥 그 자리에 있었다" — 기존 정규식은 "그냥" 바로 뒤에
      // "있었다"가 붙어야만 잡혀서 이 변형을 놓쳤음. 실제 발행글 대조에서 확인된 탐지 누락).
      // 갭은 최대 10자로 제한해 문장 경계를 넘어 오탐하지 않도록 함.
      [/빠르지도\s*느리지도\s*않았다|그냥\s*[^.!?\n]{0,10}있었다|그저\s*[^.!?\n]{0,10}있었다|조금\s*남아\s*있었다|서두르지\s*않았다|그냥[,\s]*서두르지|조금\s*늦어졌다/g, '안전한 관찰 리듬 반복'],
      [/좋았다|충분했다|괜찮았다|그런 오후였다|마음이 늦어졌다/g, '익숙한 결말로 수렴']
    ];
    patterns.forEach(([re, label]) => { if (re.test(t)) issues.push(label); });
    const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
    const last = lines.slice(-3).join(' ');
    if (/(있었다|생각했다|알게 됐다|알게 된다|보인다|보여준다|충분했다|괜찮다)$/.test(last.trim()))
      issues.push('마지막이 의미 정리로 끝남');
    if ((t.match(/\b(것|일|마음|생각)\b/g)||[]).length >= 8)
      issues.push('추상 명사가 많음');
    // 2026-07-02 완화: 단순 '~다'/은-는 문장 개수만으로 판정하지 않는다.
    // 한국어 산문은 짧은 문장이 '~다'로 끝나고 은/는을 쓰는 것이 자연스러운 기본 리듬이라,
    // 이 카운트만으로는 삽만리 특유의 짧은 시적 문체(예: "촛불 하나. 차는 뜨거웠는데, 불은 작았다.")까지
    // 오탐으로 잡는 문제가 있었다. 해석/설명 연결어가 함께 있을 때만 '설명문 리듬'으로 판정한다.
    const sentenceLike = t.split(/[.!?。]|\n\n/).filter(x => x.trim().length > 10);
    const shortDeclarativeCount = sentenceLike.filter(x => /은|는/.test(x) && /다$/.test(x.trim())).length;
    const explanatoryConnector = /그래서|때문에|의미(한다|했다|하는)?|결국|나는\s*생각했다|생각한다|알게\s*되었다|알게\s*됐다|알게\s*된다|깨달았다/;
    if (shortDeclarativeCount >= 4 && explanatoryConnector.test(t))
      issues.push('설명문 리듬이 강함');
    return [...new Set(issues)].slice(0, 10);
  }

  // ── scoreSapmanriWriting ──────────────────────────────────────
  // writing_studio.html의 scoreSapmanriWriting()와 100% 동일
  function scoreSapmanriWriting(text) {
    const issues = detectSapmanriIssues(text);
    const t = String(text || '');
    const hasScene     = /(빛|손|바람|그림자|천|옷자락|흙|창|나무|커피|발|거리|온도|소리|표면|색|냄새)/.test(t);
    const hasDiscovery = /(몰랐다|처음|이상했다|다르다|알고 있었다|본 적|이름|몸|늦게|문득|깨달았다|생각했다)/.test(t);
    const explanation  = Math.min(100, issues.length * 14);
    const scene        = hasScene     ? 85 : 55;
    const discovery    = hasDiscovery ? 88 : 58;
    const aiSmell      = Math.min(100, (t.match(/좋았다|충분했다|소중|위로|힐링|괜찮/g)||[]).length * 20 + issues.length * 5);
    const sapmanri     = Math.max(0, Math.min(100, Math.round((scene + discovery + (100-explanation) + (100-aiSmell)) / 4)));
    return { scene, discovery, explanation, ai_smell: aiSmell, sapmanri_score: sapmanri, issues };
  }

  // ── enforceSapmanriQC ─────────────────────────────────────────
  // writing_studio.html의 enforceSapmanriQC()와 100% 동일.
  // callClaudeFn: shared_writing_engine.js의 callClaude 함수를 주입받는다
  //   (Claude API 호출이 shared_writing_engine.js 한 곳에만 있도록 유지하기 위함)
  // context: { planText, metaText, outputProfileText, maxTokens }
  async function enforceSapmanriQC(callClaudeFn, draft, context) {
    const C = require('SapConstitution');
    const score = scoreSapmanriWriting(draft);
    if (score.issues.length === 0 && score.sapmanri_score >= 82) return draft;

    const system = `너는 삽만리 Writing Studio v5의 Sapmanri QC + Rewrite Engine이다. 새 글을 만들지 말고, 초안의 시선과 장면은 유지한 채 설명, 교훈, 반복, 안전한 결말만 덜어낸다. 단, 출력 매체별 분량/SEO/구조 규격은 절대 줄이지 않는다.`;
    const user = `아래 초안을 Sapmanri Writing Constitution 기준으로 한 번만 정리한다.

Sapmanri Writing Constitution:
${C.buildConstitutionText()}

수정 원칙:
- 내용과 장면은 유지한다.
- 초안이 선택한 소재와 Perception Plan을 벗어나지 않는다.
- 설명형 비교문과 일반 법칙 문장을 줄인다.
- "보여준다/알게 된다/생각했다/의미한다" 같은 해석 동사를 줄인다.
- 마지막은 의미 정리가 아니라 장면 안의 물성, 움직임, 거리, 빛, 손, 옷자락 중 하나로 끝낸다.
- 더 예쁘게 만들지 말고 덜어낸다.
- 제목 포함, 본문만 출력한다. 설명 금지.
- 아래 출력 규격의 글자수/구조/SEO 항목을 유지한다. 특히 블로그/웹매거진은 짧은 산문으로 줄이지 않는다.

Writing DNA 점수:
${JSON.stringify(score, null, 2)}

Perception/Thinking Plan:
${(context && context.planText) || ''}

이미지 메타 요약:
${(context && context.metaText) || ''}

출력 규격:
${(context && context.outputProfileText) || ''}

초안:
${draft}`;

    try {
      const fixed = await callClaudeFn(user, system, (context && context.maxTokens) || 2200);
      return fixed && fixed.trim() ? fixed.trim() : draft;
    } catch(e) {
      console.warn('Sapmanri QC rewrite failed', e);
      return draft;
    }
  }

  // ── export ────────────────────────────────────────────────────
  global.SapQC = {
    detectSapmanriIssues,
    scoreSapmanriWriting,
    enforceSapmanriQC,
  };
})(window);
