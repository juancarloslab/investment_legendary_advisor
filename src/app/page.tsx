'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { CombinedResult, DataSource, MarketOverview, MarketQuote } from '@/types';
import { getPartialFailureSummary } from '@/lib/partial-failure';
import { toNormalizedScore } from '@/lib/score-display';

// ─── Type Definitions ────────────────────────────────

type Verdict = CombinedResult['finalVerdict'];
type ScreenerResult = CombinedResult;
type MarketData = MarketOverview;

// ─── Constants ───────────────────────────────────────

const VERDICT_STYLES: Record<Verdict, { bg: string; text: string; label: string; emoji: string; guide: string }> = {
  very_bullish: { bg: 'bg-[#D4F94E]', text: 'text-white', label: '강력 매수 신호', emoji: '🟢', guide: '시장 공포 + 저평가 구간으로, 매수 적기일 가능성이 높습니다' },
  bullish: { bg: 'bg-[#A8C93E]', text: 'text-white', label: '매수 긍정적', emoji: '🟡', guide: '전반적으로 매수에 유리한 조건입니다' },
  neutral: { bg: 'bg-[#52525B]', text: 'text-white', label: '중립 (관망)', emoji: '⚪', guide: '뚜렷한 매수·매도 신호가 없는 구간입니다' },
  bearish: { bg: 'bg-[#C45C3E]', text: 'text-white', label: '매수 주의', emoji: '🟠', guide: '시장 과열 징후가 있어 신규 매수에 주의가 필요합니다' },
  very_bearish: { bg: 'bg-[#C45C3E]', text: 'text-white', label: '과열 경고', emoji: '🔴', guide: '시장이 과열 구간으로, 신규 매수를 자제하세요' },
};

const QUICK_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'KO', 'JNJ'];

// 점수 해석 함수: 점수를 사람이 이해할 수 있는 등급으로 변환
function getScoreGrade(score: number, max: number): { label: string; color: string } {
  const pct = (score / max) * 100;
  if (pct >= 76) return { label: '매우 높음', color: 'text-[#D4F94E]' };
  if (pct >= 60) return { label: '높음', color: 'text-green-300' };
  if (pct >= 40) return { label: '보통', color: 'text-[#D4F94E]' };
  if (pct >= 20) return { label: '낮음', color: 'text-[#C45C3E]' };
  return { label: '매우 낮음', color: 'text-[#C45C3E]' };
}

function getTotalRawMax(result: ScreenerResult): number {
  return result.dividend ? 90 : 70;
}

function getTotalDisplay(result: ScreenerResult) {
  return result.scoreDisplay?.total ?? toNormalizedScore(result.totalScore, getTotalRawMax(result));
}

function getTrustSummary(result: ScreenerResult) {
  const partialFailure = getPartialFailureSummary(result.dataSources);
  if (!partialFailure) {
    return {
      tone: 'high' as const,
      title: '데이터 신뢰도 높음',
      description: '핵심 심리 지표를 포함해 현재 기준 데이터로 계산된 결과입니다.',
    };
  }

  return {
    tone: 'caution' as const,
    title: '데이터 신뢰도 주의',
    description: partialFailure.message,
    fallbackMetrics: partialFailure.fallbackMetrics,
  };
}

// ─── Helper Components ──────────────────────────────

function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#2A2A2A] rounded ${className}`} />;
}

function DataSourceBadge({ source }: { source?: DataSource }) {
  if (!source) return null;
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        source === 'live'
          ? 'bg-green-800/60 text-green-300'
          : 'bg-yellow-800/60 text-yellow-300'
      }`}
    >
      {source === 'live' ? '실시간 데이터' : '추정치 (실시간 불가)'}
    </span>
  );
}

function ScoreBar({
  label,
  score,
  max,
  color,
  source,
}: {
  label: string;
  score: number;
  max: number;
  color: string;
  source?: DataSource;
}) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center text-sm mb-1 gap-2">
        <span className="font-medium text-gray-300 flex items-center gap-1.5">
          {label}
          {source && <DataSourceBadge source={source} />}
        </span>
        <span className="font-bold text-white shrink-0">
          {score}/{max}점
        </span>
      </div>
      <div className="w-full bg-[#3A3A3A] rounded-none h-3">
        <div
          className={`${color} h-3 rounded-none transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GaugeCircle({ score, max, label, normalizedLabel }: { score: number; max: number; label: string; normalizedLabel?: string }) {
  const pct = Math.min((score / max) * 100, 100);
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct > 70 ? '#22c55e' : pct > 40 ? '#eab308' : '#ef4444';
  const grade = getScoreGrade(score, max);

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#374151" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="-mt-[78px] text-center">
        <div className="text-2xl font-bold text-white">{score}</div>
        <div className="text-xs text-gray-400">/ {max}점</div>
      </div>
      <div className="mt-6 text-sm font-medium text-gray-300">{label}</div>
      <div className={`text-xs font-medium mt-1 ${grade.color}`}>{grade.label}</div>
      {normalizedLabel ? <div className="text-[11px] text-gray-500 mt-1">{normalizedLabel}</div> : null}
    </div>
  );
}

// ─── Market Header ──────────────────────────────────

function MarketCardSkeleton() {
  return (
    <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-3 sm:p-4">
      <SkeletonPulse className="h-3 w-14 mb-2" />
      <SkeletonPulse className="h-6 w-20 mb-1" />
      <SkeletonPulse className="h-3 w-16" />
    </div>
  );
}

function MarketCard({ data }: { data: MarketQuote }) {
  const isUp = data.change >= 0;
  const isVIX = data.label === 'VIX';
  // VIX 상승 = 공포 (빨간), 다른 지표 상승 = 호재 (초록)
  const colorClass = isVIX
    ? isUp
      ? 'text-[#C45C3E]'
      : 'text-[#D4F94E]'
    : isUp
    ? 'text-[#D4F94E]'
    : 'text-[#C45C3E]';

  return (
    <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-3 sm:p-4 hover:bg-[#3A3A3A] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.5)] transition-all transition-colors">
      <div className="text-xs text-gray-400 font-medium mb-1">{data.label}</div>
      <div className="text-lg sm:text-xl font-bold text-white">
        {data.label === 'US 10Y'
          ? `${data.price.toFixed(2)}%`
          : data.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </div>
      <div className={`text-xs sm:text-sm font-medium ${colorClass}`}>
        {isUp ? '+' : ''}
        {data.change.toFixed(2)} ({isUp ? '+' : ''}
        {data.changePct.toFixed(2)}%)
      </div>
    </div>
  );
}

function MarketHeader({
  data,
  loading,
}: {
  data: MarketData | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <MarketCard data={data.sp500} />
      <MarketCard data={data.nasdaq} />
      <MarketCard data={data.vix} />
      <MarketCard data={data.treasury10y} />
    </div>
  );
}

type IndicatorType = 'vix' | 'oil' | 'dxy' | 'treasury';
type StatusLevel = 'safe' | 'caution' | 'warning' | 'danger';

interface IndicatorStatus {
  label: string;
  level: StatusLevel;
  description: string;
}

const STATUS_COLORS: Record<StatusLevel, { dot: string; bar: string; badgeBg: string; badgeText: string }> = {
  safe: { dot: 'bg-emerald-500', bar: 'bg-emerald-400', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700' },
  caution: { dot: 'bg-yellow-500', bar: 'bg-yellow-400', badgeBg: 'bg-yellow-50', badgeText: 'text-yellow-700' },
  warning: { dot: 'bg-orange-500 animate-pulse', bar: 'bg-orange-400', badgeBg: 'bg-orange-50', badgeText: 'text-orange-700' },
  danger: { dot: 'bg-red-500', bar: 'bg-red-400', badgeBg: 'bg-red-50', badgeText: 'text-red-700' },
};

function getFearGreedInfo(score: number) {
  if (score <= 20) return { label: '극단적 공포', labelEn: 'Extreme Fear', color: 'text-red-500', description: '투자자 심리가 극단적 공포 상태입니다.' };
  if (score <= 40) return { label: '공포', labelEn: 'Fear', color: 'text-orange-500', description: '투자자 공포 심리가 우세합니다.' };
  if (score <= 60) return { label: '중립', labelEn: 'Neutral', color: 'text-yellow-600', description: '시장 심리가 중립 구간에 있습니다.' };
  if (score <= 80) return { label: '탐욕', labelEn: 'Greed', color: 'text-lime-600', description: '낙관 심리가 우세해지고 있습니다.' };
  return { label: '극단적 탐욕', labelEn: 'Extreme Greed', color: 'text-emerald-600', description: '시장이 과열에 가까운 탐욕 구간입니다.' };
}

function getIndicatorStatus(type: IndicatorType, value: number, changePct: number): IndicatorStatus {
  switch (type) {
    case 'vix':
      if (value > 30) return { label: '위험', level: 'danger', description: '극단적 공포 구간' };
      if (value > 20) return { label: '위험', level: 'danger', description: changePct > 0 ? '전일 대비 공포 심리 확대' : '공포 수준이나 진정 조짐' };
      if (value > 15) return { label: '경계', level: 'caution', description: '보통 수준 유지' };
      return { label: '안전', level: 'safe', description: '시장 변동성 안정' };
    case 'oil':
      if (value > 100) return { label: '경고', level: 'warning', description: '에너지 가격 급등·경기 둔화 우려' };
      if (value > 85) return { label: '주의', level: 'warning', description: '인플레 압력 확대' };
      if (value > 70) return { label: '경계', level: 'caution', description: '유가 상승세 지속' };
      return { label: '안전', level: 'safe', description: '에너지 가격 안정' };
    case 'dxy':
      if (value > 108) return { label: '위험', level: 'danger', description: '달러 초강세·위험자산 압박' };
      if (value > 103) return { label: '주의', level: 'warning', description: '강달러 지속' };
      if (value > 98) return { label: '경계', level: 'caution', description: changePct > 0 ? '안전자산 선호 지속' : '달러 약세 전환 기대' };
      return { label: '안전', level: 'safe', description: '약달러·위험자산 우호적' };
    case 'treasury':
      if (value > 4.8) return { label: '위험', level: 'danger', description: '금리 급등·시장 압박' };
      if (value > 4.3) return { label: '위험', level: 'danger', description: '고금리 부담 확대' };
      if (value > 3.8) return { label: '경계', level: 'caution', description: '금리 부담 증가' };
      return { label: '안전', level: 'safe', description: '금리 환경 비교적 안정' };
  }
}

function FearGreedGauge({ score }: { score: number }) {
  const cx = 100, cy = 95, r = 75;
  const segments = [
    { start: 180, end: 144, color: '#ef4444' },
    { start: 144, end: 108, color: '#f97316' },
    { start: 108, end: 72, color: '#eab308' },
    { start: 72, end: 36, color: '#84cc16' },
    { start: 36, end: 0, color: '#22c55e' },
  ];

  function toXY(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }

  const needleAngle = 180 - (Math.min(Math.max(score, 0), 100) / 100) * 180;
  const needleLen = r - 12;
  const needleTipInner = {
    x: cx + needleLen * Math.cos((needleAngle * Math.PI) / 180),
    y: cy - needleLen * Math.sin((needleAngle * Math.PI) / 180),
  };

  return (
    <svg viewBox="0 0 200 110" className="w-[160px] sm:w-[180px] shrink-0">
      {segments.map((seg, i) => {
        const s = toXY(seg.start);
        const e = toXY(seg.end);
        return (
          <path
            key={i}
            d={`M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`}
            fill="none"
            stroke={seg.color}
            strokeWidth={10}
          />
        );
      })}
      <line x1={cx} y1={cy} x2={needleTipInner.x} y2={needleTipInner.y} stroke="#111827" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill="#111827" />
      <text x={cx - r - 2} y={cy + 16} textAnchor="middle" className="text-[9px] fill-gray-500" style={{ fontSize: '9px' }}>0</text>
      <text x={cx} y={cy - r + 2} textAnchor="middle" className="text-[9px] fill-gray-500" style={{ fontSize: '9px' }}>50</text>
      <text x={cx + r + 2} y={cy + 16} textAnchor="middle" className="text-[9px] fill-gray-500" style={{ fontSize: '9px' }}>100</text>
    </svg>
  );
}

function MarketSignalCard({
  title,
  quote,
  type,
}: {
  title: string;
  quote: MarketQuote;
  type: IndicatorType;
}) {
  const status = getIndicatorStatus(type, quote.price, quote.changePct);
  const styles = STATUS_COLORS[status.level];
  const isUp = quote.changePct >= 0;
  const changeColor = type === 'vix'
    ? isUp ? 'text-red-500' : 'text-emerald-600'
    : isUp ? 'text-emerald-600' : 'text-red-500';
  const arrow = isUp ? '▲' : '▼';
  const changeText = type === 'treasury'
    ? `${arrow}${Math.abs(quote.change * 100).toFixed(1)}bp`
    : `${arrow}${Math.abs(quote.changePct).toFixed(1)}%`;
  const displayValue = type === 'oil'
    ? `$${quote.price.toFixed(2)}`
    : type === 'treasury'
    ? `${quote.price.toFixed(3)}%`
    : quote.price.toFixed(2);

  return (
    <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-3 sm:p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400 font-medium">{title}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xl sm:text-2xl font-bold text-white">{displayValue}</span>
        <span className={`text-xs font-medium ${changeColor}`}>{changeText}</span>
      </div>
      <div className={`h-1 rounded-full mb-2 ${styles.bar}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 leading-tight">{status.description}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${styles.badgeBg} ${styles.badgeText}`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}

function MarketSentimentDashboard({
  marketData,
  sentiment,
  marketLoading,
}: {
  marketData: MarketData | null;
  sentiment: ScreenerResult['sentiment'] | null;
  marketLoading: boolean;
}) {
  const fearGreedIndex = sentiment
    ? Math.round((1 - sentiment.totalScore / 25) * 100)
    : null;
  const fearGreed = fearGreedIndex != null ? getFearGreedInfo(fearGreedIndex) : null;

  return (
    <div className="bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-white">시장 심리 신호등</h2>
          <p className="text-[11px] text-gray-500">VIX · 유가 · 달러 · 금리 + 현재 분석 심리 점수</p>
        </div>
        {marketData ? (
          <span className="text-[11px] text-gray-500">
            {new Date(marketData.timestamp).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 기준
          </span>
        ) : null}
      </div>

      <div className="border-b border-[#3A3A3A] pb-4 mb-4">
        <p className="text-xs text-gray-500 font-medium mb-3">공포 & 탐욕</p>
        {fearGreed && sentiment ? (
          <div className="flex items-center gap-4 sm:gap-6">
            <FearGreedGauge score={fearGreedIndex ?? 50} />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-gray-400 font-medium">Fear & Greed Index</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl sm:text-4xl font-bold text-white">{fearGreedIndex}</span>
                <span className={`text-sm sm:text-base font-semibold ${fearGreed.color}`}>{fearGreed.labelEn}</span>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1">{fearGreed.description}</p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-2">
                현재 종목 분석의 심리 원점수는 {sentiment.totalScore}/25점입니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-4">
            종목 분석 결과가 있을 때 공포·탐욕 지수를 함께 표시합니다.
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-500 font-medium mb-3">시장 지표</p>
        {marketLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <SkeletonPulse key={i} className="h-28 rounded-none" />)}
          </div>
        ) : marketData ? (
          <div className="grid grid-cols-2 gap-3">
            <MarketSignalCard title="VIX 공포지수" quote={marketData.vix} type="vix" />
            {marketData.wtiOil ? <MarketSignalCard title="WTI 유가" quote={marketData.wtiOil} type="oil" /> : null}
            {marketData.dxy ? <MarketSignalCard title="DXY 달러지수" quote={marketData.dxy} type="dxy" /> : null}
            <MarketSignalCard title="10년 국채금리" quote={marketData.treasury10y} type="treasury" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Skeleton Loading ───────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Verdict Banner Skeleton */}
      <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <SkeletonPulse className="h-8 w-64" />
            <SkeletonPulse className="h-5 w-96 max-w-full" />
          </div>
          <SkeletonPulse className="h-12 w-20 ml-4" />
        </div>
      </div>

      {/* 3 Gauges Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-6 flex flex-col items-center">
            <SkeletonPulse className="w-[120px] h-[120px] rounded-none" />
            <SkeletonPulse className="h-4 w-24 mt-6" />
          </div>
        ))}
      </div>

      {/* Detail Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-6 space-y-3">
            <SkeletonPulse className="h-6 w-40" />
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-5/6" />
            <SkeletonPulse className="h-4 w-4/5" />
            <SkeletonPulse className="h-4 w-3/4" />
            <SkeletonPulse className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Comparison Components ──────────────────────────

function ComparisonTable({ results }: { results: ScreenerResult[] }) {
  return (
    <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6 overflow-x-auto">
      <h3 className="text-lg font-bold mb-4">📋 종목 비교표</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#3A3A3A]">
            <th className="text-left py-2 px-2 text-gray-400 font-medium">항목</th>
            {results.map((r) => (
              <th key={r.ticker} className="text-center py-2 px-2 text-white font-bold">
                <div>{r.ticker}</div>
                <a
                  href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.ticker.replace('-', '.'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-medium text-[#2962FF] hover:underline"
                >
                  📈 차트 ↗
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          <tr>
            <td className="py-2 px-2 text-gray-400">📈 차트 분석 (25점 만점)</td>
            {results.map((r) => (
              <td key={r.ticker} className="py-2 px-2 text-center font-bold text-white">
                {r.chart.scores.total}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-2 text-gray-400">💰 가치 평가 (20점 만점)</td>
            {results.map((r) => (
              <td key={r.ticker} className="py-2 px-2 text-center font-bold text-white">
                {r.valuation.scores.total}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-2 text-gray-400">🔄 시장 심리 (25점 만점)</td>
            {results.map((r) => (
              <td key={r.ticker} className="py-2 px-2 text-center font-bold text-white">
                {r.sentiment.totalScore}
              </td>
            ))}
          </tr>
          {results.some((r) => r.dividend) && (
            <tr>
              <td className="py-2 px-2 text-gray-400">💎 배당 분석 (20점 만점)</td>
              {results.map((r) => (
                <td key={r.ticker} className="py-2 px-2 text-center font-bold text-white">
                  {r.dividend?.totalScore ?? '-'}
                </td>
              ))}
            </tr>
          )}
          <tr className="bg-[#2A2A2A]/50">
            <td className="py-3 px-2 text-white font-bold">종합 점수 (100점 환산)</td>
            {results.map((r) => {
              const totalDisplay = getTotalDisplay(r);
              return (
                <td key={r.ticker} className="py-3 px-2 text-center">
                  <span className="font-bold text-lg text-[#D4F94E]">
                    {totalDisplay.normalizedScore}/100
                  </span>
                  <div className="text-[11px] text-gray-500">원점수 {totalDisplay.rawScore}/{totalDisplay.rawMaxScore}</div>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="py-2 px-2 text-gray-400">판정</td>
            {results.map((r) => {
              const v = VERDICT_STYLES[r.finalVerdict];
              return (
                <td key={r.ticker} className="py-2 px-2 text-center">
                  <span className={`text-xs px-2 py-1 rounded-none ${v.bg} ${v.text} font-medium`}>
                    {v.emoji} {v.label}
                  </span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="py-2 px-2 text-gray-400">현재가</td>
            {results.map((r) => (
              <td key={r.ticker} className="py-2 px-2 text-center text-white">
                ${r.valuation.currentPrice?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-2 text-gray-400">상승여력 (적정가 대비)</td>
            {results.map((r) => (
              <td
                key={r.ticker}
                className={`py-2 px-2 text-center font-bold ${
                  r.valuation.upsideDownside > 0 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'
                }`}
              >
                {r.valuation.upsideDownside > 0 ? '+' : ''}
                {r.valuation.upsideDownside}%
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-2 text-gray-400">PEG</td>
            {results.map((r) => (
              <td key={r.ticker} className="py-2 px-2 text-center text-white">
                {r.valuation.peg}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComparisonChart({ results }: { results: ScreenerResult[] }) {
  const categories = [
    { key: 'chart', label: '차트 분석', max: 25, color: '#3b82f6' },
    { key: 'valuation', label: '가치 평가', max: 20, color: '#22c55e' },
    { key: 'sentiment', label: '시장 심리', max: 25, color: '#f97316' },
  ] as const;

  const barWidth = 28;
  const barGap = 6;
  const groupWidth = categories.length * barWidth + (categories.length - 1) * barGap;
  const groupGap = 50;
  const chartHeight = 180;
  const paddingLeft = 40;
  const paddingTop = 20;
  const paddingBottom = 60;
  const totalWidth = paddingLeft + results.length * (groupWidth + groupGap);
  const totalHeight = chartHeight + paddingTop + paddingBottom;

  const getScore = (r: ScreenerResult, key: string) => {
    if (key === 'chart') return r.chart.scores.total;
    if (key === 'valuation') return r.valuation.scores.total;
    return r.sentiment.totalScore;
  };

  // Y축 그리드 (0, 5, 10, 15, 20, 25)
  const yTicks = [0, 5, 10, 15, 20, 25];

  return (
    <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6">
      <h3 className="text-lg font-bold mb-4">📊 점수 비교 차트</h3>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Math.max(totalWidth, 300)} ${totalHeight}`}
          className="w-full min-w-[300px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y축 그리드 라인 */}
          {yTicks.map((tick) => {
            const y = paddingTop + chartHeight - (tick / 25) * chartHeight;
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft - 5}
                  y1={y}
                  x2={totalWidth - 10}
                  y2={y}
                  stroke="#374151"
                  strokeWidth="1"
                  strokeDasharray={tick > 0 ? '4,4' : '0'}
                />
                <text x={paddingLeft - 10} y={y + 4} textAnchor="end" fill="#6b7280" fontSize="10">
                  {tick}
                </text>
              </g>
            );
          })}

          {/* 바 그룹 */}
          {results.map((r, groupIdx) => {
            const groupX = paddingLeft + groupIdx * (groupWidth + groupGap) + groupGap / 2;

            return (
              <g key={r.ticker}>
                {categories.map((cat, barIdx) => {
                  const score = getScore(r, cat.key);
                  const barHeight = (score / cat.max) * chartHeight;
                  const x = groupX + barIdx * (barWidth + barGap);
                  const y = paddingTop + chartHeight - barHeight;

                  return (
                    <g key={cat.key}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={cat.color}
                        rx={4}
                        opacity={0.85}
                      >
                        <animate
                          attributeName="height"
                          from="0"
                          to={barHeight}
                          dur="0.8s"
                          fill="freeze"
                        />
                        <animate
                          attributeName="y"
                          from={paddingTop + chartHeight}
                          to={y}
                          dur="0.8s"
                          fill="freeze"
                        />
                      </rect>
                      <text
                        x={x + barWidth / 2}
                        y={y - 5}
                        textAnchor="middle"
                        fill="white"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        {score}
                      </text>
                    </g>
                  );
                })}

                {/* 티커 이름 */}
                <text
                  x={groupX + groupWidth / 2}
                  y={paddingTop + chartHeight + 18}
                  textAnchor="middle"
                  fill="#d1d5db"
                  fontSize="13"
                  fontWeight="bold"
                >
                  {r.ticker}
                </text>

                {/* 총점 */}
                <text
                  x={groupX + groupWidth / 2}
                  y={paddingTop + chartHeight + 35}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {(() => { const totalDisplay = getTotalDisplay(r); return `종합 ${totalDisplay.normalizedScore}/100 (${totalDisplay.rawScore}/${totalDisplay.rawMaxScore})`; })()}
                </text>
              </g>
            );
          })}

          {/* 범례 */}
          {categories.map((cat, i) => {
            const lx = paddingLeft + i * 90;
            const ly = paddingTop + chartHeight + 50;
            return (
              <g key={cat.key}>
                <rect x={lx} y={ly - 8} width={12} height={12} fill={cat.color} rx={2} />
                <text x={lx + 16} y={ly + 2} fill="#9ca3af" fontSize="10">
                  {cat.label} ({cat.max}점 만점)
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─── Single Result Detail View ──────────────────────

function SingleResultView({ result }: { result: ScreenerResult }) {
  const v = VERDICT_STYLES[result.finalVerdict];
  const totalDisplay = getTotalDisplay(result);
  const trustSummary = getTrustSummary(result);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className={`rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 ${trustSummary.tone === 'high' ? 'bg-[#D4F94E]/10 text-[#D4F94E]' : 'bg-[#C45C3E]/10 text-[#FED7AA]'}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black">{trustSummary.title}</div>
            <div className="text-xs opacity-90">{trustSummary.description}</div>
          </div>
          {'fallbackMetrics' in trustSummary && trustSummary.fallbackMetrics ? (
            <div className="text-[11px] font-bold opacity-90">영향 지표: {trustSummary.fallbackMetrics.join(', ')}</div>
          ) : null}
        </div>
      </div>

      {/* Verdict Banner */}
      <div className={`${v.bg} ${v.text} rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-xl sm:text-3xl font-black text-[#D4F94E] drop-shadow-[2px_2px_0px_#1A1A1A]">
              {v.emoji} {result.ticker} — {v.label}
            </div>
            <div className="mt-1 text-sm opacity-80">{v.guide}</div>
            <div className="mt-2 text-sm sm:text-lg opacity-90">{result.actionGuide}</div>
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(result.ticker.replace('-', '.'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2962FF] text-white font-black text-xs rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-[6px_6px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] transition-all"
            >
              📈 트레이딩뷰 차트 보기 ↗
            </a>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl sm:text-5xl font-bold">
              {totalDisplay.normalizedScore}
              <span className="text-lg sm:text-2xl">/100</span>
            </div>
            <div className="text-xs sm:text-sm opacity-75 mt-1">원점수 {totalDisplay.rawScore}/{totalDisplay.rawMaxScore}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] p-4">
          <div className="text-xs text-gray-500 mb-1">차트 / 가치 / 심리 결론을 묶은 총점</div>
          <div className="text-2xl font-black text-[#D4F94E]">{totalDisplay.displayText}</div>
          <div className="text-xs text-gray-400 mt-1">비교용 표시는 100점 환산, 내부 계산은 원점수 체계 유지</div>
        </div>
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] p-4">
          <div className="text-xs text-gray-500 mb-1">핵심 판정</div>
          <div className="text-lg font-black text-white">{v.emoji} {v.label}</div>
          <div className="text-xs text-gray-400 mt-1">{v.guide}</div>
        </div>
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] p-4">
          <div className="text-xs text-gray-500 mb-1">액션 가이드</div>
          <div className="text-sm text-white leading-relaxed">{result.actionGuide}</div>
        </div>
      </div>

      {/* 점수 해석 가이드 */}
      <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 text-sm">
        <div className="text-xs text-gray-500 mb-2 font-medium">📖 점수 해석 가이드 (화면 표시는 100점 환산)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 bg-[#D4F94E]/20 text-[#D4F94E] rounded">🟢 76/100 이상: 강력 매수 신호</span>
          <span className="px-2 py-1 bg-[#A8C93E]/20 text-green-300 rounded">🟡 60~75/100: 매수 긍정적</span>
          <span className="px-2 py-1 bg-[#52525B]/30 text-gray-300 rounded">⚪ 40~59/100: 중립 (관망)</span>
          <span className="px-2 py-1 bg-[#C45C3E]/20 text-[#C45C3E] rounded">🟠 26~39/100: 매수 주의</span>
          <span className="px-2 py-1 bg-[#C45C3E]/20 text-[#C45C3E] rounded">🔴 25/100 이하: 과열 경고</span>
        </div>
      </div>

      {/* 3 Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6 text-center">
          <GaugeCircle score={result.chart.scores.total} max={25} label="📈 차트 분석 (기술적 추세)" normalizedLabel={result.scoreDisplay?.chart?.displayText} />
        </div>
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6 text-center">
          <GaugeCircle score={result.valuation.scores.total} max={20} label="💰 가치 평가 (적정가 분석)" normalizedLabel={result.scoreDisplay?.valuation?.displayText} />
        </div>
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6 text-center">
          <GaugeCircle score={result.sentiment.totalScore} max={25} label="🔄 시장 심리 (공포·탐욕 분석)" normalizedLabel={result.scoreDisplay?.sentiment?.displayText} />
        </div>
      </div>

      {/* Details - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Chart Detail */}
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6">
          <h3 className="text-lg font-bold mb-1">📈 차트 분석 상세</h3>
          <p className="text-xs text-gray-500 mb-4">주가 추세와 기술적 지표를 분석합니다. 각 항목 5점 만점.</p>
          <ScoreBar label="이동평균선 (추세 방향)" score={result.chart.scores.ma} max={5} color="bg-blue-500" />
          <ScoreBar label="이격도 (평균 대비 괴리)" score={result.chart.scores.deviation} max={5} color="bg-cyan-500" />
          <ScoreBar label="RSI (과매수·과매도)" score={result.chart.scores.rsi} max={5} color="bg-purple-500" />
          <ScoreBar label="차트 패턴 (W·M형)" score={result.chart.scores.pattern} max={5} color="bg-pink-500" />
          <ScoreBar
            label="시장 폭 (상승 종목 비율)"
            score={result.chart.scores.breadth || 0}
            max={5}
            color="bg-emerald-500"
          />
          <div className="mt-4 p-3 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] text-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">이동평균 상태</span>
              <span className="font-bold text-white">{result.chart.signals.maStatus}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">200일 평균 대비 이격도</span>
              <span className="font-bold text-white">{result.chart.signals.deviationPct}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">RSI 구간</span>
              <span className="font-bold text-white">{result.chart.signals.rsiLevel}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">차트 패턴</span>
              <span className="font-bold text-white">{result.chart.signals.pattern}</span>
            </div>
          </div>
        </div>

        {/* Valuation Detail */}
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6">
          <h3 className="text-lg font-bold mb-1">💰 가치 평가 상세</h3>
          <p className="text-xs text-gray-500 mb-4">현재 주가가 적정 수준인지 PER·PEG 기반으로 분석합니다. 각 항목 5점 만점.</p>
          <ScoreBar label="PER (주가수익비율 vs 시장)" score={result.valuation.scores.pe} max={5} color="bg-blue-500" />
          <ScoreBar label="적정주가 대비 현재가" score={result.valuation.scores.fairPrice} max={5} color="bg-green-500" />
          <ScoreBar label="PEG (성장성 대비 가격)" score={result.valuation.scores.peg} max={5} color="bg-purple-500" />
          <ScoreBar label="시장 전체 PER 수준" score={result.valuation.scores.marketPe} max={5} color="bg-cyan-500" />
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between p-2.5 bg-[#2A2A2A] rounded">
              <span className="text-gray-400">추정 적정주가 범위</span>
              <span className="font-bold text-[#D4F94E]">
                ${result.valuation.fairPriceRange?.low || result.valuation.fairPrice} ~ $
                {result.valuation.fairPriceRange?.high || result.valuation.fairPrice}
              </span>
            </div>
            <div className="flex justify-between p-2.5 bg-[#2A2A2A] rounded">
              <span className="text-gray-400">현재가 / 적정가</span>
              <span className="font-bold text-white">
                ${result.valuation.currentPrice?.toLocaleString()} / ${result.valuation.fairPriceRange?.mid || result.valuation.fairPrice}
              </span>
            </div>
            <div className="flex justify-between p-2.5 bg-[#2A2A2A] rounded">
              <span className="text-gray-400">상승여력 (적정가 대비)</span>
              <span
                className={`font-bold ${
                  result.valuation.upsideDownside > 0 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'
                }`}
              >
                {result.valuation.upsideDownside > 0 ? '+' : ''}
                {result.valuation.upsideDownside}%
              </span>
            </div>
            <div className="flex justify-between p-2.5 bg-[#2A2A2A] rounded">
              <span className="text-gray-400">PEG (1 미만=저평가)</span>
              <span className="font-bold text-white">{result.valuation.peg}</span>
            </div>
            <div className="p-2.5 bg-[#2A2A2A]/50 rounded text-xs text-gray-500">
              💡 적정주가는 과거 실적·PER·시장 평균을 기반으로 산출된 추정치이며, 실제 미래 가격을 보장하지 않습니다.
            </div>
          </div>
        </div>

        {/* Sentiment Detail */}
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6">
          <h3 className="text-lg font-bold mb-1">🔄 시장 심리 분석 상세</h3>
          <p className="text-xs text-gray-500 mb-4">시장 공포·탐욕 수준을 분석합니다. 점수가 높을수록 시장이 공포 구간(= 매수 기회)입니다.</p>
          {(() => {
            const partialFailure = getPartialFailureSummary(result.dataSources);
            if (!partialFailure) return null;
            return (
              <div className="mb-4 border-2 border-[#C45C3E] bg-[#C45C3E]/10 rounded-none p-3">
                <div className="text-sm font-bold text-[#FED7AA]">⚠️ 일부 심리 지표가 추정치입니다</div>
                <div className="text-xs text-gray-300 mt-1">{partialFailure.message}</div>
              </div>
            );
          })()}
          <ScoreBar
            label="VIX 공포지수 (높으면 공포)"
            score={result.sentiment.vix.score}
            max={5}
            color="bg-red-500"
            source={result.dataSources?.vix}
          />
          <ScoreBar
            label="풋/콜 비율 (높으면 비관)"
            score={result.sentiment.putCallRatio.score}
            max={5}
            color="bg-orange-500"
            source={result.dataSources?.putCallRatio}
          />
          <ScoreBar
            label="개인투자자 심리 (AAII)"
            score={result.sentiment.aaii.score}
            max={5}
            color="bg-yellow-500"
            source={result.dataSources?.aaii}
          />
          <ScoreBar
            label="신용잔고 (높으면 과열)"
            score={result.sentiment.marginDebt.score}
            max={5}
            color="bg-amber-500"
            source={result.dataSources?.marginDebt}
          />
          <ScoreBar
            label="하이일드 스프레드 (위험 선호도)"
            score={result.sentiment.hySpread.score}
            max={5}
            color="bg-rose-500"
            source={result.dataSources?.hySpread}
          />
          <div className="mt-4 p-3 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] text-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">VIX 지수</span>
              <span className="font-bold text-white">{result.sentiment.vix.current} <span className="text-gray-500 text-xs font-normal">(20 이하=안정, 30 이상=공포)</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">풋/콜 비율</span>
              <span className="font-bold text-white">{result.sentiment.putCallRatio.current} <span className="text-gray-500 text-xs font-normal">(1 이상=비관적)</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">개인투자자 심리차</span>
              <span className="font-bold text-white">{result.sentiment.aaii.spread.toFixed(1)} <span className="text-gray-500 text-xs font-normal">(음수=비관 우세)</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Dividend Card */}
      {result.dividend && (
        <div className="bg-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] p-4 sm:p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center flex-wrap gap-2">
            💎 배당 분석
            {result.dividend.status === 'king' && (
              <span className="text-[#D4F94E] text-base" title="50년 이상 연속 배당 증액">👑 배당 왕족주 (50년+)</span>
            )}
            {result.dividend.status === 'aristocrat' && (
              <span className="text-[#D4F94E] text-base" title="25년 이상 연속 배당 증액">🏅 배당 귀족주 (25년+)</span>
            )}
            {result.dividend.status === 'achiever' && (
              <span className="text-purple-400 text-base" title="10년 이상 연속 배당 증액">⭐ 배당 성취주 (10년+)</span>
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <ScoreBar
                label="배당수익률 (시장 평균 대비)"
                score={result.dividend.scores.yield}
                max={5}
                color="bg-green-500"
              />
              <ScoreBar
                label="배당 안전성 (배당성향 기준)"
                score={result.dividend.scores.safety}
                max={5}
                color="bg-blue-500"
              />
            </div>
            <div>
              <ScoreBar
                label="배당 성장률 (연평균)"
                score={result.dividend.scores.growth}
                max={5}
                color="bg-purple-500"
              />
              <ScoreBar
                label="연속 증액 (매년 배당 인상)"
                score={result.dividend.scores.streak}
                max={5}
                color="bg-yellow-500"
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] text-sm text-center">
              <div className="text-gray-400 mb-1">배당수익률</div>
              <div className="font-bold text-[#D4F94E] text-lg">
                {result.dividend.data.dividendYield.toFixed(2)}%
              </div>
            </div>
            <div className="p-3 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] text-sm text-center">
              <div className="text-gray-400 mb-1">배당성향 (이익 중 배당 비율)</div>
              <div className="font-bold text-white text-lg">
                {result.dividend.data.payoutRatio.toFixed(1)}%
              </div>
            </div>
            <div className="p-3 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] text-sm text-center">
              <div className="text-gray-400 mb-1">연속 증액</div>
              <div className="font-bold text-[#D4F94E] text-lg">
                {result.dividend.data.consecutiveYears > 0
                  ? `${result.dividend.data.consecutiveYears}년`
                  : '-'}
              </div>
            </div>
            <div className="p-3 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] text-sm text-center">
              <div className="text-gray-400 mb-1">배당 성장률</div>
              <div className="font-bold text-purple-400 text-lg">
                {result.dividend.data.growthRate > 0
                  ? `${result.dividend.data.growthRate.toFixed(1)}%`
                  : '-'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('compare');

  // 히스토리 로드 (localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('analysis-history');
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      // localStorage 접근 불가 시 무시
    }

    // URL query param에서 ticker 자동 분석 (?ticker=AAPL)
    const params = new URLSearchParams(window.location.search);
    const urlTicker = params.get('ticker');
    if (urlTicker) {
      const t = urlTicker.toUpperCase();
      setTicker(t);
      // 약간의 딜레이 후 분석 시작 (state 세팅 후)
      setTimeout(() => analyze(t), 100);
      // URL에서 query param 제거 (깔끔한 URL 유지)
      window.history.replaceState({}, '', '/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 시장 데이터 로드 (5분마다 갱신)
  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/market');
      if (res.ok) {
        const data = await res.json();
        setMarketData(data);
      }
    } catch {
      // 실패 시 무시
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarket();
    const interval = setInterval(fetchMarket, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarket]);

  // 분석 실행
  async function analyze(inputTickers?: string) {
    const raw = inputTickers || ticker;
    const tickers = raw
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 5);

    if (tickers.length === 0) return;

    setLoading(true);
    setError('');
    setResults([]);
    setActiveTab(tickers.length > 1 ? 'compare' : tickers[0]);

    try {
      const promises = tickers.map((t) =>
        fetch(`/api/screener/combined/${t}`).then((r) => {
          if (!r.ok) throw new Error(`${t} 분석 실패`);
          return r.json();
        })
      );
      const data: ScreenerResult[] = await Promise.all(promises);
      setResults(data);

      // 히스토리 업데이트
      const newHistory = [...new Set([...tickers, ...history])].slice(0, 10);
      setHistory(newHistory);
      try {
        localStorage.setItem('analysis-history', JSON.stringify(newHistory));
      } catch {
        // localStorage 접근 불가 시 무시
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '오류가 발생했습니다';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // 히스토리에서 종목 제거
  function removeFromHistory(t: string) {
    const newHistory = history.filter((h) => h !== t);
    setHistory(newHistory);
    try {
      localStorage.setItem('analysis-history', JSON.stringify(newHistory));
    } catch {
      // ignore
    }
  }

  const isMulti = results.length > 1;
  const activeResult = results.find((r) => r.ticker === activeTab);
  const focusResult = activeResult ?? results[0] ?? null;

  return (
    <main className="min-h-screen bg-[#2A2A2A] text-white">
      {/* Header */}
      <header className="border-b-2 border-[#1A1A1A] px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">📊 디킴의 투자분석 판독기</h1>
            <p className="text-xs sm:text-sm text-gray-400">차트·가치·심리 3종 분석 기반 미국주식 매수 타이밍 도구</p>
          </div>
          {marketData && (
            <div className="hidden lg:flex items-center gap-1 text-xs text-gray-500">
              <span>마지막 업데이트:</span>
              <span>{new Date(marketData.timestamp).toLocaleTimeString('ko-KR')}</span>
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b-2 border-[#1A1A1A] px-4 sm:px-6 py-2 bg-[#3A3A3A]/50">
        <div className="max-w-6xl mx-auto flex gap-4 text-sm">
          <span className="text-[#D4F94E] font-medium border-b-2 border-blue-400 py-1">
            📊 종목 분석
          </span>
          <Link href="/discover" className="text-gray-400 hover:text-white transition-colors py-1">
            🔍 추천 종목
          </Link>
          <Link href="/legends" className="text-gray-400 hover:text-white transition-colors py-1">
            🏆 레전드 전략
          </Link>
          <Link href="/etf" className="text-gray-400 hover:text-white transition-colors py-1">
            📦 ETF 추천
          </Link>
          <Link href="/bitgak" className="text-gray-400 hover:text-white transition-colors py-1">
            📐 빗각
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Market Header */}
        <MarketHeader data={marketData} loading={marketLoading} />

        <MarketSentimentDashboard
          marketData={marketData}
          sentiment={focusResult?.sentiment ?? null}
          marketLoading={marketLoading}
        />

        {/* Search */}
        <div className="flex gap-2 sm:gap-3 mb-3">
          <input
            type="text"
            placeholder="티커 입력 (예: AAPL 또는 AAPL, MSFT, NVDA)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && analyze()}
            className="flex-1 px-3 sm:px-4 py-3 bg-[#2A2A2A] border border-[#3A3A3A] rounded-none border-2 border-[#1A1A1A] text-white placeholder-gray-500 focus:outline-none focus:border-[#D4F94E] text-base sm:text-lg border-2 border-[#3A3A3A] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3)]"
          />
          <button
            onClick={() => analyze()}
            disabled={loading}
            className="px-5 sm:px-8 py-3 bg-[#D4F94E] hover:bg-[#A8C93E] disabled:bg-gray-600 disabled:cursor-not-allowed rounded-none border-2 border-[#1A1A1A] font-bold text-base sm:text-lg transition-colors shrink-0 text-[#1A1A1A] font-black border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-[6px_6px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_#1A1A1A] transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="hidden sm:inline">분석중</span>
              </span>
            ) : (
              '분석'
            )}
          </button>
        </div>

        {/* Multi-ticker hint */}
        <p className="text-xs text-gray-500 mb-4">
          💡 쉼표(,)로 구분하면 최대 5개 종목을 동시 비교할 수 있습니다
        </p>

        {/* History */}
        {history.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-xs text-gray-500 self-center mr-1">최근:</span>
            {history.map((t) => (
              <div key={t} className="group flex items-center">
                <button
                  onClick={() => {
                    setTicker(t);
                    analyze(t);
                  }}
                  className="px-3 py-1.5 bg-[#2A2A2A] rounded-l-lg hover:bg-[#3A3A3A] text-gray-300 text-sm transition-colors"
                >
                  {t}
                </button>
                <button
                  onClick={() => removeFromHistory(t)}
                  className="px-1.5 py-1.5 bg-[#2A2A2A] rounded-r-lg hover:bg-red-900/50 text-gray-500 hover:text-[#C45C3E] text-xs transition-colors border-l border-[#3A3A3A]"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quick Tickers (empty state only) */}
        {results.length === 0 && !loading && !error && history.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-xs text-gray-500 self-center mr-1">추천:</span>
            {QUICK_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTicker(t);
                  analyze(t);
                }}
                className="px-3 py-1.5 bg-[#2A2A2A] rounded-none border-2 border-[#1A1A1A] hover:bg-[#3A3A3A] text-gray-300 text-sm transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-none border-2 border-[#1A1A1A] mb-6 text-red-300">
            ❌ {error}
          </div>
        )}

        {/* Skeleton Loading */}
        {loading && <AnalysisSkeleton />}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Multi-ticker tabs */}
            {isMulti && (
              <>
                {/* Tab bar */}
                <div className="flex gap-1 overflow-x-auto border-b-2 border-[#1A1A1A] pb-0">
                  <button
                    onClick={() => setActiveTab('compare')}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors shrink-0 ${
                      activeTab === 'compare'
                        ? 'bg-[#2A2A2A] text-white border-b-2 border-[#D4F94E]'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-[#2A2A2A]/50'
                    }`}
                  >
                    📊 비교
                  </button>
                  {results.map((r) => {
                    const v = VERDICT_STYLES[r.finalVerdict];
                    return (
                      <button
                        key={r.ticker}
                        onClick={() => setActiveTab(r.ticker)}
                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors shrink-0 ${
                          activeTab === r.ticker
                            ? 'bg-[#2A2A2A] text-white border-b-2 border-[#D4F94E]'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-[#2A2A2A]/50'
                        }`}
                      >
                        {v.emoji} {r.ticker}
                        <span className="ml-1.5 text-xs opacity-70">{r.totalScore}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Compare tab */}
                {activeTab === 'compare' && (
                  <div className="space-y-6">
                    <ComparisonTable results={results} />
                    <ComparisonChart results={results} />
                  </div>
                )}

                {/* Individual tab */}
                {activeResult && <SingleResultView result={activeResult} />}
              </>
            )}

            {/* Single result */}
            {!isMulti && results[0] && <SingleResultView result={results[0]} />}
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && !error && (
          <div className="text-center py-16 sm:py-20 text-gray-500">
            <div className="text-5xl sm:text-6xl mb-4">📊</div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2">종목을 검색해 보세요</h2>
            <p className="text-sm sm:text-base">미국 주식 티커를 입력하면 차트·가치·심리 3가지 관점에서 자동 분석합니다</p>
            <p className="text-xs text-gray-600 mt-2">
              여러 종목을 쉼표로 구분하면 비교 분석도 가능합니다
            </p>
          </div>
        )}
      </div>

      {/* Disclaimer Footer */}
      <footer className="mt-12 border-t border-[#1A1A1A] pt-6 pb-8 text-center text-xs text-gray-500 px-4">
        <p className="mb-2">
          ⚠️ 본 서비스는 투자 자문이 아닌 정보 제공 목적의 분석 도구입니다.
        </p>
        <p className="mb-2">
          투자 판단의 모든 책임은 투자자 본인에게 있으며, 본 서비스의 분석 결과를 투자 권유로
          해석해서는 안 됩니다.
        </p>
        <p>미국주식 투자 방법론을 기반으로 한 교육/학습 목적의 도구입니다.</p>
      </footer>
    </main>
  );
}
