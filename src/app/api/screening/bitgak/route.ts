/**
 * 빗각(Bitgak) 주봉 추세선 스크리닝 API
 * GET /api/screening/bitgak          — 캐시 사용
 * GET /api/screening/bitgak?refresh=true — 강제 갱신
 *
 * ⚠️ 연구용. 매매 신호 아님.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runBitgakScreening } from '@/lib/screeners/bitgak-screener';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const report = await runBitgakScreening(forceRefresh);
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=43200',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '빗각 스크리닝에 실패했습니다';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
