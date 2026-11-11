import { AcpAdapter, type AcpDeps } from '../subscription-acp/adapter.ts';
export class GrokAdapter extends AcpAdapter {
  constructor(deps: AcpDeps) {
    super('grok', deps);
  }
}
