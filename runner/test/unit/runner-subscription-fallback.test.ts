import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAdapter, FakeAccounts, makeHarness, tick } from '../helpers/fakes.ts';
import { writeRunnerJson } from '../../src/config.ts';
import type { Account, Provider } from '../../src/protocol.ts';
const order: Provider[] = ['claude', 'codex', 'grok', 'antigravity'];
function setup() {
  const adapters = Object.fromEntries(order.map((p) => [p, new FakeAdapter(p)])) as Record<Provider, FakeAdapter>;
  const accounts: Account[] = order.map((p) => ({
    id: p,
    provider: p,
    title: p,
    configDir: '',
    subscription: p === 'antigravity' ? { state: 'ready' } : undefined,
  }));
  const h = makeHarness(undefined, { pools: [{ id: 'all', title: 'All', accountIds: order }] }, { adapters, accounts: new FakeAccounts(accounts) });
  writeRunnerJson(h.home, { experiments: { subscriptionFallback: true } });
  return { ...h, adapters };
}
const limit = (a: FakeAdapter, extra = {}) => a.last.result('failed', undefined, 'Subscription usage limit reached', { errorKind: 'usageLimit', ...extra });

test('three limits reach Google once, preserve thread and handoff, success ends cycle', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'Finish the task', poolId: 'all', permissionMode: 'full' });
  for (const p of order.slice(0, 3)) {
    h.adapters[p].last.init();
    limit(h.adapters[p]);
    await tick();
  }
  assert.equal(h.runner.get(thread.id).provider, 'antigravity');
  assert.equal(h.adapters.antigravity.sessions.length, 1);
  assert.match(h.adapters.antigravity.last.sent[0].text, /Finish the task/);
  assert.match(h.adapters.antigravity.last.sent[0].text, /verify.*(?:effect|operation)/i);
  h.adapters.antigravity.last.result();
  h.runner.flush();
  assert.equal(h.store.load(thread.id)?.fallbackCycle, undefined);
  assert.equal(h.runner.get(thread.id).accountId, 'antigravity');
});
test('model limit blocks only the pair, and duplicate result does not duplicate continuation', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all', model: 'claude-test' });
  const first = h.adapters.claude.last;
  first.init();
  limit(h.adapters.claude, { limit: { scope: 'model', model: 'claude-test' } });
  first.result('failed', undefined, 'again', { errorKind: 'usageLimit' });
  await tick();
  assert.equal(h.adapters.codex.sessions.length, 1);
  assert.equal(h.runner.ranDry.has('claude'), false);
  h.runner.flush();
  assert.equal(h.store.load(thread.id)?.subscriptionModelBlocks?.[0].model, 'claude-test');
});
test('user message wins over automatic continuation', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  h.adapters.claude.last.init();
  h.runner.send(thread.id, 'New instruction', [], { queue: true });
  limit(h.adapters.claude);
  await tick();
  assert.equal(h.adapters.codex.last.sent.length, 1);
  assert.match(h.adapters.codex.last.sent[0].text, /New instruction$/);
});
test('disk failure starts no replacement agent', async () => {
  const h = setup();
  h.runner.create({ text: 'x', poolId: 'all' });
  h.store.save = () => {
    throw new Error('disk full');
  };
  limit(h.adapters.claude);
  await tick();
  assert.equal(h.adapters.codex.sessions.length, 0);
});
test('pinned thread never moves', async () => {
  const h = setup();
  h.runner.create({ text: 'x', accountId: 'claude' });
  limit(h.adapters.claude);
  await tick();
  assert.equal(h.adapters.codex.sessions.length, 0);
});
test('stop removes queued recovery and wait', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  for (const p of order) {
    limit(h.adapters[p]);
    await tick();
  }
  assert.ok(h.runner.get(thread.id).waitingForRoom);
  h.runner.interrupt(thread.id, { byMike: true });
  h.runner.flush();
  assert.equal(h.store.load(thread.id)?.waitingForRoom, undefined);
  assert.equal(h.store.load(thread.id)?.fallbackCycle, undefined);
});

test('queued recovery survives a restart and dispatches once', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  h.adapters.claude.last.result();
  await h.runner.shutdown();
  const rec = h.store.load(thread.id)!;
  rec.accountId = 'codex';
  rec.provider = 'codex';
  rec.sessionUsed = false;
  rec.model = undefined;
  rec.fallbackCycle = {
    id: 'cycle',
    sourceTurnId: 'source',
    attemptedAccountIds: ['claude'],
    pending: { accountId: 'codex', turnId: 'carry', phase: 'queued' },
  };
  rec.queue = [{ turnId: 'carry', text: 'Continue with verification.', images: [], origin: 'runner' }];
  h.store.save(rec);
  const next = h.restart();
  await tick();
  assert.equal(h.adapters.codex.sessions.length, 1);
  assert.equal(h.adapters.codex.last.sent[0].id, 'carry');
  assert.equal(next.store.load(thread.id)?.fallbackCycle?.pending?.phase, 'started');
  await next.runner.shutdown();
});
test('a started recovery is not replayed after an uncertain crash', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  h.adapters.claude.last.result();
  await h.runner.shutdown();
  const rec = h.store.load(thread.id)!;
  rec.status = 'running';
  rec.turnId = 'uncertain';
  rec.fallbackCycle = {
    id: 'cycle',
    sourceTurnId: 'source',
    attemptedAccountIds: ['claude'],
    pending: { accountId: 'codex', turnId: 'uncertain', phase: 'started' },
  };
  h.store.save(rec);
  const next = h.restart();
  await tick();
  assert.equal(h.adapters.codex.sessions.length, 0);
  assert.ok(!h.adapters.claude.sessions.some((s) => s.sent.some((m) => m.id === 'uncertain')));
  await next.runner.shutdown();
});

test('a user message replaces recovery still waiting for the old process to exit', async () => {
  const h = setup();
  h.adapters.claude.slowExit = true;
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  const old = h.adapters.claude.last;
  old.init();
  limit(h.adapters.claude);
  h.runner.send(thread.id, 'User priority');
  old.exit();
  await tick();
  assert.equal(h.adapters.codex.last.sent.length, 1);
  assert.match(h.adapters.codex.last.sent[0].text, /User priority$/);
  assert.ok(!h.adapters.codex.last.sent[0].text.endsWith('instruction first.'));
});

test('after all limits reset, recovery starts at the first provider in pool order', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  for (const p of order) {
    limit(h.adapters[p]);
    await tick();
  }
  assert.ok(h.runner.get(thread.id).waitingForRoom);
  h.clock.advance(31 * 60_000);
  await tick();
  assert.equal(h.runner.get(thread.id).provider, 'claude');
  assert.equal(h.adapters.claude.sessions.length, 2);
});

test('an adapter without steering leaves later user messages in the runner queue', async () => {
  const h = setup();
  Object.assign(h.adapters.claude, { supportsSteering: false });
  const { thread } = h.runner.create({ text: 'first', poolId: 'all' });
  const session = h.adapters.claude.last;
  session.init();
  h.runner.send(thread.id, 'second');
  assert.equal(session.sent.length, 1);
  session.result();
  await tick();
  assert.equal(session.sent.length, 2);
  assert.equal(session.sent[1].text, 'second');
});

test('recovery reusing a live CLI persists dispatch before sending', async () => {
  const h = setup();
  h.cfg.pools = [{ id: 'all', title: 'One', accountIds: ['codex'] }];
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  limit(h.adapters.codex, { limit: { scope: 'account', resetsAt: new Date(h.clock.now() + 5000).toISOString() } });
  h.clock.advance(66_000);
  await tick();
  assert.equal(h.adapters.codex.sessions.length, 1);
  assert.equal(h.adapters.codex.last.sent.length, 2);
  assert.equal(h.store.load(thread.id)?.fallbackCycle?.pending?.phase, 'started');
});

test('an unready subscription is re-probed after login without restarting, with a bounded interval', async () => {
  const h = setup();
  h.runner.learnAccount('antigravity', { subscription: { state: 'loginRequired' } });
  let probes = 0;
  h.adapters.antigravity.models = async () => {
    probes++;
    if (probes === 2) h.runner.learnAccount('antigravity', { subscription: { state: 'ready' } });
    return [];
  };
  await h.runner.probeModels((a) => a.id === 'antigravity');
  h.clock.advance(59_000);
  await tick();
  assert.equal(probes, 1);
  h.clock.advance(1000);
  await tick();
  assert.equal(probes, 2);
  h.clock.advance(60_000);
  await tick();
  assert.equal(probes, 2);
});

test('a previously ready login rejected at admission is skipped only in an existing cycle', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  limit(h.adapters.claude);
  await tick();
  limit(h.adapters.codex);
  await tick();
  h.runner.learnAccount('grok', { subscription: { state: 'loginRequired' } });
  h.adapters.grok.last.result('failed', undefined, 'Authentication required', { errorKind: 'auth', admissionFailure: true });
  await tick();
  assert.equal(h.runner.get(thread.id).provider, 'antigravity');
  assert.equal(h.adapters.antigravity.sessions.length, 1);
  assert.equal(h.runner.ranDry.has('grok'), false, 'auth failure is not a usage limit');
  const other = setup();
  other.runner.create({ text: 'x', poolId: 'all' });
  other.adapters.claude.last.result('failed', undefined, 'Authentication required', { errorKind: 'auth', admissionFailure: true });
  await tick();
  assert.equal(other.adapters.codex.sessions.length, 0);
});

// 10 Nov 2026: Claude out of room in its 5-hour window moved a thread before
// its turn, and the note said "claude-main isn't on this Mac".
test('a move before the turn for low room says the limit, not that the login is missing', async () => {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  h.adapters.claude.last.init();
  h.adapters.claude.last.result();
  await tick();
  const accounts = (h.runner as any).accounts as FakeAccounts;
  accounts.base = accounts.base.map((a) =>
    a.id === 'claude'
      ? { ...a, usage: { windows: [{ kind: 'five_hour', title: '5-hour', remainingPercent: 0 }], readAt: new Date(h.clock.now()).toISOString(), source: 'live' } }
      : a,
  );
  h.runner.send(thread.id, 'next', []);
  await tick();
  assert.equal(h.runner.get(thread.id).provider, 'codex');
  const note = h.events(thread.id).filter((e: any) => e.type === 'system.note' && /^Moved to /.test(e.text)).at(-1)!.text;
  assert.match(note, /claude hit its 5-hour limit/);
  assert.doesNotMatch(note, /isn't on this Mac/);
});

// 11 Nov 2026: a scheduled turn in a thread that had moved to Grok (then on
// this feature's own adapter) failed in 1.5 s with "The CLI has not confirmed
// a supported subscription", with room on Claude. No cycle was open, so
// nothing moved it on. Only Google starts sessions that way now.
async function onGoogle() {
  const h = setup();
  const { thread } = h.runner.create({ text: 'x', poolId: 'all' });
  for (const p of order.slice(0, 3)) {
    limit(h.adapters[p]);
    await tick();
  }
  h.adapters.antigravity.last.init();
  h.adapters.antigravity.last.result();
  await tick();
  h.runner.flush();
  assert.equal(h.store.load(thread.id)?.fallbackCycle, undefined);
  // The other logins have their room back.
  h.runner.ranDry.clear();
  return { h, thread };
}
const lastMove = (h: { events(id: string): any[] }, id: string): string =>
  h.events(id).filter((e: any) => e.type === 'system.note' && /^Moved to /.test(e.text)).at(-1)!.text;

test('a Google login that cannot start a session moves the thread on with no cycle open', async () => {
  const { h, thread } = await onGoogle();
  h.runner.send(thread.id, 'Check the listing', []);
  await tick();
  h.adapters.antigravity.last.result('failed', undefined, 'The CLI has not confirmed a supported subscription.', { admissionFailure: true });
  await tick();
  assert.equal(h.runner.get(thread.id).provider, 'claude');
  assert.match(h.adapters.claude.last.sent[0].text, /Check the listing/);
  assert.equal(h.runner.ranDry.has('antigravity'), false, 'a failed start is not a usage limit');
  assert.match(lastMove(h, thread.id), /could not start a session/);
});

test('a move off a login whose subscription is no longer confirmed says so', async () => {
  const { h, thread } = await onGoogle();
  h.runner.learnAccount('antigravity', { subscription: { state: 'unknown' } });
  h.runner.send(thread.id, 'next', []);
  await tick();
  assert.equal(h.runner.get(thread.id).provider, 'claude');
  assert.match(lastMove(h, thread.id), /^Moved to claude: antigravity can't take this turn, subscription is not confirmed\. /);
});
