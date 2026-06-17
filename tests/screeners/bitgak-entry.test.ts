import test from 'node:test';
import { assert } from '../helpers/assert';
import { detectEntries, WEEKLY_PARAMS, type WeeklyBar } from '../../src/lib/screeners/bitgak';

// 평탄선(slope 0, intercept ln100) → 모든 봉에서 선값 = 100. 타점 로직을 정밀 검증.
const INTERCEPT = Math.log(100);
function bar(close: number, low: number, high: number, i: number): WeeklyBar {
  return { date: `2020-01-${String(i + 1).padStart(2, '0')}`, close, low, high };
}

test('저저고: 돌파 후 되돌림 밟기 = 과거 롱 타점', () => {
  const bars: WeeklyBar[] = [
    bar(100, 99, 101, 0), // fromIndex (스캔 시작 전)
    bar(105, 104, 106, 1), // 돌파 (close 105 > 102)
    bar(108, 106, 110, 2), // 선 위 유지
    bar(101, 99, 103, 3), // 되돌림 밟기: low 99 ≤ 101.5, close 101 ≥ 98 → 타점
    bar(107, 103, 109, 4), // 반등 (마지막 봉, 밟는 중 아님)
  ];
  const e = detectEntries(bars, 0, INTERCEPT, 'resistance', 0, WEEKLY_PARAMS);
  assert.equal(e.direction, '롱');
  assert.equal(e.status, '과거');
  assert.equal(e.count, 1);
  assert.equal(e.date, '2020-01-04');
});

test('저저고: 마지막 봉이 밟는 중 = 활성 롱 타점', () => {
  const bars: WeeklyBar[] = [
    bar(100, 99, 101, 0),
    bar(105, 104, 106, 1), // 돌파
    bar(108, 106, 110, 2),
    bar(101, 100, 103, 3), // 마지막 봉: low 100 ≤ 101.5 → 밟는 중
  ];
  const e = detectEntries(bars, 0, INTERCEPT, 'resistance', 0, WEEKLY_PARAMS);
  assert.equal(e.status, '활성');
  assert.equal(e.direction, '롱');
});

test('고고저: 이탈 후 되돌림 = 숏 타점, 방향 매핑', () => {
  const bars: WeeklyBar[] = [
    bar(100, 99, 101, 0),
    bar(95, 94, 96, 1), // 이탈 (close 95 < 98)
    bar(92, 90, 94, 2), // 선 아래 유지
    bar(99, 97, 101, 3), // 되돌림: high 101 ≥ 98.5, close 99 ≤ 102 → 숏 타점
    bar(93, 91, 95, 4),
  ];
  const e = detectEntries(bars, 0, INTERCEPT, 'support', 0, WEEKLY_PARAMS);
  assert.equal(e.direction, '숏');
  assert.equal(e.count, 1);
  assert.ok(e.status === '과거' || e.status === '활성');
});

test('돌파가 없으면 타점 없음', () => {
  const bars: WeeklyBar[] = [
    bar(100, 99, 101, 0),
    bar(100.5, 99.5, 101, 1), // breakTol 미달
    bar(99.5, 98.5, 100.5, 2),
  ];
  const e = detectEntries(bars, 0, INTERCEPT, 'resistance', 0, WEEKLY_PARAMS);
  assert.equal(e.status, '없음');
  assert.equal(e.count, 0);
  assert.equal(e.date, null);
});

test('지지 실패(종가가 선 아래로) 후 재돌파 없으면 밟기 무효', () => {
  const bars: WeeklyBar[] = [
    bar(100, 99, 101, 0),
    bar(105, 104, 106, 1), // 돌파
    bar(95, 94, 103, 2), // 종가 95 < 98 → 지지 실패, broken 해제
    bar(96, 95, 99, 3), // 재돌파 없음 → 타점 아님
  ];
  const e = detectEntries(bars, 0, INTERCEPT, 'resistance', 0, WEEKLY_PARAMS);
  assert.equal(e.status, '없음');
  assert.equal(e.count, 0);
});
