'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SnapshotStatusBanner from '@/components/SnapshotStatusBanner';
import type { ReliabilitySummary } from '@/lib/reliability';
import type { SnapshotMeta } from '@/lib/snapshots';

// ─── 타입 정의 ───────────────────────────────────────

interface ETFReturns {
  month1: number | null;
  month3: number | null;
  month6: number | null;
  year1: number | null;
  ytd: number | null;
}

interface ETFProfile {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  expenseRatio: number | null;
  aum: number | null;
  avgVolume: number;
  returns: ETFReturns;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekRange: number;
}

interface ETFResult {
  ticker: string;
  name: string;
  category: string;
  price: number;
  changePercent: number;
  chartScore: number;
  efficiencyScore: number;
  momentumScore: number;
  totalScore: number;
  verdict: string;
  verdictLabel: string;
  profile: ETFProfile;
  efficiency: {
    expenseRatio: number;
    aum: number;
    volume: number;
    range52w: number;
    total: number;
  };
  momentum: {
    month1: number;
    month3: number;
    month6: number;
    year1: number;
    total: number;
  };
}

interface ETFReport {
  timestamp: string;
  totalAnalyzed: number;
  topPicks: ETFResult[];
  momentumLeaders: ETFResult[];
  valueOpportunity: ETFResult[];
  sectorBest: Record<string, ETFResult>;
  dividendETFs: ETFResult[];
  allResults: ETFResult[];
  snapshotMeta?: SnapshotMeta;
  reliability?: ReliabilitySummary;
}

// ─── 상수 ────────────────────────────────────────────

const TABS = [
  { key: 'topPicks', label: '🏆 TOP 추천', desc: '차트·효율·모멘텀 종합 점수 상위 ETF' },
  { key: 'momentum', label: '🚀 모멘텀', desc: '최근 수익률이 가장 높은 상승세 ETF' },
  { key: 'value', label: '💎 저점 기회', desc: '52주 최저가 근처이면서 효율성이 우수한 ETF' },
  { key: 'dividend', label: '💰 배당', desc: '배당수익률 기준 매력적인 ETF' },
  { key: 'sector', label: '📊 카테고리별', desc: '각 카테고리에서 종합 1위 ETF' },
  { key: 'all', label: '📋 전체', desc: '분석된 전체 ETF 종합 랭킹' },
] as const;

type TabKey = typeof TABS[number]['key'];

const CATEGORY_LABELS: Record<string, string> = {
  market: '시장 전체',
  sector: '섹터 SPDR',
  thematic: '테마/성장',
  dividend: '배당',
  bond: '채권',
  commodity: '원자재',
  international: '국제',
};

// ─── 유틸 ────────────────────────────────────────────

function formatNum(n: number | null, decimals = 1): string {
  if (n == null) return '-';
  return n.toFixed(decimals);
}

function formatAUM(aum: number | null): string {
  if (aum == null) return '-';
  if (aum >= 1e12) return `$${(aum / 1e12).toFixed(1)}T`;
  if (aum >= 1e9) return `$${(aum / 1e9).toFixed(1)}B`;
  if (aum >= 1e6) return `$${(aum / 1e6).toFixed(0)}M`;
  return `$${aum.toFixed(0)}`;
}

function returnColor(val: number | null): string {
  if (val == null) return 'text-gray-500';
  if (val >= 5) return 'text-[#D4F94E]';
  if (val > 0) return 'text-green-300';
  if (val > -5) return 'text-red-300';
  return 'text-[#C45C3E]';
}

function verdictBg(verdict: string): string {
  switch (verdict) {
    case 'strong_opportunity': return 'bg-[#A8C93E]/20 border-green-500/40';
    case 'opportunity': return 'bg-[#A8C93E]/20 border-[#D4F94E]/40';
    case 'neutral': return 'bg-gray-500/20 border-gray-500/40';
    case 'caution': return 'bg-[#F5F5F5]/20 border-yellow-500/40';
    case 'avoid': return 'bg-[#A0452A]/20 border-red-500/40';
    default: return 'bg-gray-500/20 border-gray-500/40';
  }
}

function scoreBar(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 70) return 'bg-[#A8C93E]';
  if (pct >= 50) return 'bg-[#A8C93E]';
  if (pct >= 30) return 'bg-[#F5F5F5]';
  return 'bg-[#A0452A]';
}

// ─── 메인 컴포넌트 ──────────────────────────────────

export default function ETFPage() {
  const [report, setReport] = useState<ETFReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('topPicks');
  const [expandedETF, setExpandedETF] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/screening/etf');
      if (!res.ok) throw new Error('ETF 스크리닝 실패');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 에러');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const getTabData = (): ETFResult[] => {
    if (!report) return [];
    switch (activeTab) {
      case 'topPicks': return report.topPicks;
      case 'momentum': return report.momentumLeaders;
      case 'value': return report.valueOpportunity;
      case 'dividend': return report.dividendETFs;
      case 'sector': return Object.values(report.sectorBest);
      case 'all': return report.allResults;
    }
  };

  return (
    <div className="min-h-screen bg-[#2A2A2A] text-white">
      {/* 헤더 */}
      <header className="border-b border-[#1A1A1A] bg-[#3A3A3A]/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">← 종목분석</Link>
            <h1 className="text-lg font-bold">📊 ETF 추천</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/discover" className="text-sm text-gray-400 hover:text-white">종목발굴</Link>
            <Link href="/legends" className="text-sm text-gray-400 hover:text-white">레전드전략</Link>
            <Link href="/bitgak" className="text-sm text-gray-400 hover:text-white">빗각</Link>
            <Link href="/signals" className="text-sm text-gray-400 hover:text-white">신호</Link>
            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-3 py-1.5 bg-[#D4F94E] text-[#1A1A1A] font-black hover:bg-[#A8C93E] disabled:bg-[#3A3A3A] disabled:text-gray-400 rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-[6px_6px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] text-sm transition-all"
            >
              {loading ? '분석 중...' : '🔄 새로고침'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 로딩 */}
        {loading && !report && (
          <div className="text-center py-20">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-400">~50개 ETF 분석 중... (1-2분 소요)</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-[#A0452A]/10 border border-red-500/30 rounded-none border-2 border-[#1A1A1A] p-4 mb-6">
            <p className="text-[#C45C3E]">{error}</p>
            <button onClick={fetchReport} className="mt-2 text-sm text-[#D4F94E] hover:text-blue-300">
              다시 시도
            </button>
          </div>
        )}

        {report && (
          <>
            <SnapshotStatusBanner
              snapshotMeta={report.snapshotMeta}
              reliability={report.reliability}
            />

            {/* 요약 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3 text-center">
                <div className="text-2xl font-bold text-[#D4F94E]">{report.totalAnalyzed}</div>
                <div className="text-xs text-gray-500">분석 ETF</div>
              </div>
              <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3 text-center">
                <div className="text-2xl font-bold text-[#D4F94E]">
                  {report.allResults.filter(r => r.verdict === 'strong_opportunity' || r.verdict === 'opportunity').length}
                </div>
                <div className="text-xs text-gray-500">기회 ETF</div>
              </div>
              <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3 text-center">
                <div className="text-2xl font-bold text-[#D4F94E]">{report.topPicks[0]?.ticker || '-'}</div>
                <div className="text-xs text-gray-500">1위 ETF</div>
              </div>
              <div className="bg-[#3A3A3A] border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">{report.topPicks[0] ? `${Math.round((report.topPicks[0].totalScore / 70) * 100)}/100` : '-'}</div>
                <div className="text-xs text-gray-500">최고 점수 (원점수 {report.topPicks[0]?.totalScore ?? 0}/70)</div>
              </div>
            </div>

            {/* 탭 */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 rounded-none border-2 border-[#1A1A1A] text-sm font-black whitespace-nowrap transition-all shadow-[4px_4px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1A1A1A] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] ${
                    activeTab === tab.key
                      ? 'bg-[#D4F94E] text-[#1A1A1A] shadow-[4px_4px_0px_0px_#A8C93E]'
                      : 'bg-[#2A2A2A] text-white hover:bg-[#3A3A3A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 탭 설명 */}
            <p className="text-sm text-gray-500 mb-4">
              {TABS.find(t => t.key === activeTab)?.desc}
            </p>

            {/* ETF 리스트 */}
            <div className="space-y-3">
              {getTabData().map((etf, idx) => (
                <div
                  key={etf.ticker}
                  className={`border rounded-none border-2 border-[#1A1A1A] overflow-hidden transition-colors ${verdictBg(etf.verdict)}`}
                >
                  {/* 메인 행 */}
                  <button
                    onClick={() => setExpandedETF(expandedETF === etf.ticker ? null : etf.ticker)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 text-sm w-6">#{idx + 1}</span>
                        <div>
                          <div className="font-bold">{etf.ticker}</div>
                          <div className="text-xs text-gray-400">{etf.name}</div>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-[#3A3A3A]/50 rounded">
                          {CATEGORY_LABELS[etf.category] || etf.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="font-mono">${etf.price.toFixed(2)}</div>
                          <div className={`text-xs ${etf.changePercent >= 0 ? 'text-[#D4F94E]' : 'text-[#C45C3E]'}`}>
                            {etf.changePercent >= 0 ? '+' : ''}{etf.changePercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{Math.round((etf.totalScore / 70) * 100)}/100</div>
                          <div className="text-xs text-gray-400">원점수 {etf.totalScore}/70 · {etf.verdictLabel}</div>
                        </div>
                      </div>
                    </div>

                    {/* 점수 바 */}
                    <div className="mt-3 flex gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>차트 분석</span><span>{etf.chartScore}/25점</span>
                        </div>
                        <div className="h-1.5 bg-[#3A3A3A] rounded-none overflow-hidden">
                          <div className={`h-full rounded-none ${scoreBar(etf.chartScore, 25)}`} style={{ width: `${(etf.chartScore / 25) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>효율성</span><span>{etf.efficiencyScore}/20점</span>
                        </div>
                        <div className="h-1.5 bg-[#3A3A3A] rounded-none overflow-hidden">
                          <div className={`h-full rounded-none ${scoreBar(etf.efficiencyScore, 20)}`} style={{ width: `${(etf.efficiencyScore / 20) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>수익 모멘텀</span><span>{etf.momentumScore}/25점</span>
                        </div>
                        <div className="h-1.5 bg-[#3A3A3A] rounded-none overflow-hidden">
                          <div className={`h-full rounded-none ${scoreBar(etf.momentumScore, 25)}`} style={{ width: `${(etf.momentumScore / 25) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* 펼침 상세 */}
                  {expandedETF === etf.ticker && (
                    <div className="border-t border-[#3A3A3A]/50 p-4 bg-[#3A3A3A]/50">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        {/* 수익률 */}
                        <div>
                          <h4 className="text-xs text-gray-500 mb-2 font-semibold">📈 과거 수익률 (실제 기간별 등락)</h4>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-400">최근 1개월</span>
                              <span className={returnColor(etf.profile.returns.month1)}>
                                {etf.profile.returns.month1 != null ? (etf.profile.returns.month1 >= 0 ? '+' : '') : ''}{formatNum(etf.profile.returns.month1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">최근 3개월</span>
                              <span className={returnColor(etf.profile.returns.month3)}>
                                {etf.profile.returns.month3 != null ? (etf.profile.returns.month3 >= 0 ? '+' : '') : ''}{formatNum(etf.profile.returns.month3)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">최근 6개월</span>
                              <span className={returnColor(etf.profile.returns.month6)}>
                                {etf.profile.returns.month6 != null ? (etf.profile.returns.month6 >= 0 ? '+' : '') : ''}{formatNum(etf.profile.returns.month6)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">최근 1년</span>
                              <span className={returnColor(etf.profile.returns.year1)}>
                                {etf.profile.returns.year1 != null ? (etf.profile.returns.year1 >= 0 ? '+' : '') : ''}{formatNum(etf.profile.returns.year1)}%
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-[#3A3A3A] pt-1">
                              <span className="text-gray-400">올해 연초 이후</span>
                              <span className={returnColor(etf.profile.returns.ytd)}>
                                {etf.profile.returns.ytd != null ? (etf.profile.returns.ytd >= 0 ? '+' : '') : ''}{formatNum(etf.profile.returns.ytd)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 효율성 */}
                        <div>
                          <h4 className="text-xs text-gray-500 mb-2 font-semibold">⚡ ETF 효율성 (낮은 비용 = 좋음)</h4>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-400">연간 운용비용</span>
                              <span>{etf.profile.expenseRatio != null ? `${etf.profile.expenseRatio.toFixed(2)}%` : '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">운용규모(AUM)</span>
                              <span>{formatAUM(etf.profile.aum)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">배당수익률</span>
                              <span className="text-[#D4F94E]">
                                {etf.profile.dividendYield != null ? `${etf.profile.dividendYield.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 52주 범위 */}
                        <div>
                          <h4 className="text-xs text-gray-500 mb-2 font-semibold">📊 52주 가격 범위 (1년간 최저~최고)</h4>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-400">52주 최저가</span>
                              <span>${etf.profile.fiftyTwoWeekLow.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">52주 최고가</span>
                              <span>${etf.profile.fiftyTwoWeekHigh.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">현재 위치</span>
                              <span>{etf.profile.fiftyTwoWeekRange.toFixed(0)}% <span className="text-gray-600">(0%=최저, 100%=최고)</span></span>
                            </div>
                            {/* 범위 바 */}
                            <div className="h-2 bg-[#3A3A3A] rounded-none overflow-hidden mt-1 relative">
                              <div
                                className="absolute h-full bg-[#A8C93E] rounded-none"
                                style={{ width: `${etf.profile.fiftyTwoWeekRange}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 점수 상세 */}
                        <div>
                          <h4 className="text-xs text-gray-500 mb-2 font-semibold">🎯 점수 상세 (점수 높을수록 좋음)</h4>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-400">차트 분석</span>
                              <span>{etf.chartScore}/25점</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">효율성</span>
                              <span>{etf.efficiencyScore}/20점</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">수익 모멘텀</span>
                              <span>{etf.momentumScore}/25점</span>
                            </div>
                            <div className="flex justify-between border-t border-[#3A3A3A] pt-1 font-bold">
                              <span>종합 점수</span>
                              <span>{Math.round((etf.totalScore / 70) * 100)}/100 <span className="text-gray-500">({etf.totalScore}/70)</span></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {getTabData().length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  해당 카테고리에 데이터가 없습니다
                </div>
              )}
            </div>

            {/* 면책 */}
            <div className="mt-8 p-4 bg-[#3A3A3A]/50 border border-[#1A1A1A] rounded-none border-2 border-[#1A1A1A] text-xs text-gray-500">
              <p>⚠️ 본 ETF 분석은 교육/학습 목적의 도구이며, 투자 자문이 아닙니다. 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.</p>
              <p className="mt-1">분석 시각: {new Date(report.timestamp).toLocaleString('ko-KR')}</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
