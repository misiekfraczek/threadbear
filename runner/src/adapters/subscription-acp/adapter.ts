import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentAdapter, AgentSession, StartSessionOptions, SessionSink, UserInput } from '../types.ts';
import type { Account, ModelChoice, EffortLevel, PermissionMode } from '../../protocol.ts';
import type { ProcessRegistry } from '../../proc.ts';
import { subscriptionStatus, type SubscriptionProvider, type SubscriptionStatus } from '../../subscription-accounts.ts';
import { subscriptionEnv } from '../../subscription-env.ts';
import { toolGuidance, type ToolDefinition } from '../codex/tools.ts';
import { AcpTransport } from './transport.ts';
import { AcpNormalizer, acpFailure } from './normalize.ts';
import { acpTools } from './tools.ts';

export type AcpDeps = {
  binary: string;
  args?: string[];
  registry?: Pick<ProcessRegistry, 'add' | 'remove'>;
  toolsFor: (threadId: string) => ToolDefinition[];
  onStatus?: (account: Account, status: SubscriptionStatus, models: ModelChoice[]) => void;
};
export function acpArgs(provider: SubscriptionProvider): string[] {
  return provider === 'grok' ? ['agent', '--no-leader', 'stdio'] : ['--settings', JSON.stringify({ useG1Credits: false, modelProvider: '', gcp: {} }), 'acp'];
}
export function acpModels(provider: SubscriptionProvider, response: any): ModelChoice[] {
  const available = response?.models?.availableModels;
  if (!Array.isArray(available)) return [];
  return available
    .filter((m) => typeof m.modelId === 'string' && m.modelId.startsWith(provider === 'grok' ? 'grok-' : 'gemini-'))
    .map((m) => ({ id: m.modelId, model: m.modelId, title: String(m.name ?? m.modelId) }));
}
export class AcpAdapter implements AgentAdapter {
  readonly settingsApplyNextTurn = true;
  readonly supportsSteering = false;
  readonly wakesAfterTasks = false;
  readonly provider: SubscriptionProvider;
  private deps: AcpDeps;
  constructor(provider: SubscriptionProvider, deps: AcpDeps) {
    this.provider = provider;
    this.deps = deps;
  }
  supports(opts: StartSessionOptions): { ok: boolean; reason?: string } {
    if (opts.confined) return { ok: false, reason: 'This subscription CLI has no verified Threadbear sandbox.' };
    if (opts.permissionMode !== 'full')
      return { ok: false, reason: 'This subscription CLI is verified only for Full access. Choose a compatible login to keep the current permissions.' };
    if (opts.resumeAt) return { ok: false, reason: 'This subscription CLI cannot resume at an edited message.' };
    return { ok: true };
  }
  start(opts: StartSessionOptions, sink: SessionSink): AgentSession {
    const supported = this.supports(opts);
    if (!supported.ok) throw new Error(supported.reason);
    return new AcpSession(this.provider, this.deps, opts, sink);
  }
  async models(account: Account): Promise<ModelChoice[]> {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'threadbear-acp-models-'));
    const rpc = new AcpTransport(
      this.deps.binary,
      this.deps.args ?? acpArgs(this.provider),
      cwd,
      subscriptionEnv(this.provider, process.env),
      () => {},
      async () => {
        throw new Error('No tools during a probe');
      },
      () => {},
      this.deps.registry,
    );
    try {
      await rpc.call('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'threadbear', version: '1' } });
      let status: SubscriptionStatus | undefined;
      if (this.provider === 'grok') status = subscriptionStatus(this.provider, await rpc.call('authenticate', { methodId: 'cached_token' }));
      const r = await rpc.call('session/new', { cwd, mcpServers: [] });
      status ??= subscriptionStatus(this.provider, r);
      const models = acpModels(this.provider, r);
      this.deps.onStatus?.(account, status, models);
      return status.state === 'ready' ? models : [];
    } catch (e) {
      this.deps.onStatus?.(account, subscriptionStatus(this.provider, { error: { message: e instanceof Error ? e.message : String(e) } }), []);
      return [];
    } finally {
      await rpc.end();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
}

class AcpSession implements AgentSession {
  private rpc!: AcpTransport;
  private id = '';
  private bridge?: Awaited<ReturnType<typeof acpTools>>;
  private abort = new AbortController();
  private normalizer: AcpNormalizer;
  private ready: Promise<void>;
  private tail?: Promise<void>;
  private active = false;
  private epoch = 0;
  private ended = false;
  private cancelRequested = false;
  private announced = false;
  private initialized = false;
  private told = false;
  private tools: ToolDefinition[];
  private provider: SubscriptionProvider;
  private deps: AcpDeps;
  private opts: StartSessionOptions;
  private sink: SessionSink;
  constructor(provider: SubscriptionProvider, deps: AcpDeps, opts: StartSessionOptions, sink: SessionSink) {
    this.provider = provider;
    this.deps = deps;
    this.opts = { ...opts };
    this.sink = sink;
    this.tools = deps.toolsFor(opts.threadId);
    this.normalizer = new AcpNormalizer((o) => sink.output(o));
    this.ready = this.initialize().catch((e) => {
      this.deps.onStatus?.(this.opts.account, subscriptionStatus(this.provider, { error: { message: e instanceof Error ? e.message : String(e) } }), []);
      throw e;
    });
    // A failed start is reported by the queued send, with its turn ID.
    void this.ready.catch(() => {});
  }
  private async initialize(): Promise<void> {
    this.bridge = await acpTools(
      this.tools,
      {
        cwd: () => this.opts.cwd,
        mode: () => this.opts.permissionMode,
        rules: () => [],
        addRules: () => {},
        requestApproval: (r) => this.sink.requestApproval(r),
      },
      this.abort.signal,
      (o) => {
        this.normalizer.flush();
        this.sink.output(o);
      },
    );
    if (this.ended) {
      this.bridge.close();
      throw new Error('Session stopped.');
    }
    this.rpc = new AcpTransport(
      this.deps.binary,
      this.deps.args ?? acpArgs(this.provider),
      this.opts.cwd,
      subscriptionEnv(this.provider, { ...process.env, ...this.opts.env }),
      (method, params) => {
        if (this.active && method === 'session/update') this.normalizer.update(params?.update);
      },
      async (method, params) => {
        if (method !== 'session/request_permission') throw new Error('Unsupported ACP client request.');
        const options = Array.isArray(params?.options) ? params.options : [];
        const option = options.find((o: any) => o.kind === (this.opts.permissionMode === 'full' && !this.abort.signal.aborted ? 'allow_once' : 'reject_once'));
        return { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } };
      },
      (error) => {
        // Pending RPC rejects before exited is delivered, so its failed turn
        // is emitted once before runner.onExited examines it.
        setImmediate(() => {
          if (!this.announced) {
            this.announced = true;
            this.bridge?.close();
            this.abort.abort();
            this.sink.exited(error);
          }
        });
      },
      this.deps.registry,
    );
    const init = await this.rpc.call('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'threadbear', version: '1' } });
    if (this.opts.resume && init.agentCapabilities?.loadSession !== true) throw new Error('CLI does not support session load.');
    if (init.agentInfo?.version) this.sink.output({ kind: 'cliVersion', version: init.agentInfo.version });
    let status: SubscriptionStatus | undefined;
    if (this.provider === 'grok') status = subscriptionStatus(this.provider, await this.rpc.call('authenticate', { methodId: 'cached_token' }));
    const r = await this.rpc.call(this.opts.resume ? 'session/load' : 'session/new', {
      ...(this.opts.resume ? { sessionId: this.opts.sessionId } : {}),
      cwd: this.opts.cwd,
      mcpServers: [this.bridge.config],
    });
    status ??= subscriptionStatus(this.provider, r);
    const models = acpModels(this.provider, r);
    this.deps.onStatus?.(this.opts.account, status, models);
    if (status.state !== 'ready') throw new Error(status.reason ?? 'The CLI did not confirm a subscription.');
    this.id = this.opts.resume ? this.opts.sessionId : r.sessionId;
    if (typeof this.id !== 'string' || !this.id) throw new Error('CLI did not return a session ID.');
    if (this.opts.model) {
      if (!models.some((m) => m.model === this.opts.model)) throw new Error('This model is not offered by the subscription CLI.');
      await this.rpc.call('session/set_model', { sessionId: this.id, modelId: this.opts.model });
    } else if (this.provider === 'antigravity') {
      // Never take a saved Claude/API model as Google's default.
      const model = models[0]?.model;
      if (!model) throw new Error('No Gemini models are available.');
      this.opts.model = model;
      await this.rpc.call('session/set_model', { sessionId: this.id, modelId: model });
    }
    if (this.opts.effort) await this.effort(this.opts.effort);
    this.initialized = true;
    this.sink.output({ kind: 'session', nativeSessionId: this.id, model: this.opts.model });
  }
  send(input: UserInput): void {
    const epoch = this.epoch;
    const run = async () => {
      if (epoch !== this.epoch) return;
      const start = Date.now();
      try {
        await this.ready;
        if (this.ended) throw new Error('Session interrupted.');
        if (this.cancelRequested) {
          // Nothing reached the model yet. Complete this turn without
          // poisoning or killing the initialized session for the next one.
          this.cancelRequested = false;
          clear();
          this.sink.output({ kind: 'result', result: { outcome: 'interrupted', answers: input.id, durationMs: Date.now() - start } });
          return;
        }
        this.active = true;
        const guidance = this.told ? '' : `${toolGuidance(this.tools)}\n${this.opts.instructions ?? ''}\n\n`;
        this.told = true;
        const prompt: any[] = [{ type: 'text', text: guidance + input.text }];
        for (const im of input.images) prompt.push({ type: 'image', mimeType: im.mediaType, data: fs.readFileSync(im.path).toString('base64') });
        const r = await this.rpc.call('session/prompt', { sessionId: this.id, prompt }, 0);
        this.normalizer.flush();
        this.active = false;
        const interrupted = this.cancelRequested || r.stopReason === 'cancelled';
        const completed = r.stopReason === 'end_turn';
        clear();
        this.sink.output({
          kind: 'result',
          result: {
            outcome: interrupted ? 'interrupted' : completed ? 'completed' : 'failed',
            answers: input.id,
            durationMs: Date.now() - start,
            usage: r.usage ?? r._meta?.usage,
            ...(!interrupted && !completed ? { error: `CLI stopped: ${r.stopReason ?? 'unknown reason'}` } : {}),
          },
        });
        this.cancelRequested = false;
      } catch (e) {
        this.normalizer.flush();
        this.active = false;
        clear();
        this.sink.output({
          kind: 'result',
          result: {
            ...acpFailure(e),
            ...(!this.initialized ? { admissionFailure: true as const } : {}),
            ...(this.cancelRequested ? { outcome: 'interrupted' as const, errorKind: undefined } : {}),
            answers: input.id,
            durationMs: Date.now() - start,
          },
        });
        this.kill();
      }
    };
    // Admit the first send immediately, before initialization finishes. Stop
    // must complete that turn, while discarding any later queued sends.
    const pending = this.tail ? this.tail.then(run) : run();
    this.tail = pending;
    const clear = () => {
      if (this.tail === pending) this.tail = undefined;
    };
    void pending.then(clear, clear);
  }
  async interrupt(): Promise<void> {
    this.cancelRequested = true;
    this.epoch++;
    await this.ready;
    if (this.active) this.rpc.tell('session/cancel', { sessionId: this.id });
  }
  async setModel(model: string | undefined): Promise<void> {
    if (model !== this.opts.model) throw new Error('Start a new CLI session to change the model.');
  }
  private async effort(effort: EffortLevel): Promise<void> {
    await this.rpc.call('session/set_config_option', {
      sessionId: this.id,
      configId: this.provider === 'grok' ? 'reasoning_effort' : 'thought_level',
      value: this.provider === 'grok' ? { value: effort } : effort,
    });
  }
  async setEffort(effort: EffortLevel | undefined): Promise<void> {
    if (effort !== this.opts.effort) throw new Error('Start a new CLI session to change effort.');
  }
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.opts.permissionMode = mode;
    if (mode !== 'full') {
      this.kill();
      throw new Error('This subscription CLI cannot enforce the requested permission mode.');
    }
  }
  async end(): Promise<void> {
    this.epoch++;
    this.ended = true;
    this.abort.abort();
    await this.ready.catch(() => {});
    await this.rpc?.end();
    this.bridge?.close();
  }
  kill(): void {
    this.epoch++;
    this.ended = true;
    this.abort.abort();
    this.rpc?.kill();
    this.bridge?.close();
  }
}
