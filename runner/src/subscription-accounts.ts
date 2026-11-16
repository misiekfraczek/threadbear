import type { Account } from './protocol.ts';
// Grok runs as one of the ACP agents (adapters/acp/), not through here.
export type SubscriptionProvider = 'antigravity';
export type SubscriptionStatus = { state: 'ready' | 'loginRequired' | 'unknown' | 'unavailable'; identity?: string; plan?: string; reason?: string };
export interface SubscriptionAccountProbe {
  status(account: Account): Promise<SubscriptionStatus>;
}

// Only metadata reported by the official CLI, never token files or model lists.
export function subscriptionStatus(provider: SubscriptionProvider, response: unknown): SubscriptionStatus {
  const r = response as { error?: { message?: string }; _meta?: Record<string, any> } | undefined;
  if (/authentication required|not authenticated|login required/i.test(r?.error?.message ?? ''))
    return { state: 'loginRequired', reason: 'Sign in with the official CLI.' };
  const meta = r?._meta;
  const tier = meta?.antigravity?.tier;
  if (['g1-pro-tier', 'g1-ultra-tier'].includes(tier?.id) && typeof tier.name === 'string')
    return { state: 'ready', plan: tier.name };
  return { state: 'unknown', reason: 'The CLI has not confirmed a supported subscription.' };
}
