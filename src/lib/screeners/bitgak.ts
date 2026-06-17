/**
 * Bitgak (빗각) Weekly Trendline Pattern Detector
 *
 * 한국 트레이딩 스트리머 "인범"이 대중화한 빗각(추세선) 차트 기법의 기계적 탐지기.
 * Handoff 문서(2026-06-12)의 canonical weekly 사양을 TypeScript로 포팅한 뒤,
 * 추세선 탐지 문헌(2026-06-16 조사)의 검증 규칙을 추가해 발전시킨 버전.
 *
 * ⚠️ 연구/가설 검증용 도구입니다. 매매 신호 생성기가 아니며 투자 자문이 아닙니다.
 * 모든 기하 계산은 로그 가격 공간에서 수행합니다(차트도 로그 스케일이어야 선이 일치).
 *
 * 핵심 주장(검증 대상, 멍거인 2025-06-10): "빗각 패턴이 완성되면, 그 선의 다음 터치에서
 * 돌파할 가능성이 높다." — 이 코드는 패턴 날짜를 열거하고 다음 터치 시 돌파율을 측정한다.
 * 단일 종목(n≈10–20 터치)의 돌파율은 노이즈 밴드(5–48%)를 벗어날 수 없으므로,
 * 단일 종목 결과는 신호가 아니라 "선이 어디 있는지에 대한 지도"로만 해석할 것.
 *
 * ─── 2026-06-16 발전사항 (추세선 탐지 문헌 반영) ───────────────
 * 출처: pytrendline(ednunezg), TradingView Auto-Trendlines(convex hull/monotone chain),
 *       LuxAlgo "How to Draw Trendlines", QuantifiedStrategies, brunch @urbantrader.
 * 1. 무효화(관통) 제약: 두 앵커를 잇는 선이 정의 구간에서 가격을 관통하면 무효
 *    ("avoid cutting through candle bodies" / "no low falls below the line").
 * 2. 터치 카운팅: 같은 종류 피벗이 선에 몇 번 닿는지 — 3터치 이상이면 '확정'
 *    ("two points draw a line, the third confirms it").
 * 3. 강도 점수(0–100): 터치 수 × 적합도(평균오차) × 수명 — pytrendline 스코어 변형.
 * 4. 거래량 동반 돌파: 돌파봉 거래량이 추세평균을 넘는지 — 빗각 원본 기법의 핵심 신호.
 * 5. 리테스트: 돌파 후 선으로 되돌아와 지지/저항 역전을 확인했는지(최고 승률 셋업).
 */

// ─── 파라미터 (weekly canonical set) ─────────────────────────

export interface BitgakParams {
  pivotOrder: number; // 피벗 확정: 양쪽 N봉 기준 (확정은 N봉 지연)
  tol: number; // 선의 ±N% 이내 = 터치
  minGap: number; // 두 앵커 최소 간격 (봉)
  maxSpan: number; // 앵커1→완성 최대 간격 (봉)
  breakTol: number; // 종가가 선을 N% 넘으면 돌파
  confirm: number; // 터치 후 N봉 내 판정
  // ── 선 품질 게이트 (2026-06-16 추가) ──
  violTol: number; // 앵커 정의구간에서 선을 이만큼(%) 넘어 관통하면 선 무효
  minTouches: number; // 선을 인정하기 위한 최소 터치 수(앵커 2 + α)
  maxLogSlope: number; // 주당 |로그기울기| 상한 — degenerate 수직선 제거
  // ── 돌파 품질 (2026-06-16 추가) ──
  volLookback: number; // 거래량 평균 기준 주수
  volMult: number; // 돌파봉 거래량이 평균×volMult 초과면 '거래량 동반'
  retestWindow: number; // 돌파 후 N주 내 선 재접근(리테스트) 탐지
  // ── 현재 관련성 (2026-06-16, 실데이터 검증으로 추가) ──
  expireGap: number; // 현재가가 선에서 이만큼(비율) 이상 벌어지면 '만료'(외삽 무의미)
}

export const WEEKLY_PARAMS: BitgakParams = {
  pivotOrder: 5,
  tol: 0.015,
  minGap: 8,
  maxSpan: 200,
  breakTol: 0.02,
  confirm: 4,
  violTol: 0.02,
  minTouches: 2,
  maxLogSlope: 0.15,
  volLookback: 12,
  volMult: 1.5,
  retestWindow: 6,
  expireGap: 0.8, // 현재가가 선에서 ±80% 넘게 벌어지면 외삽이 무의미 → 만료
};

// ─── 입출력 타입 ─────────────────────────────────────────────

export interface WeeklyBar {
  date: string; // ISO yyyy-mm-dd
  high: number;
  low: number;
  close: number;
  volume?: number; // 거래량 확인용 — 없으면 거래량 판정 생략
}

export type PatternType = '저저고' | '고고저';
export type LineRole = 'resistance' | 'support';
export type TouchOutcome = '돌파' | '거부' | '미도달' | '판정중';
export type CurrentStatus = '터치임박' | '접근중' | '관망' | '이탈' | '만료';
export type EntryStatus = '활성' | '과거' | '없음';

/**
 * 빗각 밟기 타점 (돌파 후 되돌림 지지/저항을 이용한 진입 지점).
 * 인범 기법의 핵심 실전 타점: 돌파 후 주가가 다시 선으로 내려와(저저고) 밟고 지지받으며
 * 반등하면 롱, 올라와(고고저) 저항받고 되밀리면 숏.
 */
export interface EntrySetup {
  /** 활성=현재 밟는 중(관찰 액션) · 과거=확정된 되돌림 타점 있음 · 없음 */
  status: EntryStatus;
  /** 저저고(저항 돌파)→롱, 고고저(지지 이탈)→숏 */
  direction: '롱' | '숏';
  /** 가장 최근 타점 봉 날짜 */
  date: string | null;
  /** 그 시점 선값(진입 기준선) */
  lineValue: number | null;
  /** 진입 참고가(그 봉 종가) */
  refPrice: number | null;
  /** 돌파 후 빗각 밟기(되돌림 지지/저항 확인) 횟수 */
  count: number;
}

export interface BitgakPattern {
  type: PatternType;
  role: LineRole;
  /** 앵커1 (선을 그릴 첫 꼭짓점) */
  anchor1: { date: string; price: number; index: number };
  /** 앵커2 (선을 그릴 둘째 꼭짓점) */
  anchor2: { date: string; price: number; index: number };
  /** 패턴 완성 (저항/지지 터치로 빗각이 확정된 봉) */
  completion: { date: string; price: number; index: number };
  /** 로그공간 선형 (주 인덱스 x → exp(slope*x+intercept)) */
  slope: number;
  intercept: number;
  /** 마지막 봉 기준 선값(오늘의 선 위치, 손그림 검증용) */
  currentLineValue: number;
  /** 향후 주차별 선값 투영 (날짜, 선값) — 매도 시점 가늠용 */
  projection: Array<{ date: string; lineValue: number }>;
  /** 완성 이후 첫 다음-터치 결과 (검증된 과거 사건) */
  nextTouch: {
    outcome: TouchOutcome;
    date: string | null;
    lineValue: number | null;
    /** 돌파봉 거래량이 추세평균을 넘었는지 (volume 데이터 없으면 null) */
    volumeConfirmed: boolean | null;
    /** 돌파 후 선으로 되돌아와 역전을 확인했는지 (돌파일 때만 판정) */
    retest: boolean | null;
  };
  // ── 선 품질 지표 (2026-06-16 추가) ──
  /** 같은 종류 피벗이 선에 닿은 총 횟수 (앵커 2 포함 → ≥2) */
  touches: number;
  /** 3터치 이상이면 확정(문헌상 "세 번째 터치가 선을 검증") */
  confirmed: boolean;
  /** 터치 피벗들의 선 대비 평균 이격(%) — 작을수록 선에 밀착 */
  meanTouchErrorPct: number;
  /** 앵커1→완성 수명(주) */
  spanWeeks: number;
  /** 선 품질 종합 점수 0–100 (터치 수·밀착도·수명) */
  strength: number;
  /** 현재가 대비 선 위치(%) 와 상태 */
  currentGapPct: number;
  currentStatus: CurrentStatus;
  /** 빗각 밟기 타점 (돌파 후 되돌림 지지/저항 진입 지점) */
  entry: EntrySetup;
}

export interface BitgakResult {
  ticker: string;
  bars: number; // 분석에 사용한 주봉 수
  lastDate: string;
  lastClose: number;
  patternCount: number;
  /** 가장 최근 완성 패턴 (현재 가장 관련도 높은 빗각) */
  active: BitgakPattern | null;
  /** 전체 완성 패턴 (완성일 오름차순) */
  patterns: BitgakPattern[];
}

// ─── 피벗 탐지 (확정 스윙) ───────────────────────────────────

/** 양쪽 order봉보다 모두 낮은 확정 스윙 저점 인덱스 (scipy argrelextrema np.less 동등, strict) */
function confirmedLowPivots(bars: WeeklyBar[], order: number): number[] {
  const out: number[] = [];
  for (let i = order; i <= bars.length - 1 - order; i++) {
    let isPivot = true;
    for (let k = 1; k <= order; k++) {
      if (!(bars[i].low < bars[i - k].low && bars[i].low < bars[i + k].low)) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

/** 양쪽 order봉보다 모두 높은 확정 스윙 고점 인덱스 (strict) */
function confirmedHighPivots(bars: WeeklyBar[], order: number): number[] {
  const out: number[] = [];
  for (let i = order; i <= bars.length - 1 - order; i++) {
    let isPivot = true;
    for (let k = 1; k <= order; k++) {
      if (!(bars[i].high > bars[i - k].high && bars[i].high > bars[i + k].high)) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

// ─── 로그공간 선형 ──────────────────────────────────────────

function fitLogLine(x1: number, p1: number, x2: number, p2: number): { slope: number; intercept: number } {
  const ly1 = Math.log(p1);
  const ly2 = Math.log(p2);
  const slope = (ly2 - ly1) / (x2 - x1);
  const intercept = ly1 - slope * x1;
  return { slope, intercept };
}

function lineValueAt(slope: number, intercept: number, x: number): number {
  return Math.exp(slope * x + intercept);
}

// ─── 선 유효성: 관통(무효화) 제약 ────────────────────────────

/**
 * 정의 구간 [a,b]에서 선이 가격을 관통하지 않는지 검사한다.
 * (문헌 합의: "avoid cutting through candle bodies" / convex-hull validity —
 *  uptrend 지지선은 어떤 저가도 선 아래로 내려가면 안 되고, downtrend 저항선은
 *  어떤 고가도 선 위로 올라가면 안 된다.)
 *  저점선(저저고): 모든 저가가 선 아래로 violTol 넘게 관통하면 false.
 *  고점선(고고저): 모든 고가가 선 위로 violTol 넘게 관통하면 false.
 */
function segmentRespectsLine(
  bars: WeeklyBar[],
  slope: number,
  intercept: number,
  a: number,
  b: number,
  kind: 'low' | 'high',
  violTol: number,
): boolean {
  for (let i = a + 1; i < b; i++) {
    const line = lineValueAt(slope, intercept, i);
    if (kind === 'low') {
      if (bars[i].low < line * (1 - violTol)) return false;
    } else {
      if (bars[i].high > line * (1 + violTol)) return false;
    }
  }
  return true;
}

// ─── 선 강도: 터치 카운팅 + 점수 ─────────────────────────────

/**
 * [a, upto] 범위에서 같은 종류 피벗이 선에 닿은 횟수와 평균 이격(%)을 센다.
 * 앵커 2개는 정의상 선 위(이격≈0)이므로 touches ≥ 2.
 * 3터치 이상이면 "세 번째 터치가 선을 검증"하는 문헌상 확정 기준을 충족.
 */
function lineTouches(
  bars: WeeklyBar[],
  slope: number,
  intercept: number,
  pivots: number[],
  kind: 'low' | 'high',
  a: number,
  upto: number,
  tol: number,
): { touches: number; meanErrPct: number } {
  let touches = 0;
  let errSum = 0;
  for (const idx of pivots) {
    if (idx < a || idx > upto) continue;
    const px = kind === 'low' ? bars[idx].low : bars[idx].high;
    const line = lineValueAt(slope, intercept, idx);
    const errPct = Math.abs(px - line) / line;
    if (errPct <= tol) {
      touches++;
      errSum += errPct;
    }
  }
  return { touches, meanErrPct: touches > 0 ? (errSum / touches) * 100 : 0 };
}

/**
 * 선 품질 종합 점수 0–100.
 *   touchComponent: 터치 수가 많을수록 ↑ (2→30, 3→45, 4→60, 상한 60)
 *   fitComponent:   터치들이 선에 밀착할수록 ↑ (평균이격이 작을수록, 상한 25)
 *   spanComponent:  선 수명이 길수록 ↑ (장수 추세선일수록 신뢰, 상한 15)
 * pytrendline의 (평균캔들폭/평균오차)·(2.5^터치수) 아이디어를 해석가능한 가산식으로 변형.
 */
function strengthScore(touches: number, meanErrPct: number, spanWeeks: number, tol: number): number {
  const touchComponent = Math.min(60, 30 + (touches - 2) * 15);
  const tolPct = tol * 100;
  const fitComponent = tolPct > 0 ? 25 * Math.max(0, 1 - meanErrPct / tolPct) : 0;
  const spanComponent = Math.min(15, spanWeeks / 10);
  return Math.round(Math.max(0, Math.min(100, touchComponent + fitComponent + spanComponent)));
}

// ─── 다음-터치 결과 (거래량 동반 + 리테스트 포함) ────────────

function avgVolumeBefore(bars: WeeklyBar[], i: number, lookback: number): number | null {
  let sum = 0;
  let n = 0;
  for (let k = Math.max(0, i - lookback); k < i; k++) {
    const v = bars[k].volume;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/** 돌파 후 retestWindow주 내 가격이 선으로 되돌아와(±tol) 역전을 확인했는지 */
function detectRetest(
  bars: WeeklyBar[],
  slope: number,
  intercept: number,
  role: LineRole,
  breakIndex: number,
  p: BitgakParams,
): boolean {
  const end = Math.min(bars.length - 1, breakIndex + p.retestWindow);
  for (let i = breakIndex + 1; i <= end; i++) {
    const line = lineValueAt(slope, intercept, i);
    if (role === 'resistance') {
      // 저항 돌파 후: 저가가 선까지 되돌아왔다가(±tol) 종가가 다시 선 위로 마감 = 지지 전환 확인
      if (bars[i].low <= line * (1 + p.tol) && bars[i].close >= line * (1 - p.tol)) return true;
    } else {
      // 지지 이탈 후: 고가가 선까지 되돌아왔다가 종가가 다시 선 아래로 마감 = 저항 전환 확인
      if (bars[i].high >= line * (1 - p.tol) && bars[i].close <= line * (1 + p.tol)) return true;
    }
  }
  return false;
}

function nextTouchOutcome(
  bars: WeeklyBar[],
  slope: number,
  intercept: number,
  role: LineRole,
  fromIndex: number,
  p: BitgakParams,
): BitgakPattern['nextTouch'] {
  for (let i = fromIndex + 1; i < bars.length; i++) {
    const line = lineValueAt(slope, intercept, i);
    const touched = role === 'resistance'
      ? bars[i].high >= line * (1 - p.tol)
      : bars[i].low <= line * (1 + p.tol);
    if (!touched) continue;

    // 터치 발생 → confirm봉 윈도우에서 종가 돌파 여부
    const fullWindowEnd = i + p.confirm;
    const end = Math.min(bars.length - 1, fullWindowEnd);
    for (let j = i; j <= end; j++) {
      const lj = lineValueAt(slope, intercept, j);
      const broke = role === 'resistance'
        ? bars[j].close > lj * (1 + p.breakTol)
        : bars[j].close < lj * (1 - p.breakTol);
      if (broke) {
        const avgVol = avgVolumeBefore(bars, j, p.volLookback);
        const jVol = bars[j].volume;
        const volumeConfirmed = avgVol !== null && typeof jVol === 'number'
          ? jVol > avgVol * p.volMult
          : null;
        return {
          outcome: '돌파',
          date: bars[j].date,
          lineValue: round2(lj),
          volumeConfirmed,
          retest: detectRetest(bars, slope, intercept, role, j, p),
        };
      }
    }
    // 윈도우가 데이터 끝에 잘렸으면 거부 확정 불가 — 판정중
    if (end < fullWindowEnd) {
      return { outcome: '판정중', date: bars[i].date, lineValue: round2(line), volumeConfirmed: null, retest: null };
    }
    return { outcome: '거부', date: bars[i].date, lineValue: round2(line), volumeConfirmed: null, retest: null };
  }
  return { outcome: '미도달', date: null, lineValue: null, volumeConfirmed: null, retest: null };
}

// ─── 현재 상태 판정 ─────────────────────────────────────────

function classifyStatus(gapPct: number, role: LineRole, p: BitgakParams): CurrentStatus {
  const abs = Math.abs(gapPct);
  if (abs <= p.tol * 100) return '터치임박';
  // 현재가가 선에서 너무 멀면(오래된 가파른 선이 수년간 외삽된 경우) 더는 유효한 레퍼런스가 아님
  if (abs >= p.expireGap * 100) return '만료';
  // 선을 넘어선 경우(저항 위/지지 아래)는 거리와 무관하게 이탈 — 접근중보다 먼저 판정해야 함
  if (role === 'resistance' && gapPct > 0) return '이탈';
  if (role === 'support' && gapPct < 0) return '이탈';
  if (abs <= p.tol * 100 * 3) return '접근중';
  return '관망';
}

// ─── 빗각 밟기 타점 (돌파 후 되돌림 진입) ────────────────────

/**
 * 완성 이후를 훑어 "돌파 → 되돌림 밟기 → 지지/저항 확인" 진입 타점을 찾는다.
 *  저저고(저항): 종가가 선 위로 돌파 → 이후 저가가 선까지(±tol) 되돌아와 밟고 종가가 선 위에서 지지 = 롱 타점.
 *  고고저(지지): 종가가 선 아래로 이탈 → 이후 고가가 선까지 되돌아와 종가가 선 아래에서 저항 = 숏 타점.
 *  지지/저항이 깨지면(반대 종가) 셋업 무효 → 재돌파 필요. 마지막 봉이 밟는 중이면 status='활성'.
 */
export function detectEntries(
  bars: WeeklyBar[],
  slope: number,
  intercept: number,
  role: LineRole,
  fromIndex: number,
  p: BitgakParams,
): EntrySetup {
  const direction: EntrySetup['direction'] = role === 'resistance' ? '롱' : '숏';
  const lastIdx = bars.length - 1;
  const entries: number[] = []; // 확정된 밟기-지지/저항 봉 인덱스
  let broken = false;

  for (let i = fromIndex + 1; i < bars.length; i++) {
    const line = lineValueAt(slope, intercept, i);
    if (role === 'resistance') {
      if (!broken) {
        if (bars[i].close > line * (1 + p.breakTol)) broken = true;
        continue;
      }
      const stepped = bars[i].low <= line * (1 + p.tol); // 선까지 되돌아와 밟음
      const held = bars[i].close >= line * (1 - p.breakTol); // 종가가 선 위에서 지지
      if (stepped && held) entries.push(i);
      else if (bars[i].close < line * (1 - p.breakTol)) broken = false; // 지지 실패 → 무효
    } else {
      if (!broken) {
        if (bars[i].close < line * (1 - p.breakTol)) broken = true;
        continue;
      }
      const stepped = bars[i].high >= line * (1 - p.tol);
      const held = bars[i].close <= line * (1 + p.breakTol);
      if (stepped && held) entries.push(i);
      else if (bars[i].close > line * (1 + p.breakTol)) broken = false;
    }
  }

  // 현재(마지막 봉)가 밟는 중인지 — 아직 종가 확정 전이어도 '활성'으로 관찰 대상
  const lineNow = lineValueAt(slope, intercept, lastIdx);
  const steppingNow = broken && (role === 'resistance'
    ? bars[lastIdx].low <= lineNow * (1 + p.tol)
    : bars[lastIdx].high >= lineNow * (1 - p.tol));

  if (entries.length === 0 && !steppingNow) {
    return { status: '없음', direction, date: null, lineValue: null, refPrice: null, count: 0 };
  }
  const lastEntry = entries.length ? entries[entries.length - 1] : -1;
  const live = steppingNow || lastEntry === lastIdx;
  const refIdx = live ? lastIdx : lastEntry;
  return {
    status: live ? '활성' : '과거',
    direction,
    date: bars[refIdx].date,
    lineValue: round2(lineValueAt(slope, intercept, refIdx)),
    refPrice: round2(bars[refIdx].close),
    count: entries.length,
  };
}

// ─── 패턴 빌더 ──────────────────────────────────────────────

function buildPattern(
  bars: WeeklyBar[],
  type: PatternType,
  role: LineRole,
  a: number,
  b: number,
  c: number,
  anchorPrices: [number, number],
  completionPrice: number,
  quality: { touches: number; meanErrPct: number },
  p: BitgakParams,
): BitgakPattern {
  const { slope, intercept } = fitLogLine(a, anchorPrices[0], b, anchorPrices[1]);
  const lastIdx = bars.length - 1;
  const currentLineValue = lineValueAt(slope, intercept, lastIdx);
  const lastClose = bars[lastIdx].close;
  const currentGapPct = ((lastClose - currentLineValue) / currentLineValue) * 100;
  const spanWeeks = c - a;
  const strength = strengthScore(quality.touches, quality.meanErrPct, spanWeeks, p.tol);

  // 향후 12주 선값 투영 (날짜는 마지막 봉 + 7일*주차)
  const lastDate = new Date(bars[lastIdx].date);
  const projection: Array<{ date: string; lineValue: number }> = [];
  for (let w = 1; w <= 12; w++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + 7 * w);
    projection.push({
      date: d.toISOString().split('T')[0],
      lineValue: round2(lineValueAt(slope, intercept, lastIdx + w)),
    });
  }

  return {
    type,
    role,
    anchor1: { date: bars[a].date, price: round2(anchorPrices[0]), index: a },
    anchor2: { date: bars[b].date, price: round2(anchorPrices[1]), index: b },
    completion: { date: bars[c].date, price: round2(completionPrice), index: c },
    slope,
    intercept,
    currentLineValue: round2(currentLineValue),
    projection,
    nextTouch: nextTouchOutcome(bars, slope, intercept, role, c, p),
    touches: quality.touches,
    confirmed: quality.touches >= 3,
    meanTouchErrorPct: round2(quality.meanErrPct),
    spanWeeks,
    strength,
    currentGapPct: round2(currentGapPct),
    currentStatus: classifyStatus(currentGapPct, role, p),
    entry: detectEntries(bars, slope, intercept, role, c, p),
  };
}

// ─── 메인 탐지 ──────────────────────────────────────────────

export function detectBitgak(
  ticker: string,
  bars: WeeklyBar[],
  params: BitgakParams = WEEKLY_PARAMS,
): BitgakResult {
  const p = params;
  const patterns: BitgakPattern[] = [];
  const lastIdx = bars.length - 1;

  if (bars.length >= 2 * p.pivotOrder + p.minGap + 2) {
    const lows = confirmedLowPivots(bars, p.pivotOrder);
    const highs = confirmedHighPivots(bars, p.pivotOrder);

    // 저저고 (low-low-high): 상승하는 두 저점 → 저항선, 이후 고점이 선에 터치하면 완성
    const usedCompletionLLH = new Set<number>();
    for (let i = 0; i < lows.length; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        const a = lows[i];
        const b = lows[j];
        if (b - a < p.minGap) continue;
        if (!(bars[b].low > bars[a].low)) continue; // 상승 저점
        const { slope, intercept } = fitLogLine(a, bars[a].low, b, bars[b].low);
        if (Math.abs(slope) > p.maxLogSlope) continue; // degenerate 수직선 제거
        // 무효화 제약: 정의 구간에서 저가가 선을 관통하면 가짜 추세선
        if (!segmentRespectsLine(bars, slope, intercept, a, b, 'low', p.violTol)) continue;
        // 이후 확정 고점 중 선에 닿는 첫 완성 봉
        for (const c of highs) {
          if (c <= b) continue;
          if (c - a > p.maxSpan) break;
          if (usedCompletionLLH.has(c)) continue;
          const line = lineValueAt(slope, intercept, c);
          if (Math.abs(bars[c].high - line) / line <= p.tol) {
            const quality = lineTouches(bars, slope, intercept, lows, 'low', a, lastIdx, p.tol);
            if (quality.touches < p.minTouches) break;
            usedCompletionLLH.add(c); // dedup: 완성 피벗당 첫 선만
            patterns.push(
              buildPattern(bars, '저저고', 'resistance', a, b, c, [bars[a].low, bars[b].low], bars[c].high, quality, p),
            );
            break;
          }
        }
      }
    }

    // 고고저 (high-high-low): 하락하는 두 고점 → 지지선, 이후 저점이 선에 터치하면 완성
    const usedCompletionHHL = new Set<number>();
    for (let i = 0; i < highs.length; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        const a = highs[i];
        const b = highs[j];
        if (b - a < p.minGap) continue;
        if (!(bars[b].high < bars[a].high)) continue; // 하락 고점
        const { slope, intercept } = fitLogLine(a, bars[a].high, b, bars[b].high);
        if (Math.abs(slope) > p.maxLogSlope) continue; // degenerate 수직선 제거
        // 무효화 제약: 정의 구간에서 고가가 선을 관통하면 가짜 추세선
        if (!segmentRespectsLine(bars, slope, intercept, a, b, 'high', p.violTol)) continue;
        for (const c of lows) {
          if (c <= b) continue;
          if (c - a > p.maxSpan) break;
          if (usedCompletionHHL.has(c)) continue;
          const line = lineValueAt(slope, intercept, c);
          if (Math.abs(bars[c].low - line) / line <= p.tol) {
            const quality = lineTouches(bars, slope, intercept, highs, 'high', a, lastIdx, p.tol);
            if (quality.touches < p.minTouches) break;
            usedCompletionHHL.add(c);
            patterns.push(
              buildPattern(bars, '고고저', 'support', a, b, c, [bars[a].high, bars[b].high], bars[c].low, quality, p),
            );
            break;
          }
        }
      }
    }
  }

  patterns.sort((x, y) => x.completion.index - y.completion.index);
  // active = 현재 의미 있는(만료되지 않은) 가장 최근 선. 전부 만료면 가장 최근 선.
  const live = patterns.filter((pt) => pt.currentStatus !== '만료');
  const pool = live.length > 0 ? live : patterns;
  const active = pool.length > 0 ? pool[pool.length - 1] : null;

  return {
    ticker,
    bars: bars.length,
    lastDate: bars.length ? bars[lastIdx].date : '',
    lastClose: bars.length ? round2(bars[lastIdx].close) : 0,
    patternCount: patterns.length,
    active,
    patterns,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
