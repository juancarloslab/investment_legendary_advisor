/**
 * Bitgak (빗각) Weekly Trendline Pattern Detector
 *
 * 한국 트레이딩 스트리머 "인범"이 대중화한 빗각(추세선) 차트 기법의 기계적 탐지기.
 * Handoff 문서(2026-06-12)의 canonical weekly 사양을 TypeScript로 포팅한 것.
 *
 * ⚠️ 연구/가설 검증용 도구입니다. 매매 신호 생성기가 아니며 투자 자문이 아닙니다.
 * 모든 기하 계산은 로그 가격 공간에서 수행합니다(차트도 로그 스케일이어야 선이 일치).
 *
 * 핵심 주장(검증 대상, 멍거인 2025-06-10): "빗각 패턴이 완성되면, 그 선의 다음 터치에서
 * 돌파할 가능성이 높다." — 이 코드는 패턴 날짜를 열거하고 다음 터치 시 돌파율을 측정한다.
 * 단일 종목(n≈10–20 터치)의 돌파율은 노이즈 밴드(5–48%)를 벗어날 수 없으므로,
 * 단일 종목 결과는 신호가 아니라 "선이 어디 있는지에 대한 지도"로만 해석할 것.
 */

// ─── 파라미터 (weekly canonical set) ─────────────────────────

export interface BitgakParams {
  pivotOrder: number; // 피벗 확정: 양쪽 N봉 기준 (확정은 N봉 지연)
  tol: number; // 선의 ±N% 이내 = 터치
  minGap: number; // 두 앵커 최소 간격 (봉)
  maxSpan: number; // 앵커1→완성 최대 간격 (봉)
  breakTol: number; // 종가가 선을 N% 넘으면 돌파
  confirm: number; // 터치 후 N봉 내 판정
}

export const WEEKLY_PARAMS: BitgakParams = {
  pivotOrder: 5,
  tol: 0.015,
  minGap: 8,
  maxSpan: 200,
  breakTol: 0.02,
  confirm: 4,
};

// ─── 입출력 타입 ─────────────────────────────────────────────

export interface WeeklyBar {
  date: string; // ISO yyyy-mm-dd
  high: number;
  low: number;
  close: number;
}

export type PatternType = '저저고' | '고고저';
export type LineRole = 'resistance' | 'support';
export type TouchOutcome = '돌파' | '거부' | '미도달' | '판정중';
export type CurrentStatus = '터치임박' | '접근중' | '관망' | '이탈';

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
  };
  /** 현재가 대비 선 위치(%) 와 상태 */
  currentGapPct: number;
  currentStatus: CurrentStatus;
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

// ─── 다음-터치 결과 ─────────────────────────────────────────

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
        return { outcome: '돌파', date: bars[j].date, lineValue: round2(lj) };
      }
    }
    // 윈도우가 데이터 끝에 잘렸으면 거부 확정 불가 — 판정중
    if (end < fullWindowEnd) {
      return { outcome: '판정중', date: bars[i].date, lineValue: round2(line) };
    }
    return { outcome: '거부', date: bars[i].date, lineValue: round2(line) };
  }
  return { outcome: '미도달', date: null, lineValue: null };
}

// ─── 현재 상태 판정 ─────────────────────────────────────────

function classifyStatus(gapPct: number, role: LineRole, p: BitgakParams): CurrentStatus {
  const abs = Math.abs(gapPct);
  if (abs <= p.tol * 100) return '터치임박';
  // 선을 넘어선 경우(저항 위/지지 아래)는 거리와 무관하게 이탈 — 접근중보다 먼저 판정해야 함
  if (role === 'resistance' && gapPct > 0) return '이탈';
  if (role === 'support' && gapPct < 0) return '이탈';
  if (abs <= p.tol * 100 * 3) return '접근중';
  return '관망';
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
  p: BitgakParams,
): BitgakPattern {
  const { slope, intercept } = fitLogLine(a, anchorPrices[0], b, anchorPrices[1]);
  const lastIdx = bars.length - 1;
  const currentLineValue = lineValueAt(slope, intercept, lastIdx);
  const lastClose = bars[lastIdx].close;
  const currentGapPct = ((lastClose - currentLineValue) / currentLineValue) * 100;

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
    currentGapPct: round2(currentGapPct),
    currentStatus: classifyStatus(currentGapPct, role, p),
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
        // 이후 확정 고점 중 선에 닿는 첫 완성 봉
        for (const c of highs) {
          if (c <= b) continue;
          if (c - a > p.maxSpan) break;
          if (usedCompletionLLH.has(c)) continue;
          const line = lineValueAt(slope, intercept, c);
          if (Math.abs(bars[c].high - line) / line <= p.tol) {
            usedCompletionLLH.add(c); // dedup: 완성 피벗당 첫 선만
            patterns.push(
              buildPattern(bars, '저저고', 'resistance', a, b, c, [bars[a].low, bars[b].low], bars[c].high, p),
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
        for (const c of lows) {
          if (c <= b) continue;
          if (c - a > p.maxSpan) break;
          if (usedCompletionHHL.has(c)) continue;
          const line = lineValueAt(slope, intercept, c);
          if (Math.abs(bars[c].low - line) / line <= p.tol) {
            usedCompletionHHL.add(c);
            patterns.push(
              buildPattern(bars, '고고저', 'support', a, b, c, [bars[a].high, bars[b].high], bars[c].low, p),
            );
            break;
          }
        }
      }
    }
  }

  patterns.sort((x, y) => x.completion.index - y.completion.index);
  const active = patterns.length > 0 ? patterns[patterns.length - 1] : null;
  const lastIdx = bars.length - 1;

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
