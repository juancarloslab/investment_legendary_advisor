'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SnapshotStatusBanner from '@/components/SnapshotStatusBanner';
import type { ReliabilitySummary } from '@/lib/reliability';
import type { SnapshotMeta } from '@/lib/snapshots';
import type { ScreeningUniverseMeta } from '@/types';

// ─── 타입 정의 ───────────────────────────────────────

interface ScreeningResult {
  ticker: string;
  name: string;
  category: string;
  currentPrice: number;
  changePercent: number;
  totalScore: number;
  maxScore: number;
  chartScore: number;
  valuationScore: number;
  sentimentScore: number;
  dividendScore: number | null;
  verdict: string;
  highlights: string[];
  signals: {
    maStatus: string;
    rsiLevel: string;
    valuationVerdict: string;
    pattern: string;
  };
  isDividendAristocrat: boolean;
  sector: string;
  lastUpdated: string;
}

interface SectorRotation {
  sector: string;
  avgScore: number;
  recommendation: string;
  tickers: string[];
}

interface DailyReport {
  date: string;
  marketSummary: {
    sp500: { price: number; change: number };
    vix: { value: number; level: string };
    tenYearYield: number;
    sentimentVerdict: string;
  };
  topPicks: {
    fearBuys: ScreeningResult[];
    undervalued: ScreeningResult[];
    dividendAttractive: ScreeningResult[];
    momentumLeaders: ScreeningResult[];
  };
  allResults: ScreeningResult[];
  sectorRotation: SectorRotation[];
  stats: {
    totalAnalyzed: number;
    successCount: number;
    failedCount: number;
    failedTickers: string[];
  };
  updatedAt: string;
  snapshotMeta?: SnapshotMeta;
  reliability?: ReliabilitySummary;
  universeMeta?: ScreeningUniverseMeta;
}

// ─── 상수 ────────────────────────────────────────────

const TABS = [
  { key: 'today', label: '🏆 오늘의 추천', description: '차트·가치·심리 종합 점수가 가장 높은 상위 10개 종목' },
  { key: 'fearBuys', label: '😱 공포 속 기회', description: '시장이 공포에 빠졌을 때 저평가된 종목 — 남들이 팔 때 싸게 사는 전략' },
  { key: 'undervalued', label: '💰 저평가 종목', description: '현재 주가가 적정 가치보다 낮은 종목 — 가치 평가 기준' },
  { key: 'dividendAttractive', label: '💎 배당 매력', description: '높은 배당수익률 + 안정적 배당 이력을 가진 종목' },
  { key: 'momentumLeaders', label: '🚀 상승 모멘텀', description: '차트 상승 추세 + RSI가 과매수 구간이 아닌 건강한 종목' },
  { key: 'sector', label: '📊 섹터 분석', description: '업종(섹터)별 평균 종합 점수 비교 — 어떤 업종이 유리한지 확인' },
] as const;

type TabKey = typeof TABS[number]['key'];

const CATEGORY_LABELS: Record<string, string> = {
  megaCap: '대형 기술주',
  dividendAristocrats: '배당 귀족주',
  growth: '성장주',
  sectorLeaders: '섹터 대표',
  koreanFavorites: '인기 ETF',
  other: '기타',
};

const SENTIMENT_LABELS: Record<string, { label: string; color: string; action: string }> = {
  extreme_fear: { label: '극도 공포', color: 'text-[#D4F94E]', action: '→ 매수 기회 탐색 구간' },
  fear: { label: '공포', color: 'text-[#D4F94E]', action: '→ 매수에 유리한 환경' },
  neutral: { label: '중립', color: 'text-white', action: '→ 관망 또는 선별 매수' },
  greed: { label: '환호', color: 'text-[#C45C3E]', action: '→ 신규 매수 주의' },
  extreme_greed: { label: '극도 환호', color: 'text-[#C45C3E]', action: '→ 과열 경고, 매수 자제' },
};

const SECTOR_LABELS: Record<string, string> = {
  'Technology': '기술',
  'Consumer Discretionary': '소비재',
  'Consumer Staples': '필수소비재',
  'Healthcare': '헬스케어',
  'Financials': '금융',
  'Industrials': '산업재',
  'Energy': '에너지',
  'ETF': 'ETF',
  'Other': '기타',
};

// ─── 유틸리티 ────────────────────────────────────────

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function getScoreColor(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100;
  if (pct >= 70) return 'text-[#D4F94E]';
  if (pct >= 50) return 'text-[#D4F94E]';
  if (pct >= 30) return 'text-[#C45C3E]';
  return 'text-[#C45C3E]';
}

function getScoreBgColor(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100;
  if (pct >= 70) return 'bg-[#A8C93E]';
  if (pct >= 50) return 'bg-[#F5F5F5]';
  if (pct >= 30) return 'bg-[#C45C3E]';
  return 'bg-[#A0452A]';
}

// ─── 컴포넌트: MiniScoreBar ─────────────────────────

function MiniScoreBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <div className="flex-1 bg-[#2A2A2A] rounded-none h-1.5">
        <div className={`${color} h-1.5 rounded-none transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-400 w-10 text-right">{score}/{max}점</span>
    </div>
  );
}

// ─── 컴포넌트: StockCard ────────────────────────────

function StockCard({ result }: { result: ScreeningResult }) {
  const pct = Math.round((result.totalScore / result.maxScore) * 100);
  const scoreColor = getScoreColor(result.totalScore, result.maxScore);

  return (
    <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 hover:border-[#D4F94E] transition-all hover:shadow-lg hover:shadow-gray-900/50">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">{result.ticker}</h3>
            {result.isDividendAristocrat && (
              <span className="text-xs bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded-none font-medium">
                👑 배당귀족
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 truncate">{result.name}</p>
          <span className="text-xs text-gray-600">{CATEGORY_LABELS[result.category] || result.category}</span>
        </div>
        <div className="text-right shrink-0 ml-3">
          <div className={`text-2xl font-bold ${scoreColor}`}>{pct}/100</div>
          <div className="text-xs text-gray-500">원점수 {result.totalScore}/{result.maxScore}</div>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-white font-medium">
          ${result.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        {result.changePercent !== 0 && (
          <span className={`text-sm font-medium ${result.changePercent >= 0 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'}`}>
            {result.changePercent >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Mini Score Bars */}
      <div className="space-y-1.5 mb-3">
        <MiniScoreBar label="차트 분석" score={result.chartScore} max={25} color="bg-[#A8C93E]" />
        <MiniScoreBar label="가치 평가" score={result.valuationScore} max={20} color="bg-[#A8C93E]" />
        <MiniScoreBar label="시장 심리" score={result.sentimentScore} max={25} color="bg-purple-500" />
        {result.dividendScore !== null && (
          <MiniScoreBar label="배당 분석" score={result.dividendScore} max={20} color="bg-amber-500" />
        )}
      </div>

      {/* Highlights */}
      {result.highlights.length > 0 && (
        <div className="mb-3 space-y-1">
          {result.highlights.slice(0, 2).map((h, i) => (
            <div key={i} className="text-xs text-gray-300 bg-[#2A2A2A]/50 rounded px-2 py-1">
              {h}
            </div>
          ))}
        </div>
      )}

      {/* Verdict */}
      <div className="flex items-center justify-between">
        <span className="text-xs">{result.verdict}</span>
        <Link
          href={`/?ticker=${result.ticker}`}
          className="text-xs text-[#D4F94E] hover:text-blue-300 font-medium transition-colors"
        >
          상세 분석 →
        </Link>
      </div>
    </div>
  );
}

// ─── 컴포넌트: SectorCard ───────────────────────────

function SectorCard({ sector }: { sector: SectorRotation }) {
  return (
    <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white">
          {SECTOR_LABELS[sector.sector] || sector.sector}
        </h3>
        <div className={`text-xl font-bold ${
          sector.avgScore >= 50 ? 'text-[#D4F94E]' : sector.avgScore >= 35 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'
        }`}>
          {sector.avgScore}%
        </div>
      </div>

      {/* Score Bar */}
      <div className="w-full bg-[#2A2A2A] rounded-none h-2.5 mb-3">
        <div
          className={`h-2.5 rounded-none transition-all duration-500 ${getScoreBgColor(sector.avgScore, 100)}`}
          style={{ width: `${sector.avgScore}%` }}
        />
      </div>

      <div className="text-sm mb-2">{sector.recommendation}</div>

      <div className="flex flex-wrap gap-1.5">
        {sector.tickers.map(ticker => (
          <Link
            key={ticker}
            href={`/?ticker=${ticker}`}
            className="text-xs bg-[#2A2A2A] hover:bg-[#3A3A3A] text-gray-300 px-2 py-1 rounded transition-colors"
          >
            {ticker}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── 컴포넌트: MarketSummary ────────────────────────

function MarketSummary({ summary }: { summary: DailyReport['marketSummary'] }) {
  const sentiment = SENTIMENT_LABELS[summary.sentimentVerdict] || { label: summary.sentimentVerdict, color: 'text-gray-400', action: '' };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3">
        <div className="text-xs text-gray-500 mb-1">S&P 500 (미국 대표지수)</div>
        <div className="text-white font-bold">
          {summary.sp500.price > 0 ? summary.sp500.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
        </div>
        {summary.sp500.change !== 0 && (
          <div className={`text-xs ${summary.sp500.change >= 0 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'}`}>
            {summary.sp500.change >= 0 ? '+' : ''}{summary.sp500.change.toFixed(2)}%
          </div>
        )}
      </div>
      <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3">
        <div className="text-xs text-gray-500 mb-1">VIX 공포지수 (높을수록 공포)</div>
        <div className="text-white font-bold">{summary.vix.value.toFixed(2)}</div>
        <div className="text-xs text-gray-400">{summary.vix.level}</div>
      </div>
      <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3">
        <div className="text-xs text-gray-500 mb-1">미국 10년 국채금리</div>
        <div className="text-white font-bold">{summary.tenYearYield > 0 ? `${summary.tenYearYield.toFixed(2)}%` : '—'}</div>
      </div>
      <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3">
        <div className="text-xs text-gray-500 mb-1">시장 심리 (공포·탐욕)</div>
        <div className={`font-bold ${sentiment.color}`}>{sentiment.label}</div>
        <div className="text-xs text-gray-500">{sentiment.action}</div>
      </div>
    </div>
  );
}

// ─── 컴포넌트: SkeletonGrid ────────────────────────

function SkeletonGrid() {
  return (
    <div className="space-y-6">
      {/* Market Summary Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3 animate-pulse">
            <div className="w-16 h-3 bg-[#2A2A2A] rounded mb-2" />
            <div className="w-24 h-5 bg-[#2A2A2A] rounded" />
          </div>
        ))}
      </div>

      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 animate-pulse">
            <div className="flex justify-between mb-3">
              <div>
                <div className="w-16 h-5 bg-[#2A2A2A] rounded mb-1" />
                <div className="w-24 h-3 bg-[#2A2A2A] rounded" />
              </div>
              <div className="w-12 h-8 bg-[#2A2A2A] rounded" />
            </div>
            <div className="w-20 h-4 bg-[#2A2A2A] rounded mb-3" />
            <div className="space-y-2">
              <div className="w-full h-2 bg-[#2A2A2A] rounded" />
              <div className="w-full h-2 bg-[#2A2A2A] rounded" />
              <div className="w-full h-2 bg-[#2A2A2A] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 컴포넌트: LoadingProgress ──────────────────────

function LoadingProgress() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4 animate-pulse">🔍</div>
      <h2 className="text-xl font-bold text-white mb-2">
        종목 스크리닝 중{dots}
      </h2>
      <p className="text-gray-400 text-sm mb-4">
        ~55개 종목을 분석하고 있습니다. 첫 실행 시 1-2분 소요될 수 있습니다.
      </p>
      <div className="max-w-xs mx-auto">
        <div className="w-full bg-[#2A2A2A] rounded-none h-2">
          <div className="bg-[#A8C93E] h-2 rounded-none animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ────────────────────────────────────

export default function DiscoverPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [refreshing, setRefreshing] = useState(false);

  const fetchReport = useCallback(async (refresh: boolean = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const url = refresh ? '/api/screening/daily?refresh=true' : '/api/screening/daily';
      const res = await fetch(url);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '스크리닝 데이터를 불러오는데 실패했습니다');
      }

      const data: DailyReport = await res.json();
      setReport(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // 탭별 종목 리스트 결정
  function getResultsForTab(): ScreeningResult[] {
    if (!report) return [];
    switch (activeTab) {
      case 'today':
        return report.allResults.slice(0, 10);
      case 'fearBuys':
        return report.topPicks.fearBuys;
      case 'undervalued':
        return report.topPicks.undervalued;
      case 'dividendAttractive':
        return report.topPicks.dividendAttractive;
      case 'momentumLeaders':
        return report.topPicks.momentumLeaders;
      default:
        return [];
    }
  }

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const results = getResultsForTab();

  return (
    <main className="min-h-screen bg-[#2A2A2A] text-white">
      {/* Header */}
      <header className="border-b border-[#1A1A1A] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">🔍 추천 종목 스크리너</h1>
            <p className="text-xs sm:text-sm text-gray-400">차트·가치·심리 분석 기반 미국주식 종목 발굴 시스템</p>
          </div>
          <div className="flex items-center gap-3">
            {report && (
              <div className="text-right text-xs text-gray-500 hidden sm:block">
                <div>분석: {report.stats.successCount}/{report.stats.totalAnalyzed}종목</div>
                <div>업데이트: {getTimeAgo(report.updatedAt)}</div>
              </div>
            )}
            <button
              onClick={() => fetchReport(true)}
              disabled={refreshing}
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
        <div className="max-w-7xl mx-auto flex gap-4 text-sm">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors py-1">
            📊 종목 분석
          </Link>
          <span className="text-[#D4F94E] font-black border-b-2 border-[#D4F94E] py-1">
            🔍 추천 종목
          </span>
          <Link href="/legends" className="text-gray-400 hover:text-white transition-colors py-1">
            🏆 레전드 전략
          </Link>
          <Link href="/etf" className="text-gray-400 hover:text-white transition-colors py-1">
            📦 ETF 추천
          </Link>
          <Link href="/bitgak" className="text-gray-400 hover:text-white transition-colors py-1">
            📐 빗각
          </Link>
          <Link href="/signals" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">
            🔔 신호
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Error */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-none border-2 border-[#1A1A1A] mb-6 text-red-300">
            ❌ {error}
            <button onClick={() => fetchReport()} className="ml-3 text-[#C45C3E] hover:text-red-300 underline text-sm">
              다시 시도
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && !report && (
          <>
            <LoadingProgress />
            <SkeletonGrid />
          </>
        )}

        {report && (
          <>
            <SnapshotStatusBanner
              snapshotMeta={report.snapshotMeta}
              reliability={report.reliability}
              universeMeta={report.universeMeta}
            />

            {/* Market Summary */}
            <MarketSummary summary={report.marketSummary} />

            {/* Tabs */}
            <div className="flex gap-1 mb-6 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 rounded-none border-2 border-[#1A1A1A] text-sm font-black whitespace-nowrap transition-all shadow-[4px_4px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1A1A1A] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] ${
                    activeTab === tab.key
                      ? 'bg-[#D4F94E] text-[#1A1A1A] shadow-[4px_4px_0px_0px_#A8C93E]'
                      : 'bg-[#3A3A3A] text-white hover:bg-[#2A2A2A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Description */}
            <div className="text-sm text-gray-400 mb-4">
              {currentTab.description}
            </div>

            {/* Tab Content */}
            {activeTab === 'sector' ? (
              /* 섹터 분석 탭 */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {report.sectorRotation.map(sector => (
                  <SectorCard key={sector.sector} sector={sector} />
                ))}
              </div>
            ) : (
              /* 종목 카드 탭 */
              <>
                {results.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.map(result => (
                      <StockCard key={result.ticker} result={result} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-3">📭</div>
                    <p>이 카테고리에 해당하는 종목이 없습니다</p>
                  </div>
                )}
              </>
            )}

            {/* All Results (오늘의 추천 탭에서만) */}
            {activeTab === 'today' && report.allResults.length > 10 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold mb-4 text-gray-300">📋 전체 분석 결과 ({report.allResults.length}종목)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1A1A1A]">
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">#</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">종목</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">현재가</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">등락</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">차트(25)</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">가치(20)</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">심리(25)</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">배당(20)</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">종합점수</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.allResults.map((r, idx) => (
                        <tr key={r.ticker} className="border-b border-[#1A1A1A]/50 hover:bg-[#3A3A3A]/50">
                          <td className="py-2 px-3 text-gray-600">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <Link href={`/?ticker=${r.ticker}`} className="hover:text-[#D4F94E] transition-colors">
                              <span className="font-bold text-white">{r.ticker}</span>
                              <span className="text-gray-500 ml-1.5 text-xs">{r.name}</span>
                              {r.isDividendAristocrat && <span className="ml-1">👑</span>}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-right text-white">
                            ${r.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-2 px-3 text-right ${r.changePercent >= 0 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'}`}>
                            {r.changePercent !== 0 ? `${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(2)}%` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-[#D4F94E]">{r.chartScore}/25점</td>
                          <td className="py-2 px-3 text-right text-[#D4F94E]">{r.valuationScore}/20점</td>
                          <td className="py-2 px-3 text-right text-purple-400">{r.sentimentScore}/25점</td>
                          <td className="py-2 px-3 text-right text-amber-400">
                            {r.dividendScore !== null ? `${r.dividendScore}/20점` : '—'}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${getScoreColor(r.totalScore, r.maxScore)}`}>
                            {Math.round((r.totalScore / r.maxScore) * 100)}점
                          </td>
                          <td className="py-2 px-3 text-xs">{r.verdict}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stats */}
            {report.stats.failedCount > 0 && (
              <div className="mt-6 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-none border-2 border-[#1A1A1A] text-sm text-yellow-300">
                ⚠️ {report.stats.failedCount}개 종목 분석 실패:
                <span className="text-[#D4F94E] ml-1">{report.stats.failedTickers.join(', ')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Disclaimer Footer */}
      <footer className="mt-8 border-t border-[#1A1A1A] pt-6 pb-8 text-center text-xs text-gray-500 px-4">
        <p className="mb-2">⚠️ 본 서비스는 투자 자문이 아닌 정보 제공 목적의 분석 도구입니다.</p>
        <p className="mb-2">투자 판단의 모든 책임은 투자자 본인에게 있으며, 본 서비스의 분석 결과를 투자 권유로 해석해서는 안 됩니다.</p>
        <p>미국주식 투자 방법론을 기반으로 한 교육/학습 목적의 도구입니다.</p>
      </footer>
    </main>
  );
}
