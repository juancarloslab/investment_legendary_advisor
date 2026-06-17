/**
 * 매매신호 수신 (TradingView 웹훅) — 순수 파싱/타입 로직 (I/O 없음).
 *
 * ⚠️ 이것은 "매매 신호 생성기"가 아니라, TradingView가 자기 데이터로 계산해 보낸
 *    알림을 받아 모니터링·검증하는 연구 도구입니다. 지연 데이터 + 바마감(Once Per
 *    Bar Close) 신호를 전제로 하며(스캘핑 진입용 아님), 검증 전엔 신뢰하지 마세요.
 */

export interface SignalRecord {
  id: string;
  receivedAt: string; // ISO — 앱이 수신한 시각
  source: 'tradingview' | 'unknown';
  ticker?: string;
  tf?: string; // 타임프레임 (예: 1D, 1W)
  signal?: string; // 신호 이름/액션 (예: bitgak_break, buy, sell)
  price?: string; // 문자열 보존 (TradingView가 문자열로 보냄)
  time?: string; // TradingView가 보낸 봉 시각
  note?: string; // 자유 텍스트 / 평문 원문(요약)
}

export interface ParsedPayload {
  fields: Partial<Pick<SignalRecord, 'ticker' | 'tf' | 'signal' | 'price' | 'time' | 'note'>>;
  isJson: boolean;
}

const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));

/**
 * TradingView 알림 메시지(JSON 또는 평문)를 안전하게 파싱한다.
 * - 여러 별칭 필드 허용: ticker/symbol, tf/timeframe/interval, signal/action/strategy, price/close ...
 * - `secret` 같은 인증 필드는 절대 추출하지 않으므로 저장 레코드로 새지 않는다.
 * - JSON 파싱 실패 시 평문을 note로 보존(최대 500자).
 */
export function parseTradingViewPayload(rawBody: string): ParsedPayload {
  const trimmed = (rawBody || '').trim();
  if (!trimmed) return { fields: { note: '' }, isJson: false };

  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const o = obj as Record<string, unknown>;
      return {
        isJson: true,
        fields: {
          ticker: str(o.ticker ?? o.symbol),
          tf: str(o.tf ?? o.timeframe ?? o.interval),
          signal: str(o.signal ?? o.action ?? o.strategy),
          price: str(o.price ?? o.close),
          time: str(o.time ?? o.timenow),
          note: str(o.note ?? o.comment ?? o.message),
        },
      };
    }
  } catch {
    // 평문 fallback 으로 진행
  }
  return { fields: { note: trimmed.slice(0, 500) }, isJson: false };
}

/** 파싱 결과에 id/수신시각/출처를 합쳐 저장 레코드를 만든다. */
export function makeSignalRecord(
  parsed: ParsedPayload,
  opts: { id: string; receivedAt: string; source?: SignalRecord['source'] },
): SignalRecord {
  return {
    id: opts.id,
    receivedAt: opts.receivedAt,
    source: opts.source ?? 'tradingview',
    ...parsed.fields,
  };
}
