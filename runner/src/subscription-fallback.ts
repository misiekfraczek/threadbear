import type { Account, Pool, Provider } from './protocol.ts';
import { pickInPool, poolProviders, poolAccounts, UNKNOWN_WAIT_MS, WAIT_SLACK_MS } from './pools.ts';

export type FallbackCycle = {
  id: string;
  sourceTurnId: string;
  attemptedAccountIds: string[];
  pending?: { accountId: string; turnId: string; phase: 'queued' | 'started' };
};
export type FallbackChoice = { kind: 'move'; accountId: string } | { kind: 'wait'; until: string } | { kind: 'blocked'; reasons: string[] };
export type Eligibility = { ok: boolean; reason?: string; retryAt?: string };

export function chooseSubscriptionFallback(
  pool: Pool,
  accounts: Account[],
  current: { accountId: string; provider: Provider },
  cycle: FallbackCycle,
  eligible: (a: Account) => Eligibility,
  now: number,
): FallbackChoice {
  const states = new Map(poolAccounts(pool, accounts).map((a) => [a.id, eligible(a)]));
  const usable = accounts.filter((a) => states.get(a.id)?.ok);
  const order = [current.provider, ...poolProviders(pool, accounts).filter((p) => p !== current.provider)];
  for (const provider of order) {
    const id = pickInPool(pool, usable, { provider, exclude: [current.accountId, ...cycle.attemptedAccountIds], now });
    if (id) return { kind: 'move', accountId: id };
  }
  const resets = [...states.values()].map((s) => Date.parse(s.retryAt ?? '')).filter((t) => Number.isFinite(t) && t > now);
  if (resets.length) return { kind: 'wait', until: new Date(Math.min(...resets) + WAIT_SLACK_MS).toISOString() };
  if ([...states.entries()].some(([id, s]) => s.ok && (id === current.accountId || cycle.attemptedAccountIds.includes(id))))
    return { kind: 'wait', until: new Date(now + UNKNOWN_WAIT_MS).toISOString() };
  return { kind: 'blocked', reasons: [...new Set([...states.values()].map((s) => s.reason ?? 'No compatible subscription is available.'))] };
}
