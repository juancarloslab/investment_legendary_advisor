/**
 * 수신된 매매신호 피드
 * GET    /api/signals              — 최신순 신호 목록 + 저장소 모드
 * DELETE /api/signals?token=SECRET — 피드 전체 삭제(시크릿 설정 시 인증 필요)
 *
 * ⚠️ 연구·모니터링용. 매매 신호가 아닙니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSignals, clearSignals, storageMode } from '@/lib/signals-store';

export async function GET() {
  try {
    const signals = await listSignals();
    return NextResponse.json(
      { signals, count: signals.length, storage: storageMode() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '신호를 불러오지 못했습니다';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const secret = process.env.SIGNALS_WEBHOOK_SECRET;
  if (secret && new URL(req.url).searchParams.get('token') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    await clearSignals();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
