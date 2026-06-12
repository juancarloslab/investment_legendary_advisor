/**
 * 자동 스크리닝 엔진 (Auto Screener)
 *
 * 유니버스(~55종목)를 배치 분석하여 카테고리별 추천 종목을 생성합니다.
 * - 공포 매수 기회: 종합 점수 상위 (시장 공포 = 역발상 매수)
 * - 저평가 종목: 주가 판독기 점수 상위
 * - 배당 매력: 배당 점수 상위
 * - 모멘텀 리더: 차트 상승추세 + RSI 50-70 구간
 * - 섹터 로테이션: 섹터별 평균 점수 비교
 *
 * Rate Limiting: 배치(3종목) + 2초 딜레이
 * 캐싱: 4시간 TTL
 *
 * ⚠️ 본 도구는 투자 자문이 아닌 시장 분석 정보를 제공합니다.
 */

import { ScreeningResult, DailyScreeningReport } from '@/types';
import { getCached, setCache } from '../cache';
import { fetchChartData, fetchFinancialData, fetchMarketBreadth, fetchDividendData, fetchMarketOverview, fetchQuotePrice } from '../data/yahoo-finance';
import { fetchSentimentData } from '../data/sentiment-data';
import { calculateChartScore } from './chart-screener';
import { calculateValuationScore } from './valuation-screener';
import { calculateSentimentScore } from './sentiment-screener';
import { calculateDividendScore } from './dividend-screener';
import { getAllTickers, STOCK_NAMES, SECTOR_MAP, getCategoryForTicker, getScreeningUniverseMeta } from '../data/stock-universe';
import { DIVIDEND_ARISTOCRATS } from '../data/dividend-aristocrats';
import { createLogger } from '../logger';

const log = createLogger('AutoScreener');

// ─── 상수 ────────────────────────────────────────────

const SCREENING_CACHE_KEY = 'screening:daily';
const SCREENING_TTL = 4 * 60 * 60 * 1000; // 4시간
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;
const MAX_TICKERS = 200; // 전체 유니버스 스크리닝 (로컬/장시간 런타임 기준). Vercel Hobby 10s 환경에서는 HARD_TIMEOUT_MS로 부분 결과 처리

// 스크리닝 진행 상태 (인메모리)
let screeningProgress = {
  isRunning: false,
  current: 0,
  total: 0,
  startedAt: '',
};

// ─── 유틸리티 ────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getVixLevel(vix: number): string {
  if (vix >= 30) return '극도 공포';
  if (vix >= 25) return '공포';
  if (vix >= 20) return '불안';
  if (vix >= 15) return '안정';
  return '극도 안정';
}

export function getScoreLabel(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100;
  if (pct >= 80) return '🟢 매수 관점 매우 유리';
  if (pct >= 60) return '🟡 매수 관점 유리';
  if (pct >= 40) return '⚪ 중립';
  if (pct >= 20) return '🟠 매도 관점 유리';
  return '🔴 매도 관점 매우 유리';
}

function generateHighlights(result: ScreeningResult): string[] {
  const highlights: string[] = [];
  const pct = (result.totalScore / result.maxScore) * 100;

  if (pct >= 70) highlights.push('🟢 매수 관점 매우 유리한 구간');
  else if (pct >= 55) highlights.push('🟡 매수 관점 유리한 구간');

  if (result.signals.maStatus === 'above_both') {
    highlights.push('📈 50일+200일선 모두 상회');
  }
  if (result.signals.maStatus === 'below_both') {
    highlights.push('📉 주요 이동평균선 하회 (저점 매수 기회?)');
  }

  if (result.signals.valuationVerdict === 'undervalued') {
    highlights.push('💰 저평가 구간');
  }
  if (result.signals.rsiLevel === 'oversold') {
    highlights.push('⚡ RSI 과매도 신호');
  }
  if (result.signals.rsiLevel === 'overbought') {
    highlights.push('⚠️ RSI 과매수 경고');
  }

  if (result.isDividendAristocrat) {
    const info = DIVIDEND_ARISTOCRATS[result.ticker];
    if (info) {
      const badge = info.years >= 50 ? '왕족주' : '귀족주';
      highlights.push(`👑 배당 ${badge} (${info.years}년 연속 증액)`);
    }
  }

  if (result.dividendScore !== null && result.dividendScore >= 15) {
    highlights.push('💎 배당 매력도 우수');
  }

  if (result.signals.pattern === 'accumulation') {
    highlights.push('🔄 W패턴(매집) 감지');
  }

  return highlights;
}

// ─── 개별 종목 분석 ──────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)),
  ]);
}

async function analyzeOneTicker(
  ticker: string,
  sentimentResult: ReturnType<typeof calculateSentimentScore>,
  breadth: Awaited<ReturnType<typeof fetchMarketBreadth>>,
): Promise<ScreeningResult | null> {
  try {
    // 데이터 수집 (개별 종목 데이터 + 가격 정보) — 개별 종목 3초 타임아웃
    const [chartData, financialData, dividendData, quoteData] = await withTimeout(
      Promise.all([
        fetchChartData(ticker),
        fetchFinancialData(ticker),
        fetchDividendData(ticker),
        fetchQuotePrice(ticker),
      ]),
      3000,
      ticker,
    );

    chartData.marketBreadth = breadth;

    // 점수 계산
    const chartResult = calculateChartScore(chartData);
    const valuationResult = calculateValuationScore(financialData);

    let dividendAnalysis = null;
    if (dividendData) {
      dividendAnalysis = calculateDividendScore(dividendData);
    }

    // 총점 계산
    let totalScore = chartResult.scores.total + valuationResult.scores.total + sentimentResult.totalScore;
    let maxScore = 70; // 차트(25) + 주가(20) + 역발상(25)

    if (dividendAnalysis && dividendAnalysis.totalScore > 0) {
      totalScore += dividendAnalysis.totalScore;
      maxScore = 90; // 배당(20) 추가
    }

    const screeningResult: ScreeningResult = {
      ticker,
      name: STOCK_NAMES[ticker] || ticker,
      category: getCategoryForTicker(ticker),
      currentPrice: financialData.currentPrice || quoteData.price,
      changePercent: quoteData.changePercent,
      totalScore,
      maxScore,
      chartScore: chartResult.scores.total,
      valuationScore: valuationResult.scores.total,
      sentimentScore: sentimentResult.totalScore,
      dividendScore: dividendAnalysis?.totalScore ?? null,
      verdict: getScoreLabel(totalScore, maxScore),
      highlights: [],
      signals: {
        maStatus: chartResult.signals.maStatus,
        rsiLevel: chartResult.signals.rsiLevel,
        valuationVerdict: valuationResult.verdict,
        pattern: chartResult.signals.pattern,
      },
      isDividendAristocrat: !!DIVIDEND_ARISTOCRATS[ticker],
      sector: SECTOR_MAP[ticker] || 'Other',
      lastUpdated: new Date().toISOString(),
    };

    screeningResult.highlights = generateHighlights(screeningResult);

    return screeningResult;
  } catch (err) {
    log.warn(`${ticker} 분석 실패:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── 메인 스크리닝 ───────────────────────────────────

/**
 * 일일 자동 스크리닝 실행
 * @param forceRefresh true이면 캐시 무시하고 새로 스크리닝
 */
export async function runDailyScreening(forceRefresh: boolean = false): Promise<DailyScreeningReport> {
  // 캐시 확인
  if (!forceRefresh) {
    const cached = getCached<DailyScreeningReport>(SCREENING_CACHE_KEY);
    if (cached) {
      log.info('일일 스크리닝: 캐시 히트');
      return cached;
    }
  }

  // 이미 실행 중이면 대기
  if (screeningProgress.isRunning) {
    log.info('스크리닝 이미 실행 중, 대기...');
    // 최대 3분 대기
    for (let i = 0; i < 180; i++) {
      await delay(1000);
      if (!screeningProgress.isRunning) {
        const cached = getCached<DailyScreeningReport>(SCREENING_CACHE_KEY);
        if (cached) return cached;
        break;
      }
    }
  }

  screeningProgress = {
    isRunning: true,
    current: 0,
    total: 0,
    startedAt: new Date().toISOString(),
  };

  log.info('===== 일일 자동 스크리닝 시작 =====');
  const startTime = Date.now();

  try {
    const tickers = getAllTickers().slice(0, MAX_TICKERS);
    screeningProgress.total = tickers.length;

    const allResults: ScreeningResult[] = [];
    const failedTickers: string[] = [];

    // 1. 공유 데이터 수집 (시장 전체 → 1회만)
    log.info('공유 데이터 수집 중 (센티먼트, 브레드스)...');
    const [sentimentData, breadth] = await Promise.all([
      fetchSentimentData(),
      fetchMarketBreadth(),
    ]);
    const sentimentResult = calculateSentimentScore(sentimentData);

    // 2. 시장 현황 데이터
    let sp500Price = 0, sp500Change = 0, vixValue = 0, tenYearYield = 0;
    try {
      const overview = await fetchMarketOverview();
      sp500Price = overview.sp500.price;
      sp500Change = overview.sp500.changePct;
      vixValue = overview.vix.price;
      tenYearYield = overview.treasury10y.price;
    } catch {
      vixValue = sentimentData.vix;
      log.warn('시장 현황 수집 실패, VIX만 사용');
    }

    // 3. 배치 처리 (하드 타임아웃 — 초과 시 부분 결과로 진행)
    // 로컬/장시간 런타임에서 전체 유니버스를 처리하도록 상향. Vercel Hobby(10s)에서는 8000 등으로 낮춰야 함
    const HARD_TIMEOUT_MS = 120000;
    let timedOut = false;

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      // 시간 초과 체크 — 부분 결과로 진행
      if (Date.now() - startTime > HARD_TIMEOUT_MS) {
        log.warn(`⏱ 하드 타임아웃 (${HARD_TIMEOUT_MS}ms) 도달, ${allResults.length}/${tickers.length}개 완료 상태로 중단`);
        timedOut = true;
        break;
      }

      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);
      log.info(`배치 ${batchNum}/${totalBatches}: ${batch.join(', ')}`);

      const batchResults = await Promise.allSettled(
        batch.map(ticker => analyzeOneTicker(ticker, sentimentResult, breadth))
      );

      for (const result of batchResults) {
        screeningProgress.current++;
        if (result.status === 'fulfilled' && result.value) {
          allResults.push(result.value);
        } else {
          const idx = batchResults.indexOf(result);
          if (idx >= 0 && idx < batch.length) {
            failedTickers.push(batch[idx]);
          }
        }
      }

      // 배치 간 딜레이 (마지막 배치 제외)
      if (i + BATCH_SIZE < tickers.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    // 4. 분류 및 정렬
    const sortedByTotal = [...allResults].sort((a, b) => {
      // 퍼센트 기준 정렬 (maxScore가 다를 수 있으므로)
      const aPct = a.totalScore / a.maxScore;
      const bPct = b.totalScore / b.maxScore;
      return bPct - aPct;
    });

    // 공포 매수 기회: 종합 점수 상위 5
    const fearBuys = sortedByTotal.slice(0, 5);

    // 저평가 종목: 주가 판독기 점수 상위 5
    const undervalued = [...allResults]
      .sort((a, b) => b.valuationScore - a.valuationScore)
      .slice(0, 5);

    // 배당 매력: 배당 점수 상위 5 (배당이 있는 종목만)
    const dividendAttractive = [...allResults]
      .filter(r => r.dividendScore !== null && r.dividendScore > 0)
      .sort((a, b) => (b.dividendScore || 0) - (a.dividendScore || 0))
      .slice(0, 5);

    // 모멘텀 리더: 상승추세 + RSI 50-70 구간
    const momentumLeaders = [...allResults]
      .filter(r =>
        (r.signals.maStatus === 'above_both' || r.signals.maStatus === 'above_50') &&
        r.signals.rsiLevel === 'neutral' &&
        r.signals.pattern !== 'distribution'
      )
      .sort((a, b) => b.chartScore - a.chartScore)
      .slice(0, 5);

    // 5. 섹터 로테이션 분석
    const sectorMap = new Map<string, ScreeningResult[]>();
    for (const result of allResults) {
      const sector = result.sector;
      if (!sectorMap.has(sector)) sectorMap.set(sector, []);
      sectorMap.get(sector)!.push(result);
    }

    const sectorRotation = Array.from(sectorMap.entries())
      .map(([sector, results]) => {
        const avgScore = results.reduce(
          (sum, r) => sum + (r.totalScore / r.maxScore) * 100,
          0
        ) / results.length;

        let recommendation: string;
        if (avgScore >= 65) recommendation = '🟢 적극 매수 고려';
        else if (avgScore >= 50) recommendation = '🟡 매수 고려';
        else if (avgScore >= 35) recommendation = '⚪ 중립 / 관망';
        else recommendation = '🟠 보수적 접근';

        return {
          sector,
          avgScore: Math.round(avgScore * 10) / 10,
          recommendation,
          tickers: results.map(r => r.ticker),
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    // 6. 리포트 생성
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log.info(`===== 스크리닝 완료: ${allResults.length}/${tickers.length} 성공 (${elapsed}초 소요) =====`);

    const report: DailyScreeningReport = {
      date: new Date().toISOString().split('T')[0],
      universeMeta: getScreeningUniverseMeta(),
      marketSummary: {
        sp500: { price: sp500Price, change: sp500Change },
        vix: { value: vixValue, level: getVixLevel(vixValue) },
        tenYearYield,
        sentimentVerdict: sentimentResult.verdict,
      },
      topPicks: {
        fearBuys,
        undervalued,
        dividendAttractive,
        momentumLeaders,
      },
      allResults: sortedByTotal,
      sectorRotation,
      stats: {
        totalAnalyzed: tickers.length,
        successCount: allResults.length,
        failedCount: failedTickers.length,
        failedTickers,
      },
      updatedAt: new Date().toISOString(),
    };

    // 캐시 저장 (타임아웃 시 짧은 TTL로 다음 요청에서 재시도)
    const cacheTTL = timedOut ? 5 * 60 * 1000 : SCREENING_TTL; // 타임아웃: 5분, 정상: 4시간
    setCache(SCREENING_CACHE_KEY, report, cacheTTL);

    return report;
  } finally {
    screeningProgress.isRunning = false;
  }
}

// ─── 도우미 함수 ─────────────────────────────────────

/**
 * 카테고리별 추천 종목 반환
 */
export async function getTopPicks(
  category?: 'fearBuys' | 'undervalued' | 'dividendAttractive' | 'momentumLeaders',
  count: number = 5
): Promise<ScreeningResult[]> {
  const report = await runDailyScreening();

  if (category && report.topPicks[category]) {
    return report.topPicks[category].slice(0, count);
  }

  // 카테고리 미지정 시 종합 상위
  return report.allResults.slice(0, count);
}

/**
 * 섹터 로테이션 분석 결과 반환
 */
export async function getSectorRotation() {
  const report = await runDailyScreening();
  return report.sectorRotation;
}

/**
 * 스크리닝 진행 상태 반환
 */
export function getScreeningProgress() {
  return { ...screeningProgress };
}
