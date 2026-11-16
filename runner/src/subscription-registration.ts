import fs from 'node:fs';
import type { Config } from './config.ts';
import type { AgentAdapter } from './adapters/types.ts';
import type { AcpDeps } from './adapters/subscription-acp/adapter.ts';
import { AntigravityAdapter } from './adapters/antigravity/adapter.ts';
import { experimentOn } from './experiments.ts';

// Registration enables probing, not automatic eligibility: each session
// confirms its subscription again, and pools require a ready account.
export function subscriptionAdapters(
  cfg: Pick<Config, 'home' | 'antigravityPath'>,
  deps: Omit<AcpDeps, 'binary' | 'args'>,
): Partial<Record<'antigravity', AgentAdapter>> {
  if (!experimentOn(cfg.home, 'subscriptionFallback')) return {};
  const out: Partial<Record<'antigravity', AgentAdapter>> = {};
  for (const [provider, binary, Adapter] of [
    ['antigravity', cfg.antigravityPath, AntigravityAdapter],
  ] as const) {
    if (!binary) continue;
    try {
      fs.accessSync(binary, fs.constants.X_OK);
    } catch {
      continue;
    }
    out[provider] = new Adapter({ ...deps, binary });
  }
  return out;
}
