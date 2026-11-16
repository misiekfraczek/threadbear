import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpDir } from '../helpers/fakes.ts';
import { writeRunnerJson } from '../../src/config.ts';
import { subscriptionAdapters } from '../../src/subscription-registration.ts';
test('experiment off never registers the subscription CLI; on registers only an executable path', () => {
  const home = tmpDir();
  assert.deepEqual(subscriptionAdapters({ home, antigravityPath: process.execPath }, { toolsFor: () => [] }), {});
  writeRunnerJson(home, { experiments: { subscriptionFallback: true } });
  assert.equal(subscriptionAdapters({ home, antigravityPath: process.execPath }, { toolsFor: () => [] }).antigravity?.provider, 'antigravity');
  assert.deepEqual(subscriptionAdapters({ home, antigravityPath: '/missing/agy' }, { toolsFor: () => [] }), {});
});

// Mike's release of 16 Nov runs Grok as an ACP agent of its own, and since
// then the subscription fallback has no Grok adapter: grok-main is always
// the ACP agents' row, whatever the experiment says.
test('grok-main is the ACP agents\' with the experiment off and on', async () => {
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
  for (const on of [false, true]) {
    if (on) writeRunnerJson(home, { experiments: { subscriptionFallback: true } });
    const rows = discoverAccounts(cfg).filter((a) => a.provider === 'grok');
    assert.equal(rows.length, 1, 'never two rows for one login');
    assert.equal(rows[0].subscription, undefined, 'the ACP agents\' row');
    assert.equal(rows[0].configDir, path.join(userHome, '.grok'));
  }
  assert.ok(discoverAccounts(cfg).some((a) => a.id === 'antigravity-main'));
});
