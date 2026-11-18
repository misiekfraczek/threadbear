// A login the usage readings call blocked, or out of room, is asked again
// on a timer without starting a turn (AgentAdapter.usage: Codex's
// account/rateLimits/read). Without it a Codex login found at its limit
// stayed "Limit reached" until the reset its last reading named, even
// after OpenAI had reset it early (18 Nov 2026: the weekly window was back
// at 93% while Threadbear still showed it blocked), since nothing else
// reads a login no thread is running on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAccounts, makeHarness, tick, withCodex } from '../helpers/fakes.ts';
import type { Account } from '../../src/protocol.ts';
import type { UsageReading } from '../../src/usage.ts';
import { USAGE_PROBE_MS, type UsageSink } from '../../src/runner.ts';

const START = Date.parse('2026-10-26T12:00:00.000Z');

function weekly(pct: number, blocked = false): Account['usage'] {
  return {
    windows: [{ kind: 'weekly', title: 'Weekly', remainingPercent: pct, resetsAt: new Date(START + 3 * 3600_000).toISOString() }],
    readAt: new Date(START).toISOString(),
    source: 'live',
    ...(blocked ? { blocked: true } : {}),
  };
}

function probeHarness(usageOf: Record<string, Account['usage']>) {
  const fake = new FakeAccounts(withCodex().map((a) => (usageOf[a.id] ? { ...a, usage: usageOf[a.id] } : a)));
  const records: [string, UsageReading][] = [];
  const usage: UsageSink = { record: (id, r) => void records.push([id, r]) };
  const asked: string[] = [];
  const fresh: UsageReading = { windows: [{ kind: 'weekly', title: 'Weekly', remainingPercent: 93 }], blocked: false };
  const h = makeHarness(undefined, {}, { accounts: fake, usage });
  h.codex.usage = async (account) => {
    asked.push(account.id);
    return fresh;
  };
  return { ...h, fake, records, asked, fresh };
}

test('a blocked Codex login is asked for its limits on a timer, and the reading is recorded', async () => {
  const h = probeHarness({ 'codex-main': weekly(0, true) });
  h.clock.advance(USAGE_PROBE_MS);
  await tick();
  assert.deepEqual(h.asked, ['codex-main']);
  assert.deepEqual(h.records, [['codex-main', h.fresh]]);
  // Still blocked (the fake store doesn't apply readings): asked again next time.
  h.clock.advance(USAGE_PROBE_MS);
  await tick();
  assert.deepEqual(h.asked, ['codex-main', 'codex-main']);
});

test('a login with room, or with no usage known, is not asked; nor one whose adapter has no usage()', async () => {
  const h = probeHarness({ 'codex-main': weekly(40), 'claude-main': weekly(0, true) });
  h.clock.advance(USAGE_PROBE_MS * 2);
  await tick();
  assert.deepEqual(h.asked, [], 'codex-main has room; claude-main is Claude, whose fake adapter has no usage()');
  assert.deepEqual(h.records, []);
});

test('a login under the minimum room is asked too', async () => {
  const h = probeHarness({ 'codex-main': weekly(0.5) });
  h.clock.advance(USAGE_PROBE_MS);
  await tick();
  assert.deepEqual(h.asked, ['codex-main']);
});

test('a probe that fails is logged and the next one still runs', async () => {
  const h = probeHarness({ 'codex-main': weekly(0, true) });
  let calls = 0;
  h.codex.usage = async () => {
    calls++;
    throw new Error('app-server exited');
  };
  h.clock.advance(USAGE_PROBE_MS);
  await tick();
  h.clock.advance(USAGE_PROBE_MS);
  await tick();
  assert.equal(calls, 2);
  assert.deepEqual(h.records, []);
});

test('shutdown stops the timer', async () => {
  const h = probeHarness({ 'codex-main': weekly(0, true) });
  await h.runner.shutdown();
  h.clock.advance(USAGE_PROBE_MS * 3);
  await tick();
  assert.deepEqual(h.asked, []);
});
