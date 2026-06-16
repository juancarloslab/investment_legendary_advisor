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
  };
  currentGapPct: number;
  currentStatus: '터치임박' | '접근중' | '관망' | '이탈';
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

interface BitgakPooledStats {
  totalPatterns: number;
  breakouts: number;
  rejections: number;
  noTouch: number;
  pending: number;
  breakoutRate: number | null;
  syntheticNullRate: number;
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
  };
  totalAnalyzed: number;
  successCount: number;
  failedCount: number;
  failedTickers: string[];
  results: BitgakScreenResult[];
  pooledStats: BitgakPooledStats;
  disclaimer: string;
}

// ─── 표시 헬퍼 ───────────────────────────────────────

type StatusFilter = '전체' | '터치임박' | '접근중' | '이탈' | '관망';
const STATUS_FILTERS: StatusFilter[] = ['전체', '터치임박', '접근중', '이탈', '관망'];

const STATUS_STYLE: Record<string, string> = {
  터치임박: 'bg-[#D4F94E] text-[#1A1A1A]',
  접근중: 'bg-amber-500/80 text-[#1A1A1A]',
  이탈: 'bg-[#C45C3E] text-white',
  관망: 'bg-[#3A3A3A] text-gray-300',
};

const OUTCOME_STYLE: Record<string, string> = {
  돌파: 'text-[#D4F94E]',
  거부: 'text-[#C45C3E]',
  미도달: 'text-gray-500',
  판정중: 'text-amber-400',
};

function tvLink(ticker: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker.replace('-', '.'))}`;
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
  const [expanded, setExpanded] = useState<string | null>(null);

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
        (r) => statusFilter === '전체' || r.active?.currentStatus === statusFilter,
      )
    : [];

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

            {/* 파라미터 */}
            <div className="text-xs text-gray-500 mb-4">
              파라미터(weekly canonical): 피벗확정 ±{report.params.pivotOrder}주 · 터치 ±
              {(report.params.tol * 100).toFixed(1)}% · 앵커간격 ≥{report.params.minGap}주 · 스팬 ≤
              {report.params.maxSpan}주 · 돌파 종가 {(report.params.breakTol * 100).toFixed(0)}% 초과 · 판정{' '}
              {report.params.confirm}주 — 파라미터를 바꾸면 널 베이스라인도 다시 계산해야 합니다
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
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">현재가</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">현재선값</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">이격</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden lg:table-cell">앵커1</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden lg:table-cell">앵커2</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">완성</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">다음터치</th>
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
                              <td colSpan={11} className="py-3 px-3">
                                <div className="text-xs text-gray-400 mb-2">
                                  📏 로그 스케일 차트에서 앵커1({a.anchor1.date}, ${fmt(a.anchor1.price)})과
                                  앵커2({a.anchor2.date}, ${fmt(a.anchor2.price)})의 꼬리를 직선으로 이으면 이
                                  빗각선을 재현할 수 있습니다. 전체 패턴 {r.patternCount}건 / 주봉 {r.bars}개 분석.
                                </div>
                                {/* 전체 패턴 */}
                                <table className="w-full text-xs mb-3">
                                  <thead>
                                    <tr className="text-gray-600">
                                      <th className="text-left py-1 px-2 font-medium">유형</th>
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
