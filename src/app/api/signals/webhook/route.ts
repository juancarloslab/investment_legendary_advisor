/**
 * TradingView 웹훅 수신 엔드포인트
 * POST /api/signals/webhook?token=SECRET   — TradingView 알림(JSON/평문)을 받아 저장
 * GET  /api/signals/webhook                — 헬스체크(URL 검증용)
 *
 * 보안: 환경변수 SIGNALS_WEBHOOK_SECRET 설정 시, ?token= 또는 본문 {"secret":...} 일치 필요.
 * (미설정 시 개발 모드로 모두 허용 — 운영 배포 전 반드시 시크릿을 설정할 것)
 *
 * ⚠️ 매매 신호가 아니라 수신·모니터링용. 지연 데이터 + 바마감 신호 전제(스캘핑 아님).
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseTradingViewPayload, makeSignalRecord } from '@/lib/signals';
import { pushSignal } from '@/lib/signals-store';

export const maxDuration = 15;

function authorized(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.SIGNALS_WEBHOOK_SECRET;
  if (!secret) return true; // 개발 모드 (시크릿 미설정)
  if (new URL(req.url).searchParams.get('token') === secret) return true;
  try {
    const obj = JSON.parse(rawBody) as { secret?: unknown };
    if (obj && typeof obj === 'object' && obj.secret === secret) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!authorized(req, rawBody)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = parseTradingViewPayload(rawBody);
  const record = makeSignalRecord(parsed, {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
  });

  try {
    await pushSignal(record);
  } catch (e) {
    const message = e instanceof Error ? e.message : '신호 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: record.id });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST your TradingView alerts to this URL' });
}
