import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpDir } from '../helpers/fakes.ts';
import { writeRunnerJson } from '../../src/config.ts';
import { subscriptionAdapters } from '../../src/subscription-registration.ts';
test('experiment off never registers subscription CLIs; on registers only executable paths', () => {
  const home = tmpDir();
  const cfg = { home, grokPath: process.execPath, antigravityPath: '/missing/agy' };
  assert.deepEqual(subscriptionAdapters(cfg, { toolsFor: () => [] }), {});
  writeRunnerJson(home, { experiments: { subscriptionFallback: true } });
  const adapters = subscriptionAdapters(cfg, { toolsFor: () => [] });
  assert.equal(adapters.grok?.provider, 'grok');
  assert.equal(adapters.antigravity, undefined);
});

// Mike's release of 16 Nov runs Grok as an ACP agent of its own. The
// subscription fallback's Grok takes grok-main only while its experiment is on.
test('grok-main is the ACP agents\' with the experiment off and the subscription fallback\'s with it on', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { discoverAccounts } = await import('../../src/accounts.ts');
  const home = tmpDir();
  const userHome = tmpDir();
  // A logged-in Grok whose binary really is named grok (adapters/acp/agents.ts).
  fs.mkdirSync(path.join(userHome, '.grok'), { recursive: true });
  fs.writeFileSync(path.join(userHome, '.grok', 'auth.json'), '{}');
  const grok = path.join(userHome, 'grok');
  fs.writeFileSync(grok, '#!/bin/sh\n', { mode: 0o755 });
  const cfg = { home, userHome, pathEnv: '', claudeMainDir: '/missing', claudeMainJson: '/missing', tokenStatsAccountsDir: '/missing', grokPath: grok, antigravityPath: grok };
  const off = discoverAccounts(cfg);
  const offGrok = off.filter((a) => a.provider === 'grok');
  assert.equal(offGrok.length, 1);
  assert.equal(offGrok[0].subscription, undefined, 'the ACP agents\' row');
  assert.equal(offGrok[0].configDir, path.join(userHome, '.grok'));
  writeRunnerJson(home, { experiments: { subscriptionFallback: true } });
  const on = discoverAccounts(cfg);
  const onGrok = on.filter((a) => a.id === 'grok-main');
  assert.equal(onGrok.length, 1, 'never two rows for one login');
  assert.deepEqual(onGrok[0].subscription, { state: 'unknown' });
  assert.ok(on.some((a) => a.id === 'antigravity-main'));
});
