'use client';

/**
 * 매매신호 수신 피드 (TradingView 웹훅)
 *
 * ⚠️ 연구·모니터링용. 매매 신호가 아닙니다. 지연 데이터 + 바마감(Once Per Bar Close)
 *    신호를 전제로 하며 스캘핑 진입용이 아닙니다. 검증(랜덤 대비 우위) 전엔 신뢰 금지.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface SignalRecord {
  id: string;
  receivedAt: string;
  source: 'tradingview' | 'unknown';
  ticker?: string;
  tf?: string;
  signal?: string;
  price?: string;
  time?: string;
  note?: string;
}

interface SignalsResponse {
  signals: SignalRecord[];
  count: number;
  storage: 'upstash' | 'memory';
}

function timeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function SignalsPage() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/signals', { cache: 'no-store' });
      if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '신호를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const t = setInterval(fetchSignals, 30000); // 30초 폴링
    return () => clearInterval(t);
  }, [fetchSignals]);

  const clearFeed = async () => {
    const token = window.prompt('관리자 토큰(SIGNALS_WEBHOOK_SECRET). 미설정이면 비워두고 확인:') ?? '';
    if (!window.confirm('수신된 신호를 전부 삭제할까요?')) return;
    await fetch(`/api/signals${token ? `?token=${encodeURIComponent(token)}` : ''}`, { method: 'DELETE' });
    fetchSignals();
  };

  const webhookUrl = origin ? `${origin}/api/signals/webhook?token=YOUR_SECRET` : '/api/signals/webhook?token=YOUR_SECRET';
  const signals = data?.signals ?? [];

  return (
    <main className="min-h-screen bg-[#2A2A2A] text-white">
      {/* Header */}
      <header className="border-b border-[#1A1A1A] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">🔔 매매신호 수신</h1>
            <p className="text-xs sm:text-sm text-gray-400">
              TradingView 웹훅 신호 모니터링 — 연구·확인용 (매매 신호 아님)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="text-right text-xs text-gray-500 hidden sm:block">
                <div>수신 {data.count}건</div>
                <div>
                  저장:{' '}
                  <span className={data.storage === 'upstash' ? 'text-[#D4F94E]' : 'text-amber-400'}>
                    {data.storage === 'upstash' ? 'Upstash(영속)' : '인메모리(임시)'}
                  </span>
                </div>
              </div>
            )}
            <button
              onClick={fetchSignals}
              className="px-3 py-1.5 bg-[#D4F94E] text-[#1A1A1A] font-black hover:bg-[#A8C93E] rounded-none border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-[6px_6px_0px_0px_#1A1A1A] hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_0px_#1A1A1A] text-sm transition-all"
            >
              🔄 <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-[#1A1A1A] px-4 sm:px-6 py-2 bg-[#3A3A3A]/50">
        <div className="max-w-7xl mx-auto flex gap-4 text-sm overflow-x-auto">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">📊 종목 분석</Link>
          <Link href="/discover" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">🔍 추천 종목</Link>
          <Link href="/legends" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">🏆 레전드 전략</Link>
          <Link href="/etf" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">📦 ETF 추천</Link>
          <Link href="/bitgak" className="text-gray-400 hover:text-white transition-colors py-1 whitespace-nowrap">📐 빗각</Link>
          <span className="text-[#D4F94E] font-black border-b-2 border-[#D4F94E] py-1 whitespace-nowrap">🔔 신호</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Disclaimer */}
        <div className="p-3 mb-6 bg-amber-900/20 border-2 border-[#1A1A1A] text-xs sm:text-sm text-amber-300 leading-relaxed">
          ⚠️ 이 피드는 TradingView가 보낸 알림을 받아 <b>확인·모니터링</b>하는 도구입니다. 매매 신호가 아니며,
          지연 데이터 + 바마감(Once Per Bar Close) 신호를 전제로 합니다(스캘핑 진입용 아님). 어떤 신호도
          랜덤 대비 우위가 검증되기 전까지는 신뢰하지 마세요.
        </div>

        {/* Setup guide */}
        <div className="mb-6">
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="text-sm text-gray-300 hover:text-white underline underline-offset-2"
          >
            {showGuide ? '▾' : '▸'} ⚙️ TradingView 연결 방법
          </button>
          {showGuide && (
            <div className="mt-2 p-3 bg-[#1A1A1A]/40 border-2 border-[#1A1A1A] text-xs text-gray-300 leading-relaxed space-y-3">
              <div>
                <div className="font-bold text-white mb-1">1) 2FA 켜기 (필수)</div>
                TradingView → Account Settings → Privacy and Security → 2FA(인증앱). 안 켜면 웹훅 URL 칸이 잠깁니다.
              </div>
              <div>
                <div className="font-bold text-white mb-1">2) 알림 만들기</div>
                Pine 전략에 알림 생성 → 트리거 <b className="text-[#D4F94E]">&ldquo;Once Per Bar Close&rdquo;</b>(바마감 1회, 지연 강건) ·
                타임프레임 <b>일봉/주봉</b> 권장.
              </div>
              <div>
                <div className="font-bold text-white mb-1">3) 웹훅 URL</div>
                <code className="block bg-[#2A2A2A] border border-[#1A1A1A] px-2 py-1 break-all text-[#D4F94E]">{webhookUrl}</code>
                <span className="text-gray-500">YOUR_SECRET 자리에 임의 시크릿. 서버 env <code>SIGNALS_WEBHOOK_SECRET</code>와 동일하게.</span>
              </div>
              <div>
                <div className="font-bold text-white mb-1">4) 알림 메시지(JSON)</div>
                <code className="block bg-[#2A2A2A] border border-[#1A1A1A] px-2 py-1 break-all text-gray-300">
                  {`{"secret":"YOUR_SECRET","ticker":"{{ticker}}","tf":"1D","signal":"bitgak_break","price":"{{close}}","time":"{{timenow}}"}`}
                </code>
                <span className="text-gray-500">평문도 허용(그대로 note에 저장). 별칭 지원: symbol/interval/action/close 등.</span>
              </div>
              <div className="text-[10px] text-gray-500 pt-1 border-t border-[#1A1A1A]">
                영속 저장은 Upstash(구 Vercel KV) 무료 티어 연결 시 — env <code>UPSTASH_REDIS_REST_URL/TOKEN</code>이 있으면
                자동 사용, 없으면 인메모리(배포 시 초기화).
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-900/30 border-2 border-[#1A1A1A] mb-6 text-red-300 text-sm">❌ {error}</div>
        )}

        {/* Feed */}
        {loading && !data ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">🔔</div>
            <p>수신된 신호를 불러오는 중…</p>
          </div>
        ) : signals.length > 0 ? (
          <>
            <div className="flex justify-end mb-2">
              <button onClick={clearFeed} className="text-xs text-gray-500 hover:text-[#C45C3E] underline">
                전체 삭제
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1A1A1A]">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">수신</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">종목</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">TF</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">신호</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">가격</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">메모/원문</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => (
                    <tr key={s.id} className="border-b border-[#1A1A1A]/50 hover:bg-[#3A3A3A]/40">
                      <td className="py-2 px-3 text-gray-400 whitespace-nowrap" title={s.receivedAt}>{timeAgo(s.receivedAt)}</td>
                      <td className="py-2 px-3 font-bold text-white">{s.ticker || '—'}</td>
                      <td className="py-2 px-3 text-gray-400">{s.tf || '—'}</td>
                      <td className="py-2 px-3">
                        {s.signal ? <span className="px-1.5 py-0.5 bg-[#D4F94E]/20 text-[#D4F94E] text-xs">{s.signal}</span> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">{s.price ? `$${s.price}` : '—'}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs max-w-[16rem] truncate" title={s.note}>{s.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📭</div>
            <p>아직 수신된 신호가 없습니다.</p>
            <p className="text-xs text-gray-600 mt-2">위 &ldquo;TradingView 연결 방법&rdquo;을 따라 알림을 보내면 여기에 쌓입니다.</p>
          </div>
        )}
      </div>
    </main>
  );
}
