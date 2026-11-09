import { AcpAdapter, type AcpDeps } from '../acp/adapter.ts';
export class GrokAdapter extends AcpAdapter {
  constructor(deps: AcpDeps) {
    super('grok', deps);
  }
}
