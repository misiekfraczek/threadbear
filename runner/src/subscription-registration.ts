import fs from 'node:fs';
import type {Config} from './config.ts';
import type {AgentAdapter} from './adapters/types.ts';
import type {AcpDeps} from './adapters/acp/adapter.ts';
import {GrokAdapter} from './adapters/grok/adapter.ts';
import {AntigravityAdapter} from './adapters/antigravity/adapter.ts';
import {experimentOn} from './experiments.ts';

// Registration enables probing, not automatic eligibility: each session
// confirms its subscription again, and pools require a ready account.
export function subscriptionAdapters(cfg:Pick<Config,'home'|'grokPath'|'antigravityPath'>,deps:Omit<AcpDeps,'binary'|'args'>):Partial<Record<'grok'|'antigravity',AgentAdapter>> {
  if(!experimentOn(cfg.home,'subscriptionFallback'))return {};
  const out:Partial<Record<'grok'|'antigravity',AgentAdapter>>={};
  for(const [provider,binary,Adapter] of [['grok',cfg.grokPath,GrokAdapter],['antigravity',cfg.antigravityPath,AntigravityAdapter]] as const) {
    if(!binary)continue;
    try{fs.accessSync(binary,fs.constants.X_OK);}catch{continue;}
    out[provider]=new Adapter({...deps,binary});
  }
  return out;
}
