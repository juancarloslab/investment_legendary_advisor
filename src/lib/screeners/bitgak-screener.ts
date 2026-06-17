/**
 * Bitgak 유니버스 스크리너
 *
 * 현재 종목 유니버스(약 193종목) 전체에 대해 주봉 빗각 패턴을 탐지한다.
 * ⚠️ 연구용. 매매 신호 아님. 단일 종목 돌파율은 통계적으로 노이즈와 구분 불가.
 */

import { fetchWeeklyBars } from '../data/yahoo-finance';
import { getAllTickers, STOCK_NAMES } from '../data/stock-universe';
import { getCached, setCache } from '../cache';
import { createLogger } from '../logger';
import { detectBitgak, WEEKLY_PARAMS, type BitgakResult, type BitgakParams } from './bitgak';

const log = createLogger('BitgakScreener');

const CACHE_KEY = 'screening:bitgak';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12시간
// Yahoo Finance 레이트리밋 보호 (daily 스크리너와 동일한 보수적 접근, 종목당 1콜이라 약간 완화)
const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 1000;

/**
 * 빗각 전용 추가 심볼 — 차트(주봉 OHLC)만 쓰는 도구라 선물·원자재·지수 등
 * 주식 스코어링(PER/배당/대가) 대상이 아닌 심볼도 포함할 수 있다.
 * 주식 유니버스(getAllTickers)는 daily 스크리너와 공유되므로 여기서만 확장한다.
 * Yahoo 심볼 표기(예: 'MGC=F'). 개별 종목 API의 ticker 정규식은 '='을 막으므로
 * 단건 조회는 안 되고 배치 스크리너 전용이다.
 */
const BITGAK_EXTRA: Record<string, string> = {
  'MGC=F': '마이크로 골드 선물',
};

export interface BitgakScreenResult extends BitgakResult {
  name: string;
}

/** 돌파/(돌파+거부) 층별 집계 (판정 가능 표본만) */
export interface BreakoutTier {
  decided: number; // 판정 표본 = 돌파 + 거부
  breakouts: number;
  rate: number | null; // 돌파/판정, 표본 0이면 null
}

/**
 * 전 종목 다음-터치 결과 풀링 통계 (Handoff §6 binomial test 준비용).
 * 돌파율 = 돌파 / (돌파 + 거부). 미도달·판정중은 분모에서 제외.
 * 합성(랜덤워크) 널 베이스라인 ≈ 25% — 같은 파라미터에서만 비교 가능한 잣대.
 *
 * 2026-06-16 추가: 선 품질(터치 수)·거래량 동반 여부로 층화해 "품질이 돌파율을
 * 실제로 끌어올리는가"라는 가설을 직접 검정할 수 있게 했다. 품질 효과가 진짜라면
 * 3터치 확정선·거래량 동반 돌파의 돌파율이 2터치선보다 유의하게 높아야 한다.
 */
export interface BitgakPooledStats {
  totalPatterns: number;
  breakouts: number; // 돌파
  rejections: number; // 거부
  noTouch: number; // 미도달
  pending: number; // 판정중
  /** 돌파/(돌파+거부), 판정 가능 표본 없으면 null */
  breakoutRate: number | null;
  /** 합성 데이터 널 베이스라인 (Monte Carlo, weekly canonical params) */
  syntheticNullRate: number;
  // ── 선 품질 층화 (2026-06-16) ──
  /** 2터치(앵커만) 선의 돌파율 */
  twoTouch: BreakoutTier;
  /** 3터치 이상 확정선의 돌파율 — 가설이 맞다면 twoTouch보다 높아야 함 */
  confirmed: BreakoutTier;
  /** 거래량 동반 돌파 건수 / 전체 돌파 (volume 데이터 있는 돌파 중) */
  volumeConfirmedBreakouts: number;
  /** 돌파 후 리테스트가 관측된 건수 / 전체 돌파 */
  retestedBreakouts: number;
}

function tier(decided: number, breakouts: number): BreakoutTier {
  return { decided, breakouts, rate: decided > 0 ? Math.round((breakouts / decided) * 1000) / 10 : null };
}

export interface BitgakReport {
  generatedAt: string;
  params: BitgakParams;
  totalAnalyzed: number;
  successCount: number;
  failedCount: number;
  failedTickers: string[];
  /** 완성 패턴이 1개 이상인 종목만, 관련도 순 정렬 */
  results: BitgakScreenResult[];
  pooledStats: BitgakPooledStats;
  disclaimer: string;
}

const DISCLAIMER =
  '연구·가설검증용 도구입니다. 매매 신호가 아니며 투자 자문이 아닙니다. ' +
  '단일 종목의 다음-터치 돌파율은 통계적으로 노이즈(5–48%)와 구분되지 않습니다. ' +
  '풀링 돌파율도 현재 유니버스가 상장폐지/패자 종목을 제외한 생존자 편향 표본이므로 과대평가될 수 있습니다. ' +
  '선 품질(터치 수·강도·거래량) 층화는 탐색적 기술통계일 뿐, 표본이 수백 건 쌓여 이항검정을 통과하기 전에는 ' +
  '층별 차이를 신호로 받아들이지 마세요. ' +
  '빗각선은 "선이 어디 있는지"의 지도일 뿐, 진입/청산 신호가 아닙니다. 차트는 로그 스케일에서 확인하세요. ' +
  '탐지는 피벗 확정 때문에 5주 지연됩니다(실시간 진입 신호가 아님).';

// 상태 우선순위: 터치임박 > 접근중 > 이탈 > 관망 > 만료
const STATUS_RANK: Record<string, number> = { 터치임박: 0, 접근중: 1, 이탈: 2, 관망: 3, 만료: 4 };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBitgakScreening(forceRefresh = false): Promise<BitgakReport> {
  if (!forceRefresh) {
    const cached = getCached<BitgakReport>(CACHE_KEY);
    if (cached) {
      log.debug('빗각 스크리닝 캐시 히트');
      return cached;
    }
  }

  const tickers = [...getAllTickers(), ...Object.keys(BITGAK_EXTRA)];
  log.info(`===== 빗각 스크리닝 시작: ${tickers.length}종목 =====`);

  const results: BitgakScreenResult[] = [];
  const failedTickers: string[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (ticker) => {
        const bars = await fetchWeeklyBars(ticker);
        const detected = detectBitgak(ticker, bars, WEEKLY_PARAMS);
        return { ...detected, name: STOCK_NAMES[ticker] || BITGAK_EXTRA[ticker] || ticker } as BitgakScreenResult;
      }),
    );

    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        if (res.value.patternCount > 0) results.push(res.value);
      } else {
        failedTickers.push(batch[idx]);
        log.warn(`빗각 탐지 실패: ${batch[idx]} — ${res.reason}`);
      }
    });

    if (i + BATCH_SIZE < tickers.length) await delay(BATCH_DELAY_MS);
  }

  // 관련도 정렬: 현재 상태 우선 → 선 강도 높은 순 → 현재가-선 간격 작은 순
  results.sort((a, b) => {
    const ra = STATUS_RANK[a.active?.currentStatus ?? '관망'] ?? 3;
    const rb = STATUS_RANK[b.active?.currentStatus ?? '관망'] ?? 3;
    if (ra !== rb) return ra - rb;
    const sa = a.active?.strength ?? 0;
    const sb = b.active?.strength ?? 0;
    if (sa !== sb) return sb - sa; // 강한 선 우선
    const ga = Math.abs(a.active?.currentGapPct ?? 999);
    const gb = Math.abs(b.active?.currentGapPct ?? 999);
    return ga - gb;
  });

  // 전 종목 다음-터치 결과 풀링 (Handoff §6)
  const allPatterns = results.flatMap((r) => r.patterns);
  const broke = allPatterns.filter((pt) => pt.nextTouch.outcome === '돌파');
  const breakouts = broke.length;
  const rejections = allPatterns.filter((pt) => pt.nextTouch.outcome === '거부').length;
  const noTouch = allPatterns.filter((pt) => pt.nextTouch.outcome === '미도달').length;
  const pending = allPatterns.filter((pt) => pt.nextTouch.outcome === '판정중').length;
  const decided = breakouts + rejections;

  // 선 품질 층화: 2터치 vs 3터치 이상(확정선)
  const decidedPatterns = allPatterns.filter(
    (pt) => pt.nextTouch.outcome === '돌파' || pt.nextTouch.outcome === '거부',
  );
  const two = decidedPatterns.filter((pt) => !pt.confirmed);
  const three = decidedPatterns.filter((pt) => pt.confirmed);
  const twoBreaks = two.filter((pt) => pt.nextTouch.outcome === '돌파').length;
  const threeBreaks = three.filter((pt) => pt.nextTouch.outcome === '돌파').length;

  const pooledStats: BitgakPooledStats = {
    totalPatterns: allPatterns.length,
    breakouts,
    rejections,
    noTouch,
    pending,
    breakoutRate: decided > 0 ? Math.round((breakouts / decided) * 1000) / 10 : null,
    syntheticNullRate: 25,
    twoTouch: tier(two.length, twoBreaks),
    confirmed: tier(three.length, threeBreaks),
    volumeConfirmedBreakouts: broke.filter((pt) => pt.nextTouch.volumeConfirmed === true).length,
    retestedBreakouts: broke.filter((pt) => pt.nextTouch.retest === true).length,
  };

  const successCount = tickers.length - failedTickers.length;
  const report: BitgakReport = {
    generatedAt: new Date().toISOString(),
    params: WEEKLY_PARAMS,
    totalAnalyzed: tickers.length,
    successCount,
    failedCount: failedTickers.length,
    failedTickers,
    results,
    pooledStats,
    disclaimer: DISCLAIMER,
  };

  setCache(CACHE_KEY, report, CACHE_TTL);
  log.info(`===== 빗각 스크리닝 완료: ${results.length}종목 패턴 검출 / ${successCount}/${tickers.length} 성공 =====`);
  return report;
}
