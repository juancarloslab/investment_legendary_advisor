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

export interface BitgakScreenResult extends BitgakResult {
  name: string;
}

/**
 * 전 종목 다음-터치 결과 풀링 통계 (Handoff §6 binomial test 준비용).
 * 돌파율 = 돌파 / (돌파 + 거부). 미도달·판정중은 분모에서 제외.
 * 합성(랜덤워크) 널 베이스라인 ≈ 25% — 같은 파라미터에서만 비교 가능한 잣대.
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
  '빗각선은 "선이 어디 있는지"의 지도일 뿐, 진입/청산 신호가 아닙니다. 차트는 로그 스케일에서 확인하세요. ' +
  '탐지는 피벗 확정 때문에 5주 지연됩니다(실시간 진입 신호가 아님).';

// 상태 우선순위: 터치임박 > 접근중 > 이탈 > 관망
const STATUS_RANK: Record<string, number> = { 터치임박: 0, 접근중: 1, 이탈: 2, 관망: 3 };

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

  const tickers = getAllTickers();
  log.info(`===== 빗각 스크리닝 시작: ${tickers.length}종목 =====`);

  const results: BitgakScreenResult[] = [];
  const failedTickers: string[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (ticker) => {
        const bars = await fetchWeeklyBars(ticker);
        const detected = detectBitgak(ticker, bars, WEEKLY_PARAMS);
        return { ...detected, name: STOCK_NAMES[ticker] || ticker } as BitgakScreenResult;
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

  // 관련도 정렬: 현재 상태 우선 → 현재가-선 간격 작은 순
  results.sort((a, b) => {
    const ra = STATUS_RANK[a.active?.currentStatus ?? '관망'] ?? 3;
    const rb = STATUS_RANK[b.active?.currentStatus ?? '관망'] ?? 3;
    if (ra !== rb) return ra - rb;
    const ga = Math.abs(a.active?.currentGapPct ?? 999);
    const gb = Math.abs(b.active?.currentGapPct ?? 999);
    return ga - gb;
  });

  // 전 종목 다음-터치 결과 풀링 (Handoff §6)
  const allPatterns = results.flatMap((r) => r.patterns);
  const breakouts = allPatterns.filter((pt) => pt.nextTouch.outcome === '돌파').length;
  const rejections = allPatterns.filter((pt) => pt.nextTouch.outcome === '거부').length;
  const noTouch = allPatterns.filter((pt) => pt.nextTouch.outcome === '미도달').length;
  const pending = allPatterns.filter((pt) => pt.nextTouch.outcome === '판정중').length;
  const decided = breakouts + rejections;
  const pooledStats: BitgakPooledStats = {
    totalPatterns: allPatterns.length,
    breakouts,
    rejections,
    noTouch,
    pending,
    breakoutRate: decided > 0 ? Math.round((breakouts / decided) * 1000) / 10 : null,
    syntheticNullRate: 25,
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
