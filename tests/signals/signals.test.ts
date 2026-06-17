import test from 'node:test';
import { assert } from '../helpers/assert';
import { parseTradingViewPayload, makeSignalRecord } from '../../src/lib/signals';

test('parses TradingView JSON payload', () => {
  const p = parseTradingViewPayload(
    '{"ticker":"MGC=F","tf":"1D","signal":"bitgak_break","price":"4344.4","time":"2026-06-17"}',
  );
  assert.equal(p.isJson, true);
  assert.equal(p.fields.ticker, 'MGC=F');
  assert.equal(p.fields.tf, '1D');
  assert.equal(p.fields.signal, 'bitgak_break');
  assert.equal(p.fields.price, '4344.4');
  assert.equal(p.fields.time, '2026-06-17');
});

test('never leaks the secret into stored fields', () => {
  const p = parseTradingViewPayload('{"secret":"topsecret","ticker":"AAPL","signal":"buy"}');
  assert.equal(p.fields.ticker, 'AAPL');
  assert.equal(JSON.stringify(p.fields).includes('topsecret'), false);
});

test('supports alternate field aliases (symbol/interval/action/close)', () => {
  const p = parseTradingViewPayload('{"symbol":"AAPL","interval":"1W","action":"sell","close":"299.2"}');
  assert.equal(p.fields.ticker, 'AAPL');
  assert.equal(p.fields.tf, '1W');
  assert.equal(p.fields.signal, 'sell');
  assert.equal(p.fields.price, '299.2');
});

test('falls back to plain text note when not JSON', () => {
  const p = parseTradingViewPayload('MGC long signal fired');
  assert.equal(p.isJson, false);
  assert.equal(p.fields.note, 'MGC long signal fired');
});

test('empty / whitespace body is safe', () => {
  const p = parseTradingViewPayload('   ');
  assert.equal(p.isJson, false);
  assert.equal(p.fields.note, '');
});

test('array JSON is treated as plain text (not an object payload)', () => {
  const p = parseTradingViewPayload('[1,2,3]');
  assert.equal(p.isJson, false);
  assert.equal(p.fields.note, '[1,2,3]');
});

test('makeSignalRecord composes id / receivedAt / source', () => {
  const p = parseTradingViewPayload('{"ticker":"MES=F","signal":"sell"}');
  const r = makeSignalRecord(p, { id: 'X1', receivedAt: '2026-06-17T00:00:00.000Z' });
  assert.equal(r.id, 'X1');
  assert.equal(r.receivedAt, '2026-06-17T00:00:00.000Z');
  assert.equal(r.source, 'tradingview');
  assert.equal(r.ticker, 'MES=F');
  assert.equal(r.signal, 'sell');
});

test('plain-text record is marked source=unknown when specified', () => {
  const p = parseTradingViewPayload('hello');
  const r = makeSignalRecord(p, { id: 'Y1', receivedAt: '2026-06-17T00:00:00.000Z', source: 'unknown' });
  assert.equal(r.source, 'unknown');
  assert.equal(r.note, 'hello');
});
