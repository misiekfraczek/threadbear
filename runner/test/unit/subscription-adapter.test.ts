import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpDir } from '../helpers/fakes.ts';
import { GrokAdapter } from '../../src/adapters/grok/adapter.ts';
import { AntigravityAdapter } from '../../src/adapters/antigravity/adapter.ts';
import type { AdapterOutput, StartSessionOptions } from '../../src/adapters/types.ts';
const fixture = path.resolve('test/fixtures/subscriptions/fake-acp.mjs');
for (const [name, Adapter] of [
  ['grok', GrokAdapter],
  ['antigravity', AntigravityAdapter],
] as const) {
  function setup(scenario = 'ok', resume = false) {
    const cwd = tmpDir();
    const outputs: AdapterOutput[] = [];
    const statuses: any[] = [];
    const adapter = new Adapter({ binary: process.execPath, args: [fixture, scenario], toolsFor: () => [], onStatus: (_a, s) => statuses.push(s) });
    const opts: StartSessionOptions = {
      threadId: 'test',
      cwd,
      account: { id: name + '-main', provider: name, title: name, configDir: '' },
      sessionId: 'resumed-id',
      resume,
      permissionMode: 'full',
      mediaDir: cwd,
      blobsDir: cwd,
      tmpDir: cwd,
    };
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    let started!: () => void;
    const promptStarted = new Promise<void>((r) => (started = r));
    const session = adapter.start(opts, {
      output: (o) => {
        outputs.push(o);
        if (o.kind === 'result') done();
        if (o.kind === 'delta' && o.delta.type === 'assistant.text.delta' && o.delta.text === 'PROMPT_STARTED') started();
      },
      exited: () => {},
      requestApproval: async () => ({ decision: 'deny' }),
      requestQuestion: async () => ({ answers: null }),
    });
    return { outputs, session, finished, promptStarted, adapter, opts, statuses };
  }
  test(`${name}: split JSON, unknown events and resume without replay`, async () => {
    const h = setup('ok', true);
    h.session.send({ id: 'turn', text: 'hi', images: [] });
    await h.finished;
    await h.session.end();
    assert.equal(h.outputs.filter((o) => o.kind === 'result').length, 1);
    assert.equal(h.outputs.find((o) => o.kind === 'result')?.result.outcome, 'completed');
    assert.equal(h.outputs.find((o) => o.kind === 'session')?.nativeSessionId, 'resumed-id');
    assert.ok(!JSON.stringify(h.outputs).includes('OLD HISTORY'));
    assert.ok(h.outputs.some((o) => o.kind === 'event' && o.event.type === 'assistant.text' && o.event.text === 'OK'));
  });
  for (const scenario of ['eof', 'bad-json', '429', 'limit'])
    test(`${name}: ${scenario} is never success`, async () => {
      const h = setup(scenario);
      h.session.send({ id: 'turn', text: 'hi', images: [] });
      await h.finished;
      await h.session.end();
      const results = h.outputs.filter((o) => o.kind === 'result');
      assert.equal(results.length, 1);
      assert.equal(results[0].result.outcome, 'failed');
      assert.equal(results[0].result.errorKind, scenario === 'limit' ? 'usageLimit' : undefined);
    });
  test(`${name}: unsupported permissions fail closed before spawning`, () => {
    const a = new Adapter({ binary: 'DO-NOT-SPAWN', toolsFor: () => [] });
    for (const permissionMode of ['ask', 'auto', 'plan'] as const) assert.equal(a.supports({ permissionMode } as StartSessionOptions).ok, false);
    assert.equal(a.supports({ permissionMode: 'full', confined: true } as StartSessionOptions).ok, false);
  });
  test(`${name}: expired login reports failed admission and invalidates readiness`, async () => {
    const h = setup('auth-fail');
    h.session.send({ id: 'turn', text: 'hi', images: [] });
    await h.finished;
    await h.session.end();
    const result = h.outputs.find((o) => o.kind === 'result')!;
    assert.equal(result.result.admissionFailure, true);
    assert.equal(result.result.errorKind, 'auth');
    assert.equal(h.statuses.at(-1).state, 'loginRequired');
  });
  test(`${name}: Stop discards pending adapter sends`, async () => {
    const h = setup('queued-after-cancel');
    h.session.send({ id: 'one', text: 'first', images: [] });
    h.session.send({ id: 'two', text: 'second', images: [] });
    await h.promptStarted;
    await h.session.interrupt();
    await h.finished;
    await new Promise((r) => setTimeout(r, 100));
    await h.session.end();
    const results = h.outputs.filter((o) => o.kind === 'result');
    assert.equal(results.length, 1);
    assert.equal(results[0].result.outcome, 'interrupted');
  });
  test(`${name}: cancellation does not report completion`, async () => {
    const h = setup('wait');
    h.session.send({ id: 'turn', text: 'hi', images: [] });
    await h.promptStarted;
    await h.session.interrupt();
    await h.finished;
    await h.session.end();
    assert.equal(h.outputs.find((o) => o.kind === 'result')?.result.outcome, 'interrupted');
  });
}

test('Google exposes Gemini models only; catalog discovery still requires subscription confirmation', async () => {
  const a = new AntigravityAdapter({ binary: process.execPath, args: [fixture, 'ok'], toolsFor: () => [] });
  const models = await a.models({ id: 'google', provider: 'antigravity', title: 'Google', configDir: '' });
  assert.deepEqual(
    models.map((m) => m.model),
    ['gemini-test'],
  );
});
