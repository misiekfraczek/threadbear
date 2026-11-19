import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeAdapter } from '../../src/adapters/claude/adapter.ts';
import { nullLogger } from '../../src/log.ts';
import { ProcessRegistry } from '../../src/proc.ts';
import { withCodex } from '../helpers/fakes.ts';

const account = withCodex().find(a => a.id === 'claude-main')!;
const reset = '2026-11-24T11:00:00.000Z';
const meter = (utilization: number) => ({ utilization, resets_at: reset });

async function probe(limits: unknown) {
  let closed = false;
  const adapter = new ClaudeAdapter({
    log: nullLogger, registry: new ProcessRegistry('.', nullLogger), claudePath: 'claude',
    queryFn: () => ({
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async (opts: unknown) => {
        assert.deepEqual(opts, { skipBehaviors: true });
        return { rate_limits_available: !!limits, rate_limits: limits };
      },
      close: () => { closed = true; },
    }) as never,
  });
  const result = await adapter.usage(account);
  assert.ok(closed);
  return result;
}

test('an early Claude reset restores room even if Fable is exhausted', async () => {
  assert.deepEqual(await probe({ five_hour: meter(4), seven_day: meter(0), model_scoped: [{ display_name: 'Fable', ...meter(100) }] }), {
    blocked: false, windows: [
      { kind: 'five_hour', title: '5-hour', remainingPercent: 96, resetsAt: reset },
      { kind: 'weekly', title: 'Weekly', remainingPercent: 100, resetsAt: reset },
      { kind: 'weekly_model', title: 'Weekly Fable', remainingPercent: 0, resetsAt: reset },
    ],
  });
});

test('a full weekly limit stays blocked and missing readings cannot clear a block', async () => {
  assert.equal((await probe({ seven_day: meter(100) }))?.blocked, true);
  assert.equal(await probe(null), null);
  assert.equal(await probe({ seven_day: meter(NaN) }), null);
  assert.equal(await probe({ model_scoped: [{ display_name: 'Fable', ...meter(0) }] }), null);
});
