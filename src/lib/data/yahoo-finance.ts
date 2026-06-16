/**
 * Yahoo Finance 데이터 수집
 * 무료 API 사용 (yahoo-finance2 패키지)
 * 
 * 캐시 적용:
 * - 차트 데이터: 15분 TTL
 * - 재무 데이터: 1시간 TTL
 * - VIX: 5분 TTL
 * - 시장 PER: 1시간 TTL
 * - Market Breadth: 15분 TTL
 */

import { ChartData, FinancialData, MarketBreadthData, DividendRawData, MarketOverview, MastersData } from '@/types';
import { calculateRSI, calculateMA } from '../screeners/chart-screener';
import type { WeeklyBar } from '../screeners/bitgak';
import { getCached, setCache, TTL } from '../cache';
import { createLogger } from '../logger';
import { getSector } from './stock-universe';

const log = createLogger('YahooFinance');

// yahoo-finance2 v3 (서버사이드 전용)
import YahooFinance from 'yahoo-finance2';
const yf = new YahooFinance();
async function getYF() {
  return yf;
}

// ─── 타입 정의 (any 최소화) ──────────────────────────

interface YFHistoricalRow {
  date: Date;
  close: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
}

interface YFQuote {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  epsTrailingTwelveMonths?: number;
  trailingPE?: number;
  forwardPE?: number;
  trailingAnnualDividendRate?: number;
}

interface YFQuoteSummary {
  defaultKeyStatistics?: {
    pegRatio?: number;
  };
  earningsTrend?: {
    trend?: Array<{
      growth?: number;
    }>;
  };
  financialData?: Record<string, unknown>;
  summaryDetail?: Record<string, number | undefined>;
}

interface ChartDataDeps {
  historical?: (ticker: string, options: { period1: Date; period2: Date; interval: '1d' }) => Promise<YFHistoricalRow[]>;
  chart?: (ticker: string, options: { period1: Date; period2: Date; interval: '1d' }) => Promise<unknown>;
  now?: () => Date;
}

function isValidHistoricalRow(row: YFHistoricalRow | null | undefined): row is YFHistoricalRow {
  return !!row
    && row.date instanceof Date
    && !Number.isNaN(row.date.getTime())
    && Number.isFinite(row.close)
    && Number.isFinite(row.volume);
}

function toHistoricalRowsFromChartResult(result: unknown): YFHistoricalRow[] {
  const quotes = (result as { quotes?: Array<{ date?: Date | number | string; close?: number | null; volume?: number | null }> } | null)?.quotes;
  if (!Array.isArray(quotes)) return [];

  return quotes.flatMap((quote) => {
    const dateValue = quote.date;
    const date = dateValue instanceof Date
      ? dateValue
      : typeof dateValue === 'number'
      ? new Date(dateValue * 1000)
      : typeof dateValue === 'string'
      ? new Date(dateValue)
      : null;

    if (!date || Number.isNaN(date.getTime()) || !Number.isFinite(quote.close)) {
      return [];
    }

    return [{
      date,
      close: quote.close as number,
      volume: Number.isFinite(quote.volume) ? quote.volume ?? 0 : 0,
    }];
  });
}

// ─── 차트 데이터 수집 ────────────────────────────────

/**
 * 차트 데이터 수집 (캐시 적용)
 */
export async function fetchChartData(ticker: string, deps?: ChartDataDeps): Promise<ChartData> {
  const cacheKey = `chart:${ticker}`;
  const cached = getCached<ChartData>(cacheKey);
  if (cached) {
    log.debug(`차트 데이터 캐시 히트: ${ticker}`);
    return cached;
  }

  log.info(`차트 데이터 수집 시작: ${ticker}`);
  const yf = await getYF();

  const endDate = deps?.now?.() ?? new Date();
  const startDate = new Date();
  startDate.setTime(endDate.getTime());
  startDate.setDate(startDate.getDate() - 300); // 200일선 + 여유

  const historicalFetch = deps?.historical ?? ((symbol: string, options: { period1: Date; period2: Date; interval: '1d' }) =>
    yf.historical(symbol, options) as Promise<YFHistoricalRow[]>);
  const chartFetch: NonNullable<ChartDataDeps['chart']> = deps?.chart ?? ((symbol, options) =>
    (yf as unknown as { chart: NonNullable<ChartDataDeps['chart']> }).chart(symbol, options));

  let result: YFHistoricalRow[];
  try {
    result = await historicalFetch(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    if (!result?.length || result.some((row) => !isValidHistoricalRow(row))) {
      throw new Error(`${ticker}: historical 응답에 null/invalid 값 포함`);
    }
  } catch (error) {
    log.warn(`${ticker}: historical 차트 데이터 실패, chart 폴백 시도`, error instanceof Error ? error.message : error);
    const chartResult = await chartFetch(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });
    result = toHistoricalRowsFromChartResult(chartResult);
  }

  if (!result.length) {
    throw new Error(`${ticker}: 차트 데이터를 가져올 수 없습니다`);
  }

  const closes: number[] = result.map((r) => r.close);
  const latest = result[result.length - 1];

  const ma50 = calculateMA(closes, 50);
  const ma200 = calculateMA(closes, 200);
  const rsi14 = calculateRSI(closes, 14);

  const chartData: ChartData = {
    ticker,
    date: latest.date.toISOString().split('T')[0],
    close: latest.close,
    ma50: Math.round(ma50 * 100) / 100,
    ma200: Math.round(ma200 * 100) / 100,
    rsi14: Math.round(rsi14 * 100) / 100,
    volume: latest.volume,
    prices: closes.slice(-60), // 최근 60일 (패턴 분석용)
  };

  setCache(cacheKey, chartData, TTL.CHART);
  log.info(`차트 데이터 수집 완료: ${ticker} (종가: ${chartData.close})`);
  return chartData;
}

// ─── 주봉 OHLC 수집 (빗각 탐지용) ─────────────────────

interface YFChartQuote {
  date?: Date | number | string;
  high?: number | null;
  low?: number | null;
  close?: number | null;
}

/**
 * 주봉(weekly) OHLC 수집. 빗각(Bitgak) 추세선 탐지용 — 고/저 wick이 필요해 별도 수집.
 * 기본 10년 lookback, 7일 TTL 캐시.
 */
export async function fetchWeeklyBars(ticker: string, years: number = 10): Promise<WeeklyBar[]> {
  const cacheKey = `bitgak:weekly:${ticker}`;
  const cached = getCached<WeeklyBar[]>(cacheKey);
  if (cached) {
    log.debug(`주봉 데이터 캐시 히트: ${ticker}`);
    return cached;
  }

  const yf = await getYF();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);

  const chartResult = await (yf as unknown as {
    chart: (s: string, o: { period1: Date; period2: Date; interval: '1wk' }) => Promise<{ quotes?: YFChartQuote[] }>;
  }).chart(ticker, { period1: startDate, period2: endDate, interval: '1wk' });

  const quotes = Array.isArray(chartResult?.quotes) ? chartResult.quotes : [];
  const bars: WeeklyBar[] = quotes.flatMap((q) => {
    const dv = q.date;
    const date = dv instanceof Date ? dv
      : typeof dv === 'number' ? new Date(dv * 1000)
      : typeof dv === 'string' ? new Date(dv)
      : null;
    if (!date || Number.isNaN(date.getTime())) return [];
    if (!Number.isFinite(q.high) || !Number.isFinite(q.low) || !Number.isFinite(q.close)) return [];
    return [{
      date: date.toISOString().split('T')[0],
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
    }];
  });

  if (!bars.length) {
    throw new Error(`${ticker}: 주봉 데이터를 가져올 수 없습니다`);
  }

  setCache(cacheKey, bars, TTL.WEEKLY);
  log.info(`주봉 데이터 수집 완료: ${ticker} (${bars.length}주)`);
  return bars;
}

// ─── 재무 데이터 수집 ────────────────────────────────

/**
 * 재무 데이터 수집 (캐시 적용)
 */
export async function fetchFinancialData(ticker: string): Promise<FinancialData> {
  const cacheKey = `financial:${ticker}`;
  const cached = getCached<FinancialData>(cacheKey);
  if (cached) {
    log.debug(`재무 데이터 캐시 히트: ${ticker}`);
    return cached;
  }

  log.info(`재무 데이터 수집 시작: ${ticker}`);
  const yf = await getYF();

  const quote = await yf.quote(ticker) as YFQuote;
  const summary = await yf.quoteSummary(ticker, {
    modules: ['defaultKeyStatistics', 'earningsTrend', 'financialData'],
  }) as YFQuoteSummary;

  const stats = summary.defaultKeyStatistics ?? {};
  const trends = summary.earningsTrend?.trend ?? [];

  // EPS 성장률 수집
  const epsGrowthRates: number[] = [];
  
  // earningsTrend에서 성장률 추출
  for (const t of trends) {
    if (t.growth != null) {
      epsGrowthRates.push(t.growth * 100);
    }
  }

  // 성장률 데이터가 부족하면 PEG에서 역산
  if (epsGrowthRates.length === 0 && stats.pegRatio && stats.pegRatio > 0) {
    const impliedGrowth = (quote.trailingPE ?? 20) / stats.pegRatio;
    epsGrowthRates.push(impliedGrowth);
  }

  // 최소 보수적 추정
  if (epsGrowthRates.length === 0) {
    epsGrowthRates.push(10); // 기본값
    log.warn(`${ticker}: EPS 성장률 데이터 없음, 기본값(10%) 사용`);
  }

  // S&P500 PER 가져오기 (캐시 공유)
  const marketPE = await fetchMarketPE();

  const financialData: FinancialData = {
    ticker,
    currentPrice: quote.regularMarketPrice ?? 0,
    currentEPS: quote.epsTrailingTwelveMonths ?? 0,
    peRatio: quote.trailingPE ?? 0,
    forwardPE: quote.forwardPE ?? 0,
    epsGrowthRates,
    marketPE,
  };

  setCache(cacheKey, financialData, TTL.FINANCIAL);
  log.info(`재무 데이터 수집 완료: ${ticker} (PE: ${financialData.peRatio})`);
  return financialData;
}

// ─── 시장 지표 수집 ──────────────────────────────────

/**
 * VIX 수집 (캐시 적용)
 */
export async function fetchVIX(): Promise<number> {
  const cacheKey = 'market:vix';
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  const yf = await getYF();
  const quote = await yf.quote('^VIX') as YFQuote;
  const vix = quote.regularMarketPrice ?? 20;
  
  setCache(cacheKey, vix, TTL.REALTIME);
  return vix;
}

/**
 * S&P500 PER 수집 (캐시 적용)
 */
export async function fetchMarketPE(): Promise<number> {
  const cacheKey = 'market:pe';
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const yf = await getYF();
    const quote = await yf.quote('SPY') as YFQuote;
    const pe = quote.trailingPE ?? 22;
    setCache(cacheKey, pe, TTL.FINANCIAL);
    return pe;
  } catch {
    log.warn('S&P500 PER 수집 실패, 기본값(22) 사용');
    return 22;
  }
}

/**
 * S&P500 내 MA 상회 종목 비율 수집 (캐시 적용)
 */
export async function fetchMarketBreadth(): Promise<MarketBreadthData> {
  const cacheKey = 'market:breadth';
  const cached = getCached<MarketBreadthData>(cacheKey);
  if (cached) return cached;

  const yf = await getYF();
  try {
    const [above200, above50] = await Promise.all([
      yf.quote('^SPXA200R') as Promise<YFQuote>,
      yf.quote('^SPXA50R') as Promise<YFQuote>,
    ]);
    const breadth: MarketBreadthData = {
      pctAbove200: above200?.regularMarketPrice ?? 50,
      pctAbove50: above50?.regularMarketPrice ?? 50,
    };
    setCache(cacheKey, breadth, TTL.CHART);
    return breadth;
  } catch {
    log.warn('Market Breadth 수집 실패, 기본값(50%) 사용');
    const fallback: MarketBreadthData = { pctAbove200: 50, pctAbove50: 50 };
    setCache(cacheKey, fallback, TTL.REALTIME);
    return fallback;
  }
}

// ─── 배당 데이터 수집 ────────────────────────────────

/**
 * 배당 데이터 수집
 * quoteSummary의 summaryDetail에서 기본 배당 정보를 가져오고,
 * 가능하면 배당 히스토리에서 연속 증액 연수와 성장률을 계산합니다.
 */
export async function fetchDividendData(ticker: string): Promise<DividendRawData | null> {
  const cacheKey = `dividend:${ticker}`;
  const cached = getCached<DividendRawData | null>(cacheKey);
  if (cached !== undefined && cached !== null) return cached;

  const yf = await getYF();

  try {
    const [quote, summary] = await Promise.all([
      yf.quote(ticker) as Promise<YFQuote>,
      yf.quoteSummary(ticker, { modules: ['summaryDetail'] }) as Promise<YFQuoteSummary>,
    ]);

    const detail = summary.summaryDetail ?? {};

    // 연간 배당금 (달러)
    const annualDividend = detail.dividendRate ?? quote.trailingAnnualDividendRate ?? 0;
    const currentPrice = quote.regularMarketPrice ?? 0;

    if (annualDividend <= 0 || currentPrice <= 0) {
      setCache(cacheKey, null, TTL.FINANCIAL);
      return null;
    }

    // 배당수익률 직접 계산
    const dividendYield = (annualDividend / currentPrice) * 100;

    // payoutRatio: yahoo-finance2는 fraction으로 반환 (0.15 = 15%)
    const rawPayout = detail.payoutRatio ?? 0;
    const payoutRatio = rawPayout > 0 ? rawPayout * 100 : 0;

    // 5년 평균 배당수익률
    const fiveYearAvgYield = detail.fiveYearAvgDividendYield ?? dividendYield;

    // 배당 히스토리에서 연속 증액 연수 및 성장률 계산 시도
    let consecutiveYears = 0;
    let growthRate = 0;

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 30);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chartResult = await (yf as any).chart(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1mo',
      });

      const dividendEvents = chartResult?.events?.dividends;
      if (dividendEvents && typeof dividendEvents === 'object') {
        // 연도별 배당금 합산
        const yearlyDivs: Record<number, number> = {};
        const entries = Array.isArray(dividendEvents) ? dividendEvents : Object.values(dividendEvents);

        for (const div of entries) {
          const d = div as { date?: number; amount?: number; dividends?: number };
          const dateVal = d.date ? new Date(d.date * 1000) : new Date();
          const year = dateVal.getFullYear();
          const amount = d.amount ?? d.dividends ?? 0;
          if (amount > 0) {
            yearlyDivs[year] = (yearlyDivs[year] || 0) + amount;
          }
        }

        const currentYear = new Date().getFullYear();
        const years = Object.keys(yearlyDivs)
          .map(Number)
          .filter(y => y < currentYear)
          .sort((a, b) => b - a);

        // 연속 증액 연수 계산
        for (let i = 0; i < years.length - 1; i++) {
          if (yearlyDivs[years[i]] >= yearlyDivs[years[i + 1]] * 0.99) {
            consecutiveYears++;
          } else {
            break;
          }
        }

        // 5년 CAGR 계산
        if (years.length >= 6) {
          const recent = yearlyDivs[years[0]];
          const fiveAgo = yearlyDivs[years[5]];
          if (fiveAgo > 0 && recent > 0) {
            growthRate = (Math.pow(recent / fiveAgo, 1 / 5) - 1) * 100;
          }
        } else if (years.length >= 2) {
          const n = years.length - 1;
          const recent = yearlyDivs[years[0]];
          const oldest = yearlyDivs[years[n]];
          if (oldest > 0 && recent > 0 && n > 0) {
            growthRate = (Math.pow(recent / oldest, 1 / n) - 1) * 100;
          }
        }
      }
    } catch {
      log.debug(`${ticker}: 배당 히스토리 없음, 기본 데이터만 사용`);
    }

    const result: DividendRawData = {
      dividendYield: Math.round(dividendYield * 100) / 100,
      payoutRatio: Math.round(payoutRatio * 100) / 100,
      annualDividend: Math.round(annualDividend * 100) / 100,
      fiveYearAvgYield: Math.round(fiveYearAvgYield * 100) / 100,
      consecutiveYears,
      growthRate: Math.round(growthRate * 100) / 100,
    };

    setCache(cacheKey, result, TTL.FINANCIAL);
    return result;
  } catch (err) {
    log.warn(`${ticker}: 배당 데이터 수집 실패:`, err);
    return null;
  }
}

// ─── 시장 현황 ───────────────────────────────────────

/**
 * 시장 현황 데이터 수집 (기존 대시보드용)
 */
export async function fetchMarketOverview(): Promise<MarketOverview> {
  const cacheKey = 'market:overview';
  const cached = getCached<MarketOverview>(cacheKey);
  if (cached) return cached;

  const yf = await getYF();

  const tickerMap = [
    { key: 'sp500', ticker: '^GSPC', label: 'S&P 500' },
    { key: 'nasdaq', ticker: '^IXIC', label: 'NASDAQ' },
    { key: 'vix', ticker: '^VIX', label: 'VIX' },
    { key: 'treasury10y', ticker: '^TNX', label: 'US 10Y' },
    { key: 'wtiOil', ticker: 'CL=F', label: 'WTI Oil' },
    { key: 'dxy', ticker: 'DX-Y.NYB', label: 'DXY' },
  ] as const;

  const quotes = await Promise.all(
    tickerMap.map(t => yf.quote(t.ticker).catch(() => null))
  );

  const format = (q: YFQuote | null, label: string, ticker: string) => ({
    label,
    ticker,
    price: q?.regularMarketPrice ?? 0,
    change: q?.regularMarketChange ?? 0,
    changePct: q?.regularMarketChangePercent ?? 0,
  });

  const overview: MarketOverview = {
    sp500: format(quotes[0] as YFQuote | null, tickerMap[0].label, tickerMap[0].ticker),
    nasdaq: format(quotes[1] as YFQuote | null, tickerMap[1].label, tickerMap[1].ticker),
    vix: format(quotes[2] as YFQuote | null, tickerMap[2].label, tickerMap[2].ticker),
    treasury10y: format(quotes[3] as YFQuote | null, tickerMap[3].label, tickerMap[3].ticker),
    wtiOil: format(quotes[4] as YFQuote | null, tickerMap[4].label, tickerMap[4].ticker),
    dxy: format(quotes[5] as YFQuote | null, tickerMap[5].label, tickerMap[5].ticker),
    timestamp: new Date().toISOString(),
  };

  setCache(cacheKey, overview, TTL.REALTIME);
  return overview;
}

/**
 * 주요 지수 데이터 수집 (간략 — indices 대시보드용)
 */
export interface MarketIndexData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export async function fetchMarketIndices(): Promise<MarketIndexData[]> {
  const cacheKey = 'market:indices';
  const cached = getCached<MarketIndexData[]>(cacheKey);
  if (cached) return cached;

  const yf = await getYF();
  const indices = [
    { ticker: '^GSPC', name: 'S&P 500' },
    { ticker: '^IXIC', name: 'NASDAQ' },
    { ticker: '^DJI', name: 'Dow Jones' },
  ];

  try {
    const quotes = await Promise.all(
      indices.map(async (idx) => {
        const quote = await yf.quote(idx.ticker) as YFQuote;
        return {
          ticker: idx.ticker,
          name: idx.name,
          price: quote.regularMarketPrice ?? 0,
          change: quote.regularMarketChange ?? 0,
          changePercent: quote.regularMarketChangePercent ?? 0,
        };
      })
    );
    setCache(cacheKey, quotes, TTL.REALTIME);
    return quotes;
  } catch {
    log.warn('주요 지수 데이터 수집 실패');
    return [];
  }
}

/**
 * 간단한 시세 데이터 수집 (가격 + 등락률)
 * 자동 스크리닝에서 가격 변동 정보를 가져올 때 사용
 */
export async function fetchQuotePrice(ticker: string): Promise<{ price: number; changePercent: number }> {
  const cacheKey = `quote:${ticker}`;
  const cached = getCached<{ price: number; changePercent: number }>(cacheKey);
  if (cached) return cached;

  const yf = await getYF();
  try {
    const quote = await yf.quote(ticker) as YFQuote;
    const result = {
      price: quote.regularMarketPrice ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
    };
    setCache(cacheKey, result, TTL.REALTIME);
    return result;
  } catch {
    return { price: 0, changePercent: 0 };
  }
}

// ─── 투자 대가 전략 엔진 데이터 수집 ────────────────────

interface YFMastersSummary {
  financialData?: {
    returnOnEquity?: number;
    debtToEquity?: number;
    currentRatio?: number;
    revenueGrowth?: number;
  };
  defaultKeyStatistics?: {
    priceToBook?: number;
    beta?: number;
    pegRatio?: number;
  };
  summaryDetail?: {
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    averageDailyVolume10Day?: number;
    averageVolume?: number;
  };
  summaryProfile?: {
    sector?: string;
  };
}

/**
 * 투자 대가 전략 엔진용 추가 데이터 수집
 * ROE, 부채비율, PBR, 유동비율, 52주 범위, 거래량 추세, 베타 등
 * quoteSummary modules: financialData, defaultKeyStatistics, summaryDetail, summaryProfile
 */
export async function fetchMastersData(ticker: string): Promise<MastersData> {
  const cacheKey = `masters:${ticker}`;
  const cached = getCached<MastersData>(cacheKey);
  if (cached) {
    log.debug(`대가 전략 데이터 캐시 히트: ${ticker}`);
    return cached;
  }

  log.info(`대가 전략 데이터 수집 시작: ${ticker}`);
  const yf = await getYF();

  try {
    const summary = await yf.quoteSummary(ticker, {
      modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'summaryProfile'],
    }) as YFMastersSummary;

    const fin = summary.financialData ?? {};
    const stats = summary.defaultKeyStatistics ?? {};
    const detail = summary.summaryDetail ?? {};
    const profile = summary.summaryProfile ?? {};

    // 섹터: summaryProfile 우선, stock-universe 폴백
    const sector = profile.sector || getSector(ticker) || 'Other';

    const result: MastersData = {
      roe: Math.round(((fin.returnOnEquity ?? 0) * 100) * 100) / 100,
      debtToEquity: Math.round((fin.debtToEquity ?? 0) * 100) / 100,
      pbr: Math.round((stats.priceToBook ?? 0) * 100) / 100,
      currentRatio: Math.round((fin.currentRatio ?? 0) * 100) / 100,
      revenueGrowth: Math.round(((fin.revenueGrowth ?? 0) * 100) * 100) / 100,
      week52High: detail.fiftyTwoWeekHigh ?? 0,
      week52Low: detail.fiftyTwoWeekLow ?? 0,
      avgVolume10d: detail.averageDailyVolume10Day ?? 0,
      avgVolume3m: detail.averageVolume ?? 0,
      beta: Math.round((stats.beta ?? 1) * 100) / 100,
      sector,
    };

    setCache(cacheKey, result, TTL.FINANCIAL);
    log.info(`대가 전략 데이터 수집 완료: ${ticker} (ROE: ${result.roe}%, D/E: ${result.debtToEquity}%, PBR: ${result.pbr})`);
    return result;
  } catch (err) {
    log.warn(`${ticker}: 대가 전략 데이터 수집 실패, 기본값 사용:`, err);

    // 폴백: 기본값으로 반환
    const fallback: MastersData = {
      roe: 0,
      debtToEquity: 0,
      pbr: 0,
      currentRatio: 0,
      revenueGrowth: 0,
      week52High: 0,
      week52Low: 0,
      avgVolume10d: 0,
      avgVolume3m: 0,
      beta: 1,
      sector: getSector(ticker) || 'Other',
    };
    setCache(cacheKey, fallback, TTL.REALTIME); // 짧은 TTL로 빨리 재시도
    return fallback;
  }
}
