'use client';

/**
 * 빗각(Bitgak) 주봉 추세선 스크리닝 페이지
 *
 * ⚠️ 연구·가설검증용. 매매 신호가 아니며 투자 자문이 아닙니다.
 * 전 종목 유니버스에서 저저고/고고저 빗각 패턴을 기계적으로 탐지하고,
 * 다음-터치 결과를 풀링해 합성 널 베이스라인(~25%)과 비교할 표본을 쌓는다.
 */

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ─── 타입 정의 (API 응답과 일치) ─────────────────────

interface BitgakPattern {
  type: '저저고' | '고고저';
  role: 'resistance' | 'support';
  anchor1: { date: string; price: number; index: number };
  anchor2: { date: string; price: number; index: number };
  completion: { date: string; price: number; index: number };
  currentLineValue: number;
  projection: Array<{ date: string; lineValue: number }>;
  nextTouch: {
    outcome: '돌파' | '거부' | '미도달' | '판정중';
    date: string | null;
    lineValue: number | null;
    volumeConfirmed: boolean | null;
    retest: boolean | null;
  };
  touches: number;
  confirmed: boolean;
  meanTouchErrorPct: number;
  spanWeeks: number;
  strength: number;
  currentGapPct: number;
  currentStatus: '터치임박' | '접근중' | '관망' | '이탈' | '만료';
  entry: {
    status: '활성' | '과거' | '없음';
    direction: '롱' | '숏';
    date: string | null;
    lineValue: number | null;
    refPrice: number | null;
    count: number;
  };
}

interface BitgakScreenResult {
  ticker: string;
  name: string;
  bars: number;
  lastDate: string;
  lastClose: number;
  patternCount: number;
  active: BitgakPattern | null;
  patterns: BitgakPattern[];
}

interface BreakoutTier {
  decided: number;
  breakouts: number;
  rate: number | null;
}

interface BitgakPooledStats {
  totalPatterns: number;
  breakouts: number;
  rejections: number;
  noTouch: number;
  pending: number;
  breakoutRate: number | null;
  syntheticNullRate: number;
  twoTouch: BreakoutTier;
  confirmed: BreakoutTier;
  volumeConfirmedBreakouts: number;
  retestedBreakouts: number;
}

interface BitgakReport {
  generatedAt: string;
  params: {
    pivotOrder: number;
    tol: number;
    minGap: number;
    maxSpan: number;
    breakTol: number;
    confirm: number;
    violTol: number;
    minTouches: number;
    maxLogSlope: number;
    volLookback: number;
    volMult: number;
    retestWindow: number;
    expireGap: number;
  };
  totalAnalyzed: number;
  successCount: number;
  failedCount: number;
  failedTickers: string[];
  results: BitgakScreenResult[];
  pooledStats: BitgakPooledStats;
  entryBacktest: EntryBacktest;
  disclaimer: string;
}

interface BtRow {
  horizon: number;
  entryN: number;
  entryWin: number | null;
  entryMean: number | null;
  baseWin: number | null;
  baseMean: number | null;
  edge: number | null;
}
interface EntryBacktest {
  horizons: number[];
  long: BtRow[];
  short: BtRow[];
}

// ─── 표시 헬퍼 ───────────────────────────────────────

type StatusFilter = '전체' | '터치임박' | '접근중' | '이탈' | '관망' | '만료';
const STATUS_FILTERS: StatusFilter[] = ['전체', '터치임박', '접근중', '이탈', '관망', '만료'];

const STATUS_STYLE: Record<string, string> = {
  터치임박: 'bg-[#D4F94E] text-[#1A1A1A]',
  접근중: 'bg-amber-500/80 text-[#1A1A1A]',
  이탈: 'bg-[#C45C3E] text-white',
  관망: 'bg-[#3A3A3A] text-gray-300',
  만료: 'bg-[#2A2A2A] text-gray-500',
};

const OUTCOME_STYLE: Record<string, string> = {
  돌파: 'text-[#D4F94E]',
  거부: 'text-[#C45C3E]',
  미도달: 'text-gray-500',
  판정중: 'text-amber-400',
};

type EntrySetup = BitgakPattern['entry'];

/** 빗각 밟기 타점 한 줄 표현 (테이블/배지용) */
function entryLabel(e: EntrySetup): string {
  if (e.status === '없음') return '—';
  const arrow = e.direction === '롱' ? '▲롱' : '▼숏';
  if (e.status === '활성') return `🎯 ${arrow} 밟는중`;
  return `${arrow} 과거 ${e.count}회`;
}
function entryClass(e: EntrySetup): string {
  if (e.status === '활성') return e.direction === '롱' ? 'text-[#D4F94E] font-bold' : 'text-[#C45C3E] font-bold';
  if (e.status === '과거') return 'text-gray-400';
  return 'text-gray-600';
}

function strengthColor(strength: number): string {
  if (strength >= 70) return 'text-[#D4F94E]';
  if (strength >= 50) return 'text-amber-400';
  return 'text-gray-400';
}

function rateColor(rate: number | null, baseline: number): string {
  if (rate === null) return 'text-gray-500';
  return rate > baseline ? 'text-[#D4F94E]' : 'text-[#C45C3E]';
}

// ─── 결과 해석 (경우의 수별 설명) ─────────────────────
// 모든 문구는 BitgakPattern의 기존 필드에서 파생 — 매매 신호가 아니라 "선이 어디 있는지" 해설.

const STATUS_DESC: Record<string, string> = {
  터치임박: '현재가가 선에 ±1.5% 안으로 붙어 있음 — 돌파/거부가 임박한 관찰 구간',
  접근중: '현재가가 선(±4.5%)에 접근하는 중 — 곧 터치 여부가 갈림',
  이탈: '현재가가 이미 선을 넘어선 상태 — 넘어선 선은 반대 역할(저항↔지지)로 전환 가능',
  관망: '현재가가 선에서 떨어져 있어 지금은 매매와 무관 — 가격이 다가올 때 다시 볼 선',
  만료: '현재가가 선에서 ±80% 넘게 벌어져 외삽이 무의미 — 과거 기록용, 현재 레퍼런스 아님',
};

const OUTCOME_DESC: Record<string, string> = {
  돌파: '완성 후 첫 재터치에서 종가로 선을 넘김(돌파) — 검증된 과거 사건 1건',
  거부: '완성 후 첫 재터치에서 돌파 실패(거부) — 선이 한 번 더 유효하게 작동',
  미도달: '완성 후 아직 선을 다시 터치한 적 없음 — 다음-터치 표본 없음',
  판정중: '재터치는 있었으나 판정 윈도우가 데이터 끝에 걸려 미확정',
};

/** 한 줄 요약 해석 (표/카드 인라인용) */
function describeShort(p: BitgakPattern): string {
  const kind = p.type === '저저고' ? '상승저점 저항선' : '하락고점 지지선';
  const conf = p.confirmed ? `${p.touches}터치 확정선` : `${p.touches}터치 임시선`;
  return `${kind}·${conf}(강도 ${p.strength}) — ${STATUS_DESC[p.currentStatus]}`;
}

/** 조건 조합(상태×결과×확정×거래량×리테스트)에 따른 전체 해석 문단 */
function describePattern(p: BitgakPattern): string {
  const lineNature = p.type === '저저고'
    ? '상승하는 저점들을 이어 위로 연장한 저항선입니다. 종가로 위를 넘으면(돌파) 추가 상승 여력, 못 넘고 밀리면(거부) 저항이 유효한 것으로 봅니다.'
    : '하락하는 고점들을 이어 아래로 연장한 지지선입니다. 종가로 아래를 깨면(이탈/돌파) 추가 하락 위험, 닿고 튀면(거부) 지지가 유효한 것으로 봅니다.';

  const quality = p.confirmed
    ? `같은 종류 피벗이 ${p.touches}번 닿은 확정선(강도 ${p.strength}/100, 평균이격 ${p.meanTouchErrorPct}%)이라 선 위치 신뢰도가 상대적으로 높습니다.`
    : `아직 앵커 ${p.touches}점만으로 그은 임시선(강도 ${p.strength}/100)이라, 세 번째 터치로 확정되기 전엔 신뢰도가 낮습니다.`;

  const here = {
    터치임박: '현재 이 선에 ±1.5%로 바짝 붙어 있어, 돌파냐 거부냐가 임박한 관찰 구간입니다.',
    접근중: '현재 이 선(±4.5%)에 접근하는 중이라 곧 터치 여부가 갈립니다.',
    이탈: '현재가가 이미 이 선을 넘어선 상태로, 넘어선 선은 반대 역할(저항↔지지)로 바뀌어 되돌림 시 레퍼런스가 될 수 있습니다.',
    관망: '현재가가 이 선에서 떨어져 있어 지금 당장은 매매와 무관하며, 가격이 다가올 때 다시 볼 선입니다.',
    만료: '현재가가 이 선에서 ±80% 넘게 벌어져 외삽이 무의미합니다 — 과거 기록용일 뿐 현재 레퍼런스가 아닙니다.',
  }[p.currentStatus];

  const nt = p.nextTouch;
  let past: string;
  if (nt.outcome === '돌파') {
    const mods: string[] = [];
    if (nt.volumeConfirmed) mods.push('거래량 동반(신뢰도↑)');
    if (nt.retest) mods.push('돌파 후 리테스트까지 확인(되돌림은 문헌상 최고 승률 셋업)');
    past = `완성(${p.completion.date}) 이후 첫 재터치(${nt.date})에서 종가로 선을 돌파했습니다${mods.length ? ' — ' + mods.join(', ') : ' — 다만 거래량 동반·리테스트는 확인되지 않았습니다'}.`;
  } else if (nt.outcome === '거부') {
    past = `완성(${p.completion.date}) 이후 첫 재터치(${nt.date})에서 돌파에 실패(거부)했습니다 — 선이 한 번 더 유효하게 작동한 사례입니다.`;
  } else if (nt.outcome === '미도달') {
    past = '완성 이후 아직 이 선을 다시 터치한 적이 없어 다음-터치 표본이 없습니다.';
  } else {
    past = '재터치는 있었으나 판정 윈도우가 데이터 끝에 걸려 돌파/거부가 아직 확정되지 않았습니다(판정중).';
  }

  let entryClause = '';
  if (p.entry.status === '활성') {
    const hold = p.entry.direction === '롱' ? '지지' : '저항';
    const trig = p.entry.direction === '롱' ? '선 위에서 종가가 지지되며 반등하면' : '선 아래에서 종가가 저항받고 되밀리면';
    entryClause = `🎯 지금 이 빗각을 밟는 중입니다(${p.entry.direction} 후보) — 돌파 후 선($${p.entry.lineValue}) 부근으로 되돌아와 ${hold}받는지 보는 "빗각 밟기" 타점 구간입니다. ${trig} 진입 후보지만, 확정·검증 전엔 신뢰하지 마세요.`;
  } else if (p.entry.status === '과거') {
    const hold = p.entry.direction === '롱' ? '지지' : '저항';
    entryClause = `과거 돌파 후 이 선을 ${p.entry.count}회 밟고 ${hold}받은 되돌림 타점이 있었습니다(가장 최근 ${p.entry.date} · 선값 $${p.entry.lineValue}).`;
  }

  const caveat = '⚠️ 단일 종목의 다음-터치 결과는 통계적으로 노이즈(5–48%)와 구분되지 않습니다. 신호가 아니라 "선이 어디 있는지"의 지도로만 보세요.';

  return [lineNature, quality, here, past, entryClause, caveat].filter(Boolean).join(' ');
}

// ─── 전체(풀링) 결과 자동 판정 — 경우의 수별 설명 ──────
// 실제 표본의 돌파율을 널(랜덤워크)·층(2터치 vs 3터치+)과 비교해 어느 결론에 해당하는지 분기.
// z-검정(근사)으로 유의성을 가늠하되, 연구용 잣대일 뿐 매매 신호가 아님.

type Tone = 'support' | 'weak' | 'reject' | 'insufficient';
const TONE_BORDER: Record<Tone, string> = {
  support: 'border-[#D4F94E]', weak: 'border-amber-400', reject: 'border-[#C45C3E]', insufficient: 'border-gray-500',
};
const TONE_TEXT: Record<Tone, string> = {
  support: 'text-[#D4F94E]', weak: 'text-amber-400', reject: 'text-[#C45C3E]', insufficient: 'text-gray-400',
};

interface PooledVerdict { verdict: string; tone: Tone; detail: string; sub: string; }

function interpretPooled(stats: BitgakPooledStats): PooledVerdict {
  const c = stats.confirmed, t = stats.twoTouch;
  const decidedTotal = c.decided + t.decided;
  const p0 = stats.syntheticNullRate / 100; // 널 비율 (예: 0.25)

  // 거래량·리테스트 부가 설명 (모든 경우에 공통으로 덧붙임)
  const volPct = stats.breakouts > 0 ? Math.round((stats.volumeConfirmedBreakouts / stats.breakouts) * 100) : 0;
  const rtPct = stats.breakouts > 0 ? Math.round((stats.retestedBreakouts / stats.breakouts) * 100) : 0;
  const sub = stats.breakouts > 0
    ? `부가 조건: 전체 돌파 ${stats.breakouts}건 중 거래량 동반 ${stats.volumeConfirmedBreakouts}건(${volPct}%) · 리테스트 ${stats.retestedBreakouts}건(${rtPct}%). ` +
      (volPct < 50 ? '거래량 동반 돌파가 절반 미만이라 "거래량=신뢰" 통념도 이 표본에선 약합니다.' : '돌파 다수가 거래량을 동반했습니다(추가 검정 필요).')
    : '아직 돌파 사건이 없어 거래량·리테스트 조건은 평가할 수 없습니다.';

  // 1) 표본 부족
  if (c.rate === null || t.rate === null || decidedTotal < 100 || c.decided < 30 || t.decided < 30) {
    return {
      verdict: '표본 부족 — 판단 보류',
      tone: 'insufficient',
      detail: `판정 가능 표본이 ${decidedTotal}건(확정선 ${c.decided} / 임시선 ${t.decided})뿐이라 이항검정 전 단계입니다. 전 종목으로 새로고침해 수백 건을 쌓기 전에는 어떤 층별 차이도 노이즈로 보세요.`,
      sub,
    };
  }

  // z-검정 (근사)
  const zVsNull = (rate: number, n: number) => (rate / 100 - p0) / Math.sqrt((p0 * (1 - p0)) / n);
  const zC = zVsNull(c.rate, c.decided); // 확정선 vs 널
  const zT = zVsNull(t.rate, t.decided); // 임시선 vs 널
  const pooled = (c.breakouts + t.breakouts) / (c.decided + t.decided);
  const seDiff = Math.sqrt(pooled * (1 - pooled) * (1 / c.decided + 1 / t.decided));
  const zDiff = seDiff > 0 ? (c.rate / 100 - t.rate / 100) / seDiff : 0;
  const SIG = 1.96; // 95%

  const cAbove = zC > SIG, cBelow = zC < -SIG, tAbove = zT > SIG, tBelow = zT < -SIG;
  const qMatters = zDiff > SIG, qReverse = zDiff < -SIG;
  const nums = `확정선 ${c.rate}%(${c.breakouts}/${c.decided}) · 임시선 ${t.rate}%(${t.breakouts}/${t.decided}) · 널 ~${stats.syntheticNullRate}%`;

  // 2) 가설 지지: 품질이 유의하게 우위 + 확정선이 널 상회
  if (qMatters && cAbove) {
    return { verdict: '가설 지지 (잠정)', tone: 'support',
      detail: `${nums}. 3터치+ 확정선이 임시선보다, 또 널보다 유의하게(z≈${zDiff.toFixed(1)}/${zC.toFixed(1)}) 높습니다 — 선 품질이 돌파를 예측한다는 가설을 잠정 지지합니다. 단 생존자 편향·다중검정을 통제한 재현이 필요합니다.`, sub };
  }
  // 3) 품질 효과는 있으나 절대수준이 널 이하
  if (qMatters && !cAbove) {
    return { verdict: '약한 지지 — 품질차는 있으나 절대수준 미달', tone: 'weak',
      detail: `${nums}. 확정선이 임시선보다는 높지만(z≈${zDiff.toFixed(1)}) 널(~${stats.syntheticNullRate}%)을 넘지는 못합니다. "품질 높은 선이 덜 나쁘다" 수준이라 매매 우위로 보기 어렵습니다.`, sub };
  }
  // 4) 빗각선 자체는 널 상회하나 터치 수는 무관
  if (!qMatters && !qReverse && (cAbove || tAbove) && !cBelow && !tBelow) {
    return { verdict: '약한 지지 — 빗각선은 유효, 터치 수는 무관', tone: 'weak',
      detail: `${nums}. 두 층 모두 널을 상회해 빗각선 자체엔 약한 정보가 있을 수 있으나, 확정선과 임시선 차이는 노이즈(z≈${zDiff.toFixed(1)})입니다 — 터치 수를 더 쳐줄 근거는 없습니다.`, sub };
  }
  // 5) 역설: 임시선이 유의하게 더 높음 (과적합/노이즈 의심)
  if (qReverse) {
    return { verdict: '가설 기각 — 역설(임시선이 더 높음)', tone: 'reject',
      detail: `${nums}. 오히려 2터치 임시선 돌파율이 더 높습니다(z≈${zDiff.toFixed(1)}). 품질 게이트가 돌파를 예측한다는 가설과 반대 방향 — 노이즈/과적합으로 의심됩니다.`, sub };
  }
  // 6) 거부 우세: 돌파율이 널보다 유의하게 낮음
  if (cBelow && tBelow) {
    return { verdict: '가설 기각 — 오히려 거부 우세', tone: 'reject',
      detail: `${nums}. 두 층 모두 돌파율이 널보다 유의하게 낮습니다 — 선에 닿으면 돌파보다 거부될 확률이 높습니다. 빗각을 "돌파 신호"로 쓰면 안 됩니다(컨트래리언 여지는 별도 검정 필요).`, sub };
  }
  // 7) 무상관·랜덤: 층 차이도 없고 널과도 구분 안 됨 (전 종목 표본의 실제 결과)
  return { verdict: '가설 기각 — 품질 무상관·랜덤 수준', tone: 'reject',
    detail: `${nums}. 확정선과 임시선이 사실상 같고(z≈${zDiff.toFixed(1)}), 둘 다 널(~${stats.syntheticNullRate}%)과 통계적으로 구분되지 않습니다(z≈${zC.toFixed(1)}/${zT.toFixed(1)}). 터치 수는 돌파를 예측하지 못하며, 다음-터치는 매매 신호가 아닙니다.`, sub };
}

function tvLink(ticker: string): string {
  // Yahoo 선물 표기(XYZ=F) → TradingView 연속물 표기(XYZ1!), 그 외 BRK-B → BRK.B
  const sym = ticker.endsWith('=F') ? ticker.slice(0, -2) + '1!' : ticker.replace('-', '.');
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getTimeAgo(timestamp: string): string {
  const diffMin = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// ─── 페이지 ──────────────────────────────────────────

export default function BitgakPage() {
  const [report, setReport] = useState<BitgakReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체');
  const [entryOnly, setEntryOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchReport = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screening/bitgak${refresh ? '?refresh=true' : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `요청 실패 (${res.status})`);
      }
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '빗각 스크리닝을 불러오지 못했습니다');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const filtered = report
    ? report.results.filter(
        (r) =>
          (statusFilter === '전체' || r.active?.currentStatus === statusFilter) &&
          (!entryOnly || r.active?.entry.status === '활성'),
      )
    : [];

  const activeEntryCount = report
    ? report.results.filter((r) => r.active?.entry.status === '활성').length
    : 0;

  const stats = report?.pooledStats;

  return (
    <main className="min-h-screen bg-[#2A2A2A] text-white">
      {/* Header */}
      <header className="border-b border-[#1A1A1A] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">📐 빗각 추세선 스크리너</h1>
            <p className="text-xs sm:text-sm text-gray-400">
              주봉 저저고·고고저 빗각 패턴 기계 탐지 — 연구·가설검증용
            </p>
          </div>
          <div className="flex items-center gap-3">
            {report && (
              <div className="text-right text-xs text-gray-500 hidden sm:block">
                <div>분석: {report.successCount}/{report.totalAnalyzed}종목</div>
                <div>업데이트: {getTimeAgo(report.generatedAt)}</div>
              </div>
            )}
            <button
              onClick={() => fetchReport(true)}
              disabled={refreshing || loading}
              className="px-3 py-1.5 bg-[#D4F94E] text-[#1A1A1A] font-black hover:bg-[#A8C93E] disabled:bg-[#3A3A3A] disabled:text-gray-400 rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-[6px_6px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] text-sm transition-all flex items-center gap-1"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">{refreshing ? '갱신중...' : '새로고침'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-[#1A1A1A] px-4 sm:px-6 py-2 bg-[#3A3A3A]/50">
        <div className="max-w-7xl mx-auto flex gap-4 text-sm overflow-x-auto">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">
            📊 종목 분석
          </Link>
          <Link href="/discover" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">
            🔍 추천 종목
          </Link>
          <Link href="/legends" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">
            🏆 레전드 전략
          </Link>
          <Link href="/etf" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">
            📦 ETF 추천
          </Link>
          <span className="text-[#D4F94E] font-black border-b-2 border-[#D4F94E] py-1 whitespace-nowrap">
            📐 빗각
          </span>
          <Link href="/signals" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">
            🔔 신호
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Disclaimer */}
        {report && (
          <div className="p-3 mb-6 bg-amber-900/20 border-2 border-[#1A1A1A] text-xs sm:text-sm text-amber-300 leading-relaxed">
            ⚠️ {report.disclaimer}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-900/30 border-2 border-[#1A1A1A] mb-6 text-red-300">
            ❌ {error}
            <button onClick={() => fetchReport()} className="ml-3 text-[#C45C3E] hover:text-red-300 underline text-sm">
              다시 시도
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && !report && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">📐</div>
            <p>전 종목 주봉 빗각 패턴을 탐지하고 있습니다...</p>
            <p className="text-xs text-gray-500 mt-2">첫 실행은 종목 수에 따라 1~3분 걸릴 수 있습니다</p>
          </div>
        )}

        {report && (
          <>
            {/* 풀링 통계 (Handoff §6) */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="p-3 bg-[#3A3A3A]/50 border-2 border-[#1A1A1A]">
                  <div className="text-xs text-gray-500">완성 패턴 (전 종목 풀링)</div>
                  <div className="text-xl font-black text-white">{stats.totalPatterns}건</div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    검정에는 판정 표본 수백 건 필요
                  </div>
                </div>
                <div className="p-3 bg-[#3A3A3A]/50 border-2 border-[#1A1A1A]">
                  <div className="text-xs text-gray-500">다음터치 돌파율</div>
                  <div className="text-xl font-black text-[#D4F94E]">
                    {stats.breakoutRate !== null ? `${stats.breakoutRate}%` : '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    돌파 {stats.breakouts} / 거부 {stats.rejections}
                  </div>
                </div>
                <div className="p-3 bg-[#3A3A3A]/50 border-2 border-[#1A1A1A]">
                  <div className="text-xs text-gray-500">합성 널 베이스라인</div>
                  <div className="text-xl font-black text-gray-300">~{stats.syntheticNullRate}%</div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    랜덤워크에서도 이만큼 나옴 — 이를 넘어야 의미
                  </div>
                </div>
                <div className="p-3 bg-[#3A3A3A]/50 border-2 border-[#1A1A1A]">
                  <div className="text-xs text-gray-500">미도달 / 판정중</div>
                  <div className="text-xl font-black text-gray-300">
                    {stats.noTouch} / <span className="text-amber-400">{stats.pending}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">돌파율 분모에서 제외됨</div>
                </div>
              </div>
            )}

            {/* 선 품질 가설 검정 (2026-06-16) — 터치 수가 돌파율을 끌어올리는가 */}
            {stats && (
              <div className="p-3 mb-6 bg-[#1A1A1A]/40 border-2 border-[#1A1A1A]">
                <div className="text-xs text-gray-400 mb-2 font-bold">
                  🔬 선 품질 가설 검정 — &ldquo;터치가 많고 거래량을 동반한 선일수록 돌파율이 높은가?&rdquo;
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2 bg-[#3A3A3A]/40 border border-[#1A1A1A]">
                    <div className="text-[10px] text-gray-500">2터치선 돌파율</div>
                    <div className={`text-lg font-black ${rateColor(stats.twoTouch.rate, stats.syntheticNullRate)}`}>
                      {stats.twoTouch.rate !== null ? `${stats.twoTouch.rate}%` : '—'}
                    </div>
                    <div className="text-[10px] text-gray-600">판정 {stats.twoTouch.decided}건</div>
                  </div>
                  <div className="p-2 bg-[#3A3A3A]/40 border border-[#1A1A1A]">
                    <div className="text-[10px] text-gray-500">3터치+ 확정선 돌파율</div>
                    <div className={`text-lg font-black ${rateColor(stats.confirmed.rate, stats.syntheticNullRate)}`}>
                      {stats.confirmed.rate !== null ? `${stats.confirmed.rate}%` : '—'}
                    </div>
                    <div className="text-[10px] text-gray-600">판정 {stats.confirmed.decided}건</div>
                  </div>
                  <div className="p-2 bg-[#3A3A3A]/40 border border-[#1A1A1A]">
                    <div className="text-[10px] text-gray-500">거래량 동반 돌파</div>
                    <div className="text-lg font-black text-gray-300">
                      {stats.volumeConfirmedBreakouts}
                      <span className="text-xs text-gray-600">/{stats.breakouts}</span>
                    </div>
                    <div className="text-[10px] text-gray-600">돌파봉 거래량 &gt; 추세평균×1.5</div>
                  </div>
                  <div className="p-2 bg-[#3A3A3A]/40 border border-[#1A1A1A]">
                    <div className="text-[10px] text-gray-500">돌파 후 리테스트</div>
                    <div className="text-lg font-black text-gray-300">
                      {stats.retestedBreakouts}
                      <span className="text-xs text-gray-600">/{stats.breakouts}</span>
                    </div>
                    <div className="text-[10px] text-gray-600">최고 승률 셋업(되돌림 확인)</div>
                  </div>
                </div>
                {/* 경우의 수별 자동 판정 — 실제 표본 숫자로 결론 분기 */}
                {(() => {
                  const v = interpretPooled(stats);
                  return (
                    <div className={`mt-3 p-2.5 bg-[#2A2A2A]/70 border-l-2 ${TONE_BORDER[v.tone]}`}>
                      <div className={`text-xs font-black ${TONE_TEXT[v.tone]}`}>⚖️ 현재 표본 판정: {v.verdict}</div>
                      <div className="text-[11px] text-gray-300 mt-1 leading-relaxed">{v.detail}</div>
                      <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">{v.sub}</div>
                    </div>
                  );
                })()}
                <div className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  ※ 판정은 z-검정 근사에 따른 연구용 잣대입니다. 가설이 참이라면{' '}
                  <span className="text-[#D4F94E]">3터치+ 확정선 돌파율</span>이 2터치선보다, 또 합성 널(~
                  {stats.syntheticNullRate}%)보다 유의하게 높아야 합니다. 매매 신호가 아닙니다.
                </div>
              </div>
            )}

            {/* 빗각 밟기 타점 백테스트 — 타점 진입이 랜덤 대비 엣지가 있는가 */}
            {report.entryBacktest && (() => {
              const bt = report.entryBacktest;
              const longEdges = bt.long.map((r) => r.edge).filter((e): e is number => e !== null);
              const noEdge = longEdges.length > 0 && longEdges.every((e) => e <= 0.1);
              const edgeColor = (e: number | null) => (e === null ? 'text-gray-500' : e > 0.1 ? 'text-[#D4F94E]' : e < -0.1 ? 'text-[#C45C3E]' : 'text-gray-400');
              const fmtPair = (mean: number | null, win: number | null) =>
                mean === null ? '—' : `${mean >= 0 ? '+' : ''}${mean}% / ${win}%`;
              const renderRows = (rows: BtRow[]) =>
                rows.map((r) => (
                  <tr key={r.horizon} className="border-t border-[#1A1A1A]/40">
                    <td className="py-1 px-2 text-gray-400">{r.horizon}주</td>
                    <td className="py-1 px-2 text-right text-gray-300">{fmtPair(r.entryMean, r.entryWin)}<span className="text-gray-600 text-[10px]"> (n={r.entryN})</span></td>
                    <td className="py-1 px-2 text-right text-gray-500">{fmtPair(r.baseMean, r.baseWin)}</td>
                    <td className={`py-1 px-2 text-right font-bold ${edgeColor(r.edge)}`}>{r.edge === null ? '—' : `${r.edge >= 0 ? '+' : ''}${r.edge}%p`}</td>
                  </tr>
                ));
              return (
                <div className="p-3 mb-6 bg-[#1A1A1A]/40 border-2 border-[#1A1A1A]">
                  <div className="text-xs text-gray-400 mb-2 font-bold">
                    🧪 빗각 밟기 타점 백테스트 — &ldquo;돌파 후 밟기 진입이 같은 방향 랜덤 진입보다 나은가?&rdquo;
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([['저저고 → 롱', bt.long], ['고고저 → 숏', bt.short]] as const).map(([label, rows]) => (
                      <div key={label} className="overflow-x-auto">
                        <div className="text-[11px] text-gray-500 mb-1">{label}</div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-600">
                              <th className="text-left py-1 px-2 font-medium">호라이즌</th>
                              <th className="text-right py-1 px-2 font-medium">타점 평균/승률</th>
                              <th className="text-right py-1 px-2 font-medium">랜덤</th>
                              <th className="text-right py-1 px-2 font-medium">엣지</th>
                            </tr>
                          </thead>
                          <tbody>{renderRows(rows)}</tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-2 p-2 border-l-2 ${noEdge ? 'border-[#C45C3E]' : 'border-amber-400'}`}>
                    <span className={`text-xs font-black ${noEdge ? 'text-[#C45C3E]' : 'text-amber-400'}`}>
                      ⚖️ 판정: {noEdge ? '타점 진입은 랜덤 대비 엣지 없음 (롱은 오히려 음수)' : '엣지 미미/혼재 — 표본·기간 확인 필요'}
                    </span>
                    <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                      타점에서 보이는 +수익은 대부분 생존자 편향 유니버스의 상승 드리프트입니다. &lsquo;엣지(타점−랜덤)&rsquo;가 0보다
                      유의하게 커야 타점에 매매적 의미가 있습니다. 관찰용 지표이며 매매 신호가 아닙니다.
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 결과 해석 가이드 — 경우의 수별 의미 (토글) */}
            <div className="mb-6">
              <button
                onClick={() => setShowGuide((v) => !v)}
                className="text-xs text-gray-400 hover:text-white underline underline-offset-2"
              >
                {showGuide ? '▾' : '▸'} 📖 결과 해석 가이드 — 각 조건이 무슨 뜻인지
              </button>
              {showGuide && (
                <div className="mt-2 p-3 bg-[#1A1A1A]/40 border-2 border-[#1A1A1A] text-xs text-gray-300 leading-relaxed space-y-3">
                  <div>
                    <div className="font-bold text-white mb-1">유형 (선의 성격)</div>
                    <div><span className="text-[#D4F94E]">저저고(저항)</span> — 상승하는 저점들을 이어 위로 연장. 종가로 넘으면 돌파.</div>
                    <div><span className="text-[#C45C3E]">고고저(지지)</span> — 하락하는 고점들을 이어 아래로 연장. 종가로 깨면 이탈/돌파.</div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-1">상태 (현재가와 선의 관계)</div>
                    {(['터치임박', '접근중', '이탈', '관망', '만료'] as const).map((s) => (
                      <div key={s} className="flex gap-2">
                        <span className={`px-1.5 py-0.5 text-[10px] font-black shrink-0 h-fit ${STATUS_STYLE[s]}`}>{s}</span>
                        <span className="text-gray-400">{STATUS_DESC[s]}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-bold text-white mb-1">다음터치 (완성 후 첫 재터치의 과거 결과)</div>
                    {(['돌파', '거부', '미도달', '판정중'] as const).map((o) => (
                      <div key={o} className="flex gap-2">
                        <span className={`shrink-0 w-12 font-bold ${OUTCOME_STYLE[o]}`}>{o}</span>
                        <span className="text-gray-400">{OUTCOME_DESC[o]}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-bold text-white mb-1">품질·돌파 배지</div>
                    <div><span className="text-[#D4F94E] font-bold">강도 0–100</span> — 터치 수·밀착도·수명 종합. <span className="text-[#D4F94E]">✓</span> = 3터치 이상 확정선(신뢰도↑).</div>
                    <div><span className="text-[#D4F94E]">📊</span> 거래량 동반 돌파(돌파봉 거래량 &gt; 추세평균×1.5) · <span className="text-amber-400">↩</span> 돌파 후 리테스트 확인(되돌림 셋업).</div>
                  </div>
                  <div className="text-[10px] text-gray-500 pt-1 border-t border-[#1A1A1A]">
                    종목 행을 펼치면(▸) 그 종목의 조건 조합에 맞춘 해석 문장이 자동으로 표시됩니다.
                  </div>
                </div>
              )}
            </div>

            {/* 파라미터 */}
            <div className="text-xs text-gray-500 mb-4 leading-relaxed">
              파라미터(weekly canonical): 피벗확정 ±{report.params.pivotOrder}주 · 터치 ±
              {(report.params.tol * 100).toFixed(1)}% · 앵커간격 ≥{report.params.minGap}주 · 스팬 ≤
              {report.params.maxSpan}주 · 돌파 종가 {(report.params.breakTol * 100).toFixed(0)}% 초과 · 판정{' '}
              {report.params.confirm}주
              <br />
              <span className="text-gray-600">
                선 품질 게이트: 관통허용 ±{(report.params.violTol * 100).toFixed(0)}% · 최소터치 {report.params.minTouches} ·
                |기울기| ≤{report.params.maxLogSlope}/주 · 거래량 평균 {report.params.volLookback}주×{report.params.volMult} ·
                리테스트 {report.params.retestWindow}주 · 만료 ±{(report.params.expireGap * 100).toFixed(0)}%
              </span>{' '}
              — 파라미터를 바꾸면 널 베이스라인도 다시 계산해야 합니다
            </div>

            {/* 빗각 밟기 타점 필터 */}
            <div className="mb-3">
              <button
                onClick={() => setEntryOnly((v) => !v)}
                className={`px-3 py-2 rounded-none border-2 border-[#1A1A1A] text-sm font-black whitespace-nowrap transition-all shadow-[4px_4px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1A1A1A] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] ${
                  entryOnly ? 'bg-[#D4F94E] text-[#1A1A1A]' : 'bg-[#3A3A3A] text-white hover:bg-[#2A2A2A]'
                }`}
                title="돌파 후 빗각으로 되돌아와 지지/저항을 시험 중인 '빗각 밟기' 진입 타점"
              >
                🎯 활성 타점만 ({activeEntryCount})
              </button>
              <span className="ml-2 text-[10px] text-gray-500">돌파 후 빗각을 다시 밟고 지지/저항을 시험 중인 종목 — 매매신호 아님(관찰용)</span>
            </div>

            {/* 상태 필터 */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              {STATUS_FILTERS.map((f) => {
                const count =
                  f === '전체'
                    ? report.results.length
                    : report.results.filter((r) => r.active?.currentStatus === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-2 rounded-none border-2 border-[#1A1A1A] text-sm font-black whitespace-nowrap transition-all shadow-[4px_4px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1A1A1A] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] ${
                      statusFilter === f
                        ? 'bg-[#D4F94E] text-[#1A1A1A] shadow-[4px_4px_0px_0px_#A8C93E]'
                        : 'bg-[#3A3A3A] text-white hover:bg-[#2A2A2A]'
                    }`}
                  >
                    {f} ({count})
                  </button>
                );
              })}
            </div>

            {/* 결과 테이블 */}
            {filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1A1A1A]">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">종목</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">유형</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">상태</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">강도</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">현재가</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">현재선값</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">이격</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden lg:table-cell">앵커1</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden lg:table-cell">앵커2</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">완성</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">다음터치</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">🎯 타점</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">차트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const a = r.active;
                      if (!a) return null;
                      const isOpen = expanded === r.ticker;
                      return (
                        <Fragment key={r.ticker}>
                          <tr
                            onClick={() => setExpanded(isOpen ? null : r.ticker)}
                            title={describeShort(a)}
                            className="border-b border-[#1A1A1A]/50 hover:bg-[#3A3A3A]/50 cursor-pointer"
                          >
                            <td className="py-2 px-3">
                              <span className="text-gray-600 mr-1.5">{isOpen ? '▾' : '▸'}</span>
                              <span className="font-bold text-white">{r.ticker}</span>
                              <span className="text-gray-500 ml-1.5 text-xs">{r.name}</span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={a.type === '저저고' ? 'text-[#D4F94E]' : 'text-[#C45C3E]'}>
                                {a.type}
                              </span>
                              <span className="text-gray-600 text-xs ml-1">
                                ({a.role === 'resistance' ? '저항' : '지지'})
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-1.5 py-0.5 text-xs font-black ${STATUS_STYLE[a.currentStatus]}`}>
                                {a.currentStatus}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`font-bold ${strengthColor(a.strength)}`}>{a.strength}</span>
                              <span className="text-gray-600 text-xs ml-1">
                                {a.touches}터치{a.confirmed && <span className="text-[#D4F94E]">✓</span>}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-white">${fmt(r.lastClose)}</td>
                            <td className="py-2 px-3 text-right text-gray-300">${fmt(a.currentLineValue)}</td>
                            <td
                              className={`py-2 px-3 text-right ${
                                Math.abs(a.currentGapPct) <= 1.5 ? 'text-[#D4F94E] font-bold' : 'text-gray-400'
                              }`}
                            >
                              {a.currentGapPct >= 0 ? '+' : ''}
                              {a.currentGapPct.toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-400 hidden lg:table-cell">
                              {a.anchor1.date}
                              <span className="text-gray-600 ml-1">${fmt(a.anchor1.price)}</span>
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-400 hidden lg:table-cell">
                              {a.anchor2.date}
                              <span className="text-gray-600 ml-1">${fmt(a.anchor2.price)}</span>
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-400 hidden md:table-cell">
                              {a.completion.date}
                            </td>
                            <td className={`py-2 px-3 text-xs ${OUTCOME_STYLE[a.nextTouch.outcome]}`}>
                              {a.nextTouch.outcome}
                              {a.nextTouch.date && <span className="text-gray-600 ml-1">{a.nextTouch.date}</span>}
                              {a.nextTouch.volumeConfirmed && (
                                <span className="ml-1 text-[10px] text-[#D4F94E]" title="거래량 동반 돌파">📊</span>
                              )}
                              {a.nextTouch.retest && (
                                <span className="ml-1 text-[10px] text-amber-400" title="돌파 후 리테스트 확인">↩</span>
                              )}
                            </td>
                            <td className={`py-2 px-3 text-xs whitespace-nowrap ${entryClass(a.entry)}`} title={a.entry.lineValue ? `선값 $${fmt(a.entry.lineValue)} 부근` : ''}>
                              {entryLabel(a.entry)}
                            </td>
                            <td className="py-2 px-3">
                              <a
                                href={tvLink(r.ticker)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-blue-400 hover:text-blue-300 underline"
                              >
                                TV↗
                              </a>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-b border-[#1A1A1A]/50 bg-[#1A1A1A]/30">
                              <td colSpan={13} className="py-3 px-3">
                                <div className="text-xs text-gray-400 mb-2">
                                  📏 로그 스케일 차트에서 앵커1({a.anchor1.date}, ${fmt(a.anchor1.price)})과
                                  앵커2({a.anchor2.date}, ${fmt(a.anchor2.price)})의 꼬리를 직선으로 이으면 이
                                  빗각선을 재현할 수 있습니다. 이 선은 정의구간에서 가격을 관통하지 않으며(무효화 게이트
                                  통과), 같은 종류 피벗이 {a.touches}번 닿았습니다(평균 이격 {a.meanTouchErrorPct}%,
                                  수명 {a.spanWeeks}주, 강도 {a.strength}/100{a.confirmed ? ' · 3터치+ 확정선' : ''}).
                                  전체 패턴 {r.patternCount}건 / 주봉 {r.bars}개 분석.
                                </div>
                                {/* 조건 조합에 따른 해석 */}
                                <div className="mb-3 p-2.5 bg-[#2A2A2A]/60 border-l-2 border-[#D4F94E] text-xs text-gray-300 leading-relaxed">
                                  <span className="text-[#D4F94E] font-bold">🧭 해석:</span> {describePattern(a)}
                                </div>
                                {/* 전체 패턴 */}
                                <table className="w-full text-xs mb-3">
                                  <thead>
                                    <tr className="text-gray-600">
                                      <th className="text-left py-1 px-2 font-medium">유형</th>
                                      <th className="text-left py-1 px-2 font-medium">강도</th>
                                      <th className="text-left py-1 px-2 font-medium">앵커1</th>
                                      <th className="text-left py-1 px-2 font-medium">앵커2</th>
                                      <th className="text-left py-1 px-2 font-medium">완성</th>
                                      <th className="text-right py-1 px-2 font-medium">현재선값</th>
                                      <th className="text-left py-1 px-2 font-medium">다음터치 결과</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.patterns.map((pt, i) => (
                                      <tr key={i} className="border-t border-[#1A1A1A]/40 text-gray-400">
                                        <td className="py-1 px-2">{pt.type}</td>
                                        <td className="py-1 px-2">
                                          <span className={strengthColor(pt.strength)}>{pt.strength}</span>
                                          <span className="text-gray-600 ml-1">
                                            {pt.touches}T{pt.confirmed && '✓'}
                                          </span>
                                        </td>
                                        <td className="py-1 px-2">
                                          {pt.anchor1.date} <span className="text-gray-600">${fmt(pt.anchor1.price)}</span>
                                        </td>
                                        <td className="py-1 px-2">
                                          {pt.anchor2.date} <span className="text-gray-600">${fmt(pt.anchor2.price)}</span>
                                        </td>
                                        <td className="py-1 px-2">{pt.completion.date}</td>
                                        <td className="py-1 px-2 text-right">${fmt(pt.currentLineValue)}</td>
                                        <td className={`py-1 px-2 ${OUTCOME_STYLE[pt.nextTouch.outcome]}`}>
                                          {pt.nextTouch.outcome}
                                          {pt.nextTouch.date && (
                                            <span className="text-gray-600 ml-1">
                                              {pt.nextTouch.date} @ ${pt.nextTouch.lineValue !== null ? fmt(pt.nextTouch.lineValue) : ''}
                                            </span>
                                          )}
                                          {pt.nextTouch.volumeConfirmed && <span className="ml-1 text-[#D4F94E]" title="거래량 동반">📊</span>}
                                          {pt.nextTouch.retest && <span className="ml-1 text-amber-400" title="리테스트 확인">↩</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {/* 활성 선 12주 투영 */}
                                <div className="text-gray-500 mb-1">활성 빗각선 향후 12주 선값 투영:</div>
                                <div className="flex flex-wrap gap-2">
                                  {a.projection.map((pj) => (
                                    <span key={pj.date} className="px-1.5 py-0.5 bg-[#3A3A3A]/60 text-[10px] text-gray-400">
                                      {pj.date.slice(5)} ${fmt(pj.lineValue)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-3">📭</div>
                <p>해당 상태의 빗각 패턴이 없습니다</p>
              </div>
            )}

            {/* 실패 종목 */}
            {report.failedCount > 0 && (
              <div className="mt-6 p-3 bg-yellow-900/20 border-2 border-[#1A1A1A] text-sm text-yellow-300">
                ⚠️ {report.failedCount}종목 데이터 수집 실패: {report.failedTickers.join(', ')}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
