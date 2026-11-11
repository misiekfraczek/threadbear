import { AcpAdapter, type AcpDeps } from '../subscription-acp/adapter.ts';
export class AntigravityAdapter extends AcpAdapter {
  constructor(deps: AcpDeps) {
    super('antigravity', deps);
  }
}
