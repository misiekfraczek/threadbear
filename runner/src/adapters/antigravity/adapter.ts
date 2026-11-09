import { AcpAdapter, type AcpDeps } from '../acp/adapter.ts';
export class AntigravityAdapter extends AcpAdapter {
  constructor(deps: AcpDeps) {
    super('antigravity', deps);
  }
}
