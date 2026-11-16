// This fork's subscription fallback moves a pooled thread on when a login
// runs out (runner/subscriptions.ts). Grok runs on the ACP agents' adapter
// since Mike's release of 16 Nov 2026, so that adapter has to say when a
// turn failed at Grok's subscription limit, or a thread on Grok never moves
// on to the next provider.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AcpAdapter, AcpSession } from '../../src/adapters/acp/adapter.ts';
import { ACP_AGENTS } from '../../src/adapters/acp/agents.ts';
import type { AdapterOutput, SessionSink, TurnResult } from '../../src/adapters/types.ts';
import { nullLogger } from '../../src/log.ts';
import { ProcessRegistry } from '../../src/proc.ts';

const FAKE = path.join(import.meta.dirname, '..', 'helpers', 'fake-acp-agent.mjs');
const made: string[] = [];
const live: AcpSession[] = [];
afterEach(async () => {
  await Promise.all(live.splice(0).map((s) => s.end({ hard: true }).catch(() => undefined)));
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function failedTurn(message: string): Promise<TurnResult> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tb-grok-limit-')));
  made.push(root);
  const cwd = path.join(root, 'work');
  const grokHome = path.join(root, 'grok');
  fs.mkdirSync(cwd);
  fs.mkdirSync(grokHome);
  return new Promise((resolve, reject) => {
    const sink: SessionSink = {
      output(out: AdapterOutput) {
        if (out.kind === 'result') resolve(out.result);
      },
      requestApproval: async () => ({ decision: 'deny' }),
      requestQuestion: async () => ({ answers: null }),
      exited: (e) => reject(e ?? new Error('exited')),
    };
    const adapter = new AcpAdapter({
      agent: ACP_AGENTS.grok,
      binary: () => FAKE,
      registry: new ProcessRegistry(path.join(root, 'run'), nullLogger),
      log: nullLogger,
      env: { PATH: process.env.PATH, FAKE_ACP_NAME: 'Grok', GROK_HOME: grokHome },
      timings: { closeWaitMs: 300 },
      dataDir: path.join(root, 'data'),
      toolsFor: () => [],
    });
    const s = adapter.start({ threadId: 't1', cwd, account: { id: 'grok-main', provider: 'grok', title: 'Grok', configDir: '/g' }, permissionMode: 'ask', sessionId: 'unused', resume: false, mediaDir: path.join(root, 'media'), blobsDir: path.join(root, 'blobs'), tmpDir: root }, sink) as AcpSession;
    live.push(s);
    s.send({ id: 't0', text: `fail ${message}`, images: [] });
  });
}

test("a Grok turn refused at the subscription's limit is a usage limit, so a pooled thread moves on", async () => {
  const r = await failedTurn('Your subscription usage limit has been reached.');
  assert.equal(r.outcome, 'failed');
  assert.equal(r.errorKind, 'usageLimit');
});

test('any other failure, a plain rate limit included, moves nothing', async () => {
  const r = await failedTurn('429 Too Many Requests');
  assert.equal(r.outcome, 'failed');
  assert.equal(r.errorKind, undefined);
});
