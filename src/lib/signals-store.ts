/**
 * 매매신호 저장소 — Upstash Redis(REST) 우선, 없으면 인메모리 폴백.
 *
 * - Vercel 마켓플레이스로 Upstash(구 Vercel KV)를 붙이면 env가 자동 주입된다.
 *   (UPSTASH_REDIS_REST_URL/TOKEN 또는 레거시 KV_REST_API_URL/TOKEN 모두 지원)
 * - env가 없으면 인메모리로 동작한다. ⚠️ 서버리스에선 인스턴스별·콜드스타트마다
 *   초기화되므로 인메모리는 로컬/PoC 전용. 영속하려면 Upstash 무료 티어를 붙일 것.
 *
 * 의존성 0 — Upstash REST API를 fetch로 직접 호출(@upstash/redis SDK 불필요).
 */

import type { SignalRecord } from './signals';

const KEY = 'signals:feed';
const MAX = 500; // 보관 최대 건수

function upstashCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function storageMode(): 'upstash' | 'memory' {
  return upstashCreds() ? 'upstash' : 'memory';
}

// ── 인메모리 폴백 (로컬/PoC 전용) ──
const mem: SignalRecord[] = [];

async function redis(creds: { url: string; token: string }, command: (string | number)[]): Promise<unknown> {
  const res = await fetch(creds.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`Upstash: ${json.error}`);
  return json.result;
}

/** 신호 1건을 피드 맨 앞에 추가하고 최대 MAX건으로 자른다. */
export async function pushSignal(record: SignalRecord): Promise<void> {
  const creds = upstashCreds();
  if (!creds) {
    mem.unshift(record);
    if (mem.length > MAX) mem.length = MAX;
    return;
  }
  await redis(creds, ['LPUSH', KEY, JSON.stringify(record)]);
  await redis(creds, ['LTRIM', KEY, 0, MAX - 1]);
}

/** 최신순으로 신호 목록을 반환한다. */
export async function listSignals(limit = 200): Promise<SignalRecord[]> {
  const creds = upstashCreds();
  if (!creds) return mem.slice(0, limit);
  const raw = (await redis(creds, ['LRANGE', KEY, 0, limit - 1])) as unknown;
  if (!Array.isArray(raw)) return [];
  const out: SignalRecord[] = [];
  for (const s of raw) {
    try {
      out.push(JSON.parse(String(s)) as SignalRecord);
    } catch {
      // 손상 항목은 건너뜀
    }
  }
  return out;
}

/** 피드 전체 삭제. */
export async function clearSignals(): Promise<void> {
  const creds = upstashCreds();
  if (!creds) {
    mem.length = 0;
    return;
  }
  await redis(creds, ['DEL', KEY]);
}
